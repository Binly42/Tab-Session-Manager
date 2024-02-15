self.Module = {
    locateFile: function (path, prefix) {
        postMessage(`[debug] ${import.meta.url} Module.locateFile() path:${path}`)
        postMessage(`[debug] ${import.meta.url} Module.locateFile() prefix:${prefix}`)

        return './node_modules/wasm-git/' + path

        // default, the prefix (JS file's dir) + the path
        // return prefix + path
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

Module.onRuntimeInitialized = async () => {
    const lg = Module;

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

    await lg.callMain(['clone', `https://unpkg.com/browse/wasm-git@^0.0.12/test.git`, 'testrepo']);

    FS.readdir('testrepo');
}


onmessage = function (e) {
    console.log('Worker: Message received from main script');
    try {
        const result = sliceTextByBytes(e.data[0], e.data[1])
        const workerResult = 'Result: ' + result + `  (uuid:${uuidv4()}`;
        console.log('Worker: Posting message back to main script');
        postMessage(workerResult);
    } catch (err) {
        const s = 'Worker catch:' + err
        console.log('Worker: handle-ing message{', e, '} --> ', s);
        postMessage(s)
    }
}
