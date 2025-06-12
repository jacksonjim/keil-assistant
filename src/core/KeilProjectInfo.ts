import type { File } from '../node_utility/File';

export type KeilProjectInfo = {
    keilVscodeProps: any;

    prjID: string;

    vscodeDir: File;

    workspaceDir: string | undefined;

    uvprjFile: File;

    logger: Console;

    isMultiplyProject: boolean;

    toAbsolutePath(rePath: string): string;
}

