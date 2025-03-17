import { XMLParser } from "fast-xml-parser";
import { statSync, readFileSync, readdirSync } from "fs";
import { dirname, extname, join, normalize, resolve } from "path";
import {
    Event, commands, EventEmitter, ExtensionContext, l10n, ProviderResult, TreeDataProvider,
    TreeItem, TreeItemCollapsibleState, Uri, workspace, window,
    OutputChannel,
    StatusBarItem
} from "vscode";

import { IView } from "../core/IView";
import { KeilProject } from "../core/KeilProject";
import { Source } from "../core/Source";
import { ResourceManager } from "../ResourceManager";
import { File } from '../node_utility/File';
import { PTarget } from "../target/PTarget";


export class ProjectExplorer implements TreeDataProvider<IView> {

    private itemClickCommand = 'Item.Click';

    onDidChangeTreeData: Event<IView>;
    private viewEvent: EventEmitter<IView>;

    private prjList: Map<string, KeilProject>;
    private curActiveProject: KeilProject | undefined;
    private workspacePath: string | undefined;

    constructor(context: ExtensionContext, private channel: OutputChannel, private myStatusBarItem: StatusBarItem) {
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
                this.channel.show();
                this.channel.appendLine('search uvprj[x] project file; >>>>>');
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
                        try {
                            const stat = statSync(uvwPath);
                            if (stat.isFile()) {
                                const uvmpwXml = readFileSync(uvwPath);
                                const uvmpw = xmlParser.parse(uvmpwXml);
                                const projectList = uvmpw['ProjectWorkspace']['project'];
                                if (Array.isArray(projectList)) {
                                    uvList = uvList.concat(projectList.map<string>(p => {
                                        let path = p['PathAndName'] as string;
                                        if (path.startsWith('.\\')) {
                                            path = path.replace('.\\', '');
                                        }
                                        return resolve(prjWorkspace.path, path);
                                    }));
                                }
                            }
                        } catch (error) {
                            this.channel.appendLine(`Error parsing .uvmpw file ${uvwPath}: ${error}`);
                        }
                    });
                }

                // Search for .uvproj and .uvprojx files
                if (uvList.length === 0) {
                    uvList = await this.findProject(prjWorkspace.path, [/\.uvproj[x]?$/i], 1);
                }


                // Add additional project file locations
                ResourceManager
                    .getInstance()
                    .getProjectFileLocationList()
                    .forEach(path => uvList.push(path));

                // Filter out excluded files
                uvList = uvList.filter(path => {
                    const ext = extname(path).toLowerCase();
                    return !excludeList.includes(ext);
                });

                // Load each project file
                for (const uvPath of uvList) {
                    try {
                        await this.openProject(uvPath);
                    } catch (error) {
                        this.channel.appendLine(`Error: open project ${error}`);
                        window.showErrorMessage(`open project: '${uvPath}' failed !, msg: ${error}`);
                    }
                }
            } else {
                this.channel.appendLine(`Error: this assistant working in folder}`);
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
        if (this.workspacePath === undefined) {
            const msg = l10n.t('The workspace directory is empty, Goto open the workspace directory?');
            const result = await window.showInformationMessage(msg, l10n.t('Ok'), l10n.t('Cancel'));
            if (result === l10n.t('Ok')) {
                this.openWorkspace(new File(dirname(path)));
                return;
            }
            if (result === l10n.t('Cancel')) {
                const fmsg = l10n.t('Error: open project');
                const msg = l10n.t('Failed, The workspace Path');
                const emsg = l10n.t('is NULL , Please use vscode open the project folder.');
                const errorMsg = `${fmsg} ${path} ${msg} ${this.workspacePath} ${emsg}`;
                this.channel.appendLine(errorMsg);
                window.showErrorMessage(errorMsg);
                throw Error(errorMsg);
            }
        }
        const nPrj = new KeilProject(this.channel, new File(path), this.workspacePath);
        if (nPrj) {
            console.log('nPrj.prjID:', nPrj.prjID, "prjList:", this.prjList);
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
        return undefined;
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
                placeHolder: l10n.t('please select a target name for keil project')
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
                placeHolder: l10n.t('please select a target name for keil project')
            });
            if (targetName) {
                this.curActiveProject?.setActiveTarget(targetName);
            }
        }
    }

    getTarget(view?: IView): PTarget | undefined {
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
                window.showWarningMessage(l10n.t('Not found any active project !'));
            }
        }
    }

    updateView(v?: IView) {
        this.updateStatusBarItem(this.curActiveProject?.activeTargetName);
        this.viewEvent.fire(v!!);
    }

    //----------------------------------

    itemClickInfo: any = undefined;

    private async onItemClick(item: IView) {
        if (item.contextVal === 'Source') {
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
                const msg = l10n.t('Not found file');
                window.showWarningMessage(`${msg}: ${source.file.path}`);
            }
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

    openWorkspace(wsFile: File) {
        commands.executeCommand('vscode.openFolder', Uri.parse(wsFile.toUri()));
    }

    private updateStatusBarItem(prjName: string | undefined): void {
        if (prjName !== undefined) {
            this.myStatusBarItem.text = prjName;
            this.myStatusBarItem.tooltip = l10n.t('switch project target');
            this.myStatusBarItem.show();
        } else {
            this.myStatusBarItem.hide();
        }
    }

}