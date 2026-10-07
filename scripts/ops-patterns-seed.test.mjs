// scripts/ops-patterns-seed.mjs 가 원고를 칸에 맞게 읽고, 어긋나면 SQL 없이 멈추는지 확인한다 (티켓 20261007_1633).
// 실행: node scripts/ops-patterns-seed.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CARD_SHAPES,
  EXPECTED,
  SOURCE_PATH,
  parseOpsPatterns,
  splitTopLevel,
  toSeedSql,
  validateOpsPatterns,
} from './ops-patterns-seed.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const real = readFileSync(join(ROOT, SOURCE_PATH), 'utf8')

/** 원고 글에서 `from`이 정확히 한 번 나올 때만 바꾼다(고칠 자리가 사라지면 테스트가 헛돌지 않고 실패한다). */
const mutate = (md, from, to) => {
  assert.equal(md.split(from).length, 2, `원고에서 「${from.slice(0, 30)}」이 정확히 한 번 나와야 한다`)
  return md.replace(from, to)
}

/** 작은 원고 조각: 패턴 한 건의 본문. 칸 매핑만 확인하므로 개수 검사는 하지 않는다. */
const pattern = ({ no, name, menus = '믹스, 알림(40)', samples, impl, shapes = '`list`', taste = '  - 첫 신호: 이유 하나 (추정)' }) =>
  [
    `### ${no} ${name}`,
    '',
    '- **작동 원리:** 원리 글(괄호 포함).',
    '- **유저가 겪는 것:** 겪는 것.',
    `- **쓰는 메뉴·옵션:** ${menus}. 샘플별 구현: ${impl}`,
    '- **손잡이:**',
    '  - 조건: 열 수 있다. 닫은 값은 상위 기록자 조건이다.',
    '  - 장소: 정하지 않는다. 닫은 값은 없다.',
    '  - 시간: 하루다. 닫은 값은 심야 권유다.',
    '  - 보상: 배지다. 닫은 값은 공통 규칙뿐이다.',
    '  - 트라이브: 캐논 전체에서 고른다. 예시: 화자 — 어울리는 이유.',
    `- **샘플:** ${samples}`,
    "- **주의점:** 주의 글 '따옴표'와 (괄호).",
    `- **쓰는 카드 모양:** ${shapes}`,
    `- **취향 신호:**${taste === '없음' ? ' 없음' : `\n${taste}`}`,
    '- **상태:** 승인(2026-09-30 사용자, 운영툴 입력 전)',
    '',
  ].join('\n')

const mini = [
  '## 3. 패턴 본문',
  '',
  '### 공통 규칙',
  '',
  '1. **첫 규칙:** 본문 하나.',
  '2. **둘째 규칙:** 본문 둘, 쉼표 포함.',
  '',
  pattern({
    no: 'P01',
    name: '첫 패턴',
    menus: '믹스, 동기화 화면(46), 알림(가, 나)',
    impl: '3 지금 가능, 7 O13(조건, 옵션), 보조 46 O10(표시)',
    samples: '주 3 이름 셋, 7 이름 일곱 / 보조 장치 46 끝 카드 / 걸침 60 별 따는 날',
    shapes: '`list`(레시피 타일, 빈 칸), `brief`, 기사로 쓸 때는 `hero`, 이어지는 모양(미션 `square`, 레시피 `list`)',
    taste: ['  - 게릴라 알림(70): 이유: 콜론 포함 (추정)', '  - 둘째 신호: 이유 둘 (추정)'].join('\n'),
  }),
  pattern({
    no: 'P14',
    name: '쉬는 패턴',
    impl: "60 지금 가능(미션판은 O2)",
    samples: "주 60 별 따러 가는 날 / 보조 장치 - / 걸침 -",
    shapes: '없음(카드를 쓰지 않음)',
    taste: '없음',
  }),
  '### 공통 취향 신호',
  '',
  '어느 패턴에도 맞지 않는 폐기다.',
  '',
  '- 이달의 세 갈래: 택1 흐름이라 뺀다 (추정)',
  '',
  '## 부록 A. 대조표',
  '',
].join('\n')

