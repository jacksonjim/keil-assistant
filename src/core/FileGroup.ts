import type { IView } from "./IView";
import type { Source } from "./Source";

export class FileGroup implements IView {

    label: string;
    prjID: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'FileGroup';
    icons?: { light: string; dark: string; };
    private _disabled: boolean;

    //----
    sources: Source[];

    constructor(pID: string, gName: string, disabled: boolean) {
        this.label = gName;
        this.prjID = pID;
        this.sources = [];
        this.tooltip = gName;
        this._disabled = disabled;
        const iconName = disabled ? 'FolderExclude_32x' : 'Folder_32x';

        this.icons = { light: iconName, dark: iconName };
    }

    private _cachedChildren?: IView[];
    getChildViews(): IView[] | undefined {
        // return this.sources;
        this._cachedChildren ??= [...this.sources];

        return this._cachedChildren;
    }

    updateDisabledState(disabled: boolean) {
        if (this._disabled !== disabled) {
            this._disabled = disabled;
            const iconName = disabled ? 'FolderExclude_32x' : 'Folder_32x';

            this.icons = { light: iconName, dark: iconName };
            this._cachedChildren = undefined; // 清除缓存
        }
    }
}