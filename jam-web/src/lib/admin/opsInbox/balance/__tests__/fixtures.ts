/**
 * 밸런스 평가 테스트 공용 재료 (티켓 20260930_1459 조각 A). 규칙 값은 마이그레이션 207의 시드와 같은 값이다.
 */
import type { ItemBookVisibilityFields } from '@/lib/itembook/visibility'
import type { BalanceItemInput } from '../evaluate'
import { parseBalanceRules, type BalanceRules, type OpsRuleRow } from '../rules'
import type { BalanceState } from '../state'

export const NOW = '2026-10-01T03:00:00.000Z' // 10/1(수) 12:00 KST

const ECONOMY_KEYS = ['rarity_common', 'rarity_rare', 'bonus_drop_rate', 'fail_reward_points', 'completion_decay']

export const SEED_ROWS: OpsRuleRow[] = [
  { rule_key: 'open_collections_max', rule_group: 'balance', value: { max: 6, provisional: true }, level: 'warn', enabled: true },
  { rule_key: 'weekly_new_collections_max', rule_group: 'balance', value: { max: 1, provisional: true }, level: 'warn', enabled: true },
  { rule_key: 'rolling_new_collections_max', rule_group: 'balance', value: { max: 2, provisional: true }, level: 'warn', enabled: true },
  { rule_key: 'launch_lead_days_min', rule_group: 'balance', value: { min_days: 28, provisional: false }, level: 'warn', enabled: true },
  {
    rule_key: 'point_reward_max',
    rule_group: 'balance',
    value: {
      kinds: {
        count_badge: { max: 10, provisional: true },
        achievement_badge: { max: 100, provisional: false },
        mission: { max: 50, provisional: true },
        collection_completion: { max: 20, provisional: false },
        recipe: { max: 30, provisional: false },
      },
    },
    level: 'warn',
    enabled: true,
  },
  { rule_key: 'single_action_points', rule_group: 'balance', value: {}, level: 'warn', enabled: true },
  { rule_key: 'count_ladder_points', rule_group: 'balance', value: {}, level: 'warn', enabled: true },
  { rule_key: 'economy_keys', rule_group: 'balance', value: { keys: ECONOMY_KEYS }, level: 'warn', enabled: true },
]

/** 시드 규칙을 읽은 값. `patch`로 규칙 행 하나를 바꿔 읽는다(꺼 두기·값 바꾸기). */
export function makeRules(patch: Record<string, Partial<OpsRuleRow>> = {}): BalanceRules {
  const rows = SEED_ROWS.map((row) => ({ ...row, ...(patch[row.rule_key] ?? {}) }))
  return parseBalanceRules(rows)!
}

/** 고른 규칙만 켜고 나머지는 끈다(규칙 하나의 동작을 따로 볼 때). 값은 그대로 읽힌다. `patch`로 켠 규칙의 행을 바꾼다. */
export function rulesOnly(keys: string[], patch: Record<string, Partial<OpsRuleRow>> = {}): BalanceRules {
  const off: Record<string, Partial<OpsRuleRow>> = {}
  for (const row of SEED_ROWS) if (!keys.includes(row.rule_key)) off[row.rule_key] = { enabled: false }
  const merged: Record<string, Partial<OpsRuleRow>> = { ...off }
  for (const [key, value] of Object.entries(patch)) merged[key] = { ...(merged[key] ?? {}), ...value }
  return makeRules(merged)
}

let counter = 0

/** 항목 하나. 기본은 승인 전(`reviewing`)이고 시각·자원은 비어 있다. */
export function makeItem(overrides: Partial<BalanceItemInput> = {}): BalanceItemInput {
  counter += 1
  return {
    id: `item-${counter}`,
    position: counter,
    itemKey: `key-${counter}`,
    kind: 'collection_launch',
    status: 'reviewing',
    startsAt: null,
    endsAt: null,
    original: {},
    edited: null,
    approvedAt: null,
    ...overrides,
  }
}

/** 컬렉션 런칭 항목. 공개·종료 시각은 같은 값을 원본과 열에 모두 둔다(제출 때 저장되는 모양). */
export function launch(startsAt: string | null, endsAt: string | null = '2026-12-31T09:00:00+09:00', extra: Record<string, unknown> = {}, overrides: Partial<BalanceItemInput> = {}) {
  const original: Record<string, unknown> = { ...extra }
  if (startsAt) original.starts_at = startsAt
  if (endsAt) original.ends_at = endsAt
  return makeItem({
    kind: 'collection_launch',
    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    original: original as BalanceItemInput['original'],
    ...overrides,
  })
}

/** 열려 있는 컬렉션 `count`개(종료 시각 없음). */
export function openBooks(count: number, extra: Partial<ItemBookVisibilityFields> = {}): ItemBookVisibilityFields[] {
  return Array.from({ length: count }, () => ({ is_active: true, valid_from: null, valid_until: null, ...extra }))
}

/** 모든 상태를 읽은 서비스 상태. `patch`로 일부를 바꾼다(읽기 실패는 `{ ok: false }`). */
export function makeState(patch: Partial<BalanceState> = {}): BalanceState {
  return {
    books: { ok: true, data: [] },
    otherLaunches: { ok: true, data: [] },
    badgePoints: { ok: true, data: {} },
    familyBadges: { ok: true, data: {} },
    ...patch,
  }
}