test('괄호 밖 「, 」로만 나눈다', () => {
  assert.deepEqual(splitTopLevel('가, 나(다, 라), 마'), ['가', '나(다, 라)', '마'])
  assert.deepEqual(splitTopLevel('하나'), ['하나'])
})

test('칸 매핑: 패턴 본문 칸', () => {
  const { patterns, problems } = parseOpsPatterns(mini)
  assert.deepEqual(problems, [])
  const p1 = patterns.find((p) => p.pattern_no === 'P01')
  assert.equal(p1.name, '첫 패턴')
  assert.equal(p1.principle, '원리 글(괄호 포함).')
  assert.equal(p1.pitfalls, "주의 글 '따옴표'와 (괄호).")
  assert.deepEqual(p1.menus, ['믹스', '동기화 화면(46)', '알림(가, 나)'])
  assert.equal(p1.origin, 'seed')
  assert.equal(p1.status, 'active')
  assert.equal(p1.pause_reason, null)
})

test('칸 매핑: 샘플 역할 순서와 구현 글(걸침은 소속 패턴 글)', () => {
  const { patterns } = parseOpsPatterns(mini)
  const p1 = patterns.find((p) => p.pattern_no === 'P01')
  assert.deepEqual(
    p1.samples.map((s) => [s.no, s.role]),
    [[3, 'main'], [7, 'main'], [46, 'aux'], [60, 'related']],
  )
  assert.equal(p1.samples[1].impl, 'O13(조건, 옵션)')
  assert.equal(p1.samples[2].impl, 'O10(표시)')
  // 걸침 60은 주로 소속된 P14의 구현 글을 가져온다.
  assert.equal(p1.samples[3].impl, '지금 가능(미션판은 O2)')
  assert.deepEqual(p1.src.implNos, [3, 7, 46])
})

test('칸 매핑: 카드 모양 (가)(나)(다)와 「없음」', () => {
  const { patterns } = parseOpsPatterns(mini)
  assert.deepEqual(patterns.find((p) => p.pattern_no === 'P01').card_shapes, [
    { shape: 'list', note: '레시피 타일, 빈 칸' },
    { shape: 'brief', note: '' },
    { shape: 'hero', note: '기사로 쓸 때는 `hero`' },
    { shape: 'square', note: '이어지는 모양(미션 `square`, 레시피 `list`)' },
    { shape: 'list', note: '이어지는 모양(미션 `square`, 레시피 `list`)' },
  ])
  assert.deepEqual(patterns.find((p) => p.pattern_no === 'P14').card_shapes, [])
})

test('칸 매핑: 손잡이 나누기', () => {
  const { patterns } = parseOpsPatterns(mini)
  const k = patterns.find((p) => p.pattern_no === 'P01').knobs
  assert.deepEqual(Object.keys(k), ['condition', 'place', 'time', 'reward', 'tribe'])
  assert.deepEqual(k.condition, { open: '열 수 있다.', closed: '상위 기록자 조건이다.' })
  assert.deepEqual(k.place, { open: '정하지 않는다.', closed: '없다.' })
  assert.deepEqual(k.tribe, { rule: '캐논 전체에서 고른다.', example: '화자 — 어울리는 이유.' })
})

test('칸 매핑: 취향 신호(번호 괄호 유지, 추정 떼기, 없음은 행 없음, 공통은 pattern_no NULL)와 공통 규칙', () => {
  const { tasteSignals, commonRules } = parseOpsPatterns(mini)
  assert.deepEqual(tasteSignals, [
    { pattern_no: 'P01', name: '게릴라 알림(70)', reason: '이유: 콜론 포함', basis: 'estimate', sort_order: 1 },
    { pattern_no: 'P01', name: '둘째 신호', reason: '이유 둘', basis: 'estimate', sort_order: 2 },
    { pattern_no: null, name: '이달의 세 갈래', reason: '택1 흐름이라 뺀다', basis: 'estimate', sort_order: 1 },
  ])
  assert.deepEqual(commonRules, [
    { rule_no: 1, title: '첫 규칙', body: '본문 하나.' },
    { rule_no: 2, title: '둘째 규칙', body: '본문 둘, 쉼표 포함.' },
  ])
})

test('칸 매핑: P14만 쉬는 중이다', () => {
  const { patterns } = parseOpsPatterns(mini)
  const p14 = patterns.find((p) => p.pattern_no === 'P14')
  assert.equal(p14.status, 'paused')
  assert.equal(p14.pause_reason, '필요한 기능 O12·O14 대기')
})

test('SQL: 작은따옴표를 두 번 쓰고 JSONB·배열 꼴로 쓴다', () => {
  const sql = toSeedSql(parseOpsPatterns(mini))
  assert.ok(sql.includes("'주의 글 ''따옴표''와 (괄호).'"))
  assert.ok(sql.includes("ARRAY['믹스', '동기화 화면(46)', '알림(가, 나)']::text[]"))
  assert.ok(/'\[\{"no":3,"name":"이름 셋"[^']*'::jsonb/.test(sql))
  assert.ok(sql.includes('NULL, \'이달의 세 갈래\''))
  const withQuote = mutate(mini, '이름 일곱', "결계 '섬데이' 균열")
  assert.ok(toSeedSql(parseOpsPatterns(withQuote)).includes("결계 ''섬데이'' 균열"))
})

test('실제 원고: 18·63·43·7이고 검사를 통과한다', () => {
  const parsed = parseOpsPatterns(real)
  assert.equal(parsed.patterns.length, EXPECTED.patterns)
  const owned = parsed.patterns.reduce((n, p) => n + p.samples.filter((s) => s.role !== 'related').length, 0)
  assert.equal(owned, EXPECTED.samples)
  assert.equal(parsed.tasteSignals.length, EXPECTED.tasteSignals)
  assert.equal(parsed.tasteSignals.filter((t) => t.pattern_no === null).length, 3)
  assert.equal(parsed.commonRules.length, EXPECTED.commonRules)
  assert.deepEqual(validateOpsPatterns(parsed, real), [])
})

test('실제 원고: P07·P06·P14·걸침 구현', () => {
  const { patterns } = parseOpsPatterns(real)
  const by = (no) => patterns.find((p) => p.pattern_no === no)
  assert.deepEqual(by('P07').card_shapes, [
    { shape: 'brief', note: '드랍·예보' },
    { shape: 'hero', note: '힌트나 목격담을 기사로 쓸 때는 `hero`' },
  ])
  assert.deepEqual(by('P06').card_shapes, [])
  assert.deepEqual(patterns.filter((p) => p.status === 'paused').map((p) => [p.pattern_no, p.pause_reason]), [['P14', '필요한 기능 O12·O14 대기']])
  const related60 = by('P01').samples.find((s) => s.no === 60)
  assert.equal(related60.role, 'related')
  assert.equal(related60.impl, by('P09').samples.find((s) => s.no === 60).impl)
})

test('실제 원고 SQL: 한 트랜잭션, 세 INSERT 모두 ON CONFLICT DO NOTHING, 개수 확인 블록과 되돌림 SQL', () => {
  const sql = toSeedSql(parseOpsPatterns(real))
  assert.equal(sql.split('\nBEGIN;\n').length, 2)
  assert.equal(sql.split('\nCOMMIT;\n').length, 2)
  assert.equal(sql.match(/^INSERT INTO /gm).length, 3)
  assert.equal(sql.match(/^ON CONFLICT DO NOTHING;$/gm).length, 3)
  assert.ok(sql.indexOf('DO $seed_check$') > sql.lastIndexOf('INSERT INTO'))
  assert.ok(sql.indexOf('DO $seed_check$') < sql.indexOf('\nCOMMIT;\n'))
  assert.ok(sql.includes('RAISE EXCEPTION'))
  assert.ok(/^-- 되돌림 SQL$/m.test(sql))
  assert.ok(sql.includes("-- DELETE FROM public.ops_pattern_taste_signals WHERE basis = 'estimate'"))
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(sql), '생성 시각을 넣지 않는다')
  assert.equal(toSeedSql(parseOpsPatterns(real)), sql, '같은 원고면 같은 파일이 나온다')
})

