/**
 * ESLint 扁平配置 (v9+)
 * 
 * 配置结构：
 * 1. 全局忽略规则
 * 2. 基础 JavaScript 规则
 * 3. TypeScript 文件特定规则
 * 4. Prettier 集成
 * 5. 规则冲突解决
 * 
 * 文档：https://eslint.org/docs/latest/use/configure/
 */

import globals from "globals";
import eslintJs from "@eslint/js";
import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import { t } from "@vscode/l10n";

const ignorePatterns = [
    "*.js",
    "dist/",
    "vscode*.d.ts",
    "out",
    "dist",
    "src/**/*.test.ts",
    "**/*.d.ts",
    "coverage/**",
    "**/__mocks__/**",
    "**/__snapshots__/**",
    ".next/**",
    "build/**"
];

export default [
    // 1. 忽略文件和目录配置
    { ignores: ignorePatterns },

    // 2. 基础 JavaScript 规则
    eslintJs.configs.recommended,

    // 3. TypeScript 特定配置
    {
        files: ['src/**/*.ts', 'test/**/*.ts', 'ui/**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: "./tsconfig.json", // 启用类型感知规则
                tsconfigRootDir: process.cwd(), // 使用当前工作目录
                warnOnUnsupportedTypeScriptVersion: false
            },
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.es2021
            }
        },
        plugins: {
            "@typescript-eslint": typescriptPlugin
        },
        rules: {
            // 命名约定规则 - 优化后的配置
            "@typescript-eslint/naming-convention": [
                "warn",
                // 1. 类型和接口使用 PascalCase
                {
                    selector: "typeLike",
                    format: ["PascalCase"]
                },

                // 2. 对象字面量属性 - 允许三种格式
                // ⭐ 解决 'Compiler' 等属性名的警告问题
                {
                    selector: "objectLiteralProperty",
                    format: ["camelCase", "PascalCase", "UPPER_CASE"],
                    leadingUnderscore: "allow",
                    modifiers: ["requiresQuotes"] // 允许带引号的属性名
                },

                // 3. 类型属性 - 允许 camelCase/PascalCase
                {
                    selector: "typeProperty",
                    format: ["camelCase", "PascalCase"],
                    leadingUnderscore: "allow"
                },

                // 4. 类成员 - 允许三种格式
                {
                    selector: "classProperty",
                    format: ["camelCase", "PascalCase", "UPPER_CASE"],
                    leadingUnderscore: "allow"
                },

                // 5. 变量 - camelCase 或 UPPER_CASE
                {
                    selector: "variable",
                    format: ["camelCase", "UPPER_CASE"],
                    leadingUnderscore: "allow"
                },

                // 6. 函数参数 - camelCase
                {
                    selector: "parameter",
                    format: ["camelCase"],
                    leadingUnderscore: "allow"
                },

                // 7. 枚举成员 - UPPER_CASE
                {
                    selector: "enumMember",
                    format: ["UPPER_CASE"]
                },

                // 8. 默认规则 - camelCase
                {
                    selector: "default",
                    format: ["camelCase"],
                    leadingUnderscore: "allow"
                }
            ],

            // 增强的类型检查规则
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'warn',


            // 代码质量规则
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/consistent-type-definitions': ['warn', 'type'],
            '@typescript-eslint/no-unused-vars': [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_"
                }
            ],
            '@typescript-eslint/ban-ts-comment': 'warn',
            '@typescript-eslint/prefer-ts-expect-error': 'warn',
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/prefer-optional-chain': 'warn',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/switch-exhaustiveness-check': 'error',

            // 语法规则
            '@typescript-eslint/semi': ['warn', 'always'],
            '@typescript-eslint/member-delimiter-style': [
                'warn',
                {
                    multiline: { delimiter: 'semi', requireLast: true },
                    singleline: { delimiter: 'semi', requireLast: false }
                }
            ],

            // 禁用冲突规则
            'no-unused-vars': 'off',
            'semi': 'off',
            'no-var-requires': 'off'
        },

        // ignores: [
        //     'out',
        //     'dist',
        //     'src/**/*.test.ts',
        //     '**/*.d.ts',
        // ],
    },

    // 4. 通用规则（适用于所有文件）
    {
        rules: {
            // 基础代码质量规则
            'curly': ['warn', 'multi-line', 'consistent'],
            'eqeqeq': ['warn', 'always', { null: 'ignore' }],
            'no-throw-literal': 'warn',
            'no-console': [
                'warn',
                {
                    allow: ['warn', 'error', 'info']
                }
            ],
            'no-alert': 'error',

            // 现代 JavaScript 实践
            'prefer-const': 'warn',
            'prefer-template': 'warn',
            'object-shorthand': ['warn', 'always'],
            'arrow-body-style': ['warn', 'as-needed'],

            // 代码组织
            'padding-line-between-statements': [
                'warn',
                { blankLine: 'always', prev: '*', next: 'return' },
                { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
                { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] }
            ]
        }
    },

    // 5. 禁用与 Prettier 冲突的规则
    eslintConfigPrettier
];
