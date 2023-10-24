
import { FSWatcher, closeSync, openSync, readSync, watch } from "fs";
import { EventEmitter } from "events";
// import iconv = require('iconv-lite');

export class LogFileWatcher {
    readonly filePath: string;
    private _event: EventEmitter;
    private logWatcher?: FSWatcher;
    private fd?: number;

    onChanged?: (buf: Buffer) => void;

    constructor(path: string) {
        this.filePath = path;
        this._event = new EventEmitter();
    }
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: any, listener: (arg?: any) => void): this {
        this._event.on(event, listener);
        return this;
    }

    watch() {
        const CHUNK_SIZE = 16 * 1024;

        this.fd = openSync(this.filePath, 'r');
        // const fdSta = fstatSync(fd);
        let postion = 0;
        let buf = Buffer.alloc(CHUNK_SIZE);
        const loop = () => {
            if (this.fd) {
                const bytesRead = readSync(this.fd, buf, 0, CHUNK_SIZE, postion);
                postion += bytesRead;
                if (this.onChanged) {
                    this.onChanged(buf);
                }
            }
            // if (bytesRead < CHUNK_SIZE) {
            //     setTimeout(loop, 3000000);
            // } else {
            //     loop();
            // }
        };
        // loop();
        this.logWatcher = watch(this.filePath, { recursive: false }, (evt, filename) => {
            if (evt === 'change') {
                loop();
            }
        });
        this.logWatcher.on('error', (err) => {
            console.error("file err", err);
            this.close();
        });
    }

    close() {
        if (this.logWatcher) {
            this.logWatcher.close();
            this.logWatcher = undefined;
        }
        
        if (this.fd) {
            closeSync(this.fd);
        }

    }
}