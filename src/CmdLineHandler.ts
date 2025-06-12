
export class CmdLineHandler {

    // private constructor() { }

    /**
     * powershell:  & '@param callerFile' 'arg1' 'arg2'
     * 
     * cmd:         ""@param callerFile" "arg1" "arg2""
    */
    static getCommandLine(callerFile: string, args: string[], isPowershell?: boolean, noQuote = false): string {

        const quote = isPowershell ? "'" : '"';
        const callerHeader = isPowershell ? '& ' : '';
        const cmdPrefixSuffix = isPowershell ? '' : '"';

        const commandLine: string = `${cmdPrefixSuffix + callerHeader
            + this.quoteString(callerFile, quote)  } ${
             args.map((arg) => noQuote ? arg : this.quoteString(arg, quote)).join(' ')
             }${cmdPrefixSuffix}`;

        return commandLine;
    }

    /**
     * input: ""a b.exe" -a -b -c"
     * 
     * output: "a b.exe" -a -b -c
    */
    static deleteCmdPrefix(cmdLine: string): string {
        return cmdLine.replace(/^"|"$/g, '');
    }

    static quoteString(str: string, quote: string): string {
        return (str.includes(' ') && !str.includes(quote)) ? (quote + str + quote) : str;
    }
}