// scripts/check-spacing.mjs 의 위반 규칙·면제 주석·위반 목록을 확인한다 (티켓 20261108_2140).
// 파일 시스템 시험은 임시 폴더에 가짜 루트를 만들어 --root 로 돌리고, 끝나면 지운다.
// 실행: node scripts/check-spacing.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toFailures, countLine, countViolations, scan } from './check-spacing.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-spacing.mjs')

// --- 규칙 1: 임의 px 간격
assert.equal(countLine('<div className="pt-[32px]">'), 1, 'pt-[32px] 적발')
assert.equal(countLine('<div className="md:px-[13px] gap-y-[7.5px]">'), 2, '변형 접두·소수 px 적발')
assert.equal(countLine('<div className="w-[32px] h-[40px] top-[10px] text-[10px]">'), 0, '크기·위치·글자 임의 값은 대상 아님')
assert.equal(countLine('<div className="scroll-mt-[40px]">'), 0, 'scroll-mt처럼 접두가 붙은 것은 대상 아님')

// --- 규칙 2: 32px 이상 Tailwind 단계
assert.equal(countLine('<div className="flex gap-8">'), 1, 'gap-8 적발')
assert.equal(countLine('<div className="pb-10 pt-16">'), 2, 'pb-10·pt-16 적발')
assert.equal(countLine('<div className="gap-x-12 space-y-24 mx-8">'), 3, 'gap-x·space-y·mx 적발')
assert.equal(countLine('<div className="gap-6 p-4 pt-0 mt-2 py-3 gap-2">'), 0, '눈금 안(7 이하) 단계는 통과')
assert.equal(countLine('<div className="w-8 h-10 size-12 inset-8 top-10 left-16 max-w-24">'), 0, '크기·위치 접두는 대상 아님')
assert.equal(countLine('<div className="-mt-8 -mb-10">'), 0, '음수 마진은 대상 아님')
assert.equal(countLine('<div className="gap-2.5 p-0.5 gap-8x">'), 0, '소수 단계·단어 뒤 붙은 글자는 대상 아님')

// --- 규칙 3: 인라인 style의 큰 눈금 변수
assert.equal(countLine("style={{ padding: 'var(--spacing-32)' }}"), 1, 'padding: var(--spacing-32) 적발')
assert.equal(countLine('style={{ marginTop: `var(--spacing-48)`, rowGap: "var(--spacing-64)" }}'), 2, 'marginTop·rowGap 적발')
assert.equal(countLine('  gap: var(--spacing-96);'), 1, 'CSS 선언 적발')
assert.equal(countLine("style={{ padding: 'var(--spacing-16)', width: 'var(--spacing-32)' }}"), 0, '작은 눈금·다른 속성은 통과')
assert.equal(countLine('const a = 8 // padding 설명'), 0)

// --- 면제 주석
assert.equal(countLine('<div className="gap-8"> {/* spacing-allow: 전체 화면 히어로 */}'), 0, '사유 있는 면제는 세지 않음')
assert.equal(countLine('<div className="gap-8"> {/* spacing-allow: */}'), 1, '사유 없는 면제는 센다')

// --- 줄 번호
assert.deepEqual(countViolations('a\n<p className="gap-8">\nb\n<p className="pt-[32px]">').lines, [2, 4])
assert.equal(countViolations('<p className="gap-8 pt-16">').total, 2)

// 주석 안은 세지 않는다 (티켓 20261126_1310)
assert.equal(countViolations('// py-[13px] gap-8').total, 0, '줄 주석은 세지 않음')
assert.equal(countViolations('const a = 1 // pt-[32px]').total, 0, '줄 끝 주석은 세지 않음')
assert.equal(countViolations('/**\n * py-[13px] gap-8\n */\nconst a = 1').total, 0, '블록 주석은 세지 않음')
assert.equal(countViolations('<div>{/* gap-8 */}</div>').total, 0, 'JSX 주석은 세지 않음')
assert.equal(countViolations("const u = 'https://x'; const c = 'gap-8'").total, 1, '문자열 안 // 옆의 클래스는 센다')
assert.deepEqual(countViolations('/* a\n gap-8 */\n<p className="gap-8">').lines, [3], '줄 번호는 그대로')
assert.equal(countViolations('<p className="gap-8"> {/* spacing-allow: 사유 */}').total, 0, '면제 주석은 원래 줄에서 읽음')
assert.equal(countViolations('a { /* gap: var(--spacing-32) */ }', 'css').total, 0, 'CSS 주석은 세지 않음')
assert.equal(countViolations('a { gap: var(--spacing-32); }', 'css').total, 1, 'CSS 선언은 센다')

// --- 위반 목록: 기준선 없이 하나라도 있으면 실패
const cur = (total) => ({ total, lines: [1] })
assert.equal(toFailures({}).length, 0, '위반이 없으면 통과')
assert.deepEqual(toFailures({ 'b.tsx': cur(1), 'a.tsx': cur(2) }).map((f) => [f.file, f.now]), [['a.tsx', 2], ['b.tsx', 1]], '1건도 실패, 파일 순')

// --- 파일 시스템: 대상 폴더·제외 규칙, CLI 종료 코드
const dir = mkdtempSync(join(tmpdir(), 'check-spacing-'))
try {
  const put = (rel, body) => {
    const full = join(dir, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  const bad = '<div className="gap-8" />\n'
  put('jam-web/src/app/(main)/home/page.tsx', bad)
  put('jam-web/src/app/(main)/home/page.test.tsx', bad)
  put('jam-web/src/app/(main)/home/Card.stories.tsx', bad)
  put('jam-web/src/app/(main)/home/__tests__/x.tsx', bad)
  put('jam-web/src/app/(main)/admin/y.tsx', bad)
  put('jam-web/src/app/(main)/home/note.md', bad)
  put('jam-web/src/app/admin/z.tsx', bad)
  put('jam-web/src/app/dev-sample/s.tsx', bad)
  put('jam-web/src/app/spike/s.tsx', bad)
  put('jam-web/src/components/map/Pin.css', '.a { padding: var(--spacing-40); }\n')
  put('jam-web/src/components/admin/Panel.tsx', bad)
  put('jam-web/src/components/dev-sample/D.tsx', bad)

  const found = Object.keys(scan(dir)).sort()
  assert.deepEqual(
    found,
    ['jam-web/src/app/(main)/home/page.tsx', 'jam-web/src/components/map/Pin.css'],
    '대상 폴더의 .tsx·.css만 세고 test·stories·__tests__·admin·dev-sample·spike·.md는 뺀다',
  )

  const run = (...extra) => spawnSync('node', [SCRIPT, '--root', dir, ...extra], { encoding: 'utf8' })

  const first = run()
  assert.equal(first.status, 1, '위반 1건이면 종료 코드 1')
  assert.match(first.stderr, /home\/page\.tsx: 1건 \(줄 1\)/)

  put('jam-web/src/app/(main)/home/page.tsx', bad + '<p className="pt-[32px]" /> {/* spacing-allow: 시험 */}\n')
  assert.equal(run().status, 1, '예외 주석 없는 줄이 남아 있으면 실패')

  put('jam-web/src/app/(main)/home/page.tsx', '<p className="pt-[32px]" /> {/* spacing-allow: 시험 */}\n')
  rmSync(join(dir, 'jam-web/src/components/map/Pin.css'))
  const ok = run()
  assert.equal(ok.status, 0, `사유가 있는 예외만 남으면 통과해야 한다:\n${ok.stdout}${ok.stderr}`)

  put('jam-web/src/app/(main)/home/page.tsx', '<p className="pt-[32px]" /> {/* spacing-allow: */}\n')
  assert.equal(run().status, 1, '사유가 비면 위반')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('check-spacing 테스트 통과')
