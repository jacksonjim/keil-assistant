
import { PTarget } from './PTarget';
import { File } from '../node_utility/File';
import { ResourceManager } from '../ResourceManager';

export class C251Target extends PTarget {

    protected checkProject(target: any): Error | undefined {
        const targetOption = target['TargetOption'];
        if (targetOption === undefined) {
            return new Error(`This uVision project is not a C251 project, but have a 'uvproj' suffix!`); 
        }
        const target251 = targetOption['Target251'];
        if (target251 === undefined) {
            return new Error(`This uVision project is not a C251 project, but have a 'uvproj' suffix!`); 
        }
        const c251 = target251['C251'];
        if (c251 === undefined) {
            return new Error(`This uVision project is not a C251 project, but have a 'uvproj' suffix!`); 
        }
    }

    protected getToolName(target: any): string {
        return 'C251';
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
        const c251 = target['TargetOption']['Target251']['C251'];
        return c251['VariousControls']['IncludePath'];
    }

    protected getDefineString(target: any): string {
        const c251 = target['TargetOption']['Target251']['C251'];
        return c251['VariousControls']['Define'];
    }

    protected getGroups(target: any): any[] {
        return target['Groups']['Group'] || [];
    }

    protected getProblemMatcher(): string[] {
        return ['$c251'];
    }
    protected getCStandard(_target: any): string {
        return 'c89';
    }
    protected getCppStandard(_target: any): string {
        return 'c++17';
    }
    protected getIntelliSenseMode(_target: any): string {
        return '${default}';//'gcc-x86';
    }
}