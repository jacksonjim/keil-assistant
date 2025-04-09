import { IView } from "../core/IView";
import { EventEmitter as EventsEmitter } from 'events';
import { File } from "../node_utility/File";
import { KeilProjectInfo } from "../core/KeilProjectInfo";
import { commands, l10n, OutputChannel, window } from "vscode";
import { FileGroup } from "../core/FileGroup";
import { normalize, resolve } from 'path';
import { ResourceManager } from "../ResourceManager";
import { Source } from "../core/Source";
import { closeSync, openSync, readSync, statSync, watchFile, writeFileSync } from "fs";
import { spawn } from "child_process";
import { decode } from "iconv-lite";

export interface UVisonInfo {
    schemaVersion: string | undefined;
}

export abstract class PTarget implements IView {

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
    // private uv4LogLockFileWatcher: FileWatcher;
    private isTaskRunning: boolean = false;
    private taskChannel: OutputChannel | undefined;

    constructor(prjInfo: KeilProjectInfo, uvInfo: UVisonInfo, targetDOM: any, rteDom: any) {
        this._event = new EventsEmitter();
        this.project = prjInfo;
        this.targetDOM = targetDOM;
        this.rteDom = rteDom;
        this.uvInfo = uvInfo;
        this.prjID = prjInfo.prjID;
        this.targetName = `${targetDOM['TargetName']}`;
        this.label = this.targetName;
        this.tooltip = this.targetName;
        this.cppConfigName = this.getCppConfigName(prjInfo, this.targetName);
        this.includes = new Set();
        this.defines = new Set();
        this.fGroups = [];
        this.uv4LogFile = new File(this.project.vscodeDir.path + File.sep + this.targetName + '_uv4.log');
    }

    private getCppConfigName(project: KeilProjectInfo, target: string): string {
        if (project.isMultiplyProject) {
            return `${target} for ${project.uvprjFile.noSuffixName}`;
        }
        return target;
    }

