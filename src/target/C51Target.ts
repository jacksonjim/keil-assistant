
import { PTarget } from './PTarget';
import { File } from '../node_utility/File';
import { ResourceManager } from '../ResourceManager';


export class C51Target extends PTarget {

    private static readonly macros: string[] = [
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

    protected checkProject(target: any): Error | undefined {
        const targetOption = target['TargetOption'];

        if (targetOption === undefined) {
            return new Error(`This uVision project is not a C51 project, but have a 'uvproj' suffix !`);
        }
        const target51 = targetOption['Target51'];

        if (target51 === undefined) {
            return new Error(`This uVision project is not a C51 project, but have a 'uvproj' suffix !`);
        }
        const c51 = target51['C51'];

        if (c51 === undefined) {
            return new Error(`This uVision project is not a C51 project, but have a 'uvproj' suffix !`);
        }
    }
    protected getToolName(_target: any): string {
        return "C51";
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

    protected getSysDefines(_target: any) {
        C51Target.macros.forEach(define =>
            this.defines.add(define)
        );
    }

    protected getRteDefines(target: any) {
        if (target) {
            const components = target['components']['component'];
            const apis = target['apis']['api'];

            if (Array.isArray(components) || Array.isArray(apis)) {
                this.defines.add("_RTE_");
            }
        }
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

    protected getDefineString(target: any) {
        const target51 = target['TargetOption']['Target51']['C51'];
        const macros: string = target51['VariousControls']['Define'];

        macros?.split(/,|\s+/).forEach((define) => {
            if (define.trim() !== '') {
                this.defines.add(define);
            }
        });
    }

    protected getGroups(target: any): any[] {
        return target['Groups']['Group'] ?? [];
    }

    protected getProblemMatcher(): string[] {
        return ['$c51'];
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