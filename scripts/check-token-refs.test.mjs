// scripts/check-token-refs.mjs 의 판정 규칙과 실제 저장소 통과를 확인한다 (티켓 20261126_0750).
// 실행: node scripts/check-token-refs.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findUndefinedTokens } from './check-token-refs.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-token-refs.mjs')
const tokens = new Set(['--background'])

assert.deepEqual(findUndefinedTokens('<div style={{ color: "var(--nope)" }} />', tokens), ['--nope'], '미정의 참조는 잡힌다')
assert.deepEqual(findUndefinedTokens('color: var(--nope, #fff)', tokens), [], 'fallback이 있으면 넘어간다')
assert.deepEqual(findUndefinedTokens("style={{ '--eye': c, color: 'var(--eye)' }}", tokens), [], '지역 변수 선언은 넘어간다')
assert.deepEqual(findUndefinedTokens('const css = `--local: 1px; margin: var(--local)`', tokens), [], '템플릿 문자열 안 선언은 넘어간다')
assert.deepEqual(findUndefinedTokens('color: var(--g)', tokens, ':root { --g: red; }'), [], 'globals.css에 정의된 이름은 넘어간다')
assert.deepEqual(findUndefinedTokens('color: var(--background)', tokens), [], '토큰 파일에 정의된 이름은 넘어간다')
assert.deepEqual(findUndefinedTokens('설명: var(--weight-*)', tokens), [], '와일드카드 설명 표기는 넘어간다')

const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
assert.equal(r.status, 0, `실제 저장소 전체 실행이 통과해야 한다: ${r.stderr}`)

console.log('check-token-refs 시험 통과')
