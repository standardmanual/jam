// scripts/check-admin-palette.mjs 의 판정과 실행 방식을 확인한다 (티켓 20261126_2115).
// 실행: node scripts/check-admin-palette.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findMissing, loadDefined } from './check-admin-palette.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-admin-palette.mjs')
const defined = loadDefined('@theme { --color-red-500: #f00; --color-white: #fff; --shadow-sm: 0 1px; } /* --color-lime-500: x */')
const miss = (text) => findMissing(text, '.tsx', defined).map((h) => h.cls)

assert.deepEqual(miss('<p className="bg-red-500 text-white shadow-sm">'), [], '정의된 클래스는 통과')
assert.deepEqual(miss('<p className="bg-lime-500">'), ['bg-lime-500'], '정의 없는 팔레트 색은 위반')
assert.deepEqual(miss('<p className="hover:text-gray-700/80 border-t-red-600">'), ['text-gray-700', 'border-t-red-600'], '변형·불투명도·방향 접두 포함')
assert.deepEqual(miss('<p className="shadow-xl shadow-md">'), ['shadow-xl', 'shadow-md'], '정의 없는 그림자 크기는 위반')
assert.deepEqual(miss('<p className="bg-card-bg text-foreground bg-primary">'), [], '팔레트 모양이 아닌 이름은 이 검사 대상이 아님')
assert.deepEqual(miss('// bg-lime-500\nconst a = 1'), [], '주석 안은 세지 않음')
assert.deepEqual(miss('const a = 1\nconst c = "bg-lime-500"'), ['bg-lime-500'], '문자열 안은 센다')
assert.equal(findMissing('x\n<p className="bg-lime-500">', '.tsx', defined)[0].line, 2, '줄 번호')

const tmp = mkdtempSync(join(tmpdir(), 'admin-palette-'))
try {
  mkdirSync(join(tmp, 'jam-web/src/app'), { recursive: true })
  writeFileSync(join(tmp, 'jam-web/src/app/admin-theme.css'), '@theme { --color-red-500: #f00; }\n')
  writeFileSync(join(tmp, 'jam-web/src/app/A.tsx'), '<p className="bg-red-500">\n')
  const run = () => spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' })
  assert.equal(run().status, 0, '정의된 클래스만 있으면 0')
  writeFileSync(join(tmp, 'jam-web/src/app/A.tsx'), '<p className="bg-red-500 text-lime-500">\n')
  const r = run()
  assert.equal(r.status, 1, '정의 없는 클래스가 있으면 1')
  assert.match(r.stderr, /A\.tsx: text-lime-500\(줄 1\)/)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('check-admin-palette 시험 통과')
