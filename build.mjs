import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');

// Landing page bundle
await esbuild.build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  outfile: 'dist/bundle.js',
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
  target: 'es2020',
  minify: !isDev,
  sourcemap: isDev,
});

// Admin SPA bundle
await esbuild.build({
  entryPoints: ['src/client/admin/index.tsx'],
  bundle: true,
  outfile: 'dist/admin.js',
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
  target: 'es2020',
  minify: !isDev,
  sourcemap: isDev,
});

console.log(`✅ Build complete (${isDev ? 'dev' : 'production'})`);
