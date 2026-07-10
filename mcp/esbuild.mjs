import * as esbuild from 'esbuild';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const ctx = await esbuild.context({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: !minify,
  minify,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // archiver 是 CJS 模块，含 dynamic require，不能 bundle 到 ESM 中
  external: ['archiver'],
  alias: {
    previewship: path.resolve('../cli/src/index.ts'),
  },
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Build complete.');
}