test('멈춤 1·2·3: 패턴 하나를 지우면 개수가 어긋난다', () => {
  const md = real.slice(0, real.indexOf('### P18 ')) + real.slice(real.indexOf('### 공통 취향 신호'))
  const out = validateOpsPatterns(parseOpsPatterns(md), md).join('\n')
  assert.match(out, /\[멈춤 1\] 패턴이 17개다/)
  assert.match(out, /\[멈춤 1\].*없는 번호: P18/)
  assert.match(out, /\[멈춤 2\] 주\+보조 샘플이 60개다/)
  assert.match(out, /\[멈춤 3\] 취향 신호가 40개다/)
})

test('멈춤 3: 같은 (패턴, 이름)이 두 번 나온다', () => {
  const md = mutate(
    real,
    '불안하게 만든다 (추정)\n- **상태:** 승인(2026-09-30 사용자, 운영툴 입력 전)\n\n### P03',
    '불안하게 만든다 (추정)\n  - 게릴라 알림(70): 같은 이름 (추정)\n- **상태:** 승인(2026-09-30 사용자, 운영툴 입력 전)\n\n### P03',
  )
  assert.match(validateOpsPatterns(parseOpsPatterns(md), md).join('\n'), /\[멈춤 3\] 취향 신호 \(P02, 게릴라 알림\(70\)\)이 두 번 나온다/)
})

test('멈춤 4: 공통 규칙이 7개가 아니다', () => {
  const md = real.replace(/^7\. \*\*경제 수치:\*\*.*\n/m, '')
  const out = validateOpsPatterns(parseOpsPatterns(md), md).join('\n')
  assert.match(out, /\[멈춤 4\] 공통 규칙이 6개다/)
})

test('멈춤 5: 「닫은 값」이 두 번이거나 「예시:」가 두 번이면 그 패턴 번호를 낸다', () => {
  const twice = mutate(real, '초보가 열 수 없는 조건이다.', '초보가 열 수 없는 조건이다. 닫은 값도 적는다.')
  assert.match(validateOpsPatterns(parseOpsPatterns(twice), twice).join('\n'), /\[멈춤 5\] P01 손잡이 「조건」.*2번/)
  const none = mutate(real, '  - 시간: 한 주 단위다. 닫은 값은 공통 규칙뿐이다.', '  - 시간: 한 주 단위다.')
  assert.match(validateOpsPatterns(parseOpsPatterns(none), none).join('\n'), /\[멈춤 5\] P05 손잡이 「시간」.*0번/)
  const example = mutate(real, '예시: 아날로그 수집가 — 길에서', '예시: 아날로그 수집가 — 예시: 길에서')
  assert.match(validateOpsPatterns(parseOpsPatterns(example), example).join('\n'), /\[멈춤 5\] P01 .*「예시:」가 2번/)
  const noKnob = mutate(real, '  - 장소: 정하지 않는다(집에서 하는 것). 닫은 값은 야외 지점 체크인을 조건으로 거는 것이다.\n', '')
  assert.match(validateOpsPatterns(parseOpsPatterns(noKnob), noKnob).join('\n'), /\[멈춤 5\] P04 손잡이 「장소」 줄이 없다/)
})

test('멈춤 6: 「샘플별 구현」 번호가 주+보조 번호와 다르다', () => {
  const md = mutate(real, ', 7 O13(드랍 픽업에 당일 활동 거리·종류 조건을 거는 옵션)', '')
  assert.match(validateOpsPatterns(parseOpsPatterns(md), md).join('\n'), /\[멈춤 6\] P01 샘플 7의 「샘플별 구현」이 없다/)
})

test('멈춤 7: 패턴 목록 표의 번호가 본문 샘플 줄과 다르다', () => {
  const md = mutate(real, '| 3, 6, 7 | - | 60 |', '| 3, 6 | - | 60 |')
  assert.match(validateOpsPatterns(parseOpsPatterns(md), md).join('\n'), /\[멈춤 7\] P01 주 샘플: 표 \[3, 6\] ≠ 본문 \[3, 6, 7\]/)
})

