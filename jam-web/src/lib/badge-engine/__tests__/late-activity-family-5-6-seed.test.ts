/**
 * JAM 2.0 액티비티 배지 5-6 계열 시드(마이그레이션 291) — 생성기와 엔진 평가 가능성 (티켓 20261026_1018)
 *
 * 검증 대상:
 *  ① 생성기(`scripts/gen-new-activity-badge-families.mjs --set late`): 5-6 번호 대조, 행·포인트 규칙, 이름·설명이 원고 11.5절과 글자 단위로 같은지,
 *     원고가 어긋나면 던지는지
 *  ② SQL 파일: 디스크의 291 파일이 생성기 출력과 같은지, 쓰기 문장이 INSERT뿐인지, 가드(같은 계열·같은 이름·활성 수)·되돌림 SQL·드라이런·사후 검증,
 *     활성 액티비티 배지 수가 마이그레이션 290의 가드와 어떤 관계인지
 *  ③ 245·248의 출력이 이 확장으로 바뀌지 않았는지: 디스크 파일과 생성기 출력이 같고, 두 파일의 SHA-256이 그대로다
 *  ④ DB 제약 쪽: 조건 키가 247의 CHECK 허용 키(92개)와 레지스트리에 있고, 숨김·가지·등급/레벨·포인트 제약을 어기지 않는지
 *  ⑤ 이름: 245·248의 행·기존 v5 시드 배지·원고의 다른 이름과 겹치지 않는지
 *  ⑥ 엔진이 5-6을 평가하는지: `evaluateJamActionBadges`에 생성한 행을 그대로 넣어 단계별 발급과 포인트 지급을 본다
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/late-activity-family-5-6-seed.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeCondition, BadgeRow } from '@/types/database'

// ── 모킹 (held-activity-families-seed.test.ts와 같은 자리) ────────────────────────────
const mocks = vi.hoisted(() => ({
  awardPoints: vi.fn(async () => null),
  recordFeedEvent: vi.fn(async () => {}),
  countSameSpotCheckinDays: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: mocks.recordFeedEvent }))
vi.mock('@/lib/points', () => ({ awardPoints: mocks.awardPoints }))
// 계산 모듈은 이 시험이 쓰는 값만 대체한다
vi.mock('../jamActionDayMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionDayMetrics')>()),
  countSameSpotCheckinDays: mocks.countSameSpotCheckinDays,
}))

import {
  ACTIVE_ACTIVITY_AFTER_244,
  CHECK_MIGRATION_PATH,
  DEFAULT_OUT_PATH,
  FAMILY_DEFS,
  HELD_CHECK_MIGRATION_PATH,
  HELD_OUT_PATH,
  HELD_SEED_NUMBERS,
  LATE_CHECK_MIGRATION_PATH,
  LATE_MIGRATION_FILE_NAME,
  LATE_OUT_PATH,
  LATE_SEED_NUMBERS,
  MANUSCRIPT_PATH,
  RARITY_POINTS,
  RECYCLE_PATH,
  TARGET_NUMBERS,
  buildRows,
  generate,
  generateHeld,
  generateLate,
  parseFamilyList,
  parseNamesAndDescriptions,
  readAllowedConditionKeys,
  verifyNumbering,
} from '../../../../scripts/gen-new-activity-badge-families.mjs'
import { defaultPointFor } from '@/lib/admin/badge-point-defaults'
import { DEFAULT_BADGE_POINT_POLICY } from '@/lib/badge/pointPolicy'
import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS } from '../jamActionBadges'
import { JAM_SYNC_TRIGGERS } from '../jamActionProgressTriggers'
import { badgeKindOf } from '../badgeKind'
import { ALL_CONDITION_KEYS, MEASURABLE_CONDITION_KEYS, findBlockingConditionKeys, getConditionField } from '../conditionRegistry'

type SeedRow = ReturnType<typeof buildRows>[number]

const manuscript = fs.readFileSync(MANUSCRIPT_PATH, 'utf8')
const recycle = fs.readFileSync(RECYCLE_PATH, 'utf8')
const rows: SeedRow[] = buildRows({ numbers: LATE_SEED_NUMBERS })
const MIGRATIONS_DIR = path.dirname(LATE_OUT_PATH)
const SEED_JSON = path.resolve(MIGRATIONS_DIR, '..', '..', '..', 'docs/assets/content-seed/seed_v5_activity_badges.rows.json')

/** 245·248 파일의 SHA-256. 이 값이 바뀌면 «이미 검토를 거친 입력 SQL이 달라졌다»는 뜻이라 일부러 이 시험에서 멈춘다 */
const SHA256_245 = '4adfcc3b4a17a2482b31de11103a118d99e3ccec7a1ed70075b3fc963e5e2f54'
const SHA256_248 = 'ec74e38209c66c84ad32f49700f625c5930b5ddbba6e93de1b0508adc4c35b8d'

