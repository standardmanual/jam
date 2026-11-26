// scripts/gen-component-list.mjs 의 추출·판정 규칙과 --check 종료 코드를 확인한다 (티켓 20261126_0947).
// 실행: node scripts/gen-component-list.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BEGIN, END, judgeStories, parseComponentSource, parseStorySource } from './gen-component-list.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'gen-component-list.mjs')

// @summary 추출
const withSummary = `/**\n * 긴 설명 첫 줄.\n * @summary 알약 모양 버튼\n */\nexport function Pill() { return null }\n`
assert.equal(parseComponentSource(withSummary).summary, '알약 모양 버튼')
assert.deepEqual(parseComponentSource(withSummary).exports, ['Pill'])

// @summary가 없으면 주된 export 바로 위 JSDoc 첫 문장, JSDoc이 없으면 —
assert.equal(parseComponentSource(`/** 첫 문장이다. 두 번째 문장. */\nexport const Box = () => null\n`).summary, '첫 문장이다.')
assert.equal(parseComponentSource(`export const Box = () => null\n`).summary, '—')
assert.deepEqual(parseComponentSource('const Button = forwardRef(() => null)\nexport default Button\nexport const PEBBLE_SIZE = 1\n').exports, ['Button'], '따로 쓴 default export는 잡고 대문자 상수는 뺀다')

// 스토리 title·개수
const story = `const data = { title: '가짜' }\nconst meta = {\n  title: 'UI/Cards/Box',\n}\nexport default meta\nexport const A = {}\nexport const B = {}\n`
assert.deepEqual(parseStorySource(story), { title: 'UI/Cards/Box', count: 2 })

// 스토리 없는 파일은 실패, 다 있으면 빈 목록
const entries = [
  { file: 'A.tsx', story: null },
  { file: 'B.tsx', story: { title: 't', count: 1 } },
]
assert.deepEqual(judgeStories(entries), ['A.tsx'], '스토리 없는 파일은 실패 목록에 든다')
assert.deepEqual(judgeStories([entries[1]]), [], '다 있으면 빈 목록')

// 임시 폴더로 --check 종료 코드
const tmp = mkdtempSync(join(tmpdir(), 'gen-component-list-'))
try {
  const root = join(tmp, 'ui')
  mkdirSync(root)
  writeFileSync(join(root, 'Old.tsx'), '/** 옛 컴포넌트. */\nexport function Old() { return null }\n')
  writeFileSync(join(root, 'Old.stories.tsx'), "const meta = { title: 'UI/Old' }\nexport default meta\nexport const A = {}\n")
  const doc = join(tmp, 'README.md')
  writeFileSync(doc, `# 목록\n\n${BEGIN}\n${END}\n`)
  const args = ['--root', root, '--doc', doc]
  const run = (extra) => spawnSync(process.execPath, [SCRIPT, ...args, ...extra], { encoding: 'utf8' })

  assert.equal(run(['--check']).status, 1, '생성 구간이 낡았으면 실패')
  assert.equal(run([]).status, 0, '생성은 성공')
  assert.equal(run(['--check']).status, 0, '스토리가 다 있으면 통과')

  writeFileSync(join(root, 'New.tsx'), 'export function New() { return null }\n')
  run([])
  const r = run(['--check'])
  assert.equal(r.status, 1, '스토리 없는 새 정본 파일은 종료 코드 1')
  assert.match(r.stderr, /New\.tsx/)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// 실제 저장소
const real = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' })
assert.equal(real.status, 0, `실제 저장소 --check가 통과해야 한다: ${real.stderr}`)

console.log('gen-component-list 시험 통과')
