export type CompileCommand = {
    configuration: string,
    directory: string,
    file: string,
    arguments: string[]
}

export type CppProperty = {
    name: string,
    intelliSenseMode: string,
    compilerPath: string | undefined,
    cStandard: string,
    cppStandard: string,
    compilerArgs: string[] | undefined,
    includePath: string[] | undefined,
    defines: string[] | undefined
}