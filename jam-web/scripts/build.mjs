#!/usr/bin/env node
/**
 * JAM! 빌드 진입점 (package.json의 `build` 스크립트)
 *
 * **스토리북은 어떤 환경에도 배포하지 않는다** (2026-09-06 확정, 티켓 20260906_1142).
 * 확인은 로컬 `npm run storybook`(http://localhost:6006)에서만 한다.
 *
 * 이력 — 원래는 브랜치명으로 갈라서 staging 배포에만 스토리북을 실었다. Vercel Build CPU가
 * 청구의 96%($66.15/20일)를 차지해 원인을 실측했더니, 배포된 스토리북에 드는 빌드 비용이
 * 배포 1회당 12초(129초 중 9%)였다. staging의 `/storybook`은 dev-login 뒤에 있어 팀 전용이고
 * 로컬 :6006으로 같은 것을 볼 수 있으므로, 배포에서 들어내는 쪽을 택했다.
 *
 * ⚠️ 그러니 `storybook build`를 이 파일에 되살리지 말 것. 되살린다면 무엇을 얻는지 먼저
 * 적어라 — 2026-08-27에는 반대 방향의 사고가 있었다(`VERCEL_ENV`로 판정했다가 staging에서
 * 스토리북이 통째로 사라져 404). 지금은 **모든 환경에서 일관되게 없는 것**이 규칙이라
 * 그때와 같은 "어떤 배포에는 있고 어떤 배포에는 없는" 상태 자체가 생기지 않는다.
 *
 * 티켓: Service Plan/Tickets/20260906_1142_Infra_*.md (이전 경위는 20260827_020_Infra_*.md)
 */
import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

console.log('[build] 스토리북 제외 — 확인은 로컬 `npm run storybook`(:6006)에서 한다');

// 이전 빌드가 남긴 스토리북 산출물을 지운다.
// **이 정리는 스토리북을 굽지 않게 된 뒤에도 반드시 필요하다** — 로컬 작업 폴더에 예전
// public/storybook(144MB)이 남아 있으면 next build가 그것을 public 자산으로 그대로 배포한다.
rmSync(path.join(projectRoot, 'storybook-static'), { recursive: true, force: true });
rmSync(path.join(projectRoot, 'public', 'storybook'), { recursive: true, force: true });

run('next', ['build']);

// Vercel의 "Ignored Build Step"(scripts/vercel-ignore.sh)이 다음 배포에서 읽을 마커.
// **직전에 실제로 빌드한 커밋**을 남겨, 그 뒤로 jam-web/ 변경이 없으면(= 문서 전용
// 커밋만 쌓였으면) 다음 빌드를 통째로 건너뛰게 한다. HEAD^ 비교와 달리 건너뛴 구간이
// 누적되므로, 한 push에 코드와 문서 커밋이 섞여도 코드 변경을 놓치지 않는다.
//
// .next/cache에 두는 이유: Vercel이 이 디렉토리를 빌드 캐시로 보존하고, 다음 배포에서
// ignoreCommand 실행 **직전에** 복원한다. next build는 .next를 비우면서도 cache는
// 남기지만, 순서에 기대지 않도록 빌드가 끝난 뒤에 쓴다.
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
if (commitSha) {
  const cacheDir = path.join(projectRoot, '.next', 'cache');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path.join(cacheDir, 'jam-last-built-sha'), commitSha, 'utf8');
  console.log(`[build] 빌드 커밋 마커 기록: ${commitSha}`);
}

console.log('[build] 완료');
