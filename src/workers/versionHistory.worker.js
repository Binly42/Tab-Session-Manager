// NOTE: seems still not much easy to `use npm package inside webworker` ,
//      thus here just refer to wasm-git doc for development and debugging
// TODO~ DRY 'package.json' for pkg version


self.Module = {
    locateFile: function (s) {
        return 'https://unpkg.com/wasm-git@^0.0.12/' + s;
    }
};

// NOTE: cannot use import statement nor dynamic import on pkg `wasm-git`
//      (even used the second arg `{ type: "module" }` when create Worker)
//      (maybe concerning `emscripten` and/or its building ?)
importScripts('https://unpkg.com/wasm-git@^0.0.12/lg2.js');

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
