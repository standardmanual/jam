#!/usr/bin/env node
/**
 * JAM! 빌드 진입점 (package.json의 `build` 스크립트)
 *
 * 스토리북 포함 여부를 환경별로 가른다.
 * - VERCEL_ENV === 'production' (= main 배포): `next build`만 실행.
 *   스토리북은 프로덕션에 배포하지 않는다. 서비스 코드에서 `/storybook`을 참조하는 곳이 없고,
 *   public(133MB)을 통째로 중복 적재하는 비용만 남기 때문이다.
 * - 그 외(로컬, VERCEL_ENV=preview = staging 배포): 스토리북을 굽고 public/storybook으로 복사한다.
 *   staging에서 스토리북 빌드 경로가 계속 검증되고, jam-stage.vercel.app/storybook으로 확인한다.
 *
 * 티켓: Service Plan/History/Migration/Ticket/20260827_020_Infra_*.md
 */
import { spawnSync } from 'node:child_process';
import { rmSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const includeStorybook = process.env.VERCEL_ENV !== 'production';

/** 자식 프로세스를 순차 실행하고, 실패하면 그 종료 코드로 빌드를 중단한다. */
function run(command, args) {
  console.log(`\n[build] $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // `node scripts/build.mjs`로 직접 실행해도 로컬 바이너리를 찾도록 PATH를 보강한다
    // (npm run 경유일 때는 npm이 이미 넣어주지만, 그때도 중복이라 무해하다).
    env: {
      ...process.env,
      PATH: `${path.join(projectRoot, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    },
  });
  if (result.error) {
    console.error(`[build] 실행 실패: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[build] 단계 실패 (종료 코드 ${result.status}): ${command}`);
    process.exit(result.status ?? 1);
  }
}

console.log(
  `[build] VERCEL_ENV=${process.env.VERCEL_ENV ?? '(없음)'} → 스토리북 ${
    includeStorybook ? '포함' : '제외 (프로덕션)'
  }`
);

const storybookStaticDir = path.join(projectRoot, 'storybook-static');
const publicStorybookDir = path.join(projectRoot, 'public', 'storybook');

// 이전 빌드 잔여물 정리.
// 스토리북 제외 경로에서도 수행한다 — 로컬에 남아 있던 public/storybook이
// 프로덕션 산출물에 섞여 들어가지 않도록 한다.
rmSync(storybookStaticDir, { recursive: true, force: true });
rmSync(publicStorybookDir, { recursive: true, force: true });

if (includeStorybook) {
  run('storybook', ['build']);
  cpSync(storybookStaticDir, publicStorybookDir, { recursive: true });
  console.log('[build] storybook-static → public/storybook 복사 완료');
}

run('next', ['build']);

console.log('[build] 완료');