const sha256 = (text: string) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')

/** 원고 11.5절 5-6 소절의 표를 생성기의 파서를 거치지 않고 직접 읽는다: 제목에서 이름, 표에서 [등급, 이름, 조건 표기, 설명] */
function manuscriptSection56() {
  const lines = manuscript.split('\n')
  const start = lines.findIndex((l) => l.startsWith('#### 5-6. '))
  expect(start, '원고에 5-6 소절이 없다').toBeGreaterThan(-1)
  const end = lines.findIndex((l, i) => i > start && /^#{2,4} /.test(l))
  const block = lines.slice(start, end)
  const heading = block[0]
  const name = heading.split(' · 이름: ')[1]?.trim()
  const table = block
    .filter((l) => l.startsWith('| ') && !l.startsWith('| 등급') && !l.startsWith('|---'))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
  return { heading, name, table }
}

const sqlLiteral = (s: string) => `'${s.replace(/'/g, "''")}'`

// ═══════════════════════════════════════════════════════════════════════
// ① 생성기: 번호 대조와 행 규칙
// ═══════════════════════════════════════════════════════════════════════

describe('생성기 — 5-6 번호 대조와 행 규칙', () => {
  it('번호 하나(5-6), 계열 하나, 등급형 3단 3행이다', () => {
    expect(LATE_SEED_NUMBERS).toEqual(['5-6'])
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((r) => r.number))).toEqual(new Set(['5-6']))
    expect(new Set(rows.map((r) => r.family_key))).toEqual(new Set(['all:J5-6']))
    expect(rows.map((r) => r.rarity)).toEqual(['common', 'rare', 'epic'])
    expect(rows.every((r) => r.level === null)).toBe(true)
  })

  it('번호 대조가 통과하고, 원고 2절의 «등급형 3단 5·20·50일»과 같은 값을 읽는다', () => {
    const verified = verifyNumbering({ manuscript, recycle, numbers: LATE_SEED_NUMBERS })
    const v = verified.get('5-6')!
    expect(v.kind).toBe('graded')
    expect(v.count).toBe(3)
    expect(v.thresholds).toEqual([5, 20, 50])
    const listRow = parseFamilyList(manuscript).get('5-6')!
    expect(listRow.kindText).toBe('등급형 3단')
    expect(listRow.stepsText).toBe('5·20·50일')
    expect(listRow.sportsText).toBe('합산')
  })

  it('이름·설명이 원고 11.5절과 글자 단위로 같다 (제목의 이름, 표의 이름과 설명)', () => {
    const { heading, name, table } = manuscriptSection56()
    expect(heading).toBe('#### 5-6. 같은 장소에 여러 날 체크인함 · 이름: 채워 둔 세제 칸')
    expect(name).toBe('채워 둔 세제 칸')
    expect(table).toHaveLength(3)
    expect(table.map((c) => c[0])).toEqual(['Common', 'Rare', 'Epic'])
    rows.forEach((r, i) => {
      expect(r.name, `${r.rarity} 이름`).toBe(name)
      expect(table[i][1], `${r.rarity} 표의 이름`).toBe(name)
      expect(r.description, `${r.rarity} 설명`).toBe(table[i][3])
    })
  })

  it('생성한 SQL 본문에도 원고의 이름과 설명이 글자 그대로 들어 있다', () => {
    const { sql } = generateLate()
    const { name, table } = manuscriptSection56()
    expect(sql).toContain(sqlLiteral(name!))
    for (const cells of table) expect(sql, cells[0]).toContain(sqlLiteral(cells[3]))
  })

  it('조건은 {same_spot_checkin_days: 5·20·50} 하나뿐이고 종목·시간대 조건이 없다', () => {
    expect(FAMILY_DEFS['5-6'].key).toBe('same_spot_checkin_days')
    expect(rows.map((r) => r.condition_json)).toEqual([
      { same_spot_checkin_days: 5 },
      { same_spot_checkin_days: 20 },
      { same_spot_checkin_days: 50 },
    ])
  })

  it('종목 없는 합산 계열 규칙: activity_types 빈 배열, admin_category NULL, 가지 explore, sort_order 506, 숨김 아님', () => {
    for (const r of rows) {
      expect(r.activity_types).toEqual([])
      expect(r.admin_category).toBeNull()
      expect(r.branch_key).toBe('explore')
      expect(r.sort_order).toBe(506)
      expect(r.is_hidden).toBe(false)
      expect(r.type).toBe('activity')
    }
  })

  it('포인트는 등급형 규칙 값 10·20·50(합 80)이고 배지 포인트 일괄 값의 기본값과 같다', () => {
    expect(rows.map((r) => r.point_reward)).toEqual([RARITY_POINTS.common, RARITY_POINTS.rare, RARITY_POINTS.epic])
    expect(rows.map((r) => r.point_reward)).toEqual([10, 20, 50])
    expect(rows.reduce((s, r) => s + r.point_reward, 0)).toBe(80)
    for (const r of rows) {
      const expected = defaultPointFor({ rarity: r.rarity as never, isLeveled: false, isHidden: false }, DEFAULT_BADGE_POINT_POLICY)
      expect(r.point_reward, r.rarity ?? '').toBe(expected)
    }
  })

  it('이미지 원본은 재활용 후보 계열(244 유지 목록)에서만 고른다', () => {
    const sql244 = fs.readFileSync(path.join(MIGRATIONS_DIR, '244_deactivate_activity_badges_outside_recycle.sql'), 'utf8')
    for (const src of new Set(rows.map((r) => r.image.src_family_key))) expect(sql244, src).toContain(`'${src}'`)
    expect(rows.map((r) => r.image)).toEqual([
      { src_family_key: 'walking:K3', pos: 1, total: 3 },
      { src_family_key: 'walking:K3', pos: 2, total: 3 },
      { src_family_key: 'walking:K3', pos: 3, total: 3 },
    ])
  })

  it('family_key는 새 형식이고 245·248의 계열·기존 v5 시드의 family_key와 겹치지 않는다', () => {
    const used = new Set([...buildRows(), ...buildRows({ numbers: HELD_SEED_NUMBERS })].map((r) => r.family_key))
    for (const r of rows) {
      expect(r.family_key).toMatch(/^all:J5-6$/)
      expect(used.has(r.family_key), r.family_key).toBe(false)
    }
    const seed = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8')) as { family_key: string }[]
    const seedKeys = new Set(seed.map((s) => s.family_key))
    for (const r of rows) expect(seedKeys.has(r.family_key), r.family_key).toBe(false)
  })

  it('5-6은 245의 입력 대상(TARGET_NUMBERS)과 248의 보류 계열(HELD_SEED_NUMBERS)에 들어 있지 않다', () => {
    expect(TARGET_NUMBERS).not.toContain('5-6')
    expect(HELD_SEED_NUMBERS).not.toContain('5-6')
  })

  it('원고의 번호·값·분류가 어긋나면 번호 대조가 던진다', () => {
    const build = (m: string, r: string) => () => verifyNumbering({ manuscript: m, recycle: r, numbers: LATE_SEED_NUMBERS })

    // 2절 단계 값과 11절 조건 표기 값이 다르다
    const brokenSteps = manuscript.replace('| 5-6 | 같은 장소에 여러 날 체크인함 | 등급형 3단 | 5·20·50일 |', '| 5-6 | 같은 장소에 여러 날 체크인함 | 등급형 3단 | 5·20·60일 |')
    expect(brokenSteps).not.toBe(manuscript)
    expect(build(brokenSteps, recycle)).toThrow(/번호 대조 5-6/)

    // 11절 Rare 조건 표기를 고쳐 2절 값과 어긋나게 한다
    const brokenNotation = manuscript.replace('같은 장소 체크인 누적 20일', '같은 장소 체크인 누적 25일')
    expect(brokenNotation).not.toBe(manuscript)
    expect(build(brokenNotation, recycle)).toThrow(/번호 대조 5-6/)

    // 11절 표에서 한 행이 빠졌다
    const lines = manuscript.split('\n')
    const epicIdx = lines.findIndex((l) => l.startsWith('| Epic | 채워 둔 세제 칸 |'))
    expect(epicIdx).toBeGreaterThan(-1)
    const brokenRows = lines.filter((_, i) => i !== epicIdx).join('\n')
    expect(build(brokenRows, recycle)).toThrow(/번호 대조 5-6/)

    // 재활용 후보 문서의 분류가 «새로 만듦»이 아니다
    const brokenRecycle = recycle.replace(
      '| 5-6 | 같은 장소에 여러 날 체크인함(등급형 3단 5·20·50일, 합산) | 새로 만듦 |',
      '| 5-6 | 같은 장소에 여러 날 체크인함(등급형 3단 5·20·50일, 합산) | 고쳐서 재활용 |'
    )
    expect(brokenRecycle).not.toBe(recycle)
    expect(build(manuscript, brokenRecycle)).toThrow(/번호 대조 5-6/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② SQL 파일
// ═══════════════════════════════════════════════════════════════════════

describe('생성기 — 291 SQL 파일', () => {
  const { sql, allowedKeys, priorSets } = generateLate()
  const body = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  const activeBefore = ACTIVE_ACTIVITY_AFTER_244 + priorSets.reduce((s: number, p: { rowCount: number }) => s + p.rowCount, 0)
  const activeAfter = activeBefore + rows.length

  it('디스크의 291 파일은 생성기 출력과 같다 (손으로 고친 흔적·낡은 파일 방지)', () => {
    expect(path.basename(LATE_OUT_PATH)).toBe(LATE_MIGRATION_FILE_NAME)
    expect(LATE_MIGRATION_FILE_NAME).toBe('291_seed_activity_badge_family_5_6.sql')
    expect(fs.readFileSync(LATE_OUT_PATH, 'utf8')).toBe(sql)
  })

  it('291 번호의 마이그레이션 파일은 하나뿐이다', () => {
    const same = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith('291_'))
    expect(same).toEqual([LATE_MIGRATION_FILE_NAME])
  })

  it('쓰기 문장은 badges INSERT 하나뿐이고 옛 객체를 바꾸지 않으며, 한 트랜잭션이다', () => {
    expect(body).not.toMatch(/\b(UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i)
    expect(body.match(/\bINSERT INTO\b/g)).toHaveLength(1)
    expect(body).toContain('INSERT INTO public.badges')
    expect(body).toMatch(/^BEGIN;$/m)
    expect(body).toMatch(/^COMMIT;$/m)
  })

  it('가드 3개: 같은 family_key, 같은 이름, 활성 액티비티 배지 수가 INSERT보다 앞에서 예외를 던진다', () => {
    const insertAt = body.indexOf('INSERT INTO public.badges')
    for (const tag of ['$guard$', '$guard_name$', '$guard_count$']) {
      const at = body.indexOf(`DO ${tag}`)
      expect(at, tag).toBeGreaterThan(-1)
      expect(at, `${tag}가 INSERT보다 앞이어야 한다`).toBeLessThan(insertAt)
    }
    expect(body).toContain("IF EXISTS (SELECT 1 FROM public.badges WHERE family_key IN ('all:J5-6')) THEN")
    expect(body).toContain("IF EXISTS (SELECT 1 FROM public.badges WHERE deleted_at IS NULL AND name IN ('채워 둔 세제 칸')) THEN")
    expect(body).toContain("SELECT count(*) INTO v_active FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;")
    expect(body.match(/RAISE EXCEPTION/g)!.length).toBeGreaterThanOrEqual(5)
  })

  it(`활성 액티비티 배지 수 가드는 244 뒤 ${ACTIVE_ACTIVITY_AFTER_244} + 245의 61 + 248의 59 = 390이고, 적용 뒤 확인은 5-6의 3개를 더한 393이다`, () => {
    expect(priorSets.map((p: { label: string; rowCount: number }) => [p.label, p.rowCount])).toEqual([['245', 61], ['248', 59]])
    expect(activeBefore).toBe(390)
    expect(activeAfter).toBe(393)
    expect(body).toContain(`IF v_active <> ${activeBefore} THEN`)
    expect(body).toContain(`IF v_active <> ${activeAfter} THEN`)
    // 가드(사전)는 INSERT 앞, 사후 확인은 INSERT 뒤
    expect(body.indexOf(`IF v_active <> ${activeBefore} THEN`)).toBeLessThan(body.indexOf('INSERT INTO public.badges'))
    expect(body.indexOf(`IF v_active <> ${activeAfter} THEN`)).toBeGreaterThan(body.indexOf('INSERT INTO public.badges'))
  })

  it('활성 수 390은 245·248 생성기 출력의 실제 행 수에서 나온다 (하드코딩이 아니다)', () => {
    expect(generate().rows).toHaveLength(61)
    expect(generateHeld().rows).toHaveLength(59)
  })

  it('마이그레이션 290의 가드가 기대하는 활성 수는 이 파일 앞(390) 또는 뒤(393) 어느 한쪽과 같다', () => {
    const sql290 = fs.readFileSync(path.join(MIGRATIONS_DIR, '290_apply_badge_point_defaults_activity.sql'), 'utf8')
    const m = sql290.match(/IF\s+v_active\s*<>\s*(\d+)\s+THEN/)
    expect(m, '290 파일에서 활성 수 가드를 찾지 못했다').not.toBeNull()
    const expected290 = Number(m![1])
    // 290을 이 파일 뒤에 적용하려면 393으로 고쳐야 한다. 그 전에는 390이라 «290 먼저, 291 나중»이 맞다. 둘 다 아니면 계획이 어긋났다
    expect([activeBefore, activeAfter], `290 가드 ${expected290}`).toContain(expected290)
    // 머리 주석이 이 관계를 설명한다
    expect(sql).toContain('마이그레이션 290(기존 액티비티 배지 포인트 일괄 적용)과의 관계')
    expect(sql).toContain(`활성 액티비티 배지 수가 이 파일로 ${activeBefore} → ${activeAfter}이 된다`)
  })

  it('머리에 규칙·영향·적용 순서가, 끝에 되돌림 SQL·드라이런·사후 검증이 있다', () => {
    expect(sql).toMatch(/^-- 되돌림 SQL$/m)
    expect(sql).toMatch(/^-- DELETE FROM public\.badges WHERE family_key IN \('all:J5-6'\);$/m)
    expect(sql).toContain('드라이런')
    expect(sql).toContain('롤백 실측')
    expect(sql).toContain('사후 검증')
    expect(sql).toContain('이미지 대응표')
    expect(sql).toContain('적용 순서: 244 → 245 → 248 → 이 파일')
    expect(sql).toContain('공용 DB 영향')
    // 드라이런이 245·248이 들어갔는지와 244가 끝났는지를 기대값과 함께 확인한다
    expect(sql).toContain('245가 들어갔는가: 245의 14계열 61행')
    expect(sql).toContain('248이 들어갔는가: 248의 17계열 59행')
    expect(sql).toContain(`기대값 ${ACTIVE_ACTIVITY_AFTER_244}`)
  })

  it('INSERT 행 수·계열 수·포인트 합이 사후 확인 DO 블록의 기대값(3 / 1 / 80)과 같다', () => {
    expect(sql).toContain('v_rows <> 3 OR v_fams <> 1 OR v_points <> 80 OR v_hidden <> 0')
    const valueLines = body.split('\n').filter((l) => /^ {4}\('.*\)[,]?$/.test(l))
    expect(valueLines).toHaveLength(rows.length)
  })

  it('CHECK 제약을 만드는 파일이 아니라서 «가장 큰 번호의 CHECK 파일»은 247 그대로다', () => {
    expect(sql).not.toContain('ADD CONSTRAINT badges_condition_json_known_keys')
    const checkFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .filter((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').includes('ADD CONSTRAINT badges_condition_json_known_keys'))
      .sort()
    expect(checkFiles[checkFiles.length - 1]).toBe('247_condition_json_checkin_drop_jam_keys.sql')
  })

  it('CHECK 허용 키는 247 파일에서 92개를 읽고, 5-6의 조건 키가 그 안에 있다', () => {
    expect(LATE_CHECK_MIGRATION_PATH).toBe(HELD_CHECK_MIGRATION_PATH)
    expect(allowedKeys).toHaveLength(92)
    expect(readAllowedConditionKeys(fs.readFileSync(LATE_CHECK_MIGRATION_PATH, 'utf8'))).toEqual(allowedKeys)
    // 245 시험이 읽는 242의 80개는 그대로다
    expect(readAllowedConditionKeys(fs.readFileSync(CHECK_MIGRATION_PATH, 'utf8'))).toHaveLength(80)
    const allowed = new Set(allowedKeys)
    for (const r of rows) for (const k of Object.keys(r.condition_json)) expect(allowed.has(k), `${r.family_key} ${k}`).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 245·248 출력은 바뀌지 않는다
// ═══════════════════════════════════════════════════════════════════════

describe('245·248의 기존 출력 고정', () => {
  it('245: 디스크 파일이 생성기 출력과 같고 SHA-256이 그대로다 (14계열 61행)', () => {
    const out = generate()
    expect(out.rows).toHaveLength(61)
    const disk = fs.readFileSync(DEFAULT_OUT_PATH, 'utf8')
    expect(disk).toBe(out.sql)
    expect(sha256(disk)).toBe(SHA256_245)
    expect(sha256(out.sql)).toBe(SHA256_245)
  })

  it('248: 디스크 파일이 생성기 출력과 같고 SHA-256이 그대로다 (17계열 59행)', () => {
    const out = generateHeld()
    expect(out.rows).toHaveLength(59)
    const disk = fs.readFileSync(HELD_OUT_PATH, 'utf8')
    expect(disk).toBe(out.sql)
    expect(sha256(disk)).toBe(SHA256_248)
    expect(sha256(out.sql)).toBe(SHA256_248)
  })

  it('--include-held로 만든 245 변형도 5-6을 넣지 않는다 (5-6은 입력 대상 목록 밖이다)', () => {
    const out = generate({ includeHeld: true })
    expect(out.rows.some((r: SeedRow) => r.number === '5-6')).toBe(false)
  })

  it('245·248 SQL 어디에도 5-6의 family_key나 이름이 없다', () => {
    for (const f of [DEFAULT_OUT_PATH, HELD_OUT_PATH]) {
      const text = fs.readFileSync(f, 'utf8')
      expect(text, path.basename(f)).not.toContain('all:J5-6')
      expect(text, path.basename(f)).not.toContain('채워 둔 세제 칸')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ DB 제약 쪽 (CHECK 허용 키 · 값 스키마 · 숨김·가지·등급/레벨·포인트 제약 · 계열 정합성 트리거)
// ═══════════════════════════════════════════════════════════════════════

describe('조건 키와 제약 — 레지스트리·숨김·가지·포인트', () => {
  const registry = new Set<string>(ALL_CONDITION_KEYS)
  const measurable = new Set<string>(MEASURABLE_CONDITION_KEYS)

  it('조건 키 same_spot_checkin_days는 레지스트리에 있고 엔진 밖(external) 판정 키이며 값이 범위·정수 규칙을 지킨다', () => {
    for (const r of rows) {
      for (const [key, v] of Object.entries(r.condition_json as Record<string, unknown>)) {
        expect(registry.has(key), `${r.family_key} ${key}: 레지스트리 밖`).toBe(true)
        const field = getConditionField(key)!
        // 메인 엔진은 이 키만 든 조건을 항상 fail 처리하고, 판정·발급은 jamActionBadges.ts가 맡는다
        expect(field.role, key).toBe('meta')
        expect(field.evaluation, key).toBe('external')
        expect(typeof v).toBe('number')
        expect(v as number).toBeGreaterThanOrEqual(field.min ?? -Infinity)
        expect(v as number).toBeLessThanOrEqual(field.max ?? Infinity)
        if (field.input === 'integer') expect(Number.isInteger(v)).toBe(true)
      }
      const blocking = findBlockingConditionKeys(r.condition_json as BadgeCondition)
      expect(blocking.unknown).toEqual([])
      expect(blocking.pending).toEqual([])
      expect(blocking.unpaired).toEqual([])
    }
  })

  it('숨김 제약(243): 5-6은 숨김이 아니라서 badges_hidden_activity_only·no_points·common_only를 어길 수 없다', () => {
    for (const r of rows) {
      const hiddenActivityOnly = !r.is_hidden || r.type === 'activity'
      const hiddenNoPoints = !r.is_hidden || r.point_reward === 0
      const hiddenCommonOnly = !r.is_hidden || r.rarity === null || r.rarity === 'common'
      expect([hiddenActivityOnly, hiddenNoPoints, hiddenCommonOnly], r.rarity ?? '').toEqual([true, true, true])
      expect(r.is_hidden).toBe(false)
    }
  })

  it('가지 제약(243): branch_key explore가 243 파일이 허용하는 가지 목록에 있다', () => {
    const sql243 = fs.readFileSync(path.join(MIGRATIONS_DIR, '243_badges_hidden_and_branch.sql'), 'utf8')
    const m = sql243.match(/branch_key IN \(([^)]*)\)/)
    expect(m, '243 파일에서 가지 목록을 찾지 못했다').not.toBeNull()
    const allowed = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    expect(allowed).toContain('explore')
    for (const r of rows) expect(allowed).toContain(r.branch_key)
  })

  it('등급·레벨 제약(130): 등급과 레벨 중 정확히 하나만 있다 (5-6은 등급만)', () => {
    for (const r of rows) expect((r.rarity === null) !== (r.level === null), r.rarity ?? '').toBe(true)
  })

  it('계열 정합성(140): 등급형은 계열 안에서 조건 키 집합이 같고(측정 키 집합도 같다) 값이 오름차순이다', () => {
    const keySets = new Set(rows.map((r) => JSON.stringify(Object.keys(r.condition_json).sort())))
    expect(keySets.size).toBe(1)
    const measurableSets = new Set(rows.map((r) => JSON.stringify(Object.keys(r.condition_json).filter((k) => measurable.has(k)).sort())))
    expect(measurableSets.size).toBe(1)
    const values = rows.map((r) => (r.condition_json as Record<string, number>).same_spot_checkin_days)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
    expect(new Set(rows.map((r) => `${r.rarity}/${r.level}`)).size).toBe(rows.length)
  })

  it('종류 판정: 등급 계열(graded)이다', () => {
    for (const r of rows) {
      expect(badgeKindOf({ rarity: r.rarity as never, condition_json: r.condition_json as BadgeCondition })).toBe('graded')
    }
  })

  it('판정 경로가 있다: JAM! 행동 지표 키이고 동기화 끝 판정 목록에 들어 있으며, 메인 엔진은 이 키를 직접 판정하지 않는다', () => {
    expect(JAM_ACTION_CONDITION_KEYS as readonly string[]).toContain('same_spot_checkin_days')
    expect(JAM_SYNC_TRIGGERS as readonly string[]).toContain('same_spot_checkin_days')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑤ 이름
// ═══════════════════════════════════════════════════════════════════════

describe('이름: 다른 계열과 겹치지 않는다', () => {
  it('한 계열 안에서는 이름이 하나이고, 245·248의 행과 같은 이름이 없다', () => {
    expect(new Set(rows.map((r) => r.name))).toEqual(new Set(['채워 둔 세제 칸']))
    const others = [...buildRows(), ...buildRows({ numbers: HELD_SEED_NUMBERS })]
    const names = new Set(rows.map((r) => r.name))
    for (const r of others) expect(names.has(r.name), `${r.number}와 이름이 같다: ${r.name}`).toBe(false)
  })

  it('기존 v5 시드 배지와 원고의 다른 계열 이름과 겹치지 않는다', () => {
    const names = new Set(rows.map((r) => r.name))
    const seed = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8')) as { name: string }[]
    for (const s of seed) expect(names.has(s.name), `기존 배지와 이름이 같다: ${s.name}`).toBe(false)
    for (const [number, sec] of parseNamesAndDescriptions(manuscript)) {
      if (number === '5-6') continue
      const used = [sec.name, ...sec.rows.map((x: string[]) => x[1])].filter(Boolean)
      for (const n of used) expect(names.has(n as string), `${number}와 이름이 같다: ${n}`).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ⑥ 엔진이 5-6을 평가한다
// ═══════════════════════════════════════════════════════════════════════

function toBadgeRow(r: SeedRow): BadgeRow {
  return {
    id: `${r.family_key}#${r.rarity}`,
    name: r.name,
    description: r.description,
    type: 'activity',
    rarity: r.rarity,
    level: r.level,
    family_key: r.family_key,
    sort_order: r.sort_order,
    image_url: null,
    condition_json: r.condition_json,
    activity_types: r.activity_types,
    admin_category: r.admin_category,
    branch_key: r.branch_key,
    is_hidden: r.is_hidden,
    point_reward: r.point_reward,
    valid_from: null,
    valid_until: null,
    deleted_at: null,
  } as unknown as BadgeRow
}

/** 지금 유저가 갖고 있는 배지 id 집합과 이번에 넣은 행을 돌려주는 supabase 흉내 */
function fakeSupabase(badges: BadgeRow[], owned: string[], inserted: string[]) {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'or', 'in', 'order', 'limit']) builder[m] = () => builder
    builder.insert = (payload: { badge_id: string }) => {
      inserted.push(payload.badge_id)
      owned.push(payload.badge_id)
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'badges') return Promise.resolve({ data: badges, error: null }).then(resolve)
      if (table === 'user_activity_badges') return Promise.resolve({ data: owned.map((id) => ({ badge_id: id })), error: null }).then(resolve)
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

async function issueFor(days: number, owned: string[] = []): Promise<string[]> {
  mocks.countSameSpotCheckinDays.mockResolvedValue(days)
  const inserted: string[] = []
  await evaluateJamActionBadges('user-1', ['same_spot_checkin_days'], fakeSupabase(rows.map(toBadgeRow), owned, inserted))
  return inserted
}

describe('엔진 평가 — 5-6 같은 장소 체크인 일수(실제 발급 경로)', () => {
  beforeEach(() => {
    mocks.awardPoints.mockClear()
    mocks.recordFeedEvent.mockClear()
    mocks.countSameSpotCheckinDays.mockReset()
  })

  it('첫 기준값(5일) 아래(4일)에서는 받지 않는다', async () => {
    expect(await issueFor(4)).toEqual([])
    expect(mocks.awardPoints).not.toHaveBeenCalled()
  })

  it.each([
    [5, 'all:J5-6#common'],
    [19, 'all:J5-6#common'],
    [20, 'all:J5-6#rare'],
    [49, 'all:J5-6#rare'],
    [50, 'all:J5-6#epic'],
    [365, 'all:J5-6#epic'],
  ])('같은 장소 %i일이면 채운 가장 높은 단계 하나(%s)만 받는다', async (days, expected) => {
    expect(await issueFor(days)).toEqual([expected])
  })

  it('받은 배지의 point_reward로 포인트가 지급된다 (Common 10, Rare 20, Epic 50)', async () => {
    for (const [days, points] of [[5, 10], [20, 20], [50, 50]] as const) {
      mocks.awardPoints.mockClear()
      expect(await issueFor(days)).toHaveLength(1)
      const paid = mocks.awardPoints.mock.calls.reduce((s, c) => s + (c as unknown as [string, number])[1], 0)
      expect(paid, `${days}일`).toBe(points)
    }
  })

  it('이미 받은 단계는 다시 받지 않고, 위 단계에 닿으면 그 단계만 받는다', async () => {
    const first = await issueFor(5)
    expect(first).toEqual(['all:J5-6#common'])
    expect(await issueFor(5, [...first])).toEqual([])
    expect(await issueFor(20, [...first])).toEqual(['all:J5-6#rare'])
  })
})
