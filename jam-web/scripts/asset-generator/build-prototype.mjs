#!/usr/bin/env node
/**
 * JAM! 에셋 제너레이터 — 프로토타입용 공용 모듈 번들 재생성
 *
 * jam-web/src/lib/asset-generator/*.ts 를 브라우저용 IIFE 하나로 묶어
 * jam-doc/assets/prototypes/20260924_jam-asset-generator.core.js 로 내보낸다.
 * 프로토타입 HTML은 이 파일을 <script src>로 그대로 불러와 쓴다(file://로 열어도 동작).
 *
 * 모듈(random.ts·curve.ts·render.ts·types.ts)을 고쳤으면 이 스크립트를 다시 실행해
 * .core.js를 함께 갱신한다. 손으로 .core.js를 고치지 않는다.
 *
 * 실행: node jam-web/scripts/asset-generator/build-prototype.mjs (레포 어디서 실행해도 된다)
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const entryPoint = path.join(repoRoot, 'jam-web/src/lib/asset-generator/index.ts');
const outfile = path.join(repoRoot, 'jam-doc/assets/prototypes/20260924_jam-asset-generator.core.js');

const banner = [
  '// 자동 생성 파일 — 손으로 고치지 않는다.',
  '// 원본: jam-web/src/lib/asset-generator/*.ts',
  '// 재생성: node jam-web/scripts/asset-generator/build-prototype.mjs'
].join('\n');

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format: 'iife',
  globalName: 'AssetGeneratorCore',
  platform: 'browser',
  target: ['es2019'],
  legalComments: 'none',
  banner: { js: banner }
});

console.log('생성됨:', path.relative(repoRoot, outfile));
