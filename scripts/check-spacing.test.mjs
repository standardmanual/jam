// scripts/check-spacing.mjs 의 위반 규칙·면제 주석·기준선 비교를 확인한다 (티켓 20261108_2140).
// 파일 시스템 시험은 임시 폴더에 가짜 루트를 만들어 --root·--baseline 으로 돌리고, 끝나면 지운다.
// 실행: node scripts/check-spacing.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compare, countLine, countViolations, scan } from './check-spacing.mjs'

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

// --- 기준선 비교
const cur = (total) => ({ total, lines: [1] })
{
  const r = compare({ 'a.tsx': cur(2) }, { 'a.tsx': 2 })
  assert.equal(r.failures.length, 0, '같으면 통과')
  assert.equal(r.shrunk.length, 0)
}
{
  const r = compare({ 'a.tsx': cur(3) }, { 'a.tsx': 2 })
  assert.equal(r.failures.length, 1, '기준선보다 늘면 실패')
  assert.deepEqual([r.failures[0].file, r.failures[0].base, r.failures[0].now], ['a.tsx', 2, 3])
}
{
  const r = compare({ 'a.tsx': cur(1), 'new.tsx': cur(1) }, { 'a.tsx': 1 })
  assert.deepEqual(r.failures.map((f) => f.file), ['new.tsx'], '기준선에 없는 새 파일은 실패')
}
{
  const r = compare({ 'a.tsx': cur(1) }, { 'a.tsx': 3, 'gone.tsx': 2 })
  assert.equal(r.failures.length, 0, '줄어드는 것은 허용')
  assert.deepEqual(r.shrunk.map((s) => s.file), ['a.tsx', 'gone.tsx'], '줄어든 파일과 사라진 파일을 안내')
}

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

  const baseline = join(dir, 'baseline.json')
  const run = (...extra) =>
    spawnSync('node', [SCRIPT, '--root', dir, '--baseline', baseline, ...extra], { encoding: 'utf8' })

  assert.equal(run('--write-baseline').status, 0)
  const ok = run()
  assert.equal(ok.status, 0, `기준선 생성 직후엔 통과해야 한다:\n${ok.stdout}${ok.stderr}`)

  put('jam-web/src/app/(main)/home/page.tsx', bad + '<p className="pt-[32px]" />\n')
  const worse = run()
  assert.equal(worse.status, 1, '위반을 하나 더하면 실패해야 한다')
  assert.match(worse.stderr, /home\/page\.tsx: 기준선 1 → 현재 2/)

  put('jam-web/src/app/(main)/home/page.tsx', bad + '<p className="pt-[32px]" /> {/* spacing-allow: 시험 */}\n')
  assert.equal(run().status, 0, '면제 주석을 달면 다시 통과')

  put('jam-web/src/app/(main)/home/Other.tsx', bad)
  assert.equal(run().status, 1, '기준선에 없는 새 파일의 위반은 실패')
  rmSync(join(dir, 'jam-web/src/app/(main)/home/Other.tsx'))

  put('jam-web/src/app/(main)/home/page.tsx', '<div className="gap-2" />\n')
  const shrunk = run()
  assert.equal(shrunk.status, 0, '줄어들면 실패하지 않는다')
  assert.match(shrunk.stdout, /기준선을 줄이세요/)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('check-spacing 테스트 통과')
