export class MacroHandler {
    private regMatchers = {
        'normalMacro': /^#define (\w+) (.*)$/,
        'funcMacro': /^#define (\w+\([^\\)]*\)) (.*)$/
    };

    toExpression(macro: string): string | undefined {

        let mList = this.regMatchers['normalMacro'].exec(macro);

        if (mList && mList.length > 2) {
            return `${mList[1]}=${mList[2]}`;
        }

        mList = this.regMatchers['funcMacro'].exec(macro);
        if (mList && mList.length > 2) {
            return `${mList[1]}=`;
        }
    }
}