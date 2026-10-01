/**
 * 밸런스 규칙 해석 (티켓 20260930_1459 조각 A)
 *
 * 지키는 것:
 * - 마이그레이션 207의 시드가 파서로 읽히고 값이 티켓 「규칙표」와 같다(시드와 파서가 어긋나면 잡힌다)
 * - 값 모양이 틀린 규칙은 그 규칙만 「읽을 수 없음」이고 다른 규칙은 그대로 읽힌다
 * - 밸런스 규칙 행이 하나도 없으면 null(평가 실패)
 * - 횟수형·달성형 JAM! 배지 판정(`condition_json`)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BALANCE_RULE_KEYS, parseBalanceRules, type OpsRuleRow } from '../rules'
import { isCountBadgeCondition } from '../evaluate'
import { JAM_ACTION_CONDITION_KEYS } from '@/lib/badge-engine/jamActionBadges'
import { SEED_ROWS, makeRules } from './fixtures'

const MIGRATION = join(__dirname, '../../../../../../supabase/migrations/207_ops_rules.sql')

/** 마이그레이션 시드(`INSERT ... VALUES`)의 규칙 행 8개를 읽는다. */
function seedRowsFromMigration(): OpsRuleRow[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const rows: OpsRuleRow[] = []
  const pattern = /\('([a-z_]+)',\s*'(balance|signal)',\s*'(\{[\s\S]*?\})'::jsonb,\s*'(info|warn)',\s*(true|false)\)/g
  for (const match of sql.matchAll(pattern)) {
    rows.push({
      rule_key: match[1],
      rule_group: match[2],
      value: JSON.parse(match[3]),
      level: match[4],
      enabled: match[5] === 'true',
    })
  }
  return rows
}

describe('마이그레이션 207 시드', () => {
  const rows = seedRowsFromMigration()

  it('R1~R8 8행이고 모두 balance · warn · 켜짐이다', () => {
    expect(rows.map((row) => row.rule_key)).toEqual([...BALANCE_RULE_KEYS])
    expect(rows.every((row) => row.rule_group === 'balance' && row.level === 'warn' && row.enabled)).toBe(true)
  })

  it('파서가 8개 모두 읽고 값이 규칙표(임시값 여부 포함)와 같다', () => {
    const rules = parseBalanceRules(rows)!
    expect(rules).not.toBeNull()
    for (const key of BALANCE_RULE_KEYS) expect(rules[key]?.readable).toBe(true)
    expect(rules.open_collections_max).toMatchObject({ value: { max: 6, provisional: true } })
    expect(rules.weekly_new_collections_max).toMatchObject({ value: { max: 1, provisional: true } })
    expect(rules.rolling_new_collections_max).toMatchObject({ value: { max: 2, provisional: true } })
    expect(rules.launch_lead_days_min).toMatchObject({ value: { minDays: 28, provisional: false } })
    expect(rules.point_reward_max).toMatchObject({
      value: {
        kinds: {
          count_badge: { max: 10, provisional: true },
          achievement_badge: { max: 100, provisional: false },
          mission: { max: 50, provisional: true },
          collection_completion: { max: 20, provisional: false },
          recipe: { max: 30, provisional: false },
        },
      },
    })
  })

  it('R8 키는 23개이고 중복이 없다', () => {
    const rules = parseBalanceRules(rows)!
    const economy = rules.economy_keys
    expect(economy?.readable && economy.value.keys.length).toBe(23)
    expect(economy?.readable && new Set(economy.value.keys).size).toBe(23)
  })
})

describe('parseBalanceRules', () => {
  it('규칙 행이 하나도 없으면 null이다(규칙 테이블이 비어 있음)', () => {
    expect(parseBalanceRules([])).toBeNull()
  })

  it('밸런스 규칙이 아닌 행(신호 기준값)은 세지 않는다', () => {
    const signalOnly: OpsRuleRow[] = [{ rule_key: 'no_new_content_days', rule_group: 'signal', value: { max: 0 }, level: 'warn', enabled: true }]
    expect(parseBalanceRules(signalOnly)).toBeNull()
  })

  it('행이 없는 규칙은 undefined(만들지 않은 규칙)다', () => {
    const rules = parseBalanceRules(SEED_ROWS.filter((row) => row.rule_key !== 'economy_keys'))!
    expect(rules.economy_keys).toBeUndefined()
    expect(rules.open_collections_max?.readable).toBe(true)
  })

  it('꺼진 규칙은 enabled가 false다', () => {
    const rules = makeRules({ open_collections_max: { enabled: false } })
    expect(rules.open_collections_max?.enabled).toBe(false)
  })

  it('값 모양이 틀린 규칙만 읽을 수 없음이고 다른 규칙은 그대로다', () => {
    const rules = makeRules({
      open_collections_max: { value: { max: '여섯' } },
      launch_lead_days_min: { value: { min_days: -1 } },
      economy_keys: { value: { keys: ['rarity_common', 3] } },
    })
    expect(rules.open_collections_max?.readable).toBe(false)
    expect(rules.launch_lead_days_min?.readable).toBe(false)
    expect(rules.economy_keys?.readable).toBe(false)
    expect(rules.weekly_new_collections_max?.readable).toBe(true)
    expect(rules.point_reward_max?.readable).toBe(true)
  })

  it('provisional은 없으면 false이고 불리언이 아니면 읽을 수 없음이다', () => {
    const rules = makeRules({
      open_collections_max: { value: { max: 6 } },
      weekly_new_collections_max: { value: { max: 1, provisional: 'yes' } },
    })
    expect(rules.open_collections_max).toMatchObject({ readable: true, value: { max: 6, provisional: false } })
    expect(rules.weekly_new_collections_max?.readable).toBe(false)
  })

  it('R5는 종류 하나가 틀리면 그 종류만 null이다', () => {
    const rules = makeRules({
      point_reward_max: {
        value: {
          kinds: {
            count_badge: { max: 10 },
            achievement_badge: { max: 100 },
            mission: 'x',
            collection_completion: { max: 20 },
            recipe: { max: 30 },
          },
        },
      },
    })
    const r5 = rules.point_reward_max
    expect(r5?.readable && r5.value.kinds.mission).toBeNull()
    expect(r5?.readable && r5.value.kinds.recipe).toMatchObject({ max: 30 })
  })

  it('level이 info·warn이 아니면 그 규칙은 읽을 수 없음이다', () => {
    const rules = makeRules({ open_collections_max: { level: 'critical' } })
    expect(rules.open_collections_max?.readable).toBe(false)
  })

  it('R6·R7은 객체면 읽히고 값이 있어도 무시한다', () => {
    const rules = makeRules({ single_action_points: { value: { anything: 1 } }, count_ladder_points: { value: 'x' } })
    expect(rules.single_action_points?.readable).toBe(true)
    expect(rules.count_ladder_points?.readable).toBe(false)
  })
})

describe('isCountBadgeCondition', () => {
  it('JAM! 행동 지표 키가 있으면 횟수형이다', () => {
    expect(isCountBadgeCondition({ combine_attempt_count: 10 })).toBe(true)
    expect(isCountBadgeCondition({ mission_complete_count: 3, anything: 1 })).toBe(true)
  })

  it('지표 키가 JAM! 행동 키 전부에 대해 횟수형이고 recipe_first_success만 예외다', () => {
    for (const key of JAM_ACTION_CONDITION_KEYS) {
      expect(isCountBadgeCondition({ [key]: 1 })).toBe(key !== 'recipe_first_success')
    }
  })

  it('JAM! 행동 키가 없으면 달성형이다', () => {
    expect(isCountBadgeCondition({})).toBe(false)
    expect(isCountBadgeCondition({ recipe_first_success: { recipe_id: 'r' } })).toBe(false)
    expect(isCountBadgeCondition({ distance_km: 5 })).toBe(false)
  })

  it('객체가 아니면 판정할 수 없어 null이다', () => {
    expect(isCountBadgeCondition(undefined)).toBeNull()
    expect(isCountBadgeCondition(null)).toBeNull()
    expect(isCountBadgeCondition('combine_attempt_count')).toBeNull()
    expect(isCountBadgeCondition([])).toBeNull()
  })
})
