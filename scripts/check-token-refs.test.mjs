// scripts/check-token-refs.mjs 의 판정 규칙과 폴더 인자 실행을 확인한다 (티켓 20261126_0750, 범위 확대 20261126_2115).
// 실행: node scripts/check-token-refs.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declaredNames, findUndefinedTokens } from './check-token-refs.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-token-refs.mjs')
const tokens = new Set(['--background'])

assert.deepEqual(findUndefinedTokens('<div style={{ color: "var(--nope)" }} />', tokens), ['--nope'], '미정의 참조는 잡힌다')
assert.deepEqual(findUndefinedTokens('color: var(--nope, #fff)', tokens), [], 'fallback이 있으면 넘어간다')
assert.deepEqual(findUndefinedTokens("style={{ '--eye': c, color: 'var(--eye)' }}", tokens), [], '지역 변수 선언은 넘어간다')
assert.deepEqual(findUndefinedTokens('const css = `--local: 1px; margin: var(--local)`', tokens), [], '템플릿 문자열 안 선언은 넘어간다')
assert.deepEqual(findUndefinedTokens('color: var(--g)', tokens, ':root { --g: red; }'), [], 'globals.css에 정의된 이름은 넘어간다')
assert.deepEqual(findUndefinedTokens('color: var(--background)', tokens), [], '토큰 파일에 정의된 이름은 넘어간다')
assert.deepEqual(findUndefinedTokens('설명: var(--weight-*)', tokens), [], '와일드카드 설명 표기는 넘어간다')

// 선언 이름 수집: CSS·style 객체·setProperty·@property 선언은 정의로 인정하고 --tw-* 는 뺀다
assert.deepEqual(
  [...declaredNames("a { --x: 1; } s={{ '--ticket': t }} el.style.setProperty('--y', v) @property --z { } --tw-ring: 0;")].sort(),
  ['--ticket', '--x', '--y', '--z'],
  '선언 이름 수집',
)

// 폴더 인자: 그 폴더만 본다. 미정의 참조가 있으면 1, 없거나 같은 폴더 안에서 선언했으면 0
const tmp = mkdtempSync(join(tmpdir(), 'token-refs-'))
try {
  const bad = join(tmp, 'bad')
  const ok = join(tmp, 'ok')
  mkdirSync(join(bad, 'node_modules'), { recursive: true })
  mkdirSync(ok, { recursive: true })
  writeFileSync(join(bad, 'A.tsx'), 'const a = <div style={{ color: "var(--nope-zzz)" }} />\n')
  writeFileSync(join(bad, 'node_modules', 'B.css'), 'a { color: var(--ignored-zzz); }\n')
  writeFileSync(join(ok, 'A.tsx'), "const a = <div style={{ '--ticket-zzz': t, color: 'var(--ticket-zzz)' }} />\n")
  writeFileSync(join(ok, 'B.css'), '.a { --local-zzz: 1px; margin: var(--local-zzz); outline: var(--tw-ring-shadow); }\n')
  writeFileSync(join(ok, 'C.test.ts'), "el.style.setProperty('--set-zzz', '1'); const s = 'var(--set-zzz)'\n")
  const run = (dir) => spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
  let r = run(bad)
  assert.equal(r.status, 1, '미정의 참조가 있는 폴더는 종료 코드 1')
  assert.match(r.stderr, /--nope-zzz/)
  assert.doesNotMatch(r.stderr, /ignored-zzz/, 'node_modules는 건너뛴다')
  r = run(ok)
  assert.equal(r.status, 0, `선언·--tw-*·시험 파일이 있는 폴더는 통과: ${r.stderr}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('check-token-refs 시험 통과')
