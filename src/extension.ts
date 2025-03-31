import {
    ExtensionContext, OutputChannel,
    StatusBarAlignment, StatusBarItem,
    commands, env, l10n, window
} from 'vscode';

import { dirname } from 'path';

import { File } from './node_utility/File';
import { ResourceManager } from './ResourceManager';

import { stat } from 'fs';
import { ProjectExplorer } from './ui/ProjectExplorer';
import { IView } from './core/IView';

let myStatusBarItem: StatusBarItem;
let channel: OutputChannel;

export function activate(context: ExtensionContext) {
    console.log('---- keil-assistant actived >>>  ----');
    if (channel === undefined) {
        channel = window.createOutputChannel('keil-vscode');
    }
    myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 200);
    myStatusBarItem.command = 'statusbar.project';

    const testKeilRoot = ResourceManager.getInstance(context).getKeilRootDir("MDK");
    stat(testKeilRoot, (err, stat) => {
        if (err || !stat.isDirectory()) {
            channel.show();
            channel.appendLine(`Error: Please set keil root Path, ${err}`);
            window.showErrorMessage(`Error: Please set keil root Path, ${err}`);
        }
    });

    const prjExplorer = new ProjectExplorer(context, channel, myStatusBarItem);
    const subscriber = context.subscriptions;

    const projectSwitchCommandId = 'project.switch';

    subscriber.push(commands.registerCommand('explorer.open', async () => {
        const uri = await window.showOpenDialog({
            openLabel: l10n.t('Open keil uVision project'),
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
                await prjExplorer.openProject(uvPrjPath, false);
                // switch workspace
                const msg = l10n.t('keil project load done ! switch workspace ?');
                const result = await window.showInformationMessage(msg, l10n.t('Ok'), l10n.t('Later'));
                if (result === l10n.t('Ok')) {
                   prjExplorer.openWorkspace(new File(dirname(uvPrjPath)));
                }
            }
        } catch (error) {
            const errMsg = l10n.t('Open project failed! msg');
            window.showErrorMessage(`${errMsg}: ${(<Error>error).message}`);
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


    subscriber.push(myStatusBarItem);

    prjExplorer.loadWorkspace();
    console.log('---- keil-assistant actived <<<< ----');
}

export function deactivate() {
    // console.log('---- keil-assistant closed ----');
    channel.dispose();
}
