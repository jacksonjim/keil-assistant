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
        return this.dirMap.get('bin')?.path + File.sep + 'Uv4Caller.exe';
    }

    getKeilUV4Path(target: string): string {
        return `${this.getKeilRootDir(target)}${File.sep}UV4${File.sep}UV4.exe`;
    }

    getKeilRootDir(target: string): string {
        let homePath: string | undefined;

        const homeObj = this.getAppConfig().get<object>("Keil.HOME");
        if (homeObj) {
            const pathMap = new Map<string, string>(Object.entries(homeObj));

            homePath = pathMap.get(target);
            if (!homePath) {
                homePath = pathMap.get("MDK");
            }
            if (homePath) {
                return homePath;
            }

        }

        return "C:\\Keil_v5";


    }
    getPropertyValue<T, K extends keyof T>(obj: T, key: K): T[K] {
        return obj[key];
    }

    getProjectExcludeList(): string[] {
        return this.getAppConfig().get<string[]>('Project.ExcludeList') || [];
    }

    // 附加本地文件
    getProjectFileLocationList(): string[] {
        return this.getAppConfig().get<string[]>('Project.FileLocationList') || [];
    }
    // 增加自定义头文件路径
    getProjectCustomIncludePaths(): string[] {
        return this.getAppConfig().get<string[]>('Project.CustomIncludePaths') || [];
    }

    getIconByName(name: string): vscode.Uri {
        return vscode.Uri.parse(this.iconMap.get(name)!,true);
    }
}