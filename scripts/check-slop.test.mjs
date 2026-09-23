// scripts/check-slop.mjs 가 커밋 전 워킹트리의 추적되지 않는 새 파일도 검사하는지 확인한다 (티켓 20260924_0037).
// 이전에는 origin/staging...HEAD 커밋 diff만 봐서, 커밋 전에 verify.sh를 돌리면 CI와 결과가 갈렸다.
// 임시 파일은 검사 범위(jam-web/) 안에 만들고 끝나면 지운다.
// 실행: node scripts/check-slop.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROBE = join(ROOT, 'jam-web', `slop-probe-${process.pid}.txt`)

const run = () => spawnSync('node', ['scripts/check-slop.mjs'], { cwd: ROOT, encoding: 'utf8' })

try {
  writeFileSync(PROBE, '// 진짜 금칙어 탐침\n')
  const dirty = run()
  assert.equal(dirty.status, 1, '미추적 새 파일의 금칙어를 잡아야 한다')
  assert.match(dirty.stderr, /slop-probe-/)

  rmSync(PROBE)
  writeFileSync(PROBE, '// 금칙어 없는 탐침\n')
  const clean = run()
  assert.equal(clean.status, 0, `금칙어가 없으면 통과해야 한다: ${clean.stderr}`)
  console.log('check-slop 테스트 통과')
} finally {
  rmSync(PROBE, { force: true })
}
