// pre-commit 무인 예약 루틴 커밋 경로 제한 테스트 (티켓 20260921_2306)
// 임시 저장소에서 훅을 직접 실행한다. GIT_* 변수와 전역 설정은 격리해 실제 저장소를 건드리지 않는다.
// 실행: node scripts/pre-commit-routine-author.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks', 'pre-commit')
const ROUTINE_EMAIL = 'noreply@anthropic.com'
const OTHER_EMAIL = 'sihyunrr@gmail.com'

const env = (extra = {}) => {
  const e = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && !k.startsWith('JAM_')) e[k] = v
  return { ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra }
}
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env() })
  assert.equal(r.status, 0, `git ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout.trim()
}

const base = mkdtempSync(join(tmpdir(), 'pre-commit-routine-author-'))
try {
  git(['init', '-q', base], base)

  const setAuthor = (email, name = 'x') => {
    git(['config', 'user.name', name], base)
    git(['config', 'user.email', email], base)
  }

  const stage = (relPaths) => {
    for (const p of relPaths) {
      const full = join(base, p)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, `${p}\n`)
    }
    git(['add', ...relPaths], base)
  }

  const runHook = () => spawnSync('bash', [HOOK], { cwd: base, encoding: 'utf8', env: env() })

  // ① 리포트 폴더 안 — 통과
  setAuthor(ROUTINE_EMAIL, 'Claude')
  stage(['jam-doc/operations/reports/triage/2026-09-22.md'])
  let r = runHook()
  assert.equal(r.status, 0, `리포트 폴더 안 커밋은 통과해야 한다:\n${r.stderr}`)
  git(['reset', '-q'], base)

  // ② 리포트 폴더 밖 — 차단
  stage(['jam-web/src/foo.ts'])
  r = runHook()
  assert.equal(r.status, 1, `리포트 폴더 밖 커밋은 차단되어야 한다:\n${r.stderr}`)
  assert.match(r.stderr, new RegExp(ROUTINE_EMAIL.replace('.', '\\.')))
  assert.match(r.stderr, /jam-web\/src\/foo\.ts/)
  git(['reset', '-q'], base)

  // ③ 혼합(안+밖) — 차단
  stage(['jam-doc/operations/reports/triage/2026-09-23.md', 'docs/tickets/foo.md'])
  r = runHook()
  assert.equal(r.status, 1, `리포트 폴더 안팎이 섞이면 차단되어야 한다:\n${r.stderr}`)
  git(['reset', '-q'], base)

  // ④ 일반 작성자 — 무관(폴더 밖이어도 통과)
  setAuthor(OTHER_EMAIL, 'standardmanual')
  stage(['jam-web/src/bar.ts'])
  r = runHook()
  assert.equal(r.status, 0, `예약 루틴 작성자가 아니면 경로 제한이 적용되지 않아야 한다:\n${r.stderr}`)
  git(['reset', '-q'], base)

  console.log('통과: pre-commit 무인 예약 루틴 커밋 경로 제한')
} finally {
  rmSync(base, { recursive: true, force: true })
}