test('멈춤 8: 부록 A의 소속이 본문과 다르거나 걸침 번호가 63개 밖이다', () => {
  const owner = mutate(real, '| 7 | 땀 잠금 드랍 | P01 | - | O13 |', '| 7 | 땀 잠금 드랍 | P02 | - | O13 |')
  assert.match(validateOpsPatterns(parseOpsPatterns(owner), owner).join('\n'), /\[멈춤 8\] 샘플 7의 소속: 부록 A P02 ≠ 본문 P01/)
  const aux = mutate(real, '| 46 | 캐러셀 끝 카드 | P07(장치) |', '| 46 | 캐러셀 끝 카드 | P07 |')
  assert.match(validateOpsPatterns(parseOpsPatterns(aux), aux).join('\n'), /\[멈춤 8\] 샘플 46의 소속: 부록 A P07 ≠ 본문 P07\(장치\)/)
  const outside = mutate(real, '| 3, 6, 7 | - | 60 |', '| 3, 6, 7 | - | 99 |')
  const outsideBody = mutate(outside, '걸침 60 별 따러 가는 날\n- **주의점:** 6·7의', '걸침 99 없는 샘플\n- **주의점:** 6·7의')
  assert.match(validateOpsPatterns(parseOpsPatterns(outsideBody), outsideBody).join('\n'), /\[멈춤 8\] P01 걸침 99은 63개 샘플 밖이다/)
})

test('멈춤 9: 허용 밖 카드 모양', () => {
  const md = mutate(real, '`list`(레시피 재료 타일과 비어 있는 열쇠 칸)', '`grid`(레시피 재료 타일과 비어 있는 열쇠 칸)')
  assert.match(validateOpsPatterns(parseOpsPatterns(md), md).join('\n'), /\[멈춤 9\] P01 카드 모양 「grid」은 허용 밖이다/)
})

test('멈춤 9: 파서의 카드 모양 허용 목록이 shape.ts의 CARD_SHAPES와 같다', () => {
  const src = readFileSync(join(ROOT, 'jam-web/src/lib/today/shape.ts'), 'utf8')
  const m = src.match(/export const CARD_SHAPES = \[([^\]]*)\] as const/)
  assert.ok(m, 'shape.ts에서 CARD_SHAPES 배열을 찾지 못했다')
  const inApp = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(CARD_SHAPES, inApp)
})

test('CLI: 「닫은 값」을 지운 사본이면 SQL을 쓰지 않고 패턴 번호를 내며 0이 아닌 코드로 끝난다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-patterns-seed-'))
  try {
    const bad = join(dir, 'bad.md')
    const out = join(dir, 'out.sql')
    writeFileSync(bad, mutate(real, '  - 시간: 한 주 단위다. 닫은 값은 공통 규칙뿐이다.', '  - 시간: 한 주 단위다.'))
    const r = spawnSync('node', ['scripts/ops-patterns-seed.mjs', '--input', bad, '--output', out], { cwd: ROOT, encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /P05/)
    assert.equal(existsSync(out), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: 쓰고 나면 --check가 통과하고, 파일이 달라지면 0이 아닌 코드로 끝난다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-patterns-seed-'))
  try {
    const out = join(dir, 'out.sql')
    const run = (...args) =>
      spawnSync('node', ['scripts/ops-patterns-seed.mjs', '--input', join(ROOT, SOURCE_PATH), '--output', out, ...args], { cwd: ROOT, encoding: 'utf8' })
    const written = run()
    assert.equal(written.status, 0)
    assert.match(written.stdout, /패턴 18 · 샘플 63 · 취향 신호 43 · 공통 규칙 7/)
    assert.equal(run('--check').status, 0)
    writeFileSync(out, readFileSync(out, 'utf8') + '-- 손으로 고쳤다\n')
    assert.notEqual(run('--check').status, 0)
    assert.equal(readFileSync(out, 'utf8').endsWith('-- 손으로 고쳤다\n'), true, '--check는 파일을 고치지 않는다')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
