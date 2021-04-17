import browser from "webextension-polyfill";
import browserInfo from "browser-info";
import log from "loglevel";
import { getSettings } from "src/settings/settings";
import { returnReplaceURL, replacePage } from "./replace.js";

const logDir = "background/open";

export async function openSession(session, property = "openInNewWindow") {
  log.log(logDir, "openSession()", session, property);
  let isFirstWindowFlag = true;
  tabList = {};
  for (let win in session.windows) {
    const openInCurrentWindow = async () => {
      log.log(logDir, "openSession() openInCurrentWindow()");
      const currentWindow = await removeNowOpenTabs();
      createTabs(session, win, currentWindow);
    };
    const openInNewWindow = async () => {
      log.log(logDir, "openSession() openInNewWindow()");
      let createData = {};
      if (browserInfo().name === "Firefox") {
        const firstTab = session.windows[win][Object.keys(session.windows[win])[0]];
        createData.incognito = firstTab.incognito;
      }

      const isSetPosition =
        getSettings("isRestoreWindowPosition") && session.windowsInfo != undefined;

      if (isSetPosition) {
        const info = session.windowsInfo[win];
        switch (info.state) {
          case "minimized":
            createData.state = info.state;
            break;
          case "normal":
            createData.height = info.height;
            createData.width = info.width;
          case "maximized": //最大化前のサイズを維持するためheightとwidthを含めない
            createData.left = info.left;
            createData.top = info.top;
            break;
        }
      }

      const currentWindow = await browser.windows.create(createData);

      if (isSetPosition && session.windowsInfo[win].state == "maximized") {
        browser.windows.update(currentWindow.id, { state: "maximized" });
      }

      createTabs(session, win, currentWindow);
    };
    const addToCurrentWindow = async () => {
      log.log(logDir, "openSession() addToCurrentWindow()");
      const currentTabs = await browser.tabs.query({ currentWindow: true });
      const currentWinId = currentTabs[0].windowId;
      const currentWindow = await browser.windows.get(currentWinId, { populate: true });
      createTabs(session, win, currentWindow, true);
    };

    if (isFirstWindowFlag) {
      isFirstWindowFlag = false;
      switch (property) {
        case "openInCurrentWindow":
          await openInCurrentWindow();
          break;
        case "openInNewWindow":
          openInNewWindow();
          break;
        case "addToCurrentWindow":
          addToCurrentWindow();
          break;
      }
    } else {
      openInNewWindow();
    }
  }
}

const isEnabledOpenerTabId =
  (browserInfo().name == "Firefox" && browserInfo().version >= 57) ||
  (browserInfo().name == "Chrome" && browserInfo().version >= 18);
const isEnabledDiscarded = browserInfo().name == "Firefox" && browserInfo().version >= 63;
const isEnabledOpenInReaderMode = browserInfo().name == "Firefox" && browserInfo().version >= 58;
const isEnabledTabGroups = browserInfo().name == "Chrome" && browserInfo().version >= 89;

//ウィンドウとタブを閉じてcurrentWindowを返す
async function removeNowOpenTabs() {
  log.log(logDir, "removeNowOpenTabs()");
  const currentTabs = await browser.tabs.query({ currentWindow: true });
  const currentWinId = currentTabs[0].windowId;
  const allWindows = await browser.windows.getAll({ populate: true });
  for (const window of allWindows) {
    if (window.id === currentWinId) {
      //アクティブウィンドウのタブを閉じる
      for (const tab of window.tabs) {
        if (tab.index != 0) browser.tabs.remove(tab.id);
      }
    } else {
      //非アクティブウィンドウを閉じる
      await browser.windows.remove(window.id);
    }
  }
  return await browser.windows.get(currentWinId, { populate: true });
}

const createTabGroups = async (windowId, tabs) => {
  let groups = {};
  for (let tab of tabs) {
    if (!(tab.groupId > 0)) continue;

    if (!groups[tab.groupId]) groups[tab.groupId] = {
      originalGroupId: tab.groupId,
      tabIds: []
    };
    groups[tab.groupId].tabIds.push(tabList[tab.id]);
  }

  for (let group of Object.values(groups)) {
    browser.tabs.group({
      createProperties: { windowId: windowId },
      tabIds: group.tabIds
    });
  }
};

//現在のウィンドウにタブを生成
async function createTabs(session, win, currentWindow, isAddtoCurrentWindow = false) {
  log.log(logDir, "createTabs()", session, win, currentWindow, isAddtoCurrentWindow);
  let sortedTabs = [];

  for (let tab in session.windows[win]) {
    sortedTabs.push(session.windows[win][tab]);
  }

  sortedTabs.sort((a, b) => {
    return a.index - b.index;
  });

  const firstTabId = currentWindow.tabs[0].id;
  let openedTabs = [];
  let tabNumber = 0;
  for (let tab of sortedTabs) {
    const openedTab = openTab(session, win, currentWindow, tab.id, isAddtoCurrentWindow)
      .then(() => {
        tabNumber++;
        if (tabNumber == 1 && !isAddtoCurrentWindow) browser.tabs.remove(firstTabId);
        if (tabNumber == sortedTabs.length) replacePage(currentWindow.id);
      })
      .catch(() => { });
    openedTabs.push(openedTab);
    if (getSettings("ifSupportTst")) await openedTab;
  }

  if (isEnabledTabGroups) {
    await Promise.all(openedTabs);
    createTabGroups(currentWindow.id, sortedTabs);
  }
}

let tabList = {};
//実際にタブを開く
function openTab(session, win, currentWindow, tab, isOpenToLastIndex = false) {
  log.log(logDir, "openTab()", session, win, currentWindow, tab, isOpenToLastIndex);
  return new Promise(async function (resolve, reject) {
    const property = session.windows[win][tab];
    let createOption = {
      active: property.active,
      index: property.index,
      pinned: property.pinned,
      url: property.url,
      windowId: currentWindow.id
    };

    //cookieStoreId
    if (browserInfo().name == "Firefox") {
      createOption.cookieStoreId = property.cookieStoreId;

      //現在のウィンドウと開かれるタブのプライベート情報に不整合があるときはウィンドウに従う
      if (currentWindow.incognito) delete createOption.cookieStoreId;
      if (!currentWindow.incognito && property.cookieStoreId == "firefox-private")
        delete createOption.cookieStoreId;
    }

    //タブをindexの最後に開く
    if (isOpenToLastIndex) {
      createOption.index += currentWindow.tabs.length;
    }

    //Tree Style Tab
    let openDelay = 0;
    if (getSettings("ifSupportTst") && isEnabledOpenerTabId) {
      createOption.openerTabId = tabList[property.openerTabId];
      openDelay = getSettings("tstDelay");
    }

    //Lazy loading
    if (getSettings("ifLazyLoading")) {
      if (getSettings("isUseDiscarded") && isEnabledDiscarded) {
        if (!createOption.active && !createOption.pinned) {
          createOption.discarded = true;
          createOption.title = property.title;
        }
      } else {
        createOption.url = returnReplaceURL(
          "redirect",
          property.title,
          property.url,
          property.favIconUrl
        );
      }
    }

    //Reader mode
    if (property.url.substr(0, 17) == "about:reader?url=") {
      if (getSettings("ifLazyLoading")) {
        createOption.url = returnReplaceURL(
          "redirect",
          property.title,
          property.url,
          property.favIconUrl
        );
      } else {
        if (isEnabledOpenInReaderMode) createOption.openInReaderMode = true;
        createOption.url = decodeURIComponent(property.url.substr(17));
      }
    }

    //about:newtabを置き換え
    if (property.url == "about:newtab") {
      createOption.url = null;
    }

    const tryOpen = async () => {
      log.log(logDir, "openTab() tryOpen()");
      try {
        const newTab = await browser.tabs.create(createOption);
        tabList[property.id] = newTab.id;
        resolve();
      } catch (e) {
        log.warn(logDir, "openTab() tryOpen() replace", e);
        const isRemovedContainer = e.message.startsWith("No cookie store exists with ID");
        if (isRemovedContainer) delete createOption.cookieStoreId;
        else
          createOption.url = returnReplaceURL(
            "open_faild",
            property.title,
            property.url,
            property.favIconUrl
          );
        const newTab = await browser.tabs.create(createOption).catch(e => {
          log.error(logDir, "openTab() tryOpen() create", e);
          reject();
        }); //タブを開けなかった場合はreject
        tabList[property.id] = newTab.id;
        resolve();
      }
    };

    //Tree Style Tabに対応ならdelay
    if (getSettings("ifSupportTst") && isEnabledOpenerTabId) setTimeout(tryOpen, openDelay);
    else tryOpen();
  });
}
