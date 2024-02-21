self.Module = {
    locateFile: function (path, prefix) {
        postMessage(`[debug] ${import.meta.url} Module.locateFile() path:${path}`)
        postMessage(`[debug] ${import.meta.url} Module.locateFile() prefix:${prefix}`)

        return './node_modules/wasm-git/' + path

        // default, the prefix (JS file's dir) + the path
        // return prefix + path
    },

    'printErr': function (text) {
        console.error(text);
        postMessage('ERROR: '+text);
    }
};

// NOTE: cannot use import statement nor dynamic import on pkg `wasm-git`
//      (even used the second arg `{ type: "module" }` when create Worker)
//      (maybe concerning `emscripten` and/or its building ?)
// TODO~ 搞懂 wasm-git 和 emscripten 的 build , 以及 npm script 或者 webpack ;
//      从而实现: 每次构建完后直接在 workers/ 目录下存在 lib_wasm-git.emscripten.js 和 同名.wasm ,
//          而且在 worker.js 这里面直接 importScripts('lib_wasm-git.emscripten.js') ,
//          到时候应该连 Module.locateFile 就都不用定制了?
//      甚至最好能实现: 正常用 import statement
//      这样的好处在于: 所import的东西以及相关代码结构更明确更清晰, 而且应该就天然能支持 multiple import
// NOTE: Module.locateFile 里的 prefix 是对应 worker.js (而非 emscripten.js) 的 所在目录
// NOTE: 目前 wasm-git 的 lg2.js 里是 绑死了要安装的是`lg2.wasm`, 所以暂时就还是用 `CopyWebpackPlugin` raw copy
importScripts('./node_modules/wasm-git/lg2.js');

import { sliceTextByBytes } from '../common/sliceTextByBytes'
self.sliceTextByBytes = sliceTextByBytes

import uuidv4 from "uuid/v4"
self.uuidv4 = uuidv4


self.log = (...params) => {
    const t = params.join(' ')
    console.log(t)
    postMessage(t)
}

Module.onRuntimeInitialized = async () => {
    const lg = Module;
    self.lg = lg
    self.fs = FS

    // TODO~ seems FS and MEMFS are all somehow naturally global, how to adapt eslint and vscode ?
    // NOTE: for a simple 'worker.js' (without Module nor wasm-git), they are not global

    // const FS = lg.FS
    // const MEMFS = lg.MEMFS

    FS.mkdir('/working');
    FS.mount(MEMFS, {}, '/working');
    FS.chdir('/working');

    FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
            'name = Test User\n' +
            'email = test@example.com');

    // clone a local git repository and make some commits

    try {
        // 直接用 `npx http-server --port 9999` 的话, 死活无法clone (已经 `git update-server-info`) (终端里同样参数是可以clone的)
        // 相比 /r /r/ /r.git , 现在这样起码不会404, 但依然会报 ERROR 12: early EOF
        // lg.callMain(['clone', `http://localhost:9999/r/.git`, 'r']);

        lg.callMain(['clone', `https://github.com/petersalomonsen/githttpserver.git`, 'rg']);

        // 用了 githttpserver (`GIT_PROJECT_ROOT=~/tmp/tession/ npm run start`) 之后, 确实就能clone本地的 ~/tmp/tession/r 了
        // NOTE: 实测 最原始的r firefox(并没打开worker的inspect) 要花 25s 左右, 而 chromium 甚至都不用 10s ... (firefox已经重启过的了)
        //      而且 firefox 如果在 打开worker的inspect 的情况下再开始clone的话, 还真就会慢得发指...
        // TODO~ 小试了下, 似乎跟 flatpak版 无关
        lg.callMain(['clone', `http://localhost:5000/r`, 'r']);
    } catch (e) {
        postMessage(e)
    }
}


onmessage = function (e) {
    console.log('Worker: Message received from main script', e);
    try {
        switch (e.data[0]) {
            case 'git':
                switch (e.data[1]) {
                    default:
                        return lg.callMain(e.data.slice(1))
                }
        }
    } catch (err) {
        const s = 'Worker catch:' + err
        console.log('Worker: handle-ing message{', e, '} --> ', s);
        printErr(s)
    }
}
