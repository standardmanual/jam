/**
 * 밸런스 설정의 칸 값 검증과 초안 계산 (티켓 20261022_1132) — 순수 함수만 있다.
 *
 * 서버(`save.ts`)와 클라이언트 폼(`BalanceSectionForm`)이 같은 함수를 쓴다. 그래서 서버 모듈(`supabase/server` 등)을 가져오지 않는다.
 * 칸 하나의 기준(정수 여부·범위·소수 자릿수)은 칸 정의(`BalanceFieldDef`)가 값으로 들고 있고, DB의 CHECK 제약과 같은 기준이다.
 * 구역 연결(`BalanceSectionBinding.validators`)이 `lib/jam/policy.ts`의 `VALIDATORS`를 얹어 서버가 한 번 더 건다.
 */
import type { BalanceChange, BalanceFieldDef, BalanceSnapshot, BalanceValues, BalanceZeroWarning } from './types'
import { INTEGER_MAX } from './types'

/** 등급 확률 네 칸의 합계 기준과 허용 오차 — DB 제약(`jam_policy_sync_rarity_sum_100` 등)과 같다. */
export const RARITY_SUM_TARGET = 100
export const RARITY_SUM_TOLERANCE = 0.001

/** 소수 자릿수 허용 오차(부동소수 곱셈 오차를 넘기기 위한 값). */
const DECIMAL_EPSILON = 1e-7

/** 화면·문장에 쓰는 숫자 글자(천 단위 쉼표, 소수는 필요한 자리까지). */
export function formatBalanceNumber(n: number): string {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 6 })
}

/**
 * 입력 글자를 숫자로 읽는다. 숫자와 소수점만 받는다(앞뒤 공백은 버린다). `1e3`·`0x10`·쉼표·빈 글자는 `null`이다.
 */
export function parseDraftNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** DB 숫자 칸을 숫자로 읽는다. NUMERIC이 문자열로 내려올 수 있다. 숫자가 아니면 `null`. */
export function dbNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * 0~1로 저장된 비율(`NUMERIC(4,3)`)을 화면 단위인 퍼센트(소수 첫째 자리)로 바꾼다. 0.333 → 33.3.
 * 곱셈만 하면 `0.333 * 100 = 33.300000000000004`처럼 어긋나서 입력칸에 긴 소수가 보이고 «바뀐 칸»으로 잘못 센다. 저장 눈금(0.001)으로 반올림해 지운다.
 */
export function fractionToPercent(fraction: number): number {
  return Math.round(fraction * 1000) / 10
}

/** 화면 퍼센트(소수 첫째 자리)를 0~1 저장값(`NUMERIC(4,3)`)으로 바꾼다. 33.3 → 0.333. `fractionToPercent`의 거꾸로이고 왕복해도 어긋나지 않는다. */
export function percentToFraction(percent: number): number {
  return Math.round(percent * 10) / 1000
}

/** 이력처럼 칸이 어느 묶음 것인지 함께 보여야 할 때의 이름(예: «강도 배율 · 가벼움»). 묶음이 없으면 라벨만. */
export function fullFieldLabel(def: BalanceFieldDef): string {
  return def.group ? `${def.group} · ${def.label}` : def.label
}

const DECIMAL_ORDINALS =['', '첫째', '둘째', '셋째', '넷째']

/** 범위를 알리는 문장. 정수 칸의 상한이 DB 정수 한계이면 «이상»만 쓴다. */
export function rangeMessage(def: BalanceFieldDef): string {
  if (def.decimals === 0) {
    return def.max >= INTEGER_MAX
      ? `${formatBalanceNumber(def.min)} 이상의 정수로 입력해 주세요.`
      : `${formatBalanceNumber(def.min)} 이상 ${formatBalanceNumber(def.max)} 이하의 정수로 입력해 주세요.`
  }
  const places = DECIMAL_ORDINALS[def.decimals] ?? `${def.decimals}번째`
  return `${formatBalanceNumber(def.min)} 이상 ${formatBalanceNumber(def.max)} 이하로 입력해 주세요. 소수는 ${places} 자리까지 쓸 수 있어요.`
}

/** 칸 하나의 값을 검사한다. 통과하면 `null`, 아니면 칸 아래에 보일 문장. */
export function checkFieldValue(def: BalanceFieldDef, n: number): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '숫자로 입력해 주세요.'
  if (def.decimals === 0) {
    if (!Number.isInteger(n)) return rangeMessage(def)
  } else {
    const scaled = n * 10 ** def.decimals
    if (Math.abs(scaled - Math.round(scaled)) > DECIMAL_EPSILON) return rangeMessage(def)
  }
  if (n < def.min || n > def.max) return rangeMessage(def)
  return null
}

/** 저장된 값으로 초안(칸 이름 → 입력 글자)을 만든다. */
export function draftFromValues(fields: readonly BalanceFieldDef[], values: BalanceValues): Record<string, string> {
  const draft: Record<string, string> = {}
  for (const def of fields) draft[def.key] = String(values[def.key] ?? def.defaultValue)
  return draft
}

/** 초안의 칸별 오류. 오류가 없는 칸은 키가 없다. */
export function draftErrors(fields: readonly BalanceFieldDef[], draft: Readonly<Record<string, string>>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const def of fields) {
    const text = draft[def.key] ?? ''
    if (text.trim() === '') {
      errors[def.key] = '값을 입력해 주세요.'
      continue
    }
    const n = parseDraftNumber(text)
    const message = n === null ? '숫자로 입력해 주세요.' : checkFieldValue(def, n)
    if (message) errors[def.key] = message
  }
  return errors
}

/** 초안 중 저장된 값과 **다른** 칸의 키와 새 값. 읽을 수 없는 글자는 바뀐 것으로 세지 않는다(오류가 따로 알린다). */
export function draftChangedValues(
  fields: readonly BalanceFieldDef[],
  saved: BalanceValues,
  draft: Readonly<Record<string, string>>
): BalanceValues {
  const changed: BalanceValues = {}
  for (const def of fields) {
    const n = parseDraftNumber(draft[def.key] ?? '')
    if (n !== null && n !== saved[def.key]) changed[def.key] = n
  }
  return changed
}

/** 현재 값과 새 값을 견주어 **바뀐 칸만** 이력 줄로 만든다. 칸 정의 순서를 따른다. */
export function diffValues(fields: readonly BalanceFieldDef[], current: BalanceValues, next: BalanceValues): BalanceChange[] {
  const changes: BalanceChange[] = []
  for (const def of fields) {
    const to = next[def.key]
    const from = current[def.key]
    if (to === undefined || from === undefined || to === from) continue
    changes.push({ field: def.key, from, to })
  }
  return changes
}

/** 합이 어긋났을 때의 문장. 서버(`validateSumTo100`)와 화면의 합계 줄이 같은 문장을 쓴다. */
export function sumMismatchMessage(what: string, sum: number): string {
  return `${what} 합이 ${RARITY_SUM_TARGET}이어야 해요. 지금은 ${formatBalanceNumber(sum)}이에요.`
}

/**
 * 칸들의 합이 100(±0.001)인지 검사한다(등급 확률 네 칸). 맞으면 빈 객체, 아니면 **합에 든 모든 칸**에 같은 문장을 붙인다.
 * `keys`의 칸이 하나라도 숫자가 아니면 합을 알 수 없어 검사하지 않는다(칸별 검사가 먼저 알린다).
 */
export function validateSumTo100(values: BalanceValues, keys: readonly string[], what = '등급 확률'): Record<string, string> {
  let sum = 0
  for (const key of keys) {
    const n = values[key]
    if (typeof n !== 'number' || !Number.isFinite(n)) return {}
    sum += n
  }
  if (Math.abs(sum - RARITY_SUM_TARGET) < RARITY_SUM_TOLERANCE) return {}
  const message = sumMismatchMessage(what, sum)
  return Object.fromEntries(keys.map((key) => [key, message]))
}

/** 합계를 맞춰야 하는 칸 묶음(`sumTo`를 지정한 칸이 모인 `group`) 하나의 지금 합계. */
export interface BalanceGroupSum {
  /** 묶음 소제목. 화면이 이 묶음 아래에 합계를 보인다. */
  title: string
  target: number
  unit?: string
  /** 초안 합계. 읽을 수 없는 칸이 있으면 `null`(칸별 오류가 먼저 알린다). */
  sum: number | null
  /** 합계가 맞는지. 합계를 알 수 없으면 `false`가 아니라 `true`다(칸 오류가 따로 저장을 막는다). */
  ok: boolean
  /** 어긋났을 때의 문장. 맞으면 `null`. */
  message: string | null
}

/** 초안에서 묶음마다 합계를 낸다. 묶음 순서는 칸 정의 순서를 따른다. */
export function groupSums(fields: readonly BalanceFieldDef[], draft: Readonly<Record<string, string>>): BalanceGroupSum[] {
  const byGroup = new Map<string, BalanceFieldDef[]>()
  for (const def of fields) {
    if (def.sumTo === undefined || def.group === undefined) continue
    const list = byGroup.get(def.group)
    if (list) list.push(def)
    else byGroup.set(def.group, [def])
  }
  return [...byGroup.entries()].map(([title, defs]) => {
    const target = defs[0].sumTo ?? RARITY_SUM_TARGET
    let sum: number | null = 0
    for (const def of defs) {
      const n = parseDraftNumber(draft[def.key] ?? '')
      if (n === null) {
        sum = null
        break
      }
      sum += n
    }
    const ok = sum === null || Math.abs(sum - target) < RARITY_SUM_TOLERANCE
    return { title, target, unit: defs[0].unit, sum, ok, message: ok || sum === null ? null : sumMismatchMessage(title, sum) }
  })
}

/** 초안에서 **모두 0**이 된 경고 묶음의 문장들. */
export function activeZeroWarnings(
  warnings: readonly BalanceZeroWarning[] | undefined,
  draft: Readonly<Record<string, string>>
): string[] {
  if (!warnings) return []
  return warnings.filter((warning) => warning.keys.every((key) => parseDraftNumber(draft[key] ?? '') === 0)).map((warning) => warning.message)
}

/** 바뀐 칸을 «확률 안내에 반영되는 칸»과 그 밖의 칸으로 나눈다. 칸 정의 순서를 따른다. */
export function splitDisclosureChanges(
  fields: readonly BalanceFieldDef[],
  saved: BalanceValues,
  changed: BalanceValues
): { disclosure: BalanceChange[]; others: BalanceChange[] } {
  const affects = new Set(fields.filter((def) => def.affectsDisclosure).map((def) => def.key))
  const changes = diffValues(fields, saved, changed)
  return {
    disclosure: changes.filter((change) => affects.has(change.field)),
    others: changes.filter((change) => !affects.has(change.field)),
  }
}

export type SnapshotVerdict = 'same' | 'adopt' | 'reset'

/**
 * 화면을 새로 읽었을 때 서버 값(`next`)과 폼이 들고 있는 값(`prev`)을 견준다.
 * - `same`: 수정 시각이 같다. 아무것도 하지 않는다.
 * - `adopt`: 수정 시각만 달라졌고 **이 구역의 칸 값은 그대로**다(같은 행을 쓰는 다른 구역이 저장했다). 고치던 초안을 지키고 새 수정 시각만 받는다.
 * - `reset`: 이 구역의 칸 값이 달라졌다. 초안을 서버 값으로 다시 만든다.
 */
export function reconcileSnapshot(fields: readonly BalanceFieldDef[], prev: BalanceSnapshot, next: BalanceSnapshot): SnapshotVerdict {
  if (prev.updatedAt === next.updatedAt) return 'same'
  return fields.every((def) => prev.values[def.key] === next.values[def.key]) ? 'adopt' : 'reset'
}
