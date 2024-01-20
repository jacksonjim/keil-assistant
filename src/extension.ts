import {
    Event, EventEmitter, ExtensionContext, OutputChannel, ProviderResult,
    StatusBarAlignment, StatusBarItem, TreeDataProvider, TreeItem, TreeItemCollapsibleState,
    Uri, commands, env, window, workspace
} from 'vscode';

import { createHash } from 'crypto';
import { EventEmitter as EventsEmitter } from 'events';
import { normalize, dirname, resolve, join } from 'path';
import { spawn, execSync } from 'child_process';

import { File } from './node_utility/File';
import { ResourceManager } from './ResourceManager';
import { FileWatcher } from './node_utility/FileWatcher';
import { Time } from './node_utility/Time';
import { CmdLineHandler } from './CmdLineHandler';

import { XMLParser } from 'fast-xml-parser';
import { readFileSync, createWriteStream, stat, readdirSync, statSync, writeFileSync, openSync, readSync, closeSync, watchFile } from 'fs';
import { decode as heDecode } from 'he';
import { decode } from 'iconv-lite';

let myStatusBarItem: StatusBarItem;
let channel: OutputChannel;


export function activate(context: ExtensionContext) {
    console.log('---- keil-assistant actived ----');
    if (channel === undefined) {
        channel = window.createOutputChannel('keil-vscode');
    }

    const testKeilRoot = ResourceManager.getInstance(context).getKeilRootDir("MDK");
    stat(testKeilRoot, (err, stat) => {
        if (err || !stat.isDirectory()) {
            channel.show();
            channel.appendLine(`Error: Please set keil root Path, ${err}`);
            window.showErrorMessage(`Error: Please set keil root Path, ${err}`);
        }
    });

    const prjExplorer = new ProjectExplorer(context);
    const subscriber = context.subscriptions;

    const projectSwitchCommandId = 'project.switch';

    subscriber.push(commands.registerCommand('explorer.open', async () => {
        const uri = await window.showOpenDialog({
            openLabel: 'Open a keil project',
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'keilProjectXml': ['uvproj', 'uvprojx', 'uvmpw']
            }
        });

        try {
            if (uri && uri.length > 0) {

                // load project
                const uvPrjPath = uri[0].fsPath;
                await prjExplorer.openProject(uvPrjPath);

                // switch workspace
                const result = await window.showInformationMessage(
                    'keil project load done !, switch workspace ?', 'Ok', 'Later');
                if (result === 'Ok') {
                    openWorkspace(new File(dirname(uvPrjPath)));
                }
            }
        } catch (error) {
            window.showErrorMessage(`open project failed !, msg: ${(<Error>error).message}`);
        }
    }));

    subscriber.push(commands.registerCommand('project.close', (item: IView) => prjExplorer.closeProject(item.prjID)));

    subscriber.push(commands.registerCommand('project.build', (item: IView) => prjExplorer.getTarget(item)?.build()));

    subscriber.push(commands.registerCommand('project.rebuild', (item: IView) => prjExplorer.getTarget(item)?.rebuild()));

    subscriber.push(commands.registerCommand('project.download', (item: IView) => prjExplorer.getTarget(item)?.download()));

    subscriber.push(commands.registerCommand('item.copyValue', (item: IView) => env.clipboard.writeText(item.tooltip || '')));

    subscriber.push(commands.registerCommand(projectSwitchCommandId, (item: IView) => prjExplorer.switchTargetByProject(item)));

    subscriber.push(commands.registerCommand('project.active', (item: IView) => prjExplorer.activeProject(item)));

    subscriber.push(commands.registerCommand('statusbar.project', async () => {
        prjExplorer.statusBarSwitchTargetByProject();
    }));


    myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 200);
    myStatusBarItem.command = 'statusbar.project';
    subscriber.push(myStatusBarItem);

    prjExplorer.loadWorkspace();
}

export function deactivate() {
    console.log('---- keil-assistant closed ----');
    channel.dispose();
}

//==================== Global Func===========================

function getMD5(data: string): string {
    const md5 = createHash('md5');
    md5.update(data);
    return md5.digest('hex');
}

function openWorkspace(wsFile: File) {
    commands.executeCommand('openFolder', Uri.parse(wsFile.toUri()));
}

function updateStatusBarItem(prjName: string | undefined): void {
    if (prjName !== undefined) {
        myStatusBarItem.text = prjName;
        myStatusBarItem.tooltip = "switch project target";
        myStatusBarItem.show();
    } else {
        myStatusBarItem.hide();
    }
}
//===============================

interface IView {

    label: string;

    prjID: string;

    icons?: { light: string, dark: string };

    tooltip?: string;

    contextVal?: string;

    getChildViews(): IView[] | undefined;
}

//===============================================

class Source implements IView {

    label: string;
    prjID: string;
    icons?: { light: string; dark: string; } | undefined;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'Source';

    //---
    readonly file: File;
    readonly enable: boolean;

    children: Source[] | undefined;

    constructor(pID: string, f: File, _enable = true) {
        this.prjID = pID;
        this.enable = _enable;
        this.file = f;
        this.label = this.file.name;
        this.tooltip = f.path;

        let iconName = '';
        if (f.isFile() === false) {
            iconName = 'FileWarning_16x';
        } else if (_enable === false) {
            iconName = 'FileExclude_16x';
        } else {
            iconName = this.getIconBySuffix(f.suffix.toLowerCase());
        }

        this.icons = {
            dark: iconName,
            light: iconName
        };
    }

    private getIconBySuffix(suffix: string): string {
        switch (suffix) {
            case '.c':
                return 'CFile_16x';
            case '.h':
            case '.hpp':
            case '.hxx':
            case '.inc':
                return 'CPPHeaderFile_16x';
            case '.cpp':
            case '.c++':
            case '.cxx':
            case '.cc':
                return 'CPP_16x';
            case '.s':
            case '.a51':
            case '.asm':
                return 'AssemblerSourceFile_16x';
            case '.lib':
            case '.a':
                return 'Library_16x';
            default:
                return 'Text_16x';
        }
    }

    getChildViews(): IView[] | undefined {
        return this.children;
    }
}

class FileGroup implements IView {

    label: string;
    prjID: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'FileGroup';
    icons?: { light: string; dark: string; };

    //----
    sources: Source[];

    constructor(pID: string, gName: string, disabled: boolean) {
        this.label = gName;
        this.prjID = pID;
        this.sources = [];
        this.tooltip = gName;
        const iconName = disabled ? 'FolderExclude_32x' : 'Folder_32x';
        this.icons = { light: iconName, dark: iconName };
    }

    getChildViews(): IView[] | undefined {
        return this.sources;
    }
}

interface KeilProjectInfo {

    prjID: string;

    vscodeDir: File;

    uvprjFile: File;

    logger: Console;

    toAbsolutePath(rePath: string): string;
}

interface KeilProperties {
    project: object | any | undefined;
}

interface UVisonInfo {
    schemaVersion: string | undefined;
}

class KeilProject implements IView, KeilProjectInfo {

    prjID: string;
    label: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'Project';
    icons?: { light: string; dark: string; } = {
        light: 'DeactiveApplication_16x',
        dark: 'DeactiveApplication_16x'
    };

    //-------------

    vscodeDir: File;
    uvprjFile: File;
    logger: Console;

    // uVison info
    uVsionFileInfo: UVisonInfo;

    activeTargetName: string | undefined;
    private prevUpdateTime: number | undefined;

    protected _event: EventsEmitter;
    protected watcher: FileWatcher;
    protected targetList: Target[];

    keilVscodeProps: KeilProperties = {
        project: undefined,
    };

    constructor(_uvprjFile: File, workspace: string | undefined) {
        this._event = new EventsEmitter();
        this.uVsionFileInfo = <UVisonInfo>{};
        this.targetList = [];
        this.vscodeDir = new File(workspace + File.sep + '.vscode');
        this.vscodeDir.createDir();
        const logPath = this.vscodeDir.path + File.sep + 'keil-assistant.log';
        this.logger = new console.Console(createWriteStream(logPath, { flags: 'a+' }));
        this.uvprjFile = _uvprjFile;
        this.watcher = new FileWatcher(this.uvprjFile);
        this.prjID = getMD5(_uvprjFile.path);
        this.label = _uvprjFile.noSuffixName;
        this.tooltip = _uvprjFile.path;
        this.logger.log('[info] Log at : ' + Time.getInstance().getTimeStamp() + '\r\n');
        this.getKeilVscodeProperties();
        this.watcher.onChanged = () => {
            if (this.prevUpdateTime === undefined ||
                this.prevUpdateTime + 2000 < Date.now()) {
                this.prevUpdateTime = Date.now(); // reset update time
                setTimeout(() => this.onReload(), 300);
            }
        };
        this.watcher.watch();
    }

    on(event: 'dataChanged', listener: () => void): void;
    on(event: any, listener: () => void): void {
        this._event.on(event, listener);
    }

    private async onReload() {
        try {
            this.targetList.forEach((target) => target.close());
            this.targetList = [];
            await this.load();
            this.notifyUpdateView();
        } catch (error) {
            const err = (error as any).error;
            const code = err["code"];
            if (code === 'EBUSY') {
                this.logger.log(`[Warn] uVision project file '${this.uvprjFile.name}' is locked !, delay 500 ms and retry !`);
                setTimeout(() => this.onReload(), 500);
            } else {
                window.showErrorMessage(`reload project failed !, msg: ${err["message"]}`);
            }
        }
    }

    async load() {
        var doc: any = {};
        let options = {
            attributeNamePrefix: "@_",
            attrNodeName: "attr", //default is 'false'
            textNodeName: "#text",
            ignoreAttributes: false,
            ignoreNameSpace: false,
            allowBooleanAttributes: false,
            parseNodeValue: true,
            parseAttributeValue: false,
            trimValues: true,
            cdataTagName: "__cdata", //default is 'false'
            cdataPositionChar: "\\c",
            parseTrueNumberOnly: false,
            arrayMode: false, //"strict"
            // attrValueProcessor: (val: any, attrName: any) => decode(val, { isAttributeValue: true }),//default is a=>a
            // tagValueProcessor: (val: any, tagName: any) => decode(val), //default is a=>a
            stopNodes: ["parse-me-as-string"]
        };
        // channel.show();
        try {
            const parser = new XMLParser(options);
            const xmldoc = this.uvprjFile.read();
            doc = parser.parse(xmldoc, options);

        } catch (e) {
            console.error(e);
            channel.show();
            channel.appendLine(`Error:${e}`);
        }

        const targets = doc['Project']['Targets']['Target'];
        const rteDom = doc['Project']['RTE'];

        // init uVsion info
        this.uVsionFileInfo.schemaVersion = doc['Project']['SchemaVersion'];
        // console.log(doc, targets);
        if (Array.isArray(targets)) {
            for (const target of targets) {
                this.targetList.push(Target.getInstance(this, this.uVsionFileInfo, target, rteDom));
            }
        } else {
            this.targetList.push(Target.getInstance(this, this.uVsionFileInfo, targets, rteDom));
        }

        for (const target of this.targetList) {
            await target.load();
            target.on('dataChanged', () => this.notifyUpdateView());
        }

        if (this.keilVscodeProps['project']['activeTargetName'] === undefined) {
            this.activeTargetName = this.targetList[0].targetName;
            this.updateKeilVscodeProperties();
        } else {
            this.activeTargetName = this.keilVscodeProps['project']['activeTargetName'];
        }

    }

    notifyUpdateView() {
        this._event.emit('dataChanged');
    }

    close() {
        this.watcher.close();
        this.targetList.forEach((target) => target.close());
        this.logger.log('[info] project closed: ' + this.label);
    }

    toAbsolutePath(rePath: string): string {
        const path = rePath.replace(/\//g, File.sep);
        if (/^[a-z]:/i.test(path)) {
            return normalize(path);
        }
        return normalize(this.uvprjFile.dir + File.sep + path);
    }

    active() {
        this.icons = { light: 'ActiveApplication_16x', dark: 'ActiveApplication_16x' };
    }

    deactive() {
        this.icons = { light: 'DeactiveApplication_16x', dark: 'DeactiveApplication_16x' };
    }

    getTargetByName(name: string): Target | undefined {
        const index = this.targetList.findIndex((t) => { return t.targetName === name; });
        if (index !== -1) {
            return this.targetList[index];
        }
    }

    setActiveTarget(tName: string) {
        if (tName !== this.activeTargetName) {
            this.activeTargetName = tName;
            this.updateKeilVscodeProperties();
            this.notifyUpdateView(); // notify data changed
        }
    }

    getActiveTarget(): Target | undefined {
        if (this.activeTargetName) {
            return this.getTargetByName(this.activeTargetName);
        }

        else if (this.targetList.length > 0) {
            return this.targetList[0];
        }
    }

    getChildViews(): IView[] | undefined {

        if (this.activeTargetName) {
            const target = this.getTargetByName(this.activeTargetName);
            if (target) {
                return [target];
            }
        }

        if (this.targetList.length > 0) {
            return [this.targetList[0]];
        }

        return undefined;
    }

    getTargets(): Target[] {
        return this.targetList;
    }


    private getDefKeilVscodeProperties(): KeilProperties {
        return {
            project: {
                name: undefined,
                activeTargetName: undefined
            },
        };
    }

    private getKeilVscodeProperties() {
        const proFile = new File(`${this.vscodeDir.path}${File.sep}keil_project_properties.json`);
        if (proFile.isFile()) {
            try {
                this.keilVscodeProps = JSON.parse(proFile.read());
            } catch (error) {
                this.logger.log(error);
                this.keilVscodeProps = this.getDefKeilVscodeProperties();
            }
        } else {
            this.keilVscodeProps = this.getDefKeilVscodeProperties();
        }
        return proFile;
    }

    private updateKeilVscodeProperties() {
        const proFile = this.getKeilVscodeProperties();

        const project = this.keilVscodeProps['project'];
        if (project?.name === this.prjID) {
            project.activeTargetName = this.activeTargetName;
        } else {
            project.name = this.prjID;
            project.activeTargetName = this.activeTargetName;
        }

        proFile.write(JSON.stringify(this.keilVscodeProps, undefined, 4));
    }

}

abstract class Target implements IView {

    prjID: string;
    label: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'Target';
    icons?: { light: string; dark: string; } = {
        light: 'Class_16x',
        dark: 'Class_16x'
    };


    //-------------

    readonly targetName: string;

    protected _event: EventsEmitter;
    protected project: KeilProjectInfo;
    protected cppConfigName: string;
    protected targetDOM: any;
    protected rteDom: any;
    protected uvInfo: UVisonInfo;
    protected fGroups: FileGroup[];
    protected includes: Set<string>;
    protected defines: Set<string>;

    private uv4LogFile: File;
    private uv4LogLockFileWatcher: FileWatcher;
    private isTaskRunning: boolean = false;
    private taskChannel: OutputChannel | undefined;

    constructor(prjInfo: KeilProjectInfo, uvInfo: UVisonInfo, targetDOM: any, rteDom: any) {
        this._event = new EventsEmitter();
        this.project = prjInfo;
        this.targetDOM = targetDOM;
        this.rteDom = rteDom;
        this.uvInfo = uvInfo;
        this.prjID = prjInfo.prjID;
        this.targetName = targetDOM['TargetName'];
        this.label = this.targetName;
        this.tooltip = this.targetName;
        this.cppConfigName = this.targetName;
        this.includes = new Set();
        this.defines = new Set();
        this.fGroups = [];
        this.uv4LogFile = new File(this.project.vscodeDir.path + File.sep + this.targetName + '_uv4.log');
        this.uv4LogLockFileWatcher = new FileWatcher(new File(this.uv4LogFile.path + '.lock'));

        if (!this.uv4LogLockFileWatcher.file.isFile()) { // create file if not existed
            this.uv4LogLockFileWatcher.file.write('');
        }

        this.uv4LogLockFileWatcher.watch();
        this.uv4LogLockFileWatcher.onChanged = () => this.updateSourceRefs();
        this.uv4LogLockFileWatcher.on('error', () => {

            this.uv4LogLockFileWatcher.close();

            if (!this.uv4LogLockFileWatcher.file.isFile()) { // create file if not existed
                this.uv4LogLockFileWatcher.file.write('');
            }

            this.uv4LogLockFileWatcher.watch();
        });

    }


    on(event: 'dataChanged', listener: () => void): void;
    on(event: any, listener: () => void): void {
        this._event.on(event, listener);
    }

    static getInstance(prjInfo: KeilProjectInfo, uvInfo: UVisonInfo, targetDOM: any, rteDom: any): Target {
        if (prjInfo.uvprjFile.suffix.toLowerCase() === '.uvproj') {
            if (targetDOM['TargetOption']['Target251'] !== undefined) {
                return new C251Target(prjInfo, uvInfo, targetDOM, rteDom);
            }
            return new C51Target(prjInfo, uvInfo, targetDOM, rteDom);
        } else {
            return new ArmTarget(prjInfo, uvInfo, targetDOM, rteDom);
        }
    }

    private getDefCppProperties(): any {
        return {
            configurations: [
                {
                    name: this.cppConfigName,
                    includePath: undefined,
                    defines: undefined,
                    intelliSenseMode: '${default}'
                }
            ],
            version: 4
        };
    }

    private updateCppProperties() {

        const proFile = new File(this.project.vscodeDir.path + File.sep + 'c_cpp_properties.json');
        let obj: any;

        if (proFile.isFile()) {
            try {
                obj = JSON.parse(proFile.read());
            } catch (error) {
                this.project.logger.log(error);
                obj = this.getDefCppProperties();
            }
        } else {
            obj = this.getDefCppProperties();
        }

        const configList: any[] = obj['configurations'];
        const index = configList.findIndex((conf) => { return conf.name === this.cppConfigName; });

        if (index === -1) {
            configList.push({
                name: this.cppConfigName,
                includePath: Array.from(this.includes).concat(['${default}', '${workspaceFolder}/**']),
                defines: Array.from(this.defines),
                intelliSenseMode: '${default}'
            });
        } else {
            configList[index]['includePath'] = Array.from(this.includes).concat(['${default}', '${workspaceFolder}/**']);
            configList[index]['defines'] = Array.from(this.defines);
        }

        proFile.write(JSON.stringify(obj, undefined, 4));
    }

    async load(): Promise<void> {

        // check target is valid
        const err = this.checkProject(this.targetDOM);
        if (err) { throw err; }

        const incListStr: string = this.getIncString(this.targetDOM);
        const defineListStr: string = this.getDefineString(this.targetDOM);
        const _groups: any = this.getGroups(this.targetDOM);
        const sysIncludes = this.getSystemIncludes(this.targetDOM);
        const rteIncludes = this.getRTEIncludes(this.targetDOM, this.rteDom);

        // const targetName = this.targetDOM['TargetName'];

        // set includes
        this.includes.clear();

        let incList = incListStr.split(';');
        if (sysIncludes) {
            incList = incList.concat(sysIncludes);
        }
        if (rteIncludes) {
            incList = incList.concat(rteIncludes);
        }

        incList.forEach((path) => {
            const realPath = path.trim();
            if (realPath !== '') {
                this.includes.add(this.project.toAbsolutePath(realPath));
            }
        });

        // set defines
        this.defines.clear();

        // add user macros
        defineListStr.split(/,|\s+/).forEach((define) => {
            if (define.trim() !== '') {
                this.defines.add(define);
            }
        });

        // RTE macros
        this.getRteDefines(this.rteDom).forEach((define) => {
            this.defines.add(define);
        });

        // add system macros
        this.getSysDefines(this.targetDOM).forEach((define) => {
            this.defines.add(define);
        });

        // set file groups
        this.fGroups = [];

        let groups: any[];
        if (Array.isArray(_groups)) {
            groups = _groups;
        } else {
            groups = [_groups];
        }

        for (const group of groups) {
            if (group['Files'] !== undefined) {

                let isGroupExcluded = false;
                let fileList: any[];
                // console.log('GroupOption',group['GroupOption']);
                const gOption = group['GroupOption'];
                if (gOption !== undefined) { // check group is excluded
                    const gComProps = gOption['CommonProperty'];
                    if (gComProps !== undefined) {
                        isGroupExcluded = (gComProps['IncludeInBuild'] === 0);
                    }
                }

                const nGrp = new FileGroup(this.prjID, group['GroupName'], isGroupExcluded);

                if (Array.isArray(group['Files'])) {
                    fileList = [];
                    for (const files of group['Files']) {
                        if (Array.isArray(files['File'])) {
                            fileList = fileList.concat(files['File']);
                        }
                        else if (files['File'] !== undefined) {
                            fileList.push(files['File']);
                        }
                    }
                } else {
                    if (Array.isArray(group['Files']['File'])) {
                        fileList = group['Files']['File'];
                    }
                    else if (group['Files']['File'] !== undefined) {
                        fileList = [group['Files']['File']];
                    } else {
                        fileList = [];
                    }
                }

                for (const file of fileList) {
                    const f = new File(this.project.toAbsolutePath(file['FilePath']));

                    let isFileExcluded = isGroupExcluded;
                    if (isFileExcluded === false && file['FileOption']) { // check file is enable
                        const fOption = file['FileOption']['CommonProperty'];
                        if (fOption && fOption['IncludeInBuild'] === 0) {
                            isFileExcluded = true;
                        }
                    }

                    const nFile = new Source(this.prjID, f, !isFileExcluded);
                    this.includes.add(f.dir);
                    nGrp.sources.push(nFile);
                }

                this.fGroups.push(nGrp);
            }
        }

        this.updateCppProperties();

        this.updateSourceRefs();
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private runAsyncTask(name: string, type: 'b' | 'r' | 'f' = 'b') {
        if (this.isTaskRunning) {
            window.showWarningMessage(`Task isRuning Please wait it finished try !`);
            return;
        }
        this.isTaskRunning = true;

        writeFileSync(this.uv4LogFile.path, '');
        if (this.taskChannel !== undefined) {
            this.taskChannel.dispose();
        }
        this.taskChannel = window.createOutputChannel("keil Build");
        this.taskChannel.appendLine(`Start to ${name} target ${this.label}`);
        this.taskChannel.show();

        const fd = openSync(this.uv4LogFile.path, 'a+');
        // const watcher = workspace.createFileSystemWatcher(this.uv4LogFile.path, false, false, false);
        let curPos = 0;
        const buf = Buffer.alloc(4096);

        const logWatcher = watchFile(this.uv4LogFile.path, { persistent: true, interval: 1000 }, (curr, prev) => {
            // console.log("curr:", curr.size, "prev", prev.size);
            if (curr.mtime > prev.mtime) {
                // let buffer = new Buffer(curr.size - prev.size);
                // console.log("size",(curr.size - prev.size));
                const numRead = readSync(fd, buf, 0, 4096, prev.size);
                if (numRead > 0) {
                    curPos += numRead;
                    const txt = this.dealLog(buf.slice(0, numRead));
                    this.taskChannel?.append(txt);
                }
            }
        });
        // watcher.onDidChange(() => {
        //     const stats = statSync(this.uv4LogFile.path);
        //     if (stats && stats.size > 0) {
        //         /*const numRead = readSync(fd, buf, 0, 1024, curPos);
        //         if (numRead > 0) {
        //             curPos += numRead;
        //             const txt = this.dealBuildLog(buf.slice(0, numRead));
        //             this.taskChannel?.append(txt);
        //         }*/
        //         curPos = 0;
        //         this.taskChannel?.clear();
        //         console.log("stats:", stats);
        //         while (curPos < stats.size) {
        //             const numRead = readSync(fd, buf, 0, 1024, curPos);
        //             if (numRead > 0) {
        //                 curPos += numRead;
        //                 const txt = this.dealBuildLog(buf.slice(0, numRead));
        //                 this.taskChannel?.append(txt);
        //             }
        //         }
        //     }
        // });

        const execCommand = spawn(`${ResourceManager.getInstance().getKeilUV4Path(this.getKeilPlatform())}`,
            [
                `-${type}`, `${this.project.uvprjFile.path}`,
                '-j0',
                '-t', `${this.targetName}`,
                '-o', `${this.uv4LogFile.path}`
            ],
            {
                cwd: resolve(__dirname, "./"),
                stdio: ['pipe', 'pipe', 'pipe']
            }
        );

        execCommand.on('close', async (_code) => {
            this.isTaskRunning = false;
            // let execSync = require('child_process').execSync;
            // execSync('sleep ' + 5);
            // await this.sleep(20);
            const stats = statSync(this.uv4LogFile.path);
            while (curPos < stats.size) {
                const numRead = readSync(fd, buf, 0, 4096, curPos);
                if (numRead > 0) {
                    curPos += numRead;
                    const txt = this.dealLog(buf.slice(0, numRead));
                    this.taskChannel?.append(txt);
                }
            }
            this.taskChannel?.appendLine(`Build Finished!`);
            closeSync(fd);
            logWatcher.removeAllListeners();
            // watcher.dispose();
            commands.executeCommand('workbench.action.focusActiveEditorGroup');
        });



    }

    dealLog(logTxt: Buffer): string {
        let logStr = decode(logTxt, 'cp936');
        const srcFileExp: RegExp = /((\.\.\/)?.*\..\(\d+\)):/g;

        if (srcFileExp.test(logStr)) {
            const prjRoot = this.project.uvprjFile.dir;
            logStr = logStr.replace(srcFileExp, function (_match, str) {
                return normalize(prjRoot + File.sep + str);
            });
        }

        return logStr;

    }
    
    build() {
        this.runAsyncTask('Build', 'b');
    }

    rebuild() {
        this.runAsyncTask('Rebuild', 'r');
    }

    download() {
        this.runAsyncTask('Download', 'f');
    }

    updateSourceRefs() {
        const rePath = this.getOutputFolder(this.targetDOM);
        if (rePath) {
            const outPath = this.project.toAbsolutePath(rePath);
            this.fGroups.forEach((group) => {
                group.sources.forEach((source) => {
                    if (source.enable) { // if source not disabled
                        const refFile = File.fromArray([outPath, source.file.noSuffixName + '.d']);
                        if (refFile.isFile()) {
                            const refFileList = this.parseRefLines(this.targetDOM, refFile.read().split(/\r\n|\n/))
                                .map((rePath) => { return this.project.toAbsolutePath(rePath); });
                            source.children = refFileList.map((refFilePath) => {
                                return new Source(source.prjID, new File(refFilePath));
                            });
                        }
                    }
                });
            });
            this._event.emit('dataChanged');
        }
    }

    close() {
        this.uv4LogLockFileWatcher.close();
    }

    getChildViews(): IView[] | undefined {
        return this.fGroups;
    }

    protected abstract checkProject(target: any): Error | undefined;

    protected abstract getIncString(target: any): string;
    protected abstract getDefineString(target: any): string;
    protected abstract getSysDefines(target: any): string[];
    protected abstract getRteDefines(target: any): string[];
    protected abstract getGroups(target: any): any[];
    protected abstract getSystemIncludes(target: any): string[] | undefined;
    protected abstract getRTEIncludes(target: any, rteDom: any): string[] | undefined;

    protected abstract getOutputFolder(target: any): string | undefined;
    protected abstract parseRefLines(target: any, lines: string[]): string[];

    protected abstract getProblemMatcher(): string[];

    protected abstract getKeilPlatform(): string;
}

//===============================================

class C51Target extends Target {

