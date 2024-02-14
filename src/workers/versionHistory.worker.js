// NOTE: seems still not much easy to `use npm package inside webworker` ,
//      thus here just refer to wasm-git doc for development and debugging
// TODO~ DRY 'package.json' for pkg version


var Module = {
    locateFile: function (s) {
        return 'https://unpkg.com/wasm-git@^0.0.12/' + s;
    }
};

importScripts('https://unpkg.com/wasm-git@^0.0.12/lg2.js');

Module.onRuntimeInitialized = async () => {
    const lg = Module;

    // TODO~ seems FS and MEMFS are all somehow naturally global, how to adapt eslint and vscode ?
    // NOTE: for the simple '_trial_worker.js' (without Module nor wasm-git), they are not global

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
    const result = e.data[0] * e.data[1];
    if (isNaN(result)) {
        postMessage('Please write two numbers');
    } else {
        const workerResult = 'Result: ' + result;
        console.log('Worker: Posting message back to main script');
        postMessage(workerResult);
    }
}
