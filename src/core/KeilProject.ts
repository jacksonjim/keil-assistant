
import { EventEmitter as EventsEmitter } from 'events';
import { FileWatcher } from '../node_utility/FileWatcher';
import { File } from '../node_utility/File';
import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import { Time } from '../node_utility/Time';
import { XMLParser } from 'fast-xml-parser';
import { normalize } from 'path';
import { KeilProjectInfo } from './KeilProjectInfo';

import { OutputChannel, window } from 'vscode';
import { IView } from './IView';
import { PTarget, UVisonInfo } from '../target/PTarget';
import { ArmTarget } from '../target/ArmTarget';
import { C251Target } from '../target/C251Target';
import { C51Target } from '../target/C51Target';

interface KeilProperties {
    project: object | any | undefined;
}

export class KeilProject implements IView, KeilProjectInfo {

    prjID: string;
    label: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'Project';
    icons?: { light: string; dark: string; } = {
        light: 'DeactiveApplication_16x',
        dark: 'DeactiveApplication_16x'
    };

    //-------------
    workspaceDir: string | undefined;
    vscodeDir: File;
    uvprjFile: File;
    logger: Console;

    // uVison info
    uVsionFileInfo: UVisonInfo;

    activeTargetName: string | undefined;
    private prevUpdateTime: number | undefined;

    protected _event: EventsEmitter;
    protected watcher: FileWatcher;
    protected targetList: PTarget[];

    keilVscodeProps: KeilProperties = {
        project: undefined,
    };

    constructor(private channel: OutputChannel, _uvprjFile: File, workspace: string | undefined) {
        this._event = new EventsEmitter();
        this.uVsionFileInfo = <UVisonInfo>{};
        this.targetList = [];
        this.workspaceDir = workspace;
        this.vscodeDir = new File(workspace + File.sep + '.vscode');
        this.vscodeDir.createDir();
        const logPath = this.vscodeDir.path + File.sep + 'keil-assistant.log';
        this.logger = new console.Console(createWriteStream(logPath, { flags: 'a+' }));
        this.uvprjFile = _uvprjFile;
        this.watcher = new FileWatcher(this.uvprjFile);
        this.prjID = this.getMD5(_uvprjFile.path);
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

    private getMD5(data: string): string {
        const md5 = createHash('md5');
        md5.update(data);
        return md5.digest('hex');
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
            const errorMsg = e instanceof Error ? e.message : String(e);
            this.channel.show();
            this.channel.appendLine(`XML解析失败: ${errorMsg}`);
            throw new Error(`Project load failed: ${errorMsg}`);
        }

        const targets = doc.Project.Targets.Target;
        const rteDom = doc.Project.RTE;

        // init uVsion info
        this.uVsionFileInfo.schemaVersion = doc.Project.SchemaVersion;

        if (Array.isArray(targets)) {
            for (const target of targets) {
                this.targetList.push(this.getInstance(target, rteDom));
            }
        } else {
            this.targetList.push(this.getInstance(targets, rteDom));
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

    getInstance(targetDOM: any, rteDom: any): PTarget {
        if (this.uvprjFile.suffix.toLowerCase() === '.uvproj') {

            if (targetDOM['TargetOption']['Target51'] !== undefined) {
                return new C51Target(this, this.uVsionFileInfo, targetDOM, rteDom);
            }

            if (targetDOM['TargetOption']['Target251'] !== undefined) {
                return new C251Target(this, this.uVsionFileInfo, targetDOM, rteDom);
            }

            if (targetDOM['TargetOption']['TargetArmAds'] !== undefined) {
                return new ArmTarget(this, this.uVsionFileInfo, targetDOM, rteDom);
            }
            return new ArmTarget(this, this.uVsionFileInfo, targetDOM, rteDom);
        } else {
            return new ArmTarget(this, this.uVsionFileInfo, targetDOM, rteDom);
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

    getTargetByName(name: string): PTarget | undefined {
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

    getActiveTarget(): PTarget | undefined {
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

    getTargets(): PTarget[] {
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
                this.logger.log(`[Warn] keil_project_properties.json parse failed !, ${error}`);
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