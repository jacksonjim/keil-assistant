import * as vscode from 'vscode';
import { File } from './node_utility/File';

let _instance: ResourceManager | undefined;

const dirList: string[] = [
    File.sep + 'bin',
    File.sep + 'res',
    File.sep + 'res' + File.sep + 'icons'
];

export class ResourceManager {

    private extensionDir: File;
    private dirMap: Map<string, File>;
    private iconMap: Map<string, string>;

    private constructor(context: vscode.ExtensionContext) {
        this.extensionDir = new File(context.extensionPath);
        this.dirMap = new Map();
        this.iconMap = new Map();
        this.init();
    }

    static getInstance(context?: vscode.ExtensionContext): ResourceManager {
        if (_instance === undefined) {
            if (context) {
                _instance = new ResourceManager(context);
            } else {
                throw Error('context can\'t be undefined');
            }
        }
        return _instance;
    }

    private init() {
        // init dirs
        for (const path of dirList) {
            const f = new File(this.extensionDir.path + path);
            if (f.isDir()) {
                this.dirMap.set(f.noSuffixName, f);
            }
        }

        // init icons
        const iconDir = this.dirMap.get('icons');
        if (iconDir) {
            for (const icon of iconDir.getList([/\.svg$/i], File.emptyFilter)) {
                this.iconMap.set(icon.noSuffixName, icon.path);
            }
        }
    }

    private getAppConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('KeilAssistant');
    }

    getBuilderExe(): string {
        return this.getFilePath('bin', 'Uv4Caller.exe');
    }

    getKeilUV4Path(target: string): string {
        return `${this.getKeilRootDir(target)}${File.sep}UV4${File.sep}UV4.exe`;
    }

    getCompilerPath(target: string, compiler: string | undefined): string | undefined {
        if (compiler === "ARMCC") {
            return `${this.getKeilRootDir(target)}${File.sep}ARM${File.sep}ARMCC${File.sep}bin${File.sep}armcc.exe`;
        }
        if (compiler === "ARMCLANG") {
            return `${this.getKeilRootDir(target)}${File.sep}ARM${File.sep}ARMCLANG${File.sep}bin${File.sep}armclang.exe`;
        }

        return undefined;
    }

    getKeilRootDir(target: string): string {
        const homePath = this.getHomePath(target);
        return homePath ? homePath : "C:\\Keil_v5";
    }

    private getHomePath(target: string): string | undefined {
        const homeObj = this.getAppConfig().get<object>("Keil.HOME");
        if (homeObj) {
            const pathMap = new Map<string, string>(Object.entries(homeObj));
            return pathMap.get(target) || pathMap.get("MDK");
        }
        return undefined;
    }

    getPropertyValue<T, K extends keyof T>(obj: T, key: K): T[K] {
        return obj[key];
    }

    getProjectExcludeList(): string[] {
        return this.getAppConfig().get<string[]>('Project.ExcludeList') || [];
    }

    getProjectFileLocationList(): string[] {
        return this.getAppConfig().get<string[]>('Project.FileLocationList') || [];
    }

    getProjectCustomIncludePaths(): string[] {
        return this.getAppConfig().get<string[]>('Project.CustomIncludePaths') || [];
    }

    getIconByName(name: string): vscode.Uri {
        const icon = this.iconMap.get(name);
        return vscode.Uri.file(icon!);
    }

    private getFilePath(dirKey: string, fileName: string): string {
        return this.dirMap.get(dirKey)?.path + File.sep + fileName;
    }

    public getProjectFileFindMaxDepth(): number {
        const depth = this.getAppConfig().get<number>("Project.FindMaxDepth");
        return depth ? depth : 1;
    }
}