/**
 * 밸런스 설정 «서비스 활동 잼» 구역의 연결 (티켓 20261028_1735 4회, 운영 로직 4.5·12.2·19.1절)
 *
 * 서비스 활동(배지 받기·잠긴 아이템 배지 열기·믹스 성공·미션 완료·컬렉션 완성·드랍·픽업)이 주는 잼의 종류별 고정값과 하루·주간 상한을 한 구역으로 편집한다.
 * 두 곳을 읽고 쓴다.
 * - `service_jam_rules` 7행(`kind` 키, 마이그레이션 300): 종류별 잼 `amount`(0 이상 정수). **0이면 그 활동은 잼을 주지 않는다.** 칸 이름은 `rule:<kind>:amount`이고 이력에도 그대로 남는다.
 *   컬렉션 완성은 등급과 관계없이 한 값(`collection_complete`)이다. 캡슐이 가득 찬 것은 종류에 없다(잼의 재귀 방지).
 * - `jam_policy` id=1 한 행의 두 칸: `service_jam_daily_cap`(하루, KST)·`service_jam_weekly_cap`(주간, 월~일 KST). 둘 다 0 이상 정수.
 *   **상한 0은 «상한 없음»이 아니라 «지급 0»이다.** 지급 함수(`jam_apply_service_activity`, 마이그레이션 303)가 `LEAST(규칙값, 하루 남은 양, 주간 남은 양)`만큼만 주고 남은 양이 0 이하면 아무것도 쓰지 않는다.
 *   챕터 구역의 주간 상한(0이 «상한 없음», DB에는 NULL)과 뜻이 반대라 칸 안내와 구역 설명에 적는다.
 *
 * `jam_policy`는 잼·동기화·잠긴 아이템 배지 구역과 같은 행이다. 이 구역은 상한 두 칸만 읽고 쓰지만, 수정 시각(`updated_at`)이 행 하나라서 그 구역들이 저장해도 이 구역의 수정 시각이 올라간다
 * (화면이 읽은 뒤 누가 바꿨는지 가리는 용도라 다른 구역 저장 뒤에는 새로 불러와야 한다. 기존 구역끼리도 같다).
 *
 * 읽기는 **가공하지 않은 행**을 읽는다(비정상 값을 기본값으로 바꿔 보이지 않는다). 규칙은 종류 순서(`SERVICE_JAM_KINDS`)로 읽고 구역 수정 시각도 고정된 순서로 계산한다.
 * 쓰기는 두 표라 한 번의 조건부 갱신으로 끝나지 않는다. 행 단위 갱신·되돌림은 공용 모듈(`rowwise.ts`)에 맡기고, 이 파일은 표에 맞는 갱신·되돌림 함수만 만든다.
 * 확률 안내 페이지가 읽는 칸이 없어 모든 칸의 `affectsDisclosure`는 `false`다(확인창 없음).
 */
import type { Database } from '@/types/database.generated'
import { dbNumber } from './fields'
import { didUndo, latestStamp, runRowOps, toRowOutcome, type RowOp } from './rowwise'
import {
  INTEGER_MAX,
  type BalanceFieldDef,
  type BalanceSectionBinding,
  type BalanceServiceClient,
  type BalanceValues,
  type BalanceWriteResult,
} from './types'

export const SERVICE_JAM_SECTION_ID = 'servicejam'

/**
 * `service_jam_rules.kind`의 값 7종 — 마이그레이션 300의 CHECK와 같다(시험이 SQL과 대조한다). 화면 순서이기도 하다.
 * 지급 코드의 `SERVICE_JAM_KINDS`(`lib/jam/serviceActivity.ts`)와 같은 목록이지만 그 파일은 자동 채움·행동 지표 모듈을 끌어와서 어드민 화면에서는 따로 둔다.
 */
export const SERVICE_JAM_RULE_KINDS = [
  'locked_unlock',
  'badge_earned',
  'combine_success',
  'mission_complete',
  'collection_complete',
  'drop',
  'pickup',
] as const

export type ServiceJamRuleKind = (typeof SERVICE_JAM_RULE_KINDS)[number]

export const SERVICE_JAM_DAILY_CAP_KEY = 'service_jam_daily_cap'
export const SERVICE_JAM_WEEKLY_CAP_KEY = 'service_jam_weekly_cap'
export const SERVICE_JAM_CAP_KEYS = [SERVICE_JAM_DAILY_CAP_KEY, SERVICE_JAM_WEEKLY_CAP_KEY] as const

/**
 * 종류별 잼의 기본값 — 마이그레이션 300 시드(운영 로직 4.5절)와 같다. 코드에 따로 있던 값이 아니라 이 화면이 «기본값»을 보이려고 두는 사본이다.
 * 시드를 바꾸는 마이그레이션을 쓰면 같은 티켓에서 이 상수도 바꾼다(시험이 시드 SQL과 대조한다).
 */
export const SERVICE_JAM_DEFAULT_AMOUNTS: Readonly<Record<ServiceJamRuleKind, number>> = {
  locked_unlock: 5,
  badge_earned: 5,
  combine_success: 5,
  mission_complete: 20,
  collection_complete: 30,
  drop: 0,
  pickup: 0,
}

/** 상한의 기본값 — 마이그레이션 300(`jam_policy` 열 기본값)과 같다. */
export const SERVICE_JAM_DEFAULT_CAPS: Readonly<Record<(typeof SERVICE_JAM_CAP_KEYS)[number], number>> = {
  service_jam_daily_cap: 40,
  service_jam_weekly_cap: 100,
}

/** 칸 라벨과 «받는 잼» 안내에 쓰는 활동 이름·때. */
export const SERVICE_JAM_LABELS: Readonly<Record<ServiceJamRuleKind, { label: string; phrase: string }>> = {
  locked_unlock: { label: '잠긴 아이템 배지 열기', phrase: '잠긴 아이템 배지를 1개 열 때마다' },
  badge_earned: { label: '배지 받기', phrase: '배지를 1개 받을 때마다' },
  combine_success: { label: '믹스 성공', phrase: '믹스에 1번 성공할 때마다(등급 올리기 포함)' },
  mission_complete: { label: '미션 완료', phrase: '미션을 1개 완료할 때마다' },
  collection_complete: { label: '컬렉션 완성', phrase: '컬렉션을 1번 완성할 때마다(등급과 관계없이 같은 값)' },
  drop: { label: '드랍', phrase: '1번 드랍할 때마다' },
  pickup: { label: '픽업', phrase: '1번 픽업할 때마다' },
}

export const SERVICE_JAM_RULE_GROUP = '활동 종류별 잼'
export const SERVICE_JAM_CAP_GROUP = '받을 수 있는 양의 상한'

/** 상한 0의 뜻. 챕터 구역의 «주간 상한 0 = 상한 없음»과 반대라서 칸 안내와 구역 설명이 같은 문장을 쓴다. */
export const SERVICE_JAM_CAP_ZERO_MEANING = '0이면 «상한 없음»이 아니라 서비스 활동으로 받는 잼이 없어요.'

/** 종류별 잼 칸의 이름(`rule:badge_earned:amount`). 저장 본문·이력의 `field`와 같다. */
export function serviceJamRuleKey(kind: ServiceJamRuleKind): string {
  return `rule:${kind}:amount`
}

/** `rule:badge_earned:amount` → `badge_earned`. 모르는 종류나 형식이면 `null`. */
export function parseServiceJamRuleKey(key: string): ServiceJamRuleKind | null {
  const match = /^rule:([a-z_]+):amount$/.exec(key)
  if (!match) return null
  return (SERVICE_JAM_RULE_KINDS as readonly string[]).includes(match[1]) ? (match[1] as ServiceJamRuleKind) : null
}

export const SERVICE_JAM_RULE_KEYS: readonly string[] = SERVICE_JAM_RULE_KINDS.map(serviceJamRuleKey)

function ruleField(kind: ServiceJamRuleKind): BalanceFieldDef {
  const { label, phrase } = SERVICE_JAM_LABELS[kind]
  return {
    key: serviceJamRuleKey(kind),
    label,
    unit: '잼',
    hint: `${phrase} 받는 잼이에요. 0이면 잼을 주지 않아요. 하루·주간 상한을 넘겨서는 받지 않아요.`,
    group: SERVICE_JAM_RULE_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: SERVICE_JAM_DEFAULT_AMOUNTS[kind],
    affectsDisclosure: false,
  }
}

/**
 * 칸 정의. 범위는 마이그레이션 300의 CHECK와 같다: 종류별 잼과 두 상한 모두 0 이상 정수다(`amount >= 0`, `service_jam_*_cap >= 0`).
 */
export const SERVICE_JAM_FIELDS: readonly BalanceFieldDef[] = [
  ...SERVICE_JAM_RULE_KINDS.map(ruleField),
  {
    key: SERVICE_JAM_DAILY_CAP_KEY,
    label: '하루 상한',
    unit: '잼',
    hint: `한 유저가 하루(KST)에 서비스 활동으로 받을 수 있는 잼의 합이에요. ${SERVICE_JAM_CAP_ZERO_MEANING}`,
    group: SERVICE_JAM_CAP_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: SERVICE_JAM_DEFAULT_CAPS.service_jam_daily_cap,
    affectsDisclosure: false,
  },
  {
    key: SERVICE_JAM_WEEKLY_CAP_KEY,
    label: '주간 상한',
    unit: '잼',
    hint: `한 유저가 한 주(월~일, KST)에 서비스 활동으로 받을 수 있는 잼의 합이에요. 하루 상한과 함께 적용돼 남은 양이 더 적은 쪽까지만 받아요. ${SERVICE_JAM_CAP_ZERO_MEANING}`,
    group: SERVICE_JAM_CAP_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: SERVICE_JAM_DEFAULT_CAPS.service_jam_weekly_cap,
    affectsDisclosure: false,
  },
]

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다). */
export const SERVICE_JAM_RULE_SELECT = 'kind, amount, updated_at'
export const SERVICE_JAM_POLICY_SELECT = 'service_jam_daily_cap, service_jam_weekly_cap, updated_at'

/** 경고(막지는 않는다). 칸 하나가 0이면 서비스 활동으로 받는 잼이 모두 멈춘다. */
export const SERVICE_JAM_DAILY_ZERO_WARNING =
  '하루 상한이 0이라 서비스 활동으로 받는 잼이 모두 멈춰요. 의도한 설정이면 그대로 저장할 수 있어요.'
export const SERVICE_JAM_WEEKLY_ZERO_WARNING =
  '주간 상한이 0이라 서비스 활동으로 받는 잼이 모두 멈춰요. 의도한 설정이면 그대로 저장할 수 있어요.'
export const SERVICE_JAM_ALL_RULES_ZERO_WARNING =
  '종류별 잼이 모두 0이라 서비스 활동으로 받는 잼이 없어요. 나오게 하려면 하나를 1 이상으로 바꿔 주세요. 의도한 설정이면 그대로 저장할 수 있어요.'

type JamPolicyUpdate = Database['public']['Tables']['jam_policy']['Update']

interface ServiceJamRows {
  /** 종류 → 잼과 수정 시각. 7종이 모두 있고 **`SERVICE_JAM_RULE_KINDS` 순서**로 들어 있다. */
  rules: Map<ServiceJamRuleKind, { amount: number; stamp: string }>
  policy: { daily: number; weekly: number; stamp: string }
}