    protected checkProject(target: any): Error | undefined {
        if (target['TargetOption']['Target51'] === undefined ||
            target['TargetOption']['Target51']['C51'] === undefined) {
            return new Error(`This uVision project is not a C51 project, but have a 'uvproj' suffix !`);
        }

    }

    protected getKeilPlatform(): string {
        return "C51";
    }

    protected parseRefLines(_target: any, _lines: string[]): string[] {
        return [];
    }

    protected getOutputFolder(_target: any): string | undefined {
        return undefined;
    }

    protected getSysDefines(_target: any): string[] {
        return [
            '__C51__',
            '__VSCODE_C51__',
            'reentrant=',
            'compact=',
            'small=',
            'large=',
            'data=',
            'idata=',
            'pdata=',
            'bdata=',
            'xdata=',
            'code=',
            'bit=char',
            'sbit=char',
            'sfr=char',
            'sfr16=int',
            'sfr32=int',
            'interrupt=',
            'using=',
            '_at_=',
            '_priority_=',
            '_task_='
        ];
    }

    protected getRteDefines(target: any): string[] {
        if (target) {
            const components = target['components']['component'];
            const apis = target['apis']['api'];
            if (Array.isArray(components) || Array.isArray(apis)) {
                return ["_RTE_"];
            }
        }
        return [];
    }

    protected getSystemIncludes(target: any): string[] | undefined {
        const keilRootDir = new File(ResourceManager.getInstance().getKeilRootDir(this.getKeilPlatform()));
        const vendor = target['TargetOption']['TargetCommonOption']['Vendor'];
        const list = [];
        if (keilRootDir.isDir()) {
            const c51Inc = `${keilRootDir.path}${File.sep}C51${File.sep}INC`;
            const vendorInc = `${c51Inc}${File.sep}${vendor}`;
            const vendorDirFile = new File(vendorInc);
            list.push(c51Inc);
            if (vendorDirFile.isExist() && vendorDirFile.isDir()) {
                list.push(vendorInc);
            }
            return list;
        }
        return undefined;
    }

    protected getRTEIncludes(_target: any, _rteDom: any): string[] | undefined {
        return undefined;
    }

    protected getIncString(target: any): string {
        const target51 = target['TargetOption']['Target51']['C51'];
        return target51['VariousControls']['IncludePath'];
    }

    protected getDefineString(target: any): string {
        const target51 = target['TargetOption']['Target51']['C51'];
        return target51['VariousControls']['Define'];
    }

    protected getGroups(target: any): any[] {
        return target['Groups']['Group'] || [];
    }

    protected getProblemMatcher(): string[] {
        return ['$c51'];
    }
}

class C251Target extends Target {

    protected checkProject(target: any): Error | undefined {
        if (target['TargetOption']['Target251'] === undefined ||
            target['TargetOption']['Target251']['C251'] === undefined) {
            return new Error(`This uVision project is not a C251 project, but have a 'uvproj' suffix !`);
        }

    }

    protected getKeilPlatform(): string {
        return "C251";
    }

    protected parseRefLines(_target: any, _lines: string[]): string[] {
        return [];
    }

    protected getOutputFolder(_target: any): string | undefined {
        return undefined;
    }

    protected getSysDefines(_target: any): string[] {
        return [
            '__C251__',
            '__VSCODE_C251__',
            'reentrant=',
            'compact=',
            'small=',
            'large=',
            'data=',
            'idata=',
            'pdata=',
            'bdata=',
            'edata=',
            'xdata=',
            'code=',
            'bit=char',
            'sbit=char',
            'sfr=char',
            'sfr16=int',
            'sfr32=int',
            'interrupt=',
            'using=',
            'far=',
            '_at_=',
            '_priority_=',
            '_task_='
        ];
    }

    protected getRteDefines(target: any): string[] {
        if (target) {
            const components = target['components']['component'];
            const apis = target['apis']['api'];
            if (Array.isArray(components) || Array.isArray(apis)) {
                return ["_RTE_"];
            }
        }
        return [];
    }

    protected getSystemIncludes(target: any): string[] | undefined {
        const keilRootDir = new File(ResourceManager.getInstance().getKeilRootDir(this.getKeilPlatform()));
        const vendor = target['TargetOption']['TargetCommonOption']['Vendor'];
        const list = [];
        if (keilRootDir.isDir()) {
            const c251Inc = `${keilRootDir.path}${File.sep}C251${File.sep}INC`;
            const vendorInc = `${c251Inc}${File.sep}${vendor}`;
            const vendorDirFile = new File(vendorInc);
            list.push(c251Inc);
            if (vendorDirFile.isExist() && vendorDirFile.isDir()) {
                list.push(vendorInc);
            }
            return list;
        }
        return undefined;
    }

    protected getRTEIncludes(_target: any, _rteDom: any): string[] | undefined {
        return undefined;
    }

    protected getIncString(target: any): string {
        const target51 = target['TargetOption']['Target251']['C251'];
        return target51['VariousControls']['IncludePath'];
    }

    protected getDefineString(target: any): string {
        const target51 = target['TargetOption']['Target251']['C251'];
        return target51['VariousControls']['Define'];
    }

    protected getGroups(target: any): any[] {
        return target['Groups']['Group'] || [];
    }

    protected getProblemMatcher(): string[] {
        return ['$c251'];
    }
}

class MacroHandler {
    private regMatchers = {
        'normalMacro': /^#define (\w+) (.*)$/,
        'funcMacro': /^#define (\w+\([^\)]*\)) (.*)$/
    };

    toExpression(macro: string): string | undefined {

        let mList = this.regMatchers['normalMacro'].exec(macro);
        if (mList && mList.length > 2) {
            return `${mList[1]}=${mList[2]}`;
        }

        mList = this.regMatchers['funcMacro'].exec(macro);
        if (mList && mList.length > 2) {
            return `${mList[1]}=`;
        }
    }
}

class ArmTarget extends Target {

    private static readonly armccMacros: string[] = [
        '__CC_ARM',
        '__arm__',
        '__align(x)=',
        '__ALIGNOF__(x)=',
        '__alignof__(x)=',
        '__asm(x)=',
        '__forceinline=',
        '__restrict=',
        '__global_reg(n)=',
        '__inline=',
        '__int64=long long',
        '__INTADDR__(expr)=0',
        '__irq=',
        '__packed=',
        '__pure=',
        '__smc(n)=',
        '__svc(n)=',
        '__svc_indirect(n)=',
        '__svc_indirect_r7(n)=',
        '__value_in_regs=',
        '__weak=',
        '__writeonly=',
        '__declspec(x)=',
        '__attribute__(x)=',
        '__nonnull__(x)=',
        '__register=',

        '__breakpoint(x)=',
        '__cdp(x,y,z)=',
        '__clrex()=',
        '__clz(x)=0U',
        '__current_pc()=0U',
        '__current_sp()=0U',
        '__disable_fiq()=',
        '__disable_irq()=',
        '__dmb(x)=',
        '__dsb(x)=',
        '__enable_fiq()=',
        '__enable_irq()=',
        '__fabs(x)=0.0',
        '__fabsf(x)=0.0f',
        '__force_loads()=',
        '__force_stores()=',
        '__isb(x)=',
        '__ldrex(x)=0U',
        '__ldrexd(x)=0U',
        '__ldrt(x)=0U',
        '__memory_changed()=',
        '__nop()=',
        '__pld(...)=',
        '__pli(...)=',
        '__qadd(x,y)=0',
        '__qdbl(x)=0',
        '__qsub(x,y)=0',
        '__rbit(x)=0U',
        '__rev(x)=0U',
        '__return_address()=0U',
        '__ror(x,y)=0U',
        '__schedule_barrier()=',
        '__semihost(x,y)=0',
        '__sev()=',
        '__sqrt(x)=0.0',
        '__sqrtf(x)=0.0f',
        '__ssat(x,y)=0',
        '__strex(x,y)=0U',
        '__strexd(x,y)=0',
        '__strt(x,y)=',
        '__swp(x,y)=0U',
        '__usat(x,y)=0U',
        '__wfe()=',
        '__wfi()=',
        '__yield()=',
        '__vfp_status(x,y)=0'
    ];

    private static readonly armclangMacros: string[] = [
        '__alignof__(x)=',
        '__asm(x)=',
        '__asm__(x)=',
        '__forceinline=',
        '__restrict=',
        '__volatile__=',
        '__inline=',
        '__inline__=',
        '__declspec(x)=',
        '__attribute__(x)=',
        '__nonnull__(x)=',
        '__unaligned=',
        '__promise(x)=',
        '__irq=',
        '__swi=',
        '__weak=',
        '__register=',
        '__pure=',
        '__value_in_regs=',

        '__breakpoint(x)=',
        '__current_pc()=0U',
        '__current_sp()=0U',
        '__disable_fiq()=',
        '__disable_irq()=',
        '__enable_fiq()=',
        '__enable_irq()=',
        '__force_stores()=',
        '__memory_changed()=',
        '__schedule_barrier()=',
        '__semihost(x,y)=0',
        '__vfp_status(x,y)=0',

        '__builtin_arm_nop()=',
        '__builtin_arm_wfi()=',
        '__builtin_arm_wfe()=',
        '__builtin_arm_sev()=',
        '__builtin_arm_sevl()=',
        '__builtin_arm_yield()=',
        '__builtin_arm_isb(x)=',
        '__builtin_arm_dsb(x)=',
        '__builtin_arm_dmb(x)=',

        '__builtin_bswap32(x)=0U',
        '__builtin_bswap16(x)=0U',
        '__builtin_arm_rbit(x)=0U',

        '__builtin_clz(x)=0U',
        '__builtin_arm_ldrex(x)=0U',
        '__builtin_arm_strex(x,y)=0U',
        '__builtin_arm_clrex()=',
        '__builtin_arm_ssat(x,y)=0U',
        '__builtin_arm_usat(x,y)=0U',
        '__builtin_arm_ldaex(x)=0U',
        '__builtin_arm_stlex(x,y)=0U'
    ];

    private static armclangBuildinMacros: string[] | undefined;

    constructor(prjInfo: KeilProjectInfo, uvInfo: UVisonInfo, targetDOM: any, rteDom: any) {
        super(prjInfo, uvInfo, targetDOM, rteDom);
    }

    protected checkProject(): Error | undefined {
        return undefined;
    }

    protected getKeilPlatform(): string {
        return "MDK";
    }

    protected getOutputFolder(target: any): string | undefined {
        try {
            return <string>target['TargetOption']['TargetCommonOption']['OutputDirectory'];
        } catch (error) {
            return undefined;
        }
    }

    private gnuParseRefLines(lines: string[]): string[] {

        const resultList: Set<string> = new Set();

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const _line = lines[lineIndex];

            const line = _line[_line.length - 1] === '\\' ? _line.substring(0, _line.length - 1) : _line; // remove char '\'
            const subLines = line.trim().split(/(?<![\\:]) /);

            if (lineIndex === 0) // first line
            {
                for (let i = 1; i < subLines.length; i++) // skip first sub line
                {
                    resultList.add(subLines[i].trim().replace(/\\ /g, " "));
                }
            }
            else  // other lines, first char is whitespace
            {
                subLines.forEach((item) => {
                    resultList.add(item.trim().replace(/\\ /g, " "));
                });
            }
        }

        return Array.from(resultList);
    }

    private ac5ParseRefLines(lines: string[], startIndex = 1): string[] {

        const resultList: Set<string> = new Set<string>();

        for (let i = startIndex; i < lines.length; i++) {
            const sepIndex = lines[i].indexOf(": ");
            if (sepIndex > 0) {
                const line: string = lines[i].substring(sepIndex + 1).trim();
                resultList.add(line);
            }
        }

        return Array.from(resultList);
    }

    protected parseRefLines(target: any, lines: string[]): string[] {
        if (target['uAC6'] === 1) { // ARMClang
            return this.gnuParseRefLines(lines);
        } else { // ARMCC
            return this.ac5ParseRefLines(lines);
        }
    }

    private initArmclangMacros(cpuType: string | undefined) {
        if (ArmTarget.armclangBuildinMacros === undefined) {
            const armClangPath = `${ResourceManager.getInstance().getKeilRootDir(this.getKeilPlatform())}${File.sep}ARM${File.sep}ARMCLANG${File.sep}bin${File.sep}armclang.exe`;
            cpuType = cpuType?.replaceAll('"', '');
            const armClangCpu = this.getArmCpuType(cpuType);
            ArmTarget.armclangBuildinMacros = this.getArmClangMacroList(armClangPath, armClangCpu);
        }
    }

    protected getSysDefines(target: any): string[] {
        if (target['uAC6'] === 1) { // ARMClang
            this.initArmclangMacros(target['TargetOption']['TargetArmAds']['ArmAdsMisc']['AdsCpuType']);
            return ArmTarget.armclangMacros.concat(ArmTarget.armclangBuildinMacros || []);
        } else { // ARMCC
            return ArmTarget.armccMacros;
        }
    }

    protected getRteDefines(target: any): string[] {
        if (target) {
            const components = target['components']['component'];
            const apis = target['apis']['api'];
            if (Array.isArray(components) || Array.isArray(apis)) {
                return ["_RTE_"];
            }
        }
        return [];
    }

