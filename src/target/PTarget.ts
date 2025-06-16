import type { IView } from "../core/IView";
import { EventEmitter as EventsEmitter } from 'events';
import { File } from "../node_utility/File";
import type { KeilProjectInfo } from "../core/KeilProjectInfo";
import type { OutputChannel } from "vscode";
import { commands, l10n, window } from "vscode";
import { FileGroup } from "../core/FileGroup";
import { normalize, resolve } from 'path';
import { ResourceManager } from "../ResourceManager";
import { Source } from "../core/Source";
import { closeSync, openSync, readSync, statSync, watchFile, writeFileSync } from "fs";
import { spawn } from "child_process";
import { decode } from "iconv-lite";
import * as yaml from 'js-yaml';
import { CompileCommand, CppProperty } from "./comm";
import path = require("path");

export type UVisonInfo = {
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
    private isTaskRunning = false;
    private taskChannel: OutputChannel | undefined;
    private clangdContext: string | undefined;

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

        this.uv4LogFile = new File(path.posix.join(this.project.vscodeDir.path, `${this.targetName}_uv4.log`));
    }

    private getCppConfigName(project: KeilProjectInfo, target: string): string {
        if (project.isMultiplyProject) {
            return `${target} for ${project.uvprjFile.noSuffixName}`;
        }

        return target;
    }

    on(event: 'dataChanged', listener: () => void): void;
    on(event: any, listener: () => void): void {
        this._event.on(event, listener);
    }

    private lastCppConfig = '';

    private updateCppProperties(cStandard: string, cppStandard: string, intelliSenseMode: string, compilerPath?: string, compilerArgs?: string[]) {

        const proFile = new File(path.posix.join(this.project.vscodeDir.path, 'c_cpp_properties.json'));
        const ccFile = new File(path.posix.join(this.project.workspaceDir!, 'compile_commands.json'));

        let cppProperties: any = { configurations: [], version: 4 };

        if (proFile.isFile()) {
            try {
                cppProperties = JSON.parse(proFile.read());
            } catch (error) {
                this.project.logger.log(`[Error] c_cpp_properties.json parse error: ${error}`);
            }
        }

        let compileCmds: CompileCommand[] = [];
        if (ccFile.isFile() && ccFile.isExist()) {
            try {
                compileCmds = JSON.parse(ccFile.read());
            } catch (error) {
                this.project.logger.log(`[Error] c_cpp_properties.json parse error: ${error}`);
            }
        }

        const configurations: CppProperty[] = cppProperties['configurations'];
        const index = configurations.findIndex((conf) => conf.name === this.cppConfigName);

        // 提前将 Set 转换为数组，避免多次调用 Array.from
        const includeArray = Array.from(this.includes);
        const defineArray = Array.from(this.defines);
        compilerPath = compilerPath?.replace(/\\/g, '/'); // 替换反斜杠为正斜杠
        intelliSenseMode = intelliSenseMode.replace(/\\/g, '/'); // 替换反斜杠为正斜杠  

        if (index === -1) {
            configurations.push({
                name: `${this.cppConfigName}`,
                cStandard,
                cppStandard,
                compilerPath,
                compilerArgs,
                intelliSenseMode,
                includePath: includeArray,
                defines: defineArray
            });
        } else {
            configurations[index]['compilerPath'] = compilerPath;
            configurations[index]['compilerArgs'] = compilerArgs;
            configurations[index]['cStandard'] = cStandard;
            configurations[index]['cppStandard'] = cppStandard;
            configurations[index]['intelliSenseMode'] = intelliSenseMode;
            configurations[index]['includePath'] = includeArray;
            configurations[index]['defines'] = defineArray;
        }

        const newConfig = JSON.stringify(cppProperties, undefined, 4);

        if (this.lastCppConfig !== newConfig) {
            proFile.write(newConfig);
            this.lastCppConfig = newConfig;
        }
        // 提前获取工作区目录，避免多次访问属性
        const workspaceDir = this.project.workspaceDir?.replace(/\\/g, '/') ?? ".";
        const incList = includeArray.map((inc) => `-I${inc}`);
        const defList = defineArray.map((def) => `-D${def}`);

        // 生成 .clangd 文件内容    
        const clangdConfig = {
            CompileFlags: {
                Add: [
                    ...incList,
                    ...defList,
                    ...(compilerArgs ?? [])
                ],
                Compiler: compilerPath,
            }
        };

        this.clangdContext = yaml.dump(clangdConfig, {
            noRefs: true,
            lineWidth: -1
        });

        let files = this.fGroups.map(fg => fg.label).join(',');

        const ci = compileCmds.findIndex(item => item.configuration === this.cppConfigName);
        const workspacePath = workspaceDir.replace(workspaceDir, '.');


        if (ci === -1) {
            compileCmds.push({
                configuration: `${this.cppConfigName}`,
                directory: `${workspacePath}`,
                file: `**/{${files}}/**/*.c`,
                arguments: [
                    `${compilerPath}`,
                    ...incList,
                    ...defList,
                    ...(compilerArgs ?? []),
                    `-std=${cStandard}`,
                    "-c",
                    "{file}",
                    "-o",
                    "build/{file_dir}/{file_base}.o"
                ]
            });
        } else {
            compileCmds[ci] = {
                configuration: `${this.cppConfigName}`,
                directory: workspacePath,
                file: `**/{${files}}/**/*.c`,
                arguments: [
                    `${compilerPath}`,
                    ...incList,
                    ...defList,
                    ...(compilerArgs ?? []),
                    `-std=${cStandard}`,
                    "-c",
                    "{file}",
                    "-o",
                    "build/{file_dir}/{file_base}.o"
                ]
            };
        }

        ccFile.write(JSON.stringify(compileCmds, undefined, 4));

    }

    updateClangdFile() {
        const clangdFile = new File(`${this.project.workspaceDir}${File.sep}.clangd`);

        if (this.clangdContext) {
            clangdFile.write(this.clangdContext);
        } else {
            this.project.logger.log(`[Error] .clangd file is empty`);
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
        //this.includes.add('${workspaceFolder}/**');

        if (rteIncludes !== undefined)
            this.includes.add("${workspaceFolder}/RTE/" + `_${this.targetName.replace(" ", "_")}`);

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
                    [list?.File]
                        .flat()
                        .filter(Boolean)
                )
                .map(fItem => ({
                    ...fItem,
                    absPath: this.project.toAbsolutePath(fItem.FilePath)
                }))
                .filter(({ FilePath: filePath }) => {
                    const isValid = filePath?.trim();

                    !isValid && this.project.logger.log(`[Warn] 发现无效文件路径，Group: ${groupName}`);

                    return isValid;
                });

            // 使用管道操作处理文件列表
            fileList.forEach(({ FileOption: fileOption, absPath }) => {
                const isExcluded = isGroupExcluded ||
                    fileOption?.CommonProperty?.IncludeInBuild === 0;

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
                    const txt = this.dealLog(buf.subarray(0, numRead));

                    this.taskChannel?.appendLine(txt);
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

        execCommand.on('close', (_code) => {
            this.isTaskRunning = false;
            // let execSync = require('child_process').execSync;
            // execSync('sleep ' + 5);
            // await this.sleep(20);
            const stats = statSync(this.uv4LogFile.path);

            while (curPos < stats.size) {
                const numRead = readSync(fd, buf, 0, 4096, curPos);

                if (numRead > 0) {
                    curPos += numRead;
                    const txt = this.dealLog(buf.subarray(0, numRead));

                    this.taskChannel?.appendLine(txt);
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
        const srcFileExp = /((\.\.\/)?.*\..\(\d+\)):/g;

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