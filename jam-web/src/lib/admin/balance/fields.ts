/**
 * 밸런스 설정의 칸 값 검증과 초안 계산 (티켓 20261022_1132) — 순수 함수만 있다.
 *
 * 서버(`save.ts`)와 클라이언트 폼(`BalanceSectionForm`)이 같은 함수를 쓴다. 그래서 서버 모듈(`supabase/server` 등)을 가져오지 않는다.
 * 칸 하나의 기준(정수 여부·범위·소수 자릿수)은 칸 정의(`BalanceFieldDef`)가 값으로 들고 있고, DB의 CHECK 제약과 같은 기준이다.
 * 구역 연결(`BalanceSectionBinding.validators`)이 `lib/jam/policy.ts`의 `VALIDATORS`를 얹어 서버가 한 번 더 건다.
 */
import type { BalanceChange, BalanceFieldDef, BalanceValues } from './types'
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
  const message = `${what} 합이 ${RARITY_SUM_TARGET}이어야 해요. 지금은 ${formatBalanceNumber(sum)}이에요.`
  return Object.fromEntries(keys.map((key) => [key, message]))
}