    private getArmClangMacroList(armClangPath: string, armClangCpu?: string): string[] {
        try {
            const cmdLine = CmdLineHandler.quoteString(armClangPath, '"')
                + ' ' + ['--target=arm-arm-none-eabi', armClangCpu, '-E', '-dM', '-', '<nul'].join(' ');

            const lines = execSync(cmdLine).toString().split(/\r\n|\n/);
            const resList: string[] = [];
            const mHandler = new MacroHandler();

            lines.filter((line) => { return line.trim() !== ''; })
                .forEach((line) => {
                    const value = mHandler.toExpression(line);
                    if (value) {
                        resList.push(value);
                    }
                });

            return resList;
        } catch (error) {
            return ['__GNUC__=4', '__GNUC_MINOR__=2', '__GNUC_PATCHLEVEL__=1'];
        }
    }

    private getArmCpuType(cpu: string | undefined) {
        switch (cpu) {
            case 'Cortex-M0':
                return '-mcpu=Cortex-M0';
            case 'Cortex-M0+':
                return '-mcpu=cortex-m0plus';
            case 'Cortex-M1':
                return '-mcpu=Cortex-M1';
            case 'Cortex-M3':
                return '-mcpu=Cortex-M3';
            case 'Cortex-M4':
                return '-mcpu=Cortex-M4';
            case 'Cortex-M7':
                return '-mcpu=Cortex-M7';
            case 'Cortex-M23':
                return '-mcpu=Cortex-M23';
            case 'Cortex-M33':
                return '-mcpu=Cortex-M33';
            case 'Cortex-M35P':
                return '-mcpu=Cortex-M35P';
            case 'Cortex-M55':
                return '-mcpu=Cortex-M55';
            case 'Cortex-M85':
                return '-mcpu=Cortex-M85';
            case 'SC000':
                return '-mcpu=SC000';
            case 'SC300':
                return '-mcpu=SC300';
            case 'ARMV8MBL':
                return '-march=armv8-m.base';
            case 'ARMV8MML':
                return '-march=armv8-m.main';
            case 'ARMV81MML':
                return '-march=armv8.1-m.main';
            case 'Cortex-A5':
                return '-mcpu=Cortex-A5';
            case 'Cortex-A7':
                return '-mcpu=Cortex-A7';
            case 'Cortex-A9':
                return '-mcpu=Cortex-A9';

        }
    }
    /*
    private getArmClangCpu(cpu: string | undefined, fpu?: string | undefined,
        dsp?: string | undefined, mve?: string | undefined) {
        switch (cpu) {
            case 'Cortex-M0':
                return '-mcpu=Cortex-M0 -mfpu=none';
            case 'Cortex-M0+':
                return '-mcpu=cortex-m0plus -mfpu=none';
            case 'Cortex-M1':
                return '-mcpu=Cortex-M1 -mfpu=none';
            case 'Cortex-M3':
                return '-mcpu=Cortex-M3 -mfpu=none';
            case 'Cortex-M4':
                if (fpu === 'SP_FPU') {
                    return '-mcpu=Cortex-M4 -mfpu=fpv4-sp-d16 -mfloat-abi=hard';
                }
                return '-mcpu=Cortex-M4 -mfpu=none';
            case 'Cortex-M7':
                if (fpu === 'DP_FPU') {
                    return '-mcpu=Cortex-M7 -mfpu=fpv5-d16 -mfloat-abi=hard';
                }
                if (fpu === 'SP_FPU') {
                    return '-mcpu=Cortex-M7 -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
                }
                return '-mcpu=Cortex-M7 -mfpu=none';
            case 'Cortex-M23':
                return '-mcpu=Cortex-M23 -mfpu=none';
            case 'Cortex-M33':
                if (fpu === 'SP_FPU') {
                    if (dsp === 'DSP') {
                        return '-mcpu=Cortex-M33 -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
                    }
                    return '-mcpu=Cortex-M33+nodsp -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
                }
                if (dsp === 'DSP') {
                    return '-mcpu=Cortex-M33 -mfpu=none';
                }
                return '-mcpu=Cortex-M33+nodsp -mfpu=none';
            case 'Cortex-M35P':
                if (fpu === 'SP_FPU') {
                    if (dsp === 'DSP') {
                        return '-mcpu=Cortex-M35P -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
                    }
                    return '-mcpu=Cortex-M35P+nodsp -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
                }
                if (dsp === 'DSP') {
                    return '-mcpu=Cortex-M35P -mfpu=none';
                }
                return '-mcpu=Cortex-M35P+nodsp -mfpu=none';
            case 'Cortex-M55':
                if (fpu === 'NO_FPU') {
                    if (mve === 'NO_MVE') {
                        return '-mcpu=Cortex-M55+nofp+nomve';
                    }
                    return '-mcpu=Cortex-M55+nofp';
                }
                if (mve === 'NO_MVE') {
                    return '-mcpu=Cortex-M55+nomve -mfloat-abi=hard';
                }
                if (mve === 'MVE') {
                    return '-mcpu=Cortex-M55+nomve.fp -mfloat-abi=hard';
                }
                return '-mcpu=Cortex-M55 -mfloat-abi=hard';
            case 'Cortex-M85':
                if (fpu === 'NO_FPU') {
                    if (mve === 'NO_MVE') {
                        return '-mcpu=Cortex-M85+nofp+nomve';
                    }
                    return '-mcpu=Cortex-M85+nofp';
                }
                if (mve === 'NO_MVE') {
                    return '-mcpu=Cortex-M85+nomve -mfloat-abi=hard';
                }
                if (mve === 'MVE') {
                    return '-mcpu=Cortex-M85+nomve.fp -mfloat-abi=hard';
                }
                return '-mcpu=Cortex-M85 -mfloat-abi=hard';
            case 'SC000':
                return '-mcpu=SC000 -mfpu=none';
            case 'SC300':
                return '-mcpu=SC300 -mfpu=none';
            case 'ARMV8MBL':
                return '-march=armv8-m.base';
            case 'ARMV8MML':
                if (fpu === 'NO_FPU') {
                    if (dsp === 'NO_DSP') {
                        return '-march=armv8-m.main -mfpu=none -mfloat-abi=soft';
                    }
                    return '-march=armv8-m.main+dsp -mfpu=none -mfloat-abi=soft';
                }
                if (fpu === 'SP_FPU') {
                    if (dsp === 'NO_DSP') {
                        return '-march=armv8-m.main -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
                    }
                    return '-march=armv8-m.main+dsp -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
                }
                if (fpu === 'DP_FPU') {
                    if (dsp === 'NO_DSP') {
                        return '-march=armv8-m.main -mfpu=fpv5-d16 -mfloat-abi=hard';
                    }
                    return '-march=armv8-m.main+dsp -mfpu=fpv5-d16 -mfloat-abi=hard';
                }
                return '';
            case 'ARMV81MML':
                if (fpu === 'NO_FPU') {
                    if (dsp === 'NO_DSP') {
                        if (mve === 'NO_MVE') {
                            return '-march=armv8.1-m.main+nofp -mfloat-abi=soft';
                        }
                        return '-march=armv8.1-m.main+mve+nofp -mfloat-abi=soft';
                    }
                    if (mve === 'NO_MVE') {
                        return '-march=armv8.1-m.main+dsp+nofp -mfloat-abi=soft';
                    }
                    return '-march=armv8.1-m.main+dsp+mve+nofp -mfloat-abi=soft';
                }
                if (fpu === 'SP_FPU') {
                    if (dsp === 'NO_DSP') {
                        if (mve === 'NO_MVE') {
                            return '-march=armv8.1-m.main+fp -mfloat-abi=hard';
                        }
                        if (mve === 'MVE') {
                            return '-march=armv8.1-m.main+mve+fp -mfloat-abi=hard';
                        }
                        return '-march=armv8.1-m.main+mve.fp+fp -mfloat-abi=hard';
                    }
                    if (mve === 'NO_MVE') {
                        return '-march=armv8.1-m.main+dsp+fp -mfloat-abi=hard';
                    }
                    if (mve === 'MVE') {
                        return '-march=armv8.1-m.main+dsp+mve+fp -mfloat-abi=hard';
                    }
                    return '-march=armv8.1-m.main+dsp+mve.fp+fp -mfloat-abi=hard';

                }
                if (fpu === 'DP_FPU') {
                    if (dsp === 'NO_DSP') {
                        if (mve === 'NO_MVE') {
                            return '-march=armv8.1-m.main+fp.dp -mfloat-abi=hard';
                        }
                        if (mve === 'MVE') {
                            return '-march=armv8.1-m.main+mve+fp.dp -mfloat-abi=hard';
                        }
                        return '-march=armv8.1-m.main+mve.fp+fp.dp -mfloat-abi=hard';
                    }
                    if (mve === 'NO_MVE') {
                        return '-march=armv8.1-m.main+dsp+fp.dp -mfloat-abi=hard';
                    }
                    if (mve === 'MVE') {
                        return '-march=armv8.1-m.main+dsp+mve+fp.dp -mfloat-abi=hard';
                    }
                    return '-march=armv8.1-m.main+dsp+mve.fp+fp.dp -mfloat-abi=hard';

                }

                return '';
            case 'Cortex-A5':
                if (fpu === 'DP_FPU') {
                    return '-mcpu=Cortex-A5 -mfpu=vfpv3-d16-fp16 -mfloat-abi=hard';
                }
                return '-mcpu=Cortex-A5 -mfpu=none';
            case 'Cortex-A7':
                if (fpu === 'DP_FPU') {
                    return '-mcpu=Cortex-A7 -mfpu=vfpv4-d16 -mfloat-abi=hard';
                }
                return '-mcpu=Cortex-A7 -mfpu=none';
            case 'Cortex-A9':
                if (fpu === 'DP_FPU') {
                    return '-mcpu=Cortex-A9 -mfpu=vfpv3-d16-fp16 -mfloat-abi=hard';
                }
                return '-mcpu=Cortex-A9 -mfpu=none';

        }
    }
*/
    protected getSystemIncludes(target: any): string[] | undefined {
        const keilRootDir = new File(ResourceManager.getInstance().getKeilRootDir(this.getKeilPlatform()));
        if (keilRootDir.isDir()) {
            const toolName = target['uAC6'] === 1 ? 'ARMCLANG' : 'ARMCC';
            const incDir = new File(`${keilRootDir.path}${File.sep}ARM${File.sep}${toolName}${File.sep}include`);
            if (incDir.isDir()) {
                return [incDir.path].concat(
                    incDir.getList(File.emptyFilter).map((dir) => { return dir.path; }));
            }
            return [incDir.path];
        }
        return undefined;
    }

