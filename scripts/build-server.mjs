import { build } from 'esbuild'

await build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'out/server/index.js',
  // Optional native deps of chokidar/ws — not needed, excluded from bundle
  external: ['fsevents', 'bufferutil', 'utf-8-validate'],
  sourcemap: true,
})
console.log('Server bundle written to out/server/index.js')
