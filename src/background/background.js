import browser from "webextension-polyfill";
import log from "loglevel";
import updateOldSessions from "./updateOldSessions";
import {
  setAutoSave,
  handleTabUpdated,
  handleTabRemoved,
  autoSaveWhenWindowClose,
  autoSaveWhenExitBrowser,
  setUpdateTempTimer,
  openLastSession,
  autoSaveWhenOpenInCurrentWindow
} from "./autoSave";
import Sessions from "./sessions";
import { replacePage } from "./replace";
import importSessions from "./import";
import { backupSessions, resetLastBackupTime } from "./backup";
import {
  loadCurrentSession,
  saveCurrentSession,
  saveSession,
  removeSession,
  deleteAllSessions,
  updateSession,
  renameSession
} from "./save";
import getSessions from "./getSessions";
import { openSession } from "./open";
import { addTag, removeTag, applyDeviceName } from "./tag";
import { initSettings, handleSettingsChange, getSettings } from "src/settings/settings";
import exportSessions, { handleDownloadsChanged } from "./export";
import onInstalledListener from "./onInstalledListener";
import onUpdateAvailableListener from "./onUpdateAvailableListener";
import { onCommandListener } from "./keyboardShortcuts";
import { openStartupSessions } from "./startup";
import { signInGoogle, signOutGoogle } from "./cloudAuth";
import { syncCloud, syncCloudAuto, getSyncStatus } from "./cloudSync";
import { updateLogLevel, overWriteLogLevel } from "../common/log";
import { getsearchInfo } from "./search";
import { recordChange, undo, redo, updateUndoStatus } from "./undo";
import { compressAllSessions } from "./compressAllSessions";
import { startTracking, endTrackingByWindowDelete, updateTrackingStatus } from "./track";

const logDir = "background/background";
export const SessionStartTime = Date.now();

const addListeners = () => {
  const handleReplace = () => replacePage();
  browser.tabs.onActivated.addListener(handleReplace);
  browser.windows.onFocusChanged.addListener(handleReplace);

  browser.storage.onChanged.addListener((changes, areaName) => {
    handleSettingsChange(changes, areaName);
    setAutoSave(changes, areaName);
    updateLogLevel();
    resetLastBackupTime(changes);
  });

  browser.tabs.onUpdated.addListener(handleTabUpdated);
  browser.tabs.onRemoved.addListener(handleTabRemoved);
  browser.tabs.onCreated.addListener(setUpdateTempTimer);
  browser.tabs.onMoved.addListener(setUpdateTempTimer);
  browser.windows.onCreated.addListener(setUpdateTempTimer);
  browser.windows.onRemoved.addListener(autoSaveWhenWindowClose);
  browser.downloads.onChanged.addListener(handleDownloadsChanged);
};

let IsInit = false;
const init = async () => {
  await initSettings();
  overWriteLogLevel();
  updateLogLevel();
  log.info(logDir, "init()");
  await Sessions.init();
  IsInit = true;
  await updateOldSessions();

  setAutoSave();
  setTimeout(backupSessions, 30000);
  addListeners();
  syncCloudAuto();

  if (IsStartup) {
    await autoSaveWhenExitBrowser();
    const startupBehavior = getSettings("startupBehavior");
    if (startupBehavior === "previousSession") openLastSession();
    else if (startupBehavior === "startupSession") openStartupSessions();
  }
};

let IsStartup = false;
const onStartupListener = async () => {
  log.info(logDir, "onStartupListener()");
  IsStartup = true;
};

const onMessageListener = async (request, _sender, _sendResponse) => {
  log.info(logDir, "onMessageListener()", request);
  switch (request.message) {
    case "save": {
      const afterSession = await saveSession(request.session);
      recordChange(null, afterSession);
      return afterSession;
    }
    case "saveCurrentSession":
      const name = request.name;
      const property = request.property;
      const afterSession = await saveCurrentSession(name, [], property);
      recordChange(null, afterSession);
      return afterSession;
    case "open":
      if (request.property === "openInCurrentWindow") await autoSaveWhenOpenInCurrentWindow();
      openSession(request.session, request.property);
      break;
    case "remove":
      const beforeSession = await getSessions(request.id);
      await removeSession(request.id, request.isSendResponce);
      recordChange(beforeSession, null);
      break;
    case "rename": {
      const beforeSession = await getSessions(request.id);
      const afterSession = await renameSession(request.id, request.name);
      recordChange(beforeSession, afterSession);
      break;
    }
    case "update": {
      const beforeSession = await getSessions(request.session.id);
      await updateSession(request.session, request.isSendResponce);
      recordChange(beforeSession, request.session);
      break;
    }
    case "import":
      importSessions(request.importSessions);
      break;
    case "exportSessions":
      exportSessions(request.id);
      break;
    case "deleteAllSessions":
      deleteAllSessions();
      break;
    case "getSessions":
      const sessions = await getSessions(request.id, request.needKeys);
      return sessions;
    case "addTag": {
      const beforeSession = await getSessions(request.id);
      const afterSession = await addTag(request.id, request.tag);
      recordChange(beforeSession, afterSession);
      break;
    }
    case "removeTag": {
      const beforeSession = await getSessions(request.id);
      const afterSession = removeTag(request.id, request.tag);
      recordChange(beforeSession, afterSession);
      break;
    }
    case "getInitState":
      return IsInit;
    case "getCurrentSession":
      const currentSession = await loadCurrentSession("", [], request.property).catch(() => { });
      return currentSession;
    case "signInGoogle":
      return await signInGoogle();
    case "signOutGoogle":
      return await signOutGoogle();
    case "syncCloud":
      return await syncCloud();
    case "getSyncStatus":
      return getSyncStatus();
    case "applyDeviceName":
      return await applyDeviceName();
    case "getsearchInfo":
      return await getsearchInfo();
    case "requestAllSessions": {
      const sendResponse = (sessions, isEnd) => browser.runtime.sendMessage({
        message: "responseAllSessions", sessions: sessions, isEnd: isEnd, port: request.port
      }).catch(() => { });
      return Sessions.getAllWithStream(sendResponse, request.needKeys, request.count);
    }
    case "undo":
      return undo();
    case "redo":
      return redo();
    case "updateUndoStatus":
      return updateUndoStatus();
    case "compressAllSessions": {
      const sendResponse = (status) => browser.runtime.sendMessage({
        message: "updateCompressStatus",
        status: status,
        port: request.port
      }).catch(() => { });
      return compressAllSessions(sendResponse);
    }
    case "updateTrackingStatus":
      return updateTrackingStatus();
    case "startTracking":
      return startTracking(request.sessionId, request.originalWindowId, request.openedWindowId);
    case "endTrackingByWindowDelete":
      return endTrackingByWindowDelete(request.sessionId, request.originalWindowId);
  }
};