    protected getRTEIncludes(_target: any, rteDom: any): string[] | undefined {
        if (!rteDom) { return undefined; }
        //
        const componentList = rteDom['components']['component'];
        let components: Array<any> = [];
        let incList: string[] = [];
        const incMap: Map<string, string> = new Map();
        const keilRootDir = ResourceManager.getInstance().getKeilRootDir(this.getKeilPlatform());

        const packsDir = `${keilRootDir}${File.sep}ARM${File.sep}Packs`;;

        const options = {
            attributeNamePrefix: "@_",
            attrNodeName: "attr", //default is 'false'
            textNodeName: "#text",
            ignoreAttributes: false,
            ignoreNameSpace: false,
            allowBooleanAttributes: false,
            parseNodeValue: true,
            parseAttributeValue: false,
            trimValues: true,
            cdataTagName: "__cdata", //default is 'false'
            cdataPositionChar: "\\c",
            parseTrueNumberOnly: false,
            arrayMode: false, //"strict"
            attrValueProcessor: (val: any, _attrName: any) => heDecode(val, { isAttributeValue: true }),//default is a=>a
            tagValueProcessor: (val: any, _tagName: any) => heDecode(val), //default is a=>a
            stopNodes: ["parse-me-as-string"]
        };
        const parser = new XMLParser(options);
        const cache = new Map<string, any>();
        let pdscDom: any | undefined;
        if (Array.isArray(componentList)) {
            components = components.concat(componentList);
        } else {
            components.push(componentList);
        }
        for (const component of components) {
            const cClass = component['@_Cclass'];
            const cGroup = component['@_Cgroup'];
            const cSub = component['@_Csub'];
            const cVendor = component['@_Cvendor'];
            const cVersion = component['@_Cversion'];
            const cCondition = component['@_condition'];
            const cPackage = component['package'];
            const pkgName = cPackage['@_name'];
            const pkgVendor = cPackage['@_vendor'];
            const pkgVersion = cPackage['@_version'];
            const cRootDir = `${packsDir}${File.sep}${pkgVendor}${File.sep}${pkgName}${File.sep}${pkgVersion}`;
            const pdscPath = `${cRootDir}${File.sep}${cVendor}.${pkgName}.pdsc`;

            if (cache.has(pdscPath)) {
                pdscDom = cache.get(pdscPath);
            } else {
                const pdsc = new File(pdscPath);
                if (pdsc.isExist() && pdsc.isFile()) {
                    const pdscdoc = pdsc.read();
                    pdscDom = parser.parse(pdscdoc);
                    cache.set(pdscPath, pdscDom);
                } else {
                    continue;
                }
            }
            if (pdscDom) {
                const pdscComponents = pdscDom['package']['components']['component'];
                if (Array.isArray(pdscComponents)) {
                    let hasInc = false;
                    for (const pdscComponent of pdscComponents) {
                        const pdscClass = pdscComponent['@_Cclass'];
                        const pdscGroup = pdscComponent['@_Cgroup'];
                        const pdscCondition = pdscComponent['@_condition'];
                        const pdscVersion = pdscComponent['@_Cversion'];
                        const pdscSub = pdscComponent['@_Csub'];
                        const pdscfileList = pdscComponent['files']['file'];
                        let subEq = true;
                        if (pdscSub !== undefined && cSub !== undefined) {
                            subEq = pdscSub === cSub;
                        } else {
                            subEq = true;
                        }

                        if (pdscClass === cClass
                            && pdscGroup === cGroup
                            && pdscVersion === cVersion
                            && pdscCondition === cCondition
                            && subEq
                            && Array.isArray(pdscfileList)) {
                            for (const file of pdscfileList) {
                                const category = file['@_category'];
                                if (category === 'include') {
                                    const name = file['@_name'];
                                    incMap.set(File.toLocalPath(`${cRootDir}${File.sep}${name}`), name);
                                    hasInc = true;
                                    break;
                                }

                                if (category === 'header') {
                                    const name = file['@_name'] as string;
                                    const pos = name.lastIndexOf("/");
                                    const inc = name.substring(0, pos);
                                    if (!incMap.has(inc)) {
                                        incMap.set(File.toLocalPath(`${cRootDir}${File.sep}${inc}`), inc);
                                    }
                                    hasInc = true;
                                    break;
                                }
                            }

                        }
                        if (hasInc) {
                            break;
                        }
                    }
                }
            }
        }

        cache.clear();
        incMap.forEach((_, key) => {
            incList.push(key);
        });
        incMap.clear();
        // console.log("incList", incList);
        return incList;

    }

    protected getIncString(target: any): string {
        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        return dat['VariousControls']['IncludePath'];
    }

    protected getDefineString(target: any): string {
        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        return dat['VariousControls']['Define'];
    }

    protected getGroups(target: any): any[] {
        return target['Groups']['Group'] || [];
    }

    protected getProblemMatcher(): string[] {
        return ['$armcc', '$gcc'];
    }

}

//================================================

class ProjectExplorer implements TreeDataProvider<IView> {

    private itemClickCommand = 'Item.Click';

    onDidChangeTreeData: Event<IView>;
    private viewEvent: EventEmitter<IView>;

    private prjList: Map<string, KeilProject>;
    private curActiveProject: KeilProject | undefined;
    private workspacePath: string | undefined;

    constructor(context: ExtensionContext) {
        this.prjList = new Map();
        this.viewEvent = new EventEmitter();
        this.onDidChangeTreeData = this.viewEvent.event;
        context.subscriptions.push(window.registerTreeDataProvider('project', this));
        context.subscriptions.push(commands.registerCommand(this.itemClickCommand, (item: IView) => this.onItemClick(item)));
    }

