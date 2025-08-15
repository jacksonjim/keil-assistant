import * as esbuild from 'esbuild';
import * as path from 'path';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: true,
    sourcesContent: false,
    platform: 'node',
    // outfile: path.resolve(__dirname, 'dist', 'src', 'extension.js'),
    outfile: 'dist/extension.js',
    external: ['vscode', 'xml2js'], // 添加 xml2js，与 webpack 配置保持一致
    logLevel: 'warning',
    plugins: [
      esbuildProblemMatcherPlugin
    ],
    resolveExtensions: ['.ts', '.js'],
    minifyWhitespace: production,
    minifyIdentifiers: production,
    minifySyntax: production
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

const esbuildProblemMatcherPlugin: any = {
  name: 'esbuild-problem-matcher',

  setup(build: any) {
    build.onStart(() => {
      console.log('[watch] build started');
    });

    build.onEnd((result: any) => {
      result.errors.forEach((error: any) => {
        console.error(`✘ [ERROR] ${error.text}`);
        if (error.location == null) return;
        console.error(`    ${error.location.file}:${error.location.line}:${error.location.column}:`);
      });
      console.log('[watch] build finished');
    });
  }
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});