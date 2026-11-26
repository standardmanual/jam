// scripts/check-ui-rules.mjs 의 규칙 네 가지·면제 주석·위반 판정·실행 방식을 확인한다 (티켓 20261125_2012, 기준선 제거 20261126_1634).
// 파일 시스템 시험은 임시 폴더에 가짜 루트를 만들어 --root 로 돌리고, 끝나면 지운다.
// 실행: node scripts/check-ui-rules.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findHits, isTarget, scan, summarize, toFailures } from './check-ui-rules.mjs'

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
assert.equal(count("href: '#section' // #fff", 'color-literal'), 0, '앵커는 아님, 줄 끝 주석 속 hex도 세지 않음')
assert.equal(count('// 예전 색 #ff0000', 'color-literal'), 0, '주석 줄은 세지 않음')
assert.equal(count('/**\n * rgba(0,0,0,.5) 설명\n */', 'color-literal'), 0, '* 주석 줄은 세지 않음')
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

// --- 주석 안은 세지 않는다 (티켓 20261126_1310)
assert.equal(rules('/**\n * max-w-[430px] #171717 <button>\n */\nconst a = 1').length, 0, 'JSDoc 본문은 세지 않음')
assert.equal(rules('/* bg-[#fff]\n   <input> */').length, 0, '여러 줄 블록 주석은 세지 않음')
assert.equal(rules('<div>{/* <button> w-[13px] #fff */}</div>').length, 0, 'JSX 주석은 세지 않음')
assert.equal(rules("const a = 1 // w-[13px] <select> rgb(0 0 0)").length, 0, '줄 끝 주석은 세지 않음')
assert.equal(count("const u = 'https://x'; const c = 'bg-[#fff]'", 'arbitrary'), 1, '문자열 안 // 옆의 임의값은 센다')
assert.equal(count("const u = 'https://x'; const c = '#fff'", 'color-literal'), 1, '문자열 안 // 옆의 색은 센다')
assert.equal(rules("<div style={{ /* color: '#fff' */ }} />").length, 0, 'style 안 주석 속 값은 세지 않음')
assert.equal(count('<button> {/* ui-allow: 사유 */}', 'raw-element'), 0, 'ui-allow가 있는 줄은 빠짐')
assert.equal(count('<button> // ui-allow: 사유', 'raw-element'), 0, '줄 끝 ui-allow도 빠짐')
assert.equal(count('<button> {/* ui-allow: */}', 'raw-element'), 1, '사유 없는 ui-allow는 예외가 아님')
assert.equal(rules('<p className="w-[13px]">\n// w-[13px]').length, 1, '줄 번호는 그대로')

// --- 토큰만으로 이뤄진 임의값은 통과
assert.equal(count('<p className="text-[color:var(--link)] w-[length:var(--x)]">', 'arbitrary'), 0, '형식 힌트 + 토큰')
assert.equal(count('<p className="top-[calc(var(--a)+var(--b))]">', 'arbitrary'), 0, '토큰 계산식')
assert.equal(count('<p className="min-h-[calc(100dvh-var(--a))] h-[calc(100%-var(--b))] w-[min(100vw,var(--m))]">', 'arbitrary'), 0, '화면 단위·100%')
assert.equal(count('<p className="w-[calc(var(--a)*2)] p-[calc(var(--a)/2)] top-[clamp(0,var(--a),1)]">', 'arbitrary'), 0, '숫자·연산자')
assert.equal(count('<p className="w-[calc(100%+0.75rem)]">', 'arbitrary'), 1, '리터럴 길이가 섞이면 위반')
assert.equal(count('<p className="w-[calc(100%+8px)] w-[calc(100%-42px)]">', 'arbitrary'), 2, '리터럴 px가 섞이면 위반')
assert.equal(count('<p className="pb-[var(--x,1rem)]">', 'arbitrary'), 1, '대체값이 있으면 위반')
assert.equal(count('<p className="text-[color:#fff] w-[calc(var(--a)+2vh)]">', 'arbitrary'), 2, '형식 힌트 뒤 리터럴·다른 단위는 위반')
assert.equal(count('<p className="w-[calc(1000%-var(--a))]">', 'arbitrary'), 1, '100%가 아닌 퍼센트는 위반')

// --- 스토리 전용 견본 파일은 대상이 아니다
assert.equal(isTarget('jam-web/src/components/today/feed/feedStoryFixtures.tsx'), false)
assert.equal(isTarget('jam-web/src/components/a/xStoryFixtures.ts'), false)
assert.equal(isTarget('jam-web/src/components/a/StoryFixturesHelper.tsx'), true, '이름 끝이 아니면 대상')