    async loadWorkspace() {
        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            this.workspacePath = workspace.workspaceFile && /^file:/.test(workspace.workspaceFile.toString()) ?
                dirname(workspace.workspaceFile.fsPath) : workspace.workspaceFolders[0].uri.fsPath;

            const prjWorkspace = new File(this.workspacePath);
            // channel.show();
            if (prjWorkspace.isDir()) {
                channel.show();
                channel.appendLine('search uvprj[x] project file; >>>>>');
                const excludeList = ResourceManager.getInstance().getProjectExcludeList();
                let uvList: string[] = [];

                // Multiply project workspace
                const uvmwList = await this.findProject(prjWorkspace.path, [/\.uvmpw$/i], 1);
                if (uvmwList && uvmwList.length !== 0) {
                    const options = {
                        attributeNamePrefix: "@_",
                        attrNodeName: "attr", //default is 'false'
                        textNodeName: "#text",
                        ignoreAttributes: false,
                        ignoreNameSpace: false,
                        allowBooleanAttributes: false,
                        parseNodeValue: true,
                        parseAttributeValue: false,
                        trimValues: true,
                        cdataTagName: "__cdata", //default is 'false'
                        cdataPositionChar: "\\c",
                        parseTrueNumberOnly: false,
                        arrayMode: false, //"strict"
                        // attrValueProcessor: (val: any, attrName: any) => decode(val, { isAttributeValue: true }),//default is a=>a
                        // tagValueProcessor: (val: any, tagName: any) => decode(val), //default is a=>a
                        stopNodes: ["parse-me-as-string"]
                    };
                    const xmlParser = new XMLParser(options);
                    uvmwList.forEach(uvwPath => {
                        let stat = statSync(uvwPath);
                        if (stat.isFile()) {
                            const uvmpwXml = readFileSync(uvwPath);
                            const uvmpw = xmlParser.parse(uvmpwXml);
                            const projectList = uvmpw['ProjectWorkspace']['project'];
                            if (Array.isArray(projectList)) {
                                uvList = projectList.map<string>(p => {
                                    let path = p['PathAndName'] as string;
                                    if (path.indexOf('.\\') !== -1) {
                                        path = path.replace('.\\', '');
                                        path = `${prjWorkspace.path}${File.sep}${path}`;
                                    }
                                    return path;
                                });
                            }
                        }
                    });
                } else {
                    uvList = await this.findProject(prjWorkspace.path, [/\.uvproj[x]?$/i], 1);
                    // uvList = workspace.getList([/\.uvproj[x]?$/i], File.emptyFilter);
                }


                // uvList.concat()
                ResourceManager.getInstance().getProjectFileLocationList().forEach(
                    str => {
                        // uvList = uvList.concat(workspace.path2File(str, [/\.uvproj[x]?$/i], File.emptyFilter));
                        uvList.push(str);
                    }
                );
                // uvList.filter((file) => { return !excludeList.includes(file.name); });
                uvList.filter((path) => {
                    const name = path.substring(path.lastIndexOf('.'));
                    return !excludeList.includes(name);
                });

                // console.log("worckspace", uvList, uvmwList);

                for (const uvPath of uvList) {
                    try {
                        // console.log('prj uvFile start', uvPath);
                        // channel.appendLine(uvPath);
                        await this.openProject(uvPath);
                    } catch (error) {
                        channel.appendLine(`Error: open project ${error}`);
                        window.showErrorMessage(`open project: '${uvPath}' failed !, msg: ${(<Error>error).message}`);
                    }
                }
            } else {
                channel.appendLine(`Error: this assistant working in folder}`);
            }
        }
    }

    async findProject(dir: string, fileFilter?: RegExp[], deep: number = 0): Promise<string[]> {
        const list: string[] = [];
        readdirSync(dir).filter((val) => {
            const path = join(dir, val);
            const stat = statSync(path);

            if (stat.isDirectory()) {
                return val;
            }
            if (fileFilter) {
                const name = val.substring(val.lastIndexOf('.'));
                let hasFile = false;
                for (const reg of fileFilter) {
                    if (reg.test(name)) {
                        hasFile = true;
                        break;
                    }
                }
                if (hasFile) {
                    return val;
                }
            }

        }).forEach(async fp => {
            if (fp !== '.' && fp !== '..') {
                const path = join(dir, fp);
                const stat = statSync(path);
                if (stat.isFile()) {
                    const name = path.substring(path.lastIndexOf('.'));
                    if (fileFilter) {
                        for (const reg of fileFilter) {
                            if (reg.test(name)) {
                                list.push(path);
                                break;
                            }
                        }
                    } else {
                        list.push(path);
                    }
                } else {
                    if (deep > 0) {
                        list.push(...await this.findProject(path, fileFilter, 0));
                    }
                }

            }
        });
        return list;
    }

    async openProject(path: string): Promise<KeilProject | undefined> {
        const nPrj = new KeilProject(new File(path), this.workspacePath);
        if (!this.prjList.has(nPrj.prjID)) {

            await nPrj.load();
            nPrj.on('dataChanged', () => this.updateView());
            this.prjList.set(nPrj.prjID, nPrj);

            if (this.curActiveProject === undefined) {
                this.curActiveProject = nPrj;
                this.curActiveProject.active();
            }

            this.updateView();

            return nPrj;
        }
    }

    async closeProject(pID: string) {
        const prj = this.prjList.get(pID);
        if (prj) {
            prj.deactive();
            prj.close();
            this.prjList.delete(pID);
            this.updateView();
        }
    }


    async activeProject(view: IView) {
        this.curActiveProject?.deactive();
        const project = this.prjList.get(view.prjID);
        project?.active();
        this.curActiveProject = project;
        this.updateView();

    }

    async switchTargetByProject(view: IView) {
        const prj = this.prjList.get(view.prjID);
        if (prj) {
            const tList = prj.getTargets();
            const targetName = await window.showQuickPick(tList.map((ele) => { return ele.targetName; }), {
                canPickMany: false,
                placeHolder: 'please select a target name for keil project'
            });
            if (targetName) {
                prj.setActiveTarget(targetName);
            }
        }
    }

    async statusBarSwitchTargetByProject() {
        if (this.curActiveProject) {
            const tList = this.curActiveProject?.getTargets();
            const targetName = await window.showQuickPick(tList.map((ele) => { return ele.targetName; }), {
                canPickMany: false,
                placeHolder: 'please select a target name for keil project'
            });
            if (targetName) {
                this.curActiveProject?.setActiveTarget(targetName);
            }
        }
    }

    getTarget(view?: IView): Target | undefined {
        if (view) {
            const prj = this.prjList.get(view.prjID);
            if (prj) {
                const targets = prj.getTargets();
                const index = targets.findIndex((target) => {
                    return target.targetName === view.label;
                });
                if (index !== -1) {
                    return targets[index];
                }
            }
        } else { // get active target
            if (this.curActiveProject) {
                return this.curActiveProject.getActiveTarget();
            } else {
                window.showWarningMessage('Not found any active project !');
            }
        }
    }

    updateView(v?: IView) {
        updateStatusBarItem(this.curActiveProject?.activeTargetName);
        this.viewEvent.fire(v!!);
    }

    //----------------------------------

    itemClickInfo: any = undefined;

    private async onItemClick(item: IView) {
        switch (item.contextVal) {
            case 'Source':
                {
                    const source = <Source>item;
                    const file = new File(normalize(source.file.path));

                    if (file.isFile()) { // file exist, open it

                        let isPreview = true;

                        if (this.itemClickInfo &&
                            this.itemClickInfo.name === file.path &&
                            this.itemClickInfo.time + 260 > Date.now()) {
                            isPreview = false;
                        }

                        // reset prev click info
                        this.itemClickInfo = {
                            name: file.path,
                            time: Date.now()
                        };

                        window.showTextDocument(Uri.parse(file.toUri()), { preview: isPreview });

                    } else {
                        window.showWarningMessage(`Not found file: ${source.file.path}`);
                    }
                }
                break;
            default:
                break;
        }
    }

    getTreeItem(element: IView): TreeItem {

        const res = new TreeItem(element.label);

        res.contextValue = element.contextVal;
        res.tooltip = element.tooltip;
        res.collapsibleState = element.getChildViews() === undefined ?
            TreeItemCollapsibleState.None : TreeItemCollapsibleState.Collapsed;

        if (element instanceof Source) {
            res.command = {
                title: element.label,
                command: this.itemClickCommand,
                arguments: [element]
            };
        }

        if (element.icons) {
            res.iconPath = {
                light: ResourceManager.getInstance().getIconByName(element.icons.light),
                dark: ResourceManager.getInstance().getIconByName(element.icons.dark)
            };
        }
        return res;
    }

    getChildren(element?: IView | undefined): ProviderResult<IView[]> {
        if (element === undefined) {
            return Array.from(this.prjList.values());
        } else {
            return element.getChildViews();
        }
    }
}

