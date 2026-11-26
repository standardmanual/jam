// scripts/gen-token-catalog.mjs 의 층 분류·최종 값 풀기·사용 수·--check 종료 코드를 확인한다 (티켓 20261126_2116).
// 실행: node scripts/gen-token-catalog.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classOf, collect, contrastRatio, contrastRows, parseColor, parseDeclarations, plainRulesOf, resolveValue } from './gen-token-catalog.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'gen-token-catalog.mjs')

// 선언 파싱: 주석 제외, 블록 문맥 기록
const decls = parseDeclarations(`
/* --ghost: 1px; */
:root { --a: 1px; --b: color-mix(in srgb, var(--a) 50%, transparent); }
@media (prefers-contrast: more) { :root { --a: 2px; } }
`)
assert.deepEqual(decls.map((d) => d.name), ['--a', '--b', '--a'])
assert.deepEqual(decls[2].stack, ['@media (prefers-contrast: more)', ':root'])

// 값 풀기: 두 단계 참조, color-mix 안 참조, 못 푸는 값은 null
const map = new Map([['--x', '#111'], ['--y', 'var(--x)'], ['--loop', 'var(--loop)']])
assert.equal(resolveValue('var(--y)', [map]), '#111')
assert.equal(resolveValue('color-mix(in srgb, var(--y) 20%, transparent)', [map]), 'color-mix(in srgb, #111 20%, transparent)')
assert.equal(resolveValue('var(--none)', [map]), null)
assert.equal(resolveValue('var(--none, 3px)', [map]), '3px')
assert.equal(resolveValue('var(--loop)', [map]), null)

// 클래스 이름
assert.equal(classOf('--color-muted').display, '*-muted')
assert.equal(classOf('--text-xs--line-height').display, 'text-xs') // 글자 크기 쌍의 행간은 text-xs가 읽는다
// Tailwind 유틸리티 경유 사용
assert.ok('font-bold'.match(classOf('--font-weight-bold').re))
assert.ok('tracking-wide'.match(classOf('--tracking-wide').re))
assert.ok('leading-loose'.match(classOf('--leading-loose').re))
assert.ok('animate-spin'.match(classOf('--animate-spin').re))
assert.ok('aspect-video'.match(classOf('--aspect-video').re))
assert.ok('px-4 gap-2 -mt-3'.match(classOf('--spacing').re).length === 3)
assert.ok('rounded'.match(classOf('--radius').re))
assert.equal('rounded-lg'.match(classOf('--radius').re), null)
assert.ok('shadow'.match(classOf('--shadow').re))
assert.ok('backdrop-blur'.match(classOf('--blur').re))
// 일반 규칙 선언만 남기고 토큰 정의는 뺀다
assert.equal(plainRulesOf('body { background: var(--page-bg); --x: var(--y); } @theme inline { --color-a: var(--a); }'), 'background: var(--page-bg)')
// 대비: 흰 바탕 위 검정은 21, 반투명 글자는 바탕에 얹어 계산, 못 읽는 색은 null
assert.equal(contrastRatio(parseColor('#000000'), parseColor('#ffffff')).toFixed(1), '21.0')
assert.equal(parseColor('color-mix(in srgb, #ffffff 50%, transparent)').a, 0.5)
assert.equal(parseColor('oklch(1 0 0)'), null)
assert.ok(contrastRows([{ layer: 'semantic', name: '--muted', final: '#737373' }, { layer: 'semantic', name: '--background', final: '#f5f5f5' }]).find((r) => r.fg === '--muted' && r.bg === '--background').ratio.toFixed(2) === '4.35')
assert.equal(classOf('--jam-red'), null)

