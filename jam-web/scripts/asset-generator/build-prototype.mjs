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
 * 검사: node jam-web/scripts/asset-generator/build-prototype.mjs --check
 *   임시 경로로 빌드해 저장소의 .core.js와 바이트 비교한다. 다르면 종료 코드 1 (scripts/verify.sh가 호출).
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const entryPoint = path.join(repoRoot, 'jam-web/src/lib/asset-generator/index.ts');
const outfile = path.join(repoRoot, 'jam-doc/assets/prototypes/20260924_jam-asset-generator.core.js');

const banner = [
  '// 자동 생성 파일 — 손으로 고치지 않는다.',
  '// 원본: jam-web/src/lib/asset-generator/*.ts',
  '// 재생성: node jam-web/scripts/asset-generator/build-prototype.mjs'
].join('\n');

const checkMode = process.argv.includes('--check');
const checkDir = checkMode ? fs.mkdtempSync(path.join(os.tmpdir(), 'asset-bundle-check-')) : null;
const buildOutfile = checkMode ? path.join(checkDir, path.basename(outfile)) : outfile;

await build({
  // 번들 안의 모듈 경로 주석이 실행 위치(작업 폴더)에 따라 달라지지 않게 저장소 루트로 고정한다.
  // 없으면 저장소 루트에서 만든 번들이 verify.sh(jam-web 폴더에서 실행)의 --check에서 어긋난다.
  absWorkingDir: repoRoot,
  entryPoints: [entryPoint],
  outfile: buildOutfile,
  bundle: true,
  format: 'iife',
  globalName: 'AssetGeneratorCore',
  platform: 'browser',
  target: ['es2019'],
  legalComments: 'none',
  banner: { js: banner }
});

if (checkMode) {
  const fresh = fs.readFileSync(buildOutfile);
  fs.rmSync(checkDir, { recursive: true, force: true });
  const committed = fs.existsSync(outfile) ? fs.readFileSync(outfile) : null;
  if (committed === null || !fresh.equals(committed)) {
    console.error('번들이 원본과 다릅니다. `node jam-web/scripts/asset-generator/build-prototype.mjs`를 실행하세요');
    console.error('대상:', path.relative(repoRoot, outfile));
    process.exit(1);
  }
  console.log('번들이 원본과 일치합니다:', path.relative(repoRoot, outfile));
} else {
  console.log('생성됨:', path.relative(repoRoot, outfile));
}
