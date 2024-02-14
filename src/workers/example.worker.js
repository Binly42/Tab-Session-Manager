console.log(import.meta.url, 'Worker: begin');

// all just for example

import { sliceTextByBytes } from '../common/sliceTextByBytes'
self.sliceTextByBytes = sliceTextByBytes

import uuidv4 from "uuid/v4"
self.uuidv4 = uuidv4


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


console.log('Worker: end');