// 임시 저장소: 층 분류·사용 수·--check
const root = mkdtempSync(join(tmpdir(), 'token-catalog-'))
const put = (rel, body) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), body)
}
try {
  put('jam-web/design-system/tokens/primitive.css', ':root { --base-ink: #111111; --base-spare: #333333; --base-none: #444444; --text-xs: 0.75rem; --radius-md: 0.375rem; }')
  put('jam-web/design-system/tokens/semantic.css', ':root { --fg: var(--base-ink); --fg-soft: color-mix(in srgb, var(--fg) 70%, transparent); --fg-edge: var(--base-spare); }')
  put('jam-web/design-system/tokens/component.css', ':root { --chip-bg: var(--fg); }\n@media (prefers-contrast: more) { :root { --chip-bg: #000; } }')
  put('jam-web/src/app/jam-theme.css', '@theme { --text-xs: 0.75rem; }\n@theme inline reference { --radius-md: var(--radius-md); }')
  put('jam-web/src/app/admin-theme.css', '@theme { --color-red-500: #f00; }')
  put('jam-web/src/app/globals.css', '@theme inline { --color-fg: var(--fg); }\n[data-admin-theme] { --fg: #222; }')
  put(
    'jam-web/src/components/A.tsx',
    [
      '// var(--chip-bg) 는 주석이라 세지 않는다',
      'export const A = () => <div className="text-fg text-xs bg-red-500" style={{ color: "var(--chip-bg)" }} />',
      'export const B = "var(--fg) var(--fg) bg-fg"',
      'export const D = ["--fg-edge"]',
    ].join('\n'),
  )
  put('jam-web/src/components/A.test.tsx', 'const t = "var(--chip-bg) text-fg"')
  put('jam-web/src/components/A.stories.tsx', 'const t = "var(--chip-bg)"')

  const rows = collect(root)
  const row = (layer, name) => rows.find((r) => r.layer === layer && r.name === name)
  // 층 분류
  assert.ok(row('primitive', '--base-ink'))
  assert.ok(row('semantic', '--fg'))
  assert.ok(row('component', '--chip-bg'))
  assert.ok(row('admin', '--color-red-500'))
  assert.equal(row('admin', '--fg').def, '#222')
  // 최종 값
  assert.equal(row('semantic', '--fg').final, '#111111')
  assert.equal(row('semantic', '--fg-soft').final, 'color-mix(in srgb, #111111 70%, transparent)')
  // 사용 수: 주석·시험·스토리 제외, var()와 클래스를 따로 센다
  assert.equal(row('component', '--chip-bg').varUses, 1)
  assert.equal(row('semantic', '--fg').varUses, 2)
  assert.equal(row('semantic', '--fg').classUses, 2) // text-fg, bg-fg
  assert.equal(row('semantic', '--fg').fileCount, 1)
  assert.equal(row('semantic', '--fg').inToken, 3) // --fg-soft의 color-mix, --chip-bg, globals.css @theme inline
  assert.equal(row('primitive', '--base-ink').inToken, 1)
  // 덮어쓰기·중복 정의
  assert.deepEqual(row('component', '--chip-bg').overrides, ['@media (prefers-contrast: more) > :root'])
  assert.equal(row('primitive', '--text-xs').dups[0].same, true)
  // 문자열로 적은 이름, 쓰이는 토큰의 재료, 아무도 안 쓰는 토큰
  assert.equal(row('semantic', '--fg-edge').strUses, 1)
  assert.equal(row('primitive', '--base-spare').material, true)
  assert.equal(row('primitive', '--base-none').material, false)
  // reference 블록이 같은 이름을 var()로 가리키면 값이 다른 중복이 아니라 «이름만 알림»이다
  assert.equal(row('primitive', '--radius-md').dups.length, 0)
  assert.equal(row('primitive', '--radius-md').pointers.length, 1)
  assert.equal(row('primitive', '--radius-md').classes[0], 'rounded-md')
  assert.equal(row('primitive', '--text-xs').classes[0], 'text-xs')
  assert.equal(row('primitive', '--text-xs').classUses, 1)

  // --check: 문서가 없으면 1, 만들면 0, 토큰 값을 바꾸면 1, 화면 코드에 참조를 더하면 1
  const run = (...args) => spawnSync('node', [SCRIPT, '--root', root, ...args], { encoding: 'utf8' })
  assert.equal(run('--check').status, 1)
  assert.equal(run().status, 0)
  assert.equal(run('--check').status, 0)
  put('jam-web/design-system/tokens/primitive.css', ':root { --base-ink: #222222; --text-xs: 0.75rem; }')
  assert.equal(run('--check').status, 1)
  assert.match(run('--check').stderr, /낡았습니다/)
  run()
  assert.equal(run('--check').status, 0)
  put('jam-web/src/components/B.tsx', 'export const C = "var(--base-ink)"')
  assert.equal(run('--check').status, 1)
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('gen-token-catalog.test 통과')
