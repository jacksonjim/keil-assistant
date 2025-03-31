import { File } from '../node_utility/File';

export interface KeilProjectInfo {

    prjID: string;

    vscodeDir: File;

    workspaceDir: string | undefined;

    uvprjFile: File;

    logger: Console;

    isMultiplyProject: boolean;

    toAbsolutePath(rePath: string): string;
}

