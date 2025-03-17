import { File } from "./File";
import * as events from "events";
import { FSWatcher, watch } from "chokidar";

export class FileWatcher {

    readonly file: File;
    private watcher?: FSWatcher;
    private selfWatcher?: FSWatcher;
    private isDir: boolean;
    private recursive: boolean;
    private _event: events.EventEmitter;

    onRename?: (file: File) => void;
    onChanged?: (file: File) => void;

    constructor(_file: File, _recursive = false) {
        this.file = _file;
        this.recursive = _recursive;
        this.isDir = this.file.isDir();
        this._event = new events.EventEmitter();
    }

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: any, listener: (arg?: any) => void): this {
        this._event.on(event, listener);
        return this;
    }

    watch(): this {
        // 使用 chokidar 监控目录变化
        if (this.isDir && this.selfWatcher === undefined) {
            this.selfWatcher = watch(this.file.dir, { ignoreInitial: true, depth: 0 });
            this.selfWatcher.on('unlink', (removedPath) => {
                if (removedPath && removedPath.endsWith(this.file.name) && this.onRename) {
                    this.onRename(this.file);
                }
            });
            this.selfWatcher.on('error', (err) => {
                this._event.emit('error', err);
            });
        }

        // 使用 chokidar 监控文件变化
        if (this.watcher === undefined) {
            this.watcher = watch(this.file.path, { ignoreInitial: true, persistent: true, depth: this.recursive ? undefined : 0 });
            this.watcher.on('change', (changedPath) => {
                if (this.onChanged) {
                    this.onChanged(this.isDir ? File.fromArray([this.file.path, changedPath]) : this.file);
                }
            });
            this.watcher.on('unlink', (removedPath) => {
                if (this.onRename) {
                    this.onRename(this.isDir ? File.fromArray([this.file.path, removedPath]) : this.file);
                }
            });
            this.watcher.on('error', (err) => {
                this._event.emit('error', err);
            });
        }
        return this;
    }

    close() {
        if (this.selfWatcher) {
            this.selfWatcher.close();
            this.selfWatcher = undefined;
        }
        if (this.watcher) {
            this.watcher.close();
            this.watcher = undefined;
        }
    }
}
