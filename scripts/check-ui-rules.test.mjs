// scripts/check-ui-rules.mjs 의 규칙 네 가지·면제 주석·기준선 비교·실행 방식을 확인한다 (티켓 20261125_2012).
// 파일 시스템 시험은 임시 폴더에 가짜 루트를 만들어 --root·--baseline 으로 돌리고, 끝나면 지운다.
// 실행: node scripts/check-ui-rules.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compare, findHits, isTarget, scan, summarize } from './check-ui-rules.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-ui-rules.mjs')
const P = 'jam-web/src/components/Foo.tsx'
const rules = (text, p = P) => findHits(text, p).map((h) => h.rule)
const count = (text, rule, p = P) => rules(text, p).filter((r) => r === rule).length

// --- arbitrary
assert.equal(count('<p className="text-[13px]">', 'arbitrary'), 1, 'text-[13px] 적발')
assert.equal(count('<p className="md:rounded-[10px] w-[calc(100%-2px)]">', 'arbitrary'), 2, '변형 접두 뒤 임의값·calc 적발')
assert.equal(count('<p className="bg-[var(--surface)] w-[var(--w)]">', 'arbitrary'), 0, 'var(--…) 하나뿐이면 통과')
assert.equal(count('<p className="data-[state=open]:flex aria-[x=y]:block [&>svg]:size-4">', 'arbitrary'), 0, '임의 변형은 통과')
assert.equal(count('<p className="pt-[32px] -mt-[7.5px]">', 'arbitrary'), 0, '간격 접두의 [Npx]는 spacing 검사 몫')
assert.equal(count('<p className="pt-[calc(1rem+2px)]">', 'arbitrary'), 1, '간격 접두라도 px가 아닌 값은 센다')
assert.equal(count('const a = arr[0]; const b = x.y[1]', 'arbitrary'), 0, '배열 접근은 아님')

// --- color-literal
assert.equal(count("const c = '#ff0000'", 'color-literal'), 1, 'hex6')
assert.equal(count('c: #fff; d: #12345678;', 'color-literal'), 2, 'hex3·hex8')
assert.equal(count("fill: rgb(0 0 0) rgba(0,0,0,.5) hsl(1 2% 3%) hsla(1,2%,3%,.1) oklch(.5 .1 20)", 'color-literal'), 5, '함수형 색')
assert.equal(count("href: '#section' // #fff", 'color-literal'), 1, '앵커는 아님, 줄 끝 주석 속 hex는 세는 단순 규칙')
assert.equal(count('// 예전 색 #ff0000', 'color-literal'), 0, '주석 줄은 세지 않음')
assert.equal(count(' * rgba(0,0,0,.5) 설명', 'color-literal'), 0, '* 주석 줄은 세지 않음')
assert.equal(count('color: var(--text-primary)', 'color-literal'), 0)

// --- inline-visual
assert.equal(count("<div style={{ color: '#000' }} />", 'inline-visual'), 1, '문자열 리터럴')
assert.equal(count('<div style={{ fontSize: 12, fontWeight: 700 }} />', 'inline-visual'), 2, '숫자 리터럴')
assert.equal(count("<div style={{ color: 'var(--text)', background: tone.bg }} />", 'inline-visual'), 0, '변수·식은 통과')
assert.equal(count('<div style={{ color: tone.fg, width: 10, display: "flex" }} />', 'inline-visual'), 0, '시각 속성이 아니면 통과')
assert.equal(count('<div style={{\n  borderRadius: 8,\n  boxShadow: tone.s,\n}} />', 'inline-visual'), 1, '여러 줄')
assert.deepEqual(findHits('<div style={{\n  a: 1,\n  borderRadius: 8,\n}} />', P).filter((h) => h.rule === 'inline-visual').map((h) => h.line), [3], '속성 줄 번호')
assert.equal(count("const o = { color: 'red' }", 'inline-visual'), 0, 'style 밖 객체는 대상 아님')

// --- raw-element
assert.equal(count('<button type="button">', 'raw-element'), 1)
assert.equal(count('<input\n  type="text" /><select><textarea />', 'raw-element'), 3, 'input·select·textarea')
assert.equal(count('<Button> <InputField /> <buttonGroup>', 'raw-element'), 0, '정본·이름이 이어진 태그는 아님')
assert.equal(count('<button type="button">', 'raw-element', 'jam-web/src/components/ui/Button.tsx'), 0, '정본 폴더 안은 통과')

// --- ui-allow
assert.equal(rules('<button> {/* ui-allow: 네이티브 필요 */}').length, 0, '사유 있는 예외')
assert.equal(rules('<button> {/* ui-allow: */}').length, 1, '사유 없으면 무효')
assert.equal(rules('const c = "#fff" // ui-allow: 브랜드 로고').length, 0)

// --- 대상 판정
assert.equal(isTarget('jam-web/src/app/(main)/a/page.tsx'), true)
assert.equal(isTarget('jam-web/src/app/(main)/admin/page.tsx'), false, 'admin 제외')
assert.equal(isTarget('jam-web/src/components/__tests__/a.tsx'), false)
assert.equal(isTarget('jam-web/src/components/a.test.tsx'), false)
assert.equal(isTarget('jam-web/src/components/a.stories.tsx'), false)
assert.equal(isTarget('jam-web/src/components/a.json'), false)
assert.equal(isTarget('jam-web/src/app/globals.css'), false, '토큰 정의 파일')
assert.equal(isTarget('jam-web/design-system/components/a.tsx'), false)
assert.equal(isTarget('jam-web/src/app/admin/a.tsx'), false)

