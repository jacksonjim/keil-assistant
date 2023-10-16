//@ts-check
'use strict';

const path = require('path');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const config = {
    target: 'node',
    // mode: 'none',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist', 'src'),
        filename: 'extension.js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]"
    },
    node: {
        __dirname: false, // leave the __dirname behavior intact
    },
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode',
        xml2js: 'xml2js'
    },
    resolve: {
        // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js'],
        mainFields: ['main', 'module']
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [{
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        "inlineSorceMap": true,
                    }
                }
            }]
        }, {
            test: /.node$/,
            loader: 'node-loader'
        }]
    },
    optimization: {
        minimize: false
    },
    stats: {
        warnings: false
    },
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    }
};

// export default [config];
module.exports = (env) => {
    // if (env.vscode_nls) {
    //     // rewrite nls cal when being asked for 
    //     //@ts-ignore
    //     config.module?.rules?.unshift({
    //         loader: 'vscode-nls-dev/lib/webpack-loader',
    //         options: {
    //             base: `${__dirname}/src`
    //         }
    //     })
    // }
    return config;
};