// NOTE: 下面这些log, 手动 `Load Temporary Add-on` 之后也并不一定会出现, 倒是在 Inspect窗口 里再重新 Reload 之后会出现
//      当然后面排查出了 根因似乎是出在'其他js文件里的未声明变量' 之后似乎就再没出现过这个困扰了
log.log(logDir, "before background any init");

browser.runtime.onStartup.addListener(onStartupListener);                   log.debug(logDir, "done browser.runtime.onStartup.addListener");
browser.runtime.onInstalled.addListener(onInstalledListener);               log.debug(logDir, "done browser.runtime.onInstalled.addListener");
browser.runtime.onUpdateAvailable.addListener(onUpdateAvailableListener);   log.debug(logDir, "done browser.runtime.onUpdateAvailable.addListener");
browser.runtime.onMessage.addListener(onMessageListener);                   log.debug(logDir, "done browser.runtime.onMessage.addListener");
browser.commands.onCommand.addListener(onCommandListener);                  log.debug(logDir, "done browser.commands.onCommand.addListener");

log.log(logDir, "before background last init");
const _init_ret = init();
log.log(logDir, "done background last init:", _init_ret);

try {
    // NOTE: (tested both firefox and chrome)
    //      - must not use the second arg `{ type: "module" }`
    //      - unnecessary to use the '../'  (maybe because src-folder ?)
    const worker = self.vcs_worker = new Worker("workers/versionHistory.worker.bundle.js");
    log.log(logDir, 'vcs_worker created:', worker);
    worker.onmessage = (e) => self.console.log(e);

    // NOTE: there had been some other ways for 'kinds of import problems in worker.js' during previous several commits

    // TODO~ https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#passing_data_by_transferring_ownership_transferable_objects


    log.log(logDir, "done background init worker");
} catch (e) {
    log.error(logDir, "background setup worker error:", e);
}




const TST_ID = self.TST_ID = 'treestyletab@piro.sakura.ne.jp';

async function registerToTST() {
    try {
        let result = await browser.runtime.sendMessage(TST_ID, {
            type: 'register-self',
            name: browser.i18n.getMessage('extensionName'),
            icons: browser.runtime.getManifest().icons,
            listeningTypes: [
                'ready',                // for restart
                'permissions-changed',
                'wait-for-shutdown',    // let this extension able to be auto unregistered by TST
            ],
            allowBulkMessaging: true,
            permissions: ['tabs'],
        })
        if (!result) {
            log.error(logDir, 'registerToTST() fail ?', `(from ${TST_ID})`)
        } else {
            log.info(logDir, 'done registerToTST() :', result, `(from ${TST_ID})`)
        }
    } catch (e) {
        log.error(logDir, 'registerToTST() error:', e, `(from ${TST_ID})`)
    }
}

const promisedShutdown = new Promise((resolve, _reject) => {
    // TODO~ test whether would really timeout in real scene if not do anything here
    //      ref: https://github.com/piroor/treestyletab/issues/2313#issuecomment-1947777088
    self.addEventListener('beforeunload', () => resolve(true));
})

function onMessageExternal_TST(message, _sender) {
    switch (message.type) {
        case 'wait-for-shutdown':
            return promisedShutdown

        case 'ready':
        case 'permissions-changed':
            // TODO~ add timeout ?
            registerToTST()
            break
    }
}


function onMessageExternalListener(message, sender) {
    log.debug(logDir, 'onMessageExternalListener:', message, sender)
    switch (sender.id) {
        case TST_ID:
            return onMessageExternal_TST(message, sender)
    }
}

browser.runtime.onMessageExternal.addListener(onMessageExternalListener)
await registerToTST()

// TODEL test
self.tst = {
    registerToTST,
    promisedShutdown,
    test: async (windowId) => {
        const register_ret = await browser.runtime.sendMessage(TST_ID, {
            type: 'register-self',
            name: browser.i18n.getMessage('extensionName'),
            icons: browser.runtime.getManifest().icons,
            listeningTypes: [
                'ready',                // for restart
                'permissions-changed',
                'wait-for-shutdown',    // let this extension able to be auto unregistered by TST
            ],
            allowBulkMessaging: true,
            permissions: ['tabs'],
        })
        console.log(register_ret, `(from ${TST_ID})`)
        const tabs_ret = await browser.runtime.sendMessage(TST_ID, {
            type:   'get-tree',
            tabs:   '*',
            windowId,
        })
        console.log(tabs_ret[0].title, `(from ${TST_ID})`)
    },
}