// --- 기준선 비교
const cur = (counts) => ({ counts, lines: Object.fromEntries(Object.keys(counts).map((k) => [k, [1]])) })
{
  const r = compare({ 'a.tsx': cur({ arbitrary: 2 }) }, { 'a.tsx': { arbitrary: 2 } })
  assert.equal(r.failures.length + r.shrunk.length, 0, '같으면 통과')
  const up = compare({ 'a.tsx': cur({ arbitrary: 3 }) }, { 'a.tsx': { arbitrary: 2 } })
  assert.equal(up.failures.length, 1, '늘면 실패')
  assert.match(up.failures[0].fix, /카리나/)
  assert.equal(compare({ 'n.tsx': cur({ 'raw-element': 1 }) }, {}).failures.length, 1, '기준선 밖 파일은 실패')
  assert.equal(compare({ 'a.tsx': cur({ 'raw-element': 1 }) }, { 'a.tsx': { arbitrary: 2 } }).failures.length, 1, '다른 규칙이 새로 생기면 실패')
  const down = compare({ 'a.tsx': cur({ arbitrary: 1 }) }, { 'a.tsx': { arbitrary: 2 } })
  assert.equal(down.failures.length, 0)
  assert.equal(down.shrunk.length, 1, '줄면 안내')
  assert.equal(compare({}, { 'a.tsx': { arbitrary: 2 } }).shrunk.length, 1, '사라진 파일은 안내')
  assert.equal(compare({}, { 'a.tsx': { arbitrary: 2 } }, ['b.tsx']).shrunk.length, 0, 'onlyFiles 밖 기준선은 보지 않음')
}
assert.deepEqual(summarize(findHits('<button>\n<button>', P)).counts, { 'raw-element': 2 })

// --- 파일 시스템·CLI
const tmp = mkdtempSync(join(tmpdir(), 'ui-rules-'))
try {
  const comp = join(tmp, 'jam-web/src/components')
  mkdirSync(comp, { recursive: true })
  mkdirSync(join(tmp, 'jam-web/src/app/(main)/admin'), { recursive: true })
  mkdirSync(join(tmp, 'jam-web/src/app/(main)/한글'), { recursive: true })
  writeFileSync(join(comp, 'A.tsx'), '<p className="text-[13px]">\n')
  writeFileSync(join(comp, 'A.test.tsx'), '<button>\n')
  writeFileSync(join(tmp, 'jam-web/src/app/(main)/admin/x.tsx'), '<button>\n')
  writeFileSync(join(tmp, 'jam-web/src/app/(main)/한글/p.tsx'), "const c = '#fff'\n")
  const scanned = scan(tmp)
  assert.deepEqual(Object.keys(scanned).sort(), ['jam-web/src/app/(main)/한글/p.tsx', 'jam-web/src/components/A.tsx'], '테스트·admin 제외, 한글 경로')

  const base = join(tmp, 'baseline.json')
  const run = (args, input) =>
    spawnSync('node', [SCRIPT, '--root', tmp, '--baseline', base, ...args], { encoding: 'utf8', input })

  assert.equal(run(['--write-baseline']).status, 0)
  assert.deepEqual(JSON.parse(readFileSync(base, 'utf8'))['jam-web/src/components/A.tsx'], { arbitrary: 1 })
  assert.equal(run([]).status, 0, '기준선과 같으면 통과')

  // 위반을 새로 넣으면 실패하고 파일·줄·규칙 키·고치는 방법이 나온다
  writeFileSync(join(comp, 'A.tsx'), '<p className="text-[13px]">\n<button>\n')
  let r = run([])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /A\.tsx \[raw-element\].*줄 2/)
  assert.match(r.stderr, /고치는 방법: .*정본 컴포넌트/)
  const j = JSON.parse(run(['--json']).stdout)
  assert.equal(j.ok, false)
  assert.equal(j.failures[0].rule, 'raw-element')

  // --files: 주어진 파일만, 비대상·없는 파일은 무시
  assert.equal(run(['--files', 'jam-web/src/components/A.tsx']).status, 1)
  assert.equal(run(['--files', 'jam-web/src/components/A.test.tsx', 'jam-web/src/components/없음.tsx']).status, 0)

  // --stdin-file: 디스크(위반 있음)가 아니라 표준 입력 내용으로 판정
  r = run(['--stdin-file', 'jam-web/src/components/A.tsx'], '<p className="text-[13px]">\n')
  assert.equal(r.status, 0, '디스크는 위반이지만 입력이 깨끗하면 통과')
  r = run(['--stdin-file', 'jam-web/src/components/A.tsx'], '<p style={{ color: "#000" }}>\n')
  assert.equal(r.status, 1, '입력의 위반을 잡는다')
  assert.match(r.stderr, /inline-visual/)
  assert.equal(run(['--stdin-file', join(tmp, 'jam-web/src/components/New.tsx')], '<button>').status, 1, '절대 경로·새 파일도 판정')

  // 줄어든 파일은 안내만
  writeFileSync(join(comp, 'A.tsx'), 'ok\n')
  r = run([])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /기준선을 줄이세요/)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('check-ui-rules.test: 통과')
