//@ts-check
'use strict';

import { resolve , dirname } from 'path';
import { fileURLToPath } from 'url';

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const config = {
    target: 'node',
    // mode: 'none',
    entry: './src/extension.ts',
    output: {
        path: resolve(dirname(fileURLToPath(import.meta.url)), 'dist', 'src'),
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
export default () => {
    return config;
};
