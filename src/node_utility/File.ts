import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export class File {

    static sep = path.sep;
    static delimiter = path.delimiter;
    static emptyFilter: RegExp[] = [];

    readonly name: string;          // example 'demo.cpp'
    readonly noSuffixName: string;  // example 'demo'
    readonly suffix: string;        // example '.cpp'
    readonly dir: string;           // example 'd:\\dir'
    readonly path: string;          // example 'd:\\dir\\demo.cpp'

    constructor(fPath: string) {
        this.path = fPath;
        this.name = path.basename(fPath);
        this.noSuffixName = this.getNoSuffixName(this.name);
        this.suffix = path.extname(fPath);
        this.dir = path.dirname(fPath);
    }

    static fromArray(pathArray: string[]): File {
        return new File(pathArray.join(File.sep));
    }

    static toUnixPath(path: string): string {
        return path.normalize(path).replace(/\\{1,}/g, '/');
    }

    static toUri(path: string): string {
        return `file://${  this.toNoProtocolUri(path)}`;
    }

    static toNoProtocolUri(path: string): string {
        return `/${  encodeURIComponent(path.replace(/\\/g, '/'))}`;
    }

    // c:/abcd/../a -> c:\abcd\..\a
    static toLocalPath(path: string): string {

        const res = File.toUnixPath(path);

        if (File.sep === '\\') {
            return res.replace(/\//g, File.sep);
        }

        return res;
    }
  
    private static _match(str: string, isInverter: boolean, regList: RegExp[]): boolean {

        let isMatch = false;

        for (const reg of regList) {
            if (reg.test(str)) {
                isMatch = true;
                break;
            }
        }

        if (isInverter) {
            isMatch = !isMatch;
        }

        return isMatch;
    }

    private static _filter(fList: File[], isInverter: boolean, fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {

        const res: File[] = [];

        if (fileFilter) {
            fList.forEach(f => {
                if (f.isFile() && this._match(f.name, isInverter, fileFilter)) {
                    res.push(f);
                }
            });
        } else {
            fList.forEach(f => {
                if (f.isFile()) {
                    res.push(f);
                }
            });
        }

        if (dirFilter) {
            fList.forEach(f => {
                if (f.isDir() && this._match(f.name, isInverter, dirFilter)) {
                    res.push(f);
                }
            });
        } else {
            fList.forEach(f => {
                if (f.isDir()) {
                    res.push(f);
                }
            });
        }

        return res;
    }

    static filter(fList: File[], fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        return this._filter(fList, false, fileFilter, dirFilter);
    }

    static notMatchFilter(fList: File[], fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        return this._filter(fList, true, fileFilter, dirFilter);
    }

    private getNoSuffixName(name: string): string {
        const nList = this.name.split('.');

        if (nList.length > 1) {
            nList.pop();

            return nList.join('.');
        } else {
            return name;
        }
    }

    private _copyRetainDir(baseDir: File, file: File) {

        const relativePath = baseDir.toRelativePath(file.dir);

        if (relativePath) {

            const dir = File.fromArray([this.path, relativePath.replace(/\//g, File.sep)]);

            if (!dir.isDir()) {
                this.createDir(true);
            }
            fs.copyFileSync(file.path, dir.path + File.sep + file.name);
        }
    }

    /**
     * example: this.path: 'd:\app\abc\.', absPath: 'd:\app\abc\.\def\a.c', result: '.\def\a.c'
    */
    toRelativePath(abspath: string, hasPrefix = true): string | undefined {

        if (!path.isAbsolute(abspath)) {
            return undefined;
        }

        const rePath = path.relative(this.path, abspath);

        if (path.isAbsolute(rePath)) {
            return undefined;
        }

        return hasPrefix ? (`.${File.sep}${rePath}`) : rePath;
    }

    //----------------------------------------------------

    createDir(recursive = false): void {
        if (!this.isDir()) {
            if (recursive) {
                const list = this.path.split(path.sep);
                let f: File;

                if (list.length > 0) {
                    let dir: string = list[0];

                    for (let i = 0; i < list.length;) {
                        f = new File(dir);
                        if (!f.isDir()) {
                            fs.mkdirSync(f.path);
                        }
                        dir += ++i < list.length ? (path.sep + list[i]) : '';
                    }

                    return;
                }

                return;
            }
            fs.mkdirSync(this.path);
        }
    }

    path2File(path: string, fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        const list: File[] = [];

        if (path !== '.' && path !== '..') {
            const f = new File(path);

            if (f.isDir()) {
                if (dirFilter) {
                    for (const reg of dirFilter) {
                        if (reg.test(f.name)) {
                            list.push(f);
                            break;
                        }
                    }
                } else {
                    list.push(f);
                }
            } else {
                if (fileFilter) {
                    for (const reg of fileFilter) {
                        if (reg.test(f.name)) {
                            list.push(f);
                            break;
                        }
                    }
                } else {
                    list.push(f);
                }
            }
        }

        return list;
    }

    getList(fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        const list: File[] = [];

        fs.readdirSync(this.path).forEach((str: string) => {
            if (str !== '.' && str !== '..') {
                const f = new File(this.path + path.sep + str);

                if (f.isDir()) {
                    if (dirFilter) {
                        for (const reg of dirFilter) {
                            if (reg.test(f.name)) {
                                list.push(f);
                                break;
                            }
                        }
                    } else {
                        list.push(f);
                    }
                } else {
                    if (fileFilter) {
                        for (const reg of fileFilter) {
                            if (reg.test(f.name)) {
                                list.push(f);
                                break;
                            }
                        }
                    } else {
                        list.push(f);
                    }
                }
            }
        });

        return list;
    }

    getAll(fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        const res: File[] = [];

        let fStack: File[] = this.getList(fileFilter);
        let f: File;

        while (fStack.length > 0) {
            f = fStack.pop() as File;
            if (f.isDir()) {
                fStack = fStack.concat(f.getList(fileFilter));
            }
            res.push(f);
        }

        return File.filter(res, undefined, dirFilter);
    }

    copyRetainDir(baseDir: File, file: File) {
        this._copyRetainDir(baseDir, file);
    }

    copyFile(file: File) {
        fs.copyFileSync(file.path, this.path + File.sep + file.name);
    }

    copyList(dir: File, fileFilter?: RegExp[], dirFilter?: RegExp[]) {
        const fList = dir.getList(fileFilter, dirFilter);

        fList.forEach(f => {
            if (f.isFile()) {
                this.copyRetainDir(dir, f);
            }
        });
    }

    copyAll(dir: File, fileFilter?: RegExp[], dirFilter?: RegExp[]) {
        const fList = dir.getAll(fileFilter, dirFilter);

        fList.forEach(f => {
            if (f.isFile()) {
                this.copyRetainDir(dir, f);
            }
        });
    }

    //-------------------------------------------------

    read(encoding?: any): string {
        return fs.readFileSync(this.path, { encoding: encoding ?? 'utf8' }) as unknown as string;
    }

    write(str: string, options?: fs.WriteFileOptions) {
        fs.writeFileSync(this.path, str, options);
    }

    isExist(): boolean {
        return fs.existsSync(this.path);
    }

    isFile(): boolean {
        if (fs.existsSync(this.path)) {
            return fs.lstatSync(this.path).isFile();
        }

        return false;
    }

    isDir(): boolean {
        if (fs.existsSync(this.path)) {
            return fs.lstatSync(this.path).isDirectory();
        }

        return false;
    }

    getHash(hashName?: string): string {
        const hash = crypto.createHash(hashName ?? 'md5');

        hash.update(fs.readFileSync(this.path));

        return hash.digest('hex');
    }

    getSize(): number {
        return fs.statSync(this.path).size;
    }

    toUri(): string {
        return `file://${  this.toNoProtocolUri()}`;
    }

    toNoProtocolUri(): string {
        return `/${  encodeURIComponent(this.path.replace(/\\/g, '/'))}`;
    }
}