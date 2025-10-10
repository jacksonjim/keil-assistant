import { File } from '../node_utility/File';
import { ResourceManager } from '../ResourceManager';
import type { KeilProjectInfo } from '../core/KeilProjectInfo';
import { CmdLineHandler } from '../CmdLineHandler';
import { execSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { existsSync, statSync, readFileSync, readdirSync } from 'fs';
import { resolve, join, extname } from 'path';
import type { UVisonInfo } from './PTarget';
import { PTarget } from './PTarget';
import { MacroHandler } from '../core/MacroHandler';

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
        return target?.['TargetOption']?.['TargetCommonOption']?.['OutputDirectory'] ?? undefined;
    }

    private gnuParseRefLines(lines: string[]): string[] {

        const resultList = new Set<string>();

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

    protected getSysDefines(target: any) {
        if (target['uAC6'] === 1) { // ARMClang
            this.initArmclangMacros(target['TargetOption']['TargetArmAds']['ArmAdsMisc']['AdsCpuType']);

            ArmTarget.armclangMacros.forEach(define =>
                this.defines.add(define)
            );
            ArmTarget.armclangBuildinMacros?.forEach(define =>
                this.defines.add(define)
            )
        } else { // ARMCC
            ArmTarget.armccMacros.forEach(define =>
                this.defines.add(define)
            );
        }
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

    private getArmClangMacroList(armClangPath: string, armClangCpu?: string): string[] {
        try {
            // armclang.exe --target=arm-arm-none-eabi -E -dM -xc - < nul
            const cmdArgs = ['--target=arm-arm-none-eabi'];
            if (armClangCpu) {
                cmdArgs.push(armClangCpu);
            }
            cmdArgs.push('-E', '-dM', '-xc', '-', '<', 'nul');

            const cmdLine = `${CmdLineHandler.quoteString(armClangPath, '"')} ${cmdArgs.join(' ')}`;

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
        } catch (err) {
            console.warn('getArmClangMacroList failed:', err);
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
            case undefined: { throw new Error('Not implemented yet: undefined case') }
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
                            return '-march=armv8.1-m.main+nofp+nomve';
                        }
                        return '-march=armv8.1-m.main+nofp';
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
            const incPath = incDir.path.replace(/\\/g, '/');
            if (incDir.isDir()) {
                return [incPath].concat(
                    incDir.getList(File.emptyFilter).map((dir) => dir.path.replace(/\\/g, '/')));
            }

            return [incPath];
        }

        return undefined;
    }
    private processArray(item: any): any[] {
        if (Array.isArray(item)) {
            return item;
        }

        return item ? [item] : [];
    }

    private extractMacros(source: string) {
        const lines = source.split('\n');
        let currentMacro = { name: '', value: '' };
        let inMultiLine = false;

        for (const line of lines) {
            const trimmed = line.trim();

            // 跳过非宏定义行
            if (!trimmed.startsWith('#define') && !inMultiLine) continue;
            if (trimmed === '#define') continue; // 无效定义

            if (!inMultiLine) {
                // 解析新宏定义
                const parts = trimmed.split(/\s+/).filter(p => p);
                if (parts.length < 2) continue; // 无效格式

                currentMacro.name = parts[1];
                currentMacro.value = parts.slice(2).join(' ');
                // 更高效的注释移除方式
                const singleLineCommentIndex = currentMacro.value.indexOf('//');
                const multiLineCommentStartIndex = currentMacro.value.indexOf('/*');

                if (singleLineCommentIndex !== -1) {
                    currentMacro.value = currentMacro.value.substring(0, singleLineCommentIndex);
                } else if (multiLineCommentStartIndex !== -1) {
                    const multiLineCommentEndIndex = currentMacro.value.indexOf('*/', multiLineCommentStartIndex + 2);
                    if (multiLineCommentEndIndex !== -1) {
                        currentMacro.value = currentMacro.value.substring(0, multiLineCommentStartIndex) +
                            currentMacro.value.substring(multiLineCommentEndIndex + 2);
                    }
                }
                currentMacro.value = currentMacro.value.trim();

                // 检查是否多行宏
                inMultiLine = trimmed.endsWith('\\');
            } else {
                // 处理多行宏的续行
                currentMacro.value += ' ' + trimmed.replace(/\\$/, '').trim();
                inMultiLine = trimmed.endsWith('\\');
            }

            // 如果当前宏定义结束
            if (!inMultiLine && currentMacro.name) {
                if (currentMacro.value) {
                    this.defines.add(`${currentMacro.name}=${currentMacro.value}`);
                } else {
                    this.defines.add(currentMacro.name);
                }
                currentMacro = { name: '', value: '' };
            }
        }

    }

    protected getRTEIncludes(target: any, rteDom: any): string[] | undefined {
        if (!rteDom) return undefined;
        // 使用解构赋值和数组处理优化
        const { components, packages, files } = rteDom;
        // 强化数组标准化处理逻辑
        const cpuinfo = target?.TargetOption?.TargetCommonOption?.Cpu ?? undefined;
        const armMisc = (target?.uAC6 === 1) ? 'ARMCC6' : 'ARMCC';

        // 正则表达式：提取Cortex-M*和可选的FPU信息
        const match = cpuinfo?.match(/CPUTYPE\(["']Cortex-(M\d+)["']\)(?:\s+FPU(\d+))?/);

        const rotsCondition = match
            ? `CM${match[1].replace('M', '')}${match[2] === '2' ? '_FP' : ''}_${armMisc}`
            : undefined;
        const groups = this.getGroups(target);
        let hasRTE = false;
        groups.forEach((group) => {
            if (group["GroupName"].match(/^::.*/)) {
                hasRTE = true;
            }
        });

        const componentsList = this.processArray(components?.component);
        const packageList = this.processArray(packages?.package);
        const rteFiles = this.processArray(files?.file);

        const incSet = new Set<string>();
        const packsDir = ResourceManager.getInstance().getPackDir(this.getKeilPlatform());

        const pdscCache = new Map<string, any>();
        const parserOptions = {
            attributeNamePrefix: "@_",
            ignoreAttributes: false,
        };


        // 处理组件包含路径
        for (const component of componentsList) {
            const cPackage = component.package;
            const pkgVendor = cPackage['@_vendor'];
            const pkgName = cPackage['@_name'];
            const pkgVersion = cPackage['@_version'];
            const cBundle = component['@_Cbundle'];
            const cClass = component['@_Cclass'];
            const condition = component['@_condition'];
            const cVariant = component['@_Cvariant'];
            const cVersion = component['@_Cversion'];
            const cGroup = component['@_Cgroup'];
            const cRootDir = join(packsDir, pkgVendor, pkgName, pkgVersion);
            const pdscPath = join(cRootDir, `${component['@_Cvendor']}.${pkgName}.pdsc`);

            // 带缓存的PDSC解析
            if (!pdscCache.has(pdscPath)) {
                if (existsSync(pdscPath) && statSync(pdscPath).isFile()) {
                    const pdscContent = readFileSync(pdscPath, 'utf-8');

                    pdscCache.set(pdscPath, new XMLParser(parserOptions).parse(pdscContent));
                }
            }

            const pdscDom = pdscCache.get(pdscPath);
            if (!pdscDom) {
                console.warn(`PDSC file not found or invalid: ${pdscPath}`);
                continue;
            }

            if (pdscDom?.package?.components) {
                // 组件路径处理逻辑
                const components = this.processArray(pdscDom.package.components.component);
                const bundle = pdscDom.package.components.bundle;

                for (const comp of components) {
                    if (comp['@_Cgroup'] === cGroup
                        && comp['@_condition'] === condition) {
                        const files = this.processArray(comp.files?.file);

                        for (const file of files) {
                            if (file['@_category'] === 'include') {
                                this.addValidPath(incSet, join(cRootDir, file['@_name']));
                            } else if (file['@_category'] === 'header') {
                                this.addValidPath(incSet, join(cRootDir, file['@_name'], ".."));
                            }
                        }
                    }
                }
                // 处理bundle路径
                if (bundle && bundle['@_Cbundle'] === cBundle
                    && bundle['@_Cclass'] === cClass && bundle['@_Cversion'] === cVersion) {
                    const components = this.processArray(bundle.component);

                    for (const comp of components) {
                        if (comp['@_Cgroup'] === cGroup
                            && comp['@_Cvariant'] === cVariant
                            && comp['@_condition'] === condition) {
                            const files = this.processArray(comp.files?.file);
                            const pre_Include_Global_h = comp.Pre_Include_Global_h;
                            if (pre_Include_Global_h !== undefined) {
                                this.extractMacros(pre_Include_Global_h);
                            }

                            for (const file of files) {
                                const fileCondition = file['@_condition'];
                                if (fileCondition === undefined) {
                                    if (file['@_category'] === 'include') {
                                        this.addValidPath(incSet, join(cRootDir, file['@_name']));
                                    } else if (file['@_category'] === 'preIncludeGlobal') {
                                        const headerExtName = extname(file['@_name']);
                                        if ((headerExtName === '.h' || headerExtName === '.hpp')) {
                                            const headerDir = PTarget.getDirFromPath(file['@_name']);
                                            this.addValidPath(incSet, join(cRootDir, headerDir));
                                        }
                                    }
                                } else if (fileCondition === rotsCondition) {
                                    if (file['@_category'] === 'include') {
                                        this.addValidPath(incSet, join(cRootDir, file['@_name']));
                                    }
                                }

                            }
                        }
                    }
                }
            }
            const apis = this.processArray(pdscDom?.package?.apis?.api);
            for (const api of apis) {
                const apiClass = api['@_Cclass'];
                const apiGroup = api['@_Cgroup'];
                if ((apiClass == 'CMSIS' && apiGroup === 'RTOS2') ||
                    (apiClass == 'Device' && apiGroup === 'OS Tick')) {
                    const apifiles = this.processArray(api.files.file);
                    for (const af of apifiles) {
                        const category = af['@_category'];
                        const afPath = af['@_name'];
                        const headerExtName = extname(afPath);
                        if (category === 'header' && (headerExtName === '.h' || headerExtName === '.hpp')) {
                            const headerDir = PTarget.getDirFromPath(afPath);
                            this.addValidPath(incSet, join(cRootDir, headerDir));
                        }
                    }
                }
            }
        }

        // 处理项目文件路径
        const prjRoot = resolve(this.project.uvprjFile.dir);

        for (const file of rteFiles) {
            const file_category = file['@_category'];
            if (file['@_attr'] === 'config' && (
                file_category === 'header' || file_category === 'preIncludeGlobal')) {
                const headerPath = file.instance['#text'];
                const headerExtName = extname(headerPath);
                if (headerExtName === '.h' || headerExtName === '.hpp') {
                    const headerDir = PTarget.getDirFromPath(headerPath);
                    this.addValidPath(incSet, join(prjRoot, headerDir));
                }
            }
        }

        // 处理API路径
        /* for (const rte_pkg of packageList) {
            if (rte_pkg['@_name'] !== 'CMSIS') continue; // Ignore other packages
            for (const targetInfo of this.processArray(rte_pkg.targetInfos?.targetInfo)) {
                if (targetInfo['@_name'] === this.targetName) {
                    this.addValidPath(incSet, join(prjRoot, "RTE", `_${this.targetName}`));
                }
            }
        } */
        if (hasRTE) {
            const target = this.targetName.replace(/\s/g, '_');
            const rteIncPath = join(prjRoot, "RTE", `_${target}`);
            this.addValidPath(incSet, rteIncPath);

            if (existsSync(rteIncPath) && statSync(rteIncPath).isDirectory()) {
                const incFiles = readdirSync(rteIncPath);
                incFiles.forEach(incFile => {
                    const incFilePath = join(rteIncPath, incFile);
                    const content = readFileSync(incFilePath, 'utf-8');
                    this.extractMacros(content);
                })
            }

        }

        return Array.from(incSet);
    }

    protected getIncString(target: any): string {
        const dat = target['TargetOption']['TargetArmAds']['Cads'];

        return dat['VariousControls']['IncludePath'];
    }

    protected getDefineString(target: any) {
        const dat = target['TargetOption']['TargetArmAds']['Cads'];

        const macros: string = dat['VariousControls']['Define'];

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
        return ['$armcc', '$gcc'];
    }

    protected getCStandard(target: any): string {
        if (target['uAC6'] !== 1) return 'c17'
        /**
         * 0：default  → C 语言标准
         * 1：C90      → 对应uC90
         * 2：gnu90    → 对应uGnu99
         * 3：C99      → 对应uC99
         * 4：gnu99    → 对应uGnu99
         * 5：C11      → 对应uC11
         * 6：gnu11    → 对应uGnu11
         */

        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        const uC99 = dat['uC99'];
        const uGnu = dat['uGnu'];
        const v6Lang = dat['v6Lang'];

        switch (v6Lang) {
            case 1:
                return 'c90';
            case 2:
                return 'gnu90';
            case 3:
                return uC99 === 1 ? 'c99' : 'c11';
            case 4:
                return uGnu === 1 ? 'gnu99' : 'gnu11';
            case 5:
                return 'c11';
            case 6:
                return 'gnu11';
            default:
                return 'c99';
        }
    }
    protected getCppStandard(target: any): string {
        if (target['uAC6'] !== 1) return 'c++17'
        /**
         * 0: default  → C++语言标准
         * 1: C++98    → 对应uC++98
         * 2: gnu++98  → 对应uGnu++98
         * 3: C++11    → 对应uC++11
         * 4: gnu++11  → 对应uGnu++11
         * 5: C++03    → 对应uC++03
         * 6: C++14    → 对应uC++14
         * 7: gnu++14  → 对应uGnu++14
         * 8: C++17    → 对应uC++17
         * 9: gnu++17  → 对应uGnu++17
         */
        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        const v6Langp = dat['v6LangP'];
        
        switch (v6Langp) {
            case 1:
                return 'c++98';
            case 2:
                return 'gnu++98';
            case 3:
                return 'c++11';
            case 4:
                return 'gnu++11';
            case 5:
                return 'c++03';
            case 6:
                return 'c++14';
            case 7:
                return 'gnu++14';
            case 8:
                return 'c++17';
            case 9:
                return 'gnu++17';
            default:
                return 'c++11';
        }
    }
    protected getIntelliSenseMode(target: any): string {
        if (target['uAC6'] === 1) { // ARMClang
            return 'clang-arm';
        } else { // ARMCC
            return '${default}';
        }
    }
}