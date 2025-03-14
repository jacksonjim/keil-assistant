
import { File } from '../node_utility/File';
import { ResourceManager } from '../ResourceManager';
import { KeilProjectInfo } from '../core/KeilProjectInfo';
import { CmdLineHandler } from '../CmdLineHandler';
import { execSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { existsSync, statSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { decode as heDecode } from 'he';
import { PTarget, UVisonInfo } from './PTarget';

export class ArmTarget extends PTarget {

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

    protected getToolName(target: any): string {
        return target['uAC6'] === 1 ? 'ARMCLANG' : 'ARMCC';
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

            // Skip the first sub line for the first line only
            const startIndex = (lineIndex === 0) ? 1 : 0;

            for (let i = startIndex; i < subLines.length; i++) {
                const item = subLines[i].trim().replace(/\\ /g, " ");
                if (item) { // Ensure the item is not empty
                    resultList.add(item);
                }
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
            // armclang.exe --target=arm-arm-none-eabi -E -dM -xc - < nul
            const cmdLine = CmdLineHandler.quoteString(armClangPath, '"')
                + ' ' + ['--target=arm-arm-none-eabi', armClangCpu, '-E', '-dM', '-xc', '-', '<', 'nul'].join(' ');

            const lines = execSync(cmdLine).toString().split(/\r\n|\n/);
            const resList: string[] = [];
            const mHandler = new MacroHandler();

            lines.filter((line) => line.trim() !== '')
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
        if (!rteDom)
            return undefined;
        //
        const componentList = rteDom['components']['component'];
        let components: Array<any> = [];
        const rteFiles = rteDom['files']['file'];
        let rtefileList: Array<any> = [];
        const apiList = rteDom['apis']['api'];
        let targetInfos = undefined;
        if (apiList !== undefined)
            targetInfos = apiList['targetInfos']['targetInfo'];
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
            if (componentList !== undefined) {
                components.push(componentList);
            }
        }

        for (const component of components) {
            const cClass = component['@_Cclass'];
            const cBundle = component['@_Cbundle'];
            const cGroup = component['@_Cgroup'];
            const cSub = component['@_Csub'];
            const cVendor = component['@_Cvendor'];
            const cVersion = component['@_Cversion'];
            const cCondition = component['@_condition'];
            const cPackage = component['package'];
            const pkgName = cPackage['@_name'];
            const pkgVendor = cPackage['@_vendor'];
            const pkgVersion = cPackage['@_version'];
            const cRootDir = join(packsDir, pkgVendor, pkgName, pkgVersion);
            const pdscPath = join(cRootDir, `${cVendor}.${pkgName}.pdsc`);

            if (cache.has(pdscPath)) {
                pdscDom = cache.get(pdscPath);
            } else {
                if (!existsSync(pdscPath))
                    continue;
                const pdscSta = statSync(pdscPath);
                if (pdscSta.isFile()) {
                    const pdscdoc = readFileSync(pdscPath, { encoding: 'utf-8' });
                    pdscDom = parser.parse(pdscdoc);
                    cache.set(pdscPath, pdscDom);
                } else {
                    continue;
                }
            }

            if (pdscDom) {
                let pdscComponents;
                let pdscBundle = undefined;
                if (cBundle !== undefined) {
                    pdscComponents = pdscDom['package']['components']['bundle']['component'];
                    pdscBundle = pdscDom['package']['components']['bundle']['@_Cbundle']
                } else {
                    pdscComponents = pdscDom['package']['components']['component'];
                }

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

                        if ((pdscClass === cClass || pdscBundle == cBundle) &&
                            pdscGroup === cGroup
                            && pdscVersion === cVersion
                            && pdscCondition === cCondition
                            && subEq
                            && Array.isArray(pdscfileList)) {
                            for (const file of pdscfileList) {
                                const category = file['@_category'];
                                const attr = file['@_attr'];
                                if (attr === 'config')
                                    continue;
                                if (category === 'include') {
                                    const name = file['@_name'];
                                    const incPath = resolve(join(cRootDir, name));
                                    if (existsSync(incPath)) {
                                        incMap.set(incPath, name);
                                        hasInc = true;
                                    }
                                    break;
                                }

                                // delete
                                /* if (category === 'header') {
                                    const name = file['@_name'] as string;
                                    const pos = name.lastIndexOf("/");
                                    const inc = name.substring(0, pos);
                                    if (!incMap.has(inc)) {
                                        incMap.set(File.toLocalPath(`${cRootDir}${File.sep}${inc}`), inc);
                                    }
                                    hasInc = true;
                                    break;
                                } */
                            }

                        }
                        if (hasInc) {
                            break;
                        }
                    }
                }
            }
        }


        const prjPath = this.project.uvprjFile.dir;
        const wkd = this.project.workspaceDir;
        const prjRoot = prjPath.replace(wkd!, ".");
        if (Array.isArray(rteFiles)) {
            rtefileList = rtefileList.concat(rteFiles);
            for (const rtefile of rtefileList) {
                const fAttr = rtefile['@_attr'];
                const fCategory = rtefile['@_category'];
                const instance = rtefile['instance'];
                if (fAttr === 'config' && fCategory === 'header') {
                    const incStr = instance['#text'];
                    const incPath = resolve(join(prjRoot, incStr));
                    if (existsSync(incPath))
                        incMap.set(incPath, incStr);
                }
            }
        }
        if (Array.isArray(targetInfos)) {
            for (const targetInfo of targetInfos) {
                const inc = targetInfo['@_name'];
                const incPath = join(prjRoot, "RTE", `_${inc}`);
                if (inc === this.targetName) {
                    incMap.set(incPath, inc);
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

    protected getCStandard(target: any): string {
        /**
         * 0：default  → C 语言标准
         * 1：C90      → 对应uC90
         * 2：gun90    → 对应uGun99
         * 3：C99      → 对应uC99
         * 4：gun99    → 对应uGun99
         * 5：C11      → 对应uC11
         * 6：gun11    → 对应uGun11
         */

        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        const uC99 = dat['uC99'];
        const uGun = dat['uGnu'];
        const v6Lang = dat['v6Lang'];
        switch (v6Lang) {
            case 1:
                return 'c90';
            case 2:
                return 'gun90';
            case 3:
                return uC99 === 1 ? 'c99' : 'c11';
            case 4:
                return uGun === 1 ? 'gun99' : 'gun11';
            case 5:
                return 'c11';
            case 6:
                return 'gun11';
            default:
                return 'c99';
        }
    }
    protected getCppStandard(target: any): string {
        /**
         * 0: default  → C++语言标准
         * 1: C++98    → 对应uC++98
         * 2: gun++98  → 对应uGun++98
         * 3: C++11    → 对应uC++11
         * 4: gun++11  → 对应uGun++11
         * 5: C++03    → 对应uC++03
         * 6: C++14    → 对应uC++14
         * 7: gun++14  → 对应uGun++14
         * 8: C++17    → 对应uC++17
         * 9: gun++17  → 对应uGun++17
         */
        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        const v6Langp = dat['v6Langp'];
        switch (v6Langp) {
            case 1:
                return 'c++98';
            case 2:
                return 'gun++98';
            case 3:
                return 'c++11';
            case 4:
                return 'gun++11';
            case 5:
                return 'c++03';
            case 6:
                return 'c++14';
            case 7:
                return 'gun++14';
            case 8:
                return 'c++17';
            case 9:
                return 'gun++17';
            default:
                return 'c++11';
        }
    }
    protected getIntelliSenseMode(target: any): string {
        if (target['uAC6'] === 1) { // ARMClang
            return 'clang-arm';
        } else { // ARMCC
            return 'gcc-arm';
        }
    }
}