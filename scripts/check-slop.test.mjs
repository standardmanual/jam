// scripts/check-slop.mjs 가 커밋 전 워킹트리의 추적되지 않는 새 파일도 검사하는지 확인한다 (티켓 20260924_0037).
// 이전에는 origin/staging...HEAD 커밋 diff만 봐서, 커밋 전에 verify.sh를 돌리면 CI와 결과가 갈렸다.
// 임시 파일은 검사 범위(jam-web/) 안에 만들고 끝나면 지운다.
// 실행: node scripts/check-slop.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROBE_REL = `jam-web/slop-probe-${process.pid}.txt`
const BIN_REL = `jam-web/slop-probe-${process.pid}.bin`
// 사용자 트렌드 자료 폴더는 원문을 고치지 않으므로 검사에서 빠져야 한다 (티켓 20260930_1518)
const TREND_REL = `docs/operations/inbox/trends/2099-01-01_slop-probe-${process.pid}.md`
const PROBE = join(ROOT, PROBE_REL)
const BIN = join(ROOT, BIN_REL)
const TREND = join(ROOT, TREND_REL)

// 인자로 준 파일만 판정한다 — 워킹트리의 다른 미커밋 변경이 결과를 흔들지 않게 한다 (티켓 20260924_0652).
const run = (rel) => spawnSync('node', ['scripts/check-slop.mjs', rel], { cwd: ROOT, encoding: 'utf8' })

try {
  writeFileSync(PROBE, '// 진짜 금칙어 탐침\n')
  const dirty = run(PROBE_REL)
  assert.equal(dirty.status, 1, '미추적 새 파일의 금칙어를 잡아야 한다')
  assert.match(dirty.stderr, /slop-probe-/)

  rmSync(PROBE)
  writeFileSync(PROBE, '// 금칙어 없는 탐침\n')
  const clean = run(PROBE_REL)
  assert.equal(clean.status, 0, `금칙어가 없으면 통과해야 한다: ${clean.stderr}`)

  // 미추적 바이너리(널 바이트 포함)는 금칙어 바이트가 섞여 있어도 건너뛰어야 한다.
  writeFileSync(BIN, Buffer.concat([Buffer.from('진짜 금칙어'), Buffer.from([0, 1, 2, 255])]))
  const bin = run(BIN_REL)
  assert.equal(bin.status, 0, `미추적 바이너리는 건너뛰어야 한다: ${bin.stderr}`)

  mkdirSync(dirname(TREND), { recursive: true })
  writeFileSync(TREND, '진짜 금칙어\n')
  const trend = run(TREND_REL)
  assert.equal(trend.status, 0, `사용자 트렌드 자료는 금칙어 검사에서 빠져야 한다: ${trend.stderr}`)
  console.log('check-slop 테스트 통과')
} finally {
  rmSync(PROBE, { force: true })
  rmSync(BIN, { force: true })
  rmSync(TREND, { force: true })
}