// --- 위반 목록: 기준선 없이 하나라도 있으면 실패
const cur = (counts) => ({ counts, lines: Object.fromEntries(Object.keys(counts).map((k) => [k, [1]])) })
{
  assert.equal(toFailures({}).length, 0, '위반이 없으면 통과')
  const one = toFailures({ 'a.tsx': cur({ 'raw-element': 1 }) })
  assert.equal(one.length, 1, '위반 1건도 실패')
  assert.match(one[0].fix, /정본 컴포넌트/)
  assert.equal(toFailures({ 'a.tsx': cur({ arbitrary: 2, 'raw-element': 1 }) }).length, 2, '규칙별로 나눈다')
}
// --- 토큰 없는 계산식은 리터럴 값이다
assert.equal(findHits('<p className="scale-[calc(0.96)]">', P).length, 1)
assert.equal(findHits('<p className="w-[calc(100%)]">', P).length, 1)
assert.equal(findHits('<p className="w-[calc(100%-var(--x))]">', P).length, 0, '토큰이 있으면 조합으로 본다')
// --- ui-allow: 사유가 있으면 통과, 비면 위반
assert.equal(findHits('<p className="text-[13px]"> {/* ui-allow: 견본 */}', P).length, 0)
assert.equal(findHits('<p className="text-[13px]"> {/* ui-allow: */}', P).length, 1)
assert.deepEqual(summarize(findHits('<button>\n<button>', P)).counts, { 'raw-element': 2 })

// --- 층 규칙: primitive-ref·palette-class (티켓 20261126_2115, 9-4회차). 이름은 실제 저장소 파일에서 읽는다.
assert.equal(count('color: var(--base-white)', 'primitive-ref'), 1, '기본값 직접 참조 적발')
assert.equal(count('color: var(--base-white, #fff)', 'primitive-ref'), 1, '대체값이 있어도 적발')
assert.equal(count('width: var(--text-xs)', 'primitive-ref'), 1, 'jam-theme.css @theme 이름도 기본값')
assert.equal(count('color: var(--background) var(--page-x)', 'primitive-ref'), 0, '의미 토큰은 통과')
assert.equal(count('// var(--base-white)', 'primitive-ref'), 0, '주석 안은 세지 않음')
assert.equal(count('color: var(--base-white)', 'primitive-ref', 'jam-web/src/components/ui/Button.tsx'), 0, '정본 폴더는 통과')
assert.equal(count('a: var(--base-white)', 'primitive-ref', 'jam-web/src/components/transitions.css'), 0, 'transitions.css는 통과')
assert.equal(count('color: var(--base-white) /* ui-allow: 사유 */', 'primitive-ref'), 1, 'ui-allow 예외를 받지 않음')
assert.equal(count('<p className="bg-red-500 hover:text-gray-700/80">', 'palette-class'), 2, '팔레트 클래스·변형·불투명도')
assert.equal(count('<p className="text-primary bg-destructive border-input ring-ring">', 'palette-class'), 4, '어드민 shadcn 이름')
assert.equal(count('<p className="bg-jam-red border-t-white shadow-sm">', 'palette-class'), 3, '강조색·방향 접두·그림자')
assert.equal(count('<p className="bg-card-bg text-foreground bg-accent text-muted border-border bg-card-bg/50">', 'palette-class'), 0, '서비스 의미 토큰 클래스는 통과')
assert.equal(count('<p className="bg-red-500">', 'palette-class', 'jam-web/src/components/ui/Button.tsx'), 0, '정본 폴더는 통과')
assert.equal(count('<p className="bg-red-500"> {/* ui-allow: 사유 */}', 'palette-class'), 1, 'ui-allow 예외를 받지 않음')
assert.equal(count('// bg-red-500', 'palette-class'), 0, '주석 안은 세지 않음')
{
  const f = toFailures({ 'a.tsx': { counts: { 'palette-class': 1 }, lines: { 'palette-class': [3] } } })
  assert.match(f[0].fix, /카리나에게 토큰 추가 승인/)
}

// --- card-padding: 정본 Card는 여백을 인라인 style로 넣어 className의 여백 클래스가 무시된다 (티켓 20261126_2224)
assert.equal(count('<Card className="p-4">x</Card>', 'card-padding'), 1, '문자열 className의 p-*')
assert.equal(count('<Card className="rounded-lg px-3 pb-2">', 'card-padding'), 2, '여러 여백 클래스는 각각 센다')
assert.equal(count('<Card className="md:pt-4 -ml-2 ps-2 pe-2 pl-1 pr-1 py-1">', 'card-padding'), 6, '변형 접두·방향·논리 방향(-ml은 마진이라 제외)')
assert.equal(count('<Card className={cn("p-4", x)}>', 'card-padding'), 1, 'cn() 식 안')
assert.equal(count('<Card className={`flex ${a} px-2`}>', 'card-padding'), 1, '템플릿 문자열 안')
assert.equal(count('<Card\n  tone="a"\n  className="p-4"\n>', 'card-padding'), 1, '여러 줄 태그')
assert.deepEqual(findHits('<Card\n  tone="a"\n  className="p-4"\n>', P).map((h) => h.line), [3], '줄 번호는 className 줄')
assert.equal(count('<Card className="flex gap-2 pointer-events-none placeholder-x">', 'card-padding'), 0, 'pointer-events 등은 여백이 아님')
assert.equal(count('<Card className="m-4 gap-2 rounded-lg">', 'card-padding'), 0, '마진·간격은 통과')
assert.equal(count('<Card style={{ padding: "var(--x)" }} className="flex">', 'card-padding'), 0, 'style로 덮는 방식은 이 규칙 대상이 아님')
assert.equal(count('<CardHeader className="p-4"> <Cardinal className="p-4">', 'card-padding'), 0, '이름이 이어진 태그는 아님')
assert.equal(count('<div className="p-4"> <Card tone="a">', 'card-padding'), 0, 'Card가 아닌 태그의 p-*는 통과')
assert.equal(count('<Card onClick={() => go()} className="p-4">', 'card-padding'), 1, '앞 속성의 화살표 함수가 있어도 className을 읽는다')
assert.equal(count('<Card className="p-4"> {/* ui-allow: 사유 */}', 'card-padding'), 0, 'ui-allow가 있는 줄은 빠짐')
assert.equal(count('{/* <Card className="p-4"> */}', 'card-padding'), 0, '주석 안은 세지 않음')
assert.match(toFailures({ 'a.tsx': cur({ 'card-padding': 1 }) })[0].fix, /Card/)

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

  const run = (args, input) =>
    spawnSync('node', [SCRIPT, '--root', tmp, ...args], { encoding: 'utf8', input })

  // 위반 1건이면 종료 코드 1, 파일·줄·규칙 키·고치는 방법이 나온다
  let r = run([])
  assert.equal(r.status, 1, '기준선 없이 위반 1건도 실패')
  writeFileSync(join(comp, 'A.tsx'), '<p className="text-[13px]">\n<button>\n')
  r = run([])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /A\.tsx \[raw-element\].*줄 2/)
  assert.match(r.stderr, /고치는 방법: .*정본 컴포넌트/)
  const j = JSON.parse(run(['--json']).stdout)
  assert.equal(j.ok, false)
  assert.ok(j.failures.some((f) => f.rule === 'raw-element'))

  // --files: 주어진 파일만, 비대상·없는 파일은 무시
  assert.equal(run(['--files', 'jam-web/src/components/A.tsx']).status, 1)
  assert.equal(run(['--files', 'jam-web/src/components/A.test.tsx', 'jam-web/src/components/없음.tsx']).status, 0)

  // --stdin-file: 디스크(위반 있음)가 아니라 표준 입력 내용으로 판정
  r = run(['--stdin-file', 'jam-web/src/components/A.tsx'], '<p className="text-sm">\n')
  assert.equal(r.status, 0, '디스크는 위반이지만 입력이 깨끗하면 통과')
  r = run(['--stdin-file', 'jam-web/src/components/A.tsx'], '<p style={{ color: "#000" }}>\n')
  assert.equal(r.status, 1, '입력의 위반을 잡는다')
  assert.match(r.stderr, /inline-visual/)
  assert.equal(run(['--stdin-file', join(tmp, 'jam-web/src/components/New.tsx')], '<button>').status, 1, '절대 경로·새 파일도 판정')

  // 한글 경로의 위반도 남아 있으므로 지우고 나면 통과, 줄 단위 예외도 통과
  writeFileSync(join(comp, 'A.tsx'), 'ok\n')
  writeFileSync(join(tmp, 'jam-web/src/app/(main)/한글/p.tsx'), "const c = '#fff' // ui-allow: 시험\n")
  rmSync(join(tmp, 'jam-web/src/app/(main)/admin'), { recursive: true, force: true })
  r = run([])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /통과/)

  // 층 규칙 이름은 --root 아래 파일에서 읽는다: 파일이 없으면 아무것도 잡지 않고, 있으면 그 이름으로 잡는다
  writeFileSync(join(comp, 'L.tsx'), '<p className="bg-lime-950 text-primary" style={{ margin: "var(--base-zzz)" }}>\n')
  assert.equal(run(['--files', 'jam-web/src/components/L.tsx']).status, 0, '이름 파일이 없는 root에서는 층 규칙이 잡지 않음')
  mkdirSync(join(tmp, 'jam-web/design-system/tokens'), { recursive: true })
  mkdirSync(join(tmp, 'jam-web/src/app'), { recursive: true })
  writeFileSync(join(tmp, 'jam-web/design-system/tokens/primitive.css'), ':root { --base-zzz: 1px; }\n')
  writeFileSync(join(tmp, 'jam-web/src/app/admin-theme.css'), '@theme { --color-lime-950: #000; }\n')
  writeFileSync(join(tmp, 'jam-web/src/app/globals.css'), '@theme inline {\n  /* shadcn 이름 — 어드민 전용 */\n  --color-primary: var(--primary);\n}\n')
  r = run(['--files', 'jam-web/src/components/L.tsx'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /\[primitive-ref\]/)
  assert.match(r.stderr, /\[palette-class\]: 2건/)
  rmSync(join(comp, 'L.tsx'))
  writeFileSync(join(tmp, 'jam-web/src/app/(main)/한글/p.tsx'), "const c = '#fff' // ui-allow:\n")
  assert.equal(run([]).status, 1, '사유가 비면 위반')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('check-ui-rules.test: 통과')