function rowsStamp(rows: ServiceJamRows): string {
  return latestStamp([...[...rows.rules.values()].map((rule) => rule.stamp), rows.policy.stamp])
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 두 곳을 가공 없이 읽는다. 종류 행이 모자라거나 `jam_policy` id=1 행이 없거나 숫자가 아닌 칸이 있으면 던진다(기본값으로 바꿔 보이지 않는다).
 * 규칙은 DB가 준 순서와 상관없이 고정된 종류 순서로 만든다.
 */
async function readRows(service: BalanceServiceClient): Promise<ServiceJamRows> {
  const [ruleRes, policyRes] = await Promise.all([
    service.from('service_jam_rules').select(SERVICE_JAM_RULE_SELECT).order('kind', { ascending: true }),
    service.from('jam_policy').select(SERVICE_JAM_POLICY_SELECT).eq('id', 1).maybeSingle(),
  ])
  if (ruleRes.error) throw new Error(`서비스 활동 잼 규칙 조회 실패: ${ruleRes.error.message}`)
  if (policyRes.error) throw new Error(`서비스 활동 잼 상한 조회 실패: ${policyRes.error.message}`)
  if (!policyRes.data) throw new Error('서비스 활동 잼 상한 조회 실패: id=1 행이 없음')

  const ruleByKind = new Map<string, { amount: number; stamp: string }>()
  for (const row of ruleRes.data ?? []) {
    if (!(SERVICE_JAM_RULE_KINDS as readonly string[]).includes(row.kind)) continue
    const amount = dbNumber(row.amount)
    if (amount === null) throw new Error(`서비스 활동 잼 규칙 조회 실패: ${row.kind} 값을 숫자로 읽을 수 없음`)
    ruleByKind.set(row.kind, { amount, stamp: row.updated_at })
  }
  const rules = new Map<ServiceJamRuleKind, { amount: number; stamp: string }>()
  for (const kind of SERVICE_JAM_RULE_KINDS) {
    const row = ruleByKind.get(kind)
    if (!row) throw new Error(`서비스 활동 잼 규칙 조회 실패: ${kind} 행이 없음`)
    rules.set(kind, row)
  }

  const daily = dbNumber(policyRes.data.service_jam_daily_cap)
  if (daily === null) throw new Error(`서비스 활동 잼 상한 조회 실패: ${SERVICE_JAM_DAILY_CAP_KEY} 값을 숫자로 읽을 수 없음`)
  const weekly = dbNumber(policyRes.data.service_jam_weekly_cap)
  if (weekly === null) throw new Error(`서비스 활동 잼 상한 조회 실패: ${SERVICE_JAM_WEEKLY_CAP_KEY} 값을 숫자로 읽을 수 없음`)
  return { rules, policy: { daily, weekly, stamp: policyRes.data.updated_at } }
}

export const SERVICE_JAM_BINDING: BalanceSectionBinding = {
  id: SERVICE_JAM_SECTION_ID,
  fields: SERVICE_JAM_FIELDS,
  validators: Object.fromEntries(SERVICE_JAM_FIELDS.map((def): [string, (n: number) => boolean] => [def.key, (n) => Number.isInteger(n) && n >= 0])),
  zeroWarnings: [
    { keys: [SERVICE_JAM_DAILY_CAP_KEY], message: SERVICE_JAM_DAILY_ZERO_WARNING },
    { keys: [SERVICE_JAM_WEEKLY_CAP_KEY], message: SERVICE_JAM_WEEKLY_ZERO_WARNING },
    { keys: SERVICE_JAM_RULE_KEYS, message: SERVICE_JAM_ALL_RULES_ZERO_WARNING },
  ],

  async read(service) {
    const rows = await readRows(service)
    const values: BalanceValues = {}
    for (const kind of SERVICE_JAM_RULE_KINDS) values[serviceJamRuleKey(kind)] = rows.rules.get(kind)?.amount ?? 0
    values[SERVICE_JAM_DAILY_CAP_KEY] = rows.policy.daily
    values[SERVICE_JAM_WEEKLY_CAP_KEY] = rows.policy.weekly
    return { values, updatedAt: rowsStamp(rows) }
  },

  async write(service, input): Promise<BalanceWriteResult> {
    const rulePatch = new Map<ServiceJamRuleKind, number>()
    // jam_policy는 한 행이라 두 상한을 한 번의 갱신으로 쓴다(수정 시각을 한 번만 올리므로 칸마다 따로 갱신하면 두 번째가 충돌한다).
    const policyPatch: Pick<JamPolicyUpdate, 'service_jam_daily_cap' | 'service_jam_weekly_cap'> = {}
    for (const [key, value] of Object.entries(input.values)) {
      const kind = parseServiceJamRuleKey(key)
      if (kind !== null) rulePatch.set(kind, value)
      else if (key === SERVICE_JAM_DAILY_CAP_KEY) policyPatch.service_jam_daily_cap = value
      else if (key === SERVICE_JAM_WEEKLY_CAP_KEY) policyPatch.service_jam_weekly_cap = value
    }
    const policyTouched = policyPatch.service_jam_daily_cap !== undefined || policyPatch.service_jam_weekly_cap !== undefined
    if (rulePatch.size === 0 && !policyTouched) return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }

    let rows: ServiceJamRows
    try {
      rows = await readRows(service)
    } catch (e) {
      return { ok: false, reason: 'error', message: messageOf(e) }
    }
    if (rowsStamp(rows) !== input.expectedUpdatedAt) return { ok: false, reason: 'conflict' }

    // 종류 순서로 쓰고 `jam_policy`는 마지막이다.
    const ops: RowOp[] = []
    for (const kind of SERVICE_JAM_RULE_KINDS) {
      const value = rulePatch.get(kind)
      if (value === undefined) continue
      const before = rows.rules.get(kind)
      if (!before) return { ok: false, reason: 'error', message: `${kind} 행이 없음` }
      ops.push({
        label: serviceJamRuleKey(kind),
        apply: async () =>
          toRowOutcome(
            await service
              .from('service_jam_rules')
              .update({ amount: value, updated_at: input.nextUpdatedAt })
              .eq('kind', kind)
              .eq('updated_at', before.stamp)
              .select('updated_at')
          ),
        undo: async (appliedStamp) =>
          didUndo(
            await service
              .from('service_jam_rules')
              .update({ amount: before.amount, updated_at: before.stamp })
              .eq('kind', kind)
              .eq('updated_at', appliedStamp)
              .select('updated_at')
          ),
      })
    }
    if (policyTouched) {
      const before = rows.policy
      // 바꾸는 칸만 이전 값으로 되돌린다(바꾸지 않은 칸은 건드리지 않는다)
      const restore: JamPolicyUpdate = { updated_at: before.stamp }
      if (policyPatch.service_jam_daily_cap !== undefined) restore.service_jam_daily_cap = before.daily
      if (policyPatch.service_jam_weekly_cap !== undefined) restore.service_jam_weekly_cap = before.weekly
      ops.push({
        label: 'jam_policy',
        apply: async () =>
          toRowOutcome(
            await service
              .from('jam_policy')
              .update({ ...policyPatch, updated_at: input.nextUpdatedAt })
              .eq('id', 1)
              .eq('updated_at', before.stamp)
              .select('updated_at')
          ),
        undo: async (appliedStamp) =>
          didUndo(await service.from('jam_policy').update(restore).eq('id', 1).eq('updated_at', appliedStamp).select('updated_at')),
      })
    }

    const result = await runRowOps(SERVICE_JAM_SECTION_ID, ops)
    if (!result.ok) return result

    // 구역의 수정 시각 = 이번에 쓴 행들(모두 같은 시각)과 쓰지 않은 행들 가운데 가장 늦은 것
    const untouched = [
      ...[...rows.rules.entries()].filter(([kind]) => !rulePatch.has(kind)).map(([, rule]) => rule.stamp),
      ...(policyTouched ? [] : [rows.policy.stamp]),
    ]
    return { ok: true, updatedAt: latestStamp([...result.stamps, ...untouched]) }
  },
}