    private hashCode(str: string): number {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char; // 等价于 hash * 31 + char
            hash |= 0; // 将结果转换为 32 位整数
        }
        return hash;
    }

    on(event: 'dataChanged', listener: () => void): void;
    on(event: any, listener: () => void): void {
        this._event.on(event, listener);
    }

    private getDefCppProperties(): any {
        return {
            configurations: [
                {
                    name: this.cppConfigName,
                    intelliSenseMode: '${default}',
                    compilerPath: undefined,
                    cStandard: 'c99',
                    cppStandard: 'c++03',
                    includePath: undefined,
                    defines: undefined
                }
            ],
            version: 4
        };
    }

    private lastCppConfig: string = '';

    private updateCppProperties(cStandard: string, cppStandard: string, intelliSenseMode: string, compilerPath?: string, compilerArgs?: string[]) {

        const proFile = new File(this.project.vscodeDir.path + File.sep + 'c_cpp_properties.json');
        let obj: any;

        if (proFile.isFile()) {
            try {
                obj = JSON.parse(proFile.read());
            } catch (error) {
                this.project.logger.log(`[Error] c_cpp_properties.json parse error: ${error}`);
                obj = this.getDefCppProperties();
            }
        } else {
            obj = this.getDefCppProperties();
        }

        const configList: any[] = obj['configurations'];
        const index = configList.findIndex((conf) => { return conf.name === this.cppConfigName; });
        if (index === -1) {
            configList.push({
                name: `${this.cppConfigName}`,
                cStandard: cStandard,
                cppStandard: cppStandard,
                compilerPath: compilerPath,
                compilerArgs: compilerArgs,
                intelliSenseMode: intelliSenseMode,
                includePath: Array.from(this.includes),
                defines: Array.from(this.defines)
            });
        } else {
            configList[index]['compilerPath'] = compilerPath;
            configList[index]['compilerArgs'] = compilerArgs;
            configList[index]['cStandard'] = cStandard;
            configList[index]['cppStandard'] = cppStandard;
            configList[index]['intelliSenseMode'] = intelliSenseMode;
            configList[index]['includePath'] = Array.from(this.includes);
            configList[index]['defines'] = Array.from(this.defines);
        }

        // proFile.write(JSON.stringify(obj, undefined, 4));
        const newConfig = JSON.stringify(obj, undefined, 4);
        if (this.lastCppConfig !== newConfig) {
            proFile.write(newConfig);
            this.lastCppConfig = newConfig;
        }
    }

    async load(): Promise<void> {

        // check target is valid
        const err = this.checkProject(this.targetDOM);
        if (err) {
            console.error(`check project failed, ${err}`);
            throw err;
        }

        const incListStr: string = this.getIncString(this.targetDOM);
        const defineListStr: string = this.getDefineString(this.targetDOM);
        const _groups: any = this.getGroups(this.targetDOM);
        const sysIncludes = this.getSystemIncludes(this.targetDOM);
        const rteIncludes = this.getRTEIncludes(this.targetDOM, this.rteDom);

        const cStandard = this.getCStandard(this.targetDOM);
        const cppStandard = this.getCppStandard(this.targetDOM);
        const intelliSenseMode = this.getIntelliSenseMode(this.targetDOM);

        // set includes
        this.includes.clear();
        this.includes.add('${workspaceFolder}/**');

        if (sysIncludes) {
            sysIncludes.forEach((incPath) => {
                incPath = incPath.trim();
                if (incPath !== '')
                    this.includes.add(incPath);
            });
        }
        if (rteIncludes) {
            rteIncludes.forEach((incPath) => {
                incPath = incPath.trim();
                if (incPath !== '')
                    this.includes.add(incPath);
            });
        }

        const prjIncList = incListStr.split(';');
        const workspaceDir = `${this.project.workspaceDir}${File.sep}`;

        prjIncList.forEach((incPath) => {
            incPath = incPath.trim();
            if (incPath !== '') {
                incPath = normalize(this.project.uvprjFile.dir + File.sep + incPath);
                incPath = incPath.replace(workspaceDir, '');
                this.includes.add(incPath);
            }
        })


        ResourceManager.getInstance().getProjectFileLocationList().forEach(
            filePath => {
                this.includes.add(this.project.toAbsolutePath(filePath));
            }
        );


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
            const groupName = String(group['GroupName']);
            if (!group['Files']) {
                this.project.logger.log(`[Warn] 发现无效的文件组，Group: ${groupName}`);
                continue;
            }

            let isGroupExcluded = false;
            const gOption = group['GroupOption'];
            if (gOption) { // check group is excluded
                const gComProps = gOption['CommonProperty'];
                if (gComProps) {
                    isGroupExcluded = (gComProps['IncludeInBuild'] === 0);
                }
            }
            const nGrp = new FileGroup(this.prjID, groupName, isGroupExcluded);

            // 处理文件列表（使用解构+管道操作优化）
            const fileList = [group['Files']]
                .flat()
                .flatMap(list =>
                    [list?.File]  // 统一处理可能存在的 File 属性
                        .flat()    // 展平嵌套结构
                        .filter(Boolean) // 过滤无效条目
                )
                .map(fItem => ({
                    ...fItem,
                    absPath: this.project.toAbsolutePath(fItem.FilePath)
                }))
                .filter(({ FilePath }) => {
                    const isValid = FilePath?.trim();
                    !isValid && this.project.logger.log(`[Warn] 发现无效文件路径，Group: ${groupName}`);
                    return isValid;
                });

            // 使用管道操作处理文件列表
            fileList.forEach(({ FileOption, absPath }) => {
                const isExcluded = isGroupExcluded ||
                    FileOption?.CommonProperty?.IncludeInBuild === 0;
                nGrp.sources.push(new Source(this.prjID, new File(absPath), !isExcluded));
            });

            this.fGroups.push(nGrp);

        }

        const toolName = this.getToolName(this.targetDOM);
        const compilerPath = ResourceManager.getInstance().getCompilerPath(this.getKeilPlatform(), toolName);

        const compilerArgs = toolName === 'ARMCLANG' ? ['--target=arm-arm-none-eabi'] : undefined;
        this.updateCppProperties(cStandard, cppStandard, intelliSenseMode, compilerPath, compilerArgs);

        this.updateSourceRefs();
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private runAsyncTask(name: string, type: 'b' | 'r' | 'f' = 'b') {
        if (this.isTaskRunning) {
            const msg = l10n.t('Task isRuning Please wait it finished try !');
            window.showWarningMessage(msg);
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
        let curPos = 0;
        const buf = Buffer.alloc(4096);

        const logWatcher = watchFile(this.uv4LogFile.path, { persistent: true, interval: 1000 }, (curr, prev) => {
            if (curr.mtime > prev.mtime) {
                const numRead = readSync(fd, buf, 0, 4096, prev.size);
                if (numRead > 0) {
                    curPos += numRead;
                    const txt = this.dealLog(buf.slice(0, numRead));
                    this.taskChannel?.append(txt);
                }
            }
        });

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

    private refCache = new Map<string, Source[]>();

    updateSourceRefs() {
        const rePath = this.getOutputFolder(this.targetDOM);
        if (!rePath) return;

        const outPath = this.project.toAbsolutePath(rePath);
        this.fGroups.forEach(group => {
            group.sources.forEach(source => {
                if (!source.enable) return;

                const cacheKey = `${outPath}|${source.file.noSuffixName}`;
                const cached = this.refCache.get(cacheKey);
                if (cached) {
                    source.children = cached;
                    return;
                }

                const refFile = File.fromArray([outPath, `${source.file.noSuffixName}.d`]);
                if (refFile.isFile()) {
                    const refContent = refFile.read();
                    const refFileList = this.parseRefLines(this.targetDOM, refContent.split(/\r\n|\n/))
                        .map(rePath => this.project.toAbsolutePath(rePath));
                    const sources = refFileList.map(refFilePath =>
                        new Source(source.prjID, new File(refFilePath))
                    );
                    this.refCache.set(cacheKey, sources);
                    source.children = sources;
                }
            });
        });
        this._event.emit('dataChanged');
    }

    close() {
        // this.uv4LogLockFileWatcher.close();
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
    protected abstract getToolName(target: any): string;

    protected abstract getCStandard(target: any): string;
    protected abstract getCppStandard(target: any): string;
    protected abstract getIntelliSenseMode(target: any): string;

}