/**
 * 배지 양식의 «잠김으로 만듦»·«여는 데 필요한 양» 검증과 정규화 (티켓 20261018_0051 2회, 운영 로직 7.4절)
 *
 * 순수 파일이다. 어드민 배지 양식(클라이언트 컴포넌트)과 저장 라우트(POST·PUT)가 **같은 함수·같은 문구**를 쓴다.
 * 서버 전용 모듈을 가져오지 않는다 — 최소값은 호출부가 `jam_policy.locked_min_*`에서 읽어 넘긴다(라우트는 `getJamPolicy`, 양식은 서버 페이지가 props로 내림).
 *
 * 규칙
 *  - 아이템 배지(`type='item'`)에만 있는 입력이다. 다른 종류는 값을 저장하지 않는다(`always_locked` false, `unlock_required` null).
 *  - `unlock_required`를 비우면 저장은 null이고 발급 때 등급 최소값을 쓴다(`lib/drop-engine/lockAssignment.ts`).
 *  - 값이 있으면 1 이상의 정수여야 하고 그 등급의 최소값보다 적으면 저장하지 않는다.
 */
import type { BadgeRarity } from '@/types/database'
import type { JamPolicy } from '@/lib/jam/policy'
import { RARITY_LABEL } from '@/lib/rarity'

/** 등급별 최소값(잼). `jam_policy.locked_min_*`와 같은 값이다 */
export type LockedMinimums = Record<BadgeRarity, number>

/** DB 칸(`badges.unlock_required`)이 INTEGER라 넘을 수 없는 상한 */
const INTEGER_MAX = 2_147_483_647

/** 정책 행에서 등급별 최소값만 뽑는다 */
export function lockedMinimumsFrom(
  policy: Pick<JamPolicy, 'locked_min_common' | 'locked_min_rare' | 'locked_min_epic' | 'locked_min_mystic'>
): LockedMinimums {
  return {
    common: policy.locked_min_common,
    rare: policy.locked_min_rare,
    epic: policy.locked_min_epic,
    mystic: policy.locked_min_mystic,
  }
}

/**
 * 입력 값을 저장 값으로 바꾼다. 비어 있으면 `null`(= 등급 최소값을 씀), 1 이상의 정수가 아니면 `'invalid'`.
 * 양식은 문자열, API 본문은 숫자나 null이 올 수 있어 `unknown`으로 받는다.
 */
export function parseUnlockRequired(raw: unknown): number | null | 'invalid' {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' && raw.trim() === '') return null
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  if (!Number.isInteger(value) || value < 1 || value > INTEGER_MAX) return 'invalid'
  return value
}

/**
 * 저장을 막을 까닭. 통과하면 `null`.
 * 아이템 배지가 아니면 검사하지 않는다(저장 값은 `normalizeLockFields`가 비운다).
 */
export function findUnlockRequiredError(
  type: string,
  rarity: BadgeRarity | null,
  rawUnlockRequired: unknown,
  minimums: LockedMinimums
): string | null {
  if (type !== 'item') return null
  const parsed = parseUnlockRequired(rawUnlockRequired)
  if (parsed === null) return null
  if (parsed === 'invalid') {
    return '저장할 수 없습니다. 여는 데 필요한 양은 1 이상의 정수로 적어주세요. 비워 두면 등급 최소값을 써요.'
  }
  if (!rarity) return null
  const min = minimums[rarity]
  if (parsed < min) {
    return `저장할 수 없습니다. 여는 데 필요한 양은 ${RARITY_LABEL[rarity]} 등급 최소값인 ${min}잼 이상이어야 해요. 비워 두면 최소값을 써요.`
  }
  return null
}

/**
 * 저장할 잠금 칸 두 개. 아이템 배지가 아니면 항상 «잠그지 않음·값 없음»이다.
 * `parseUnlockRequired`가 `'invalid'`인 값은 검증(`findUnlockRequiredError`)이 먼저 막으므로 여기서는 null로 둔다.
 */
export function normalizeLockFields(
  type: string,
  alwaysLocked: unknown,
  rawUnlockRequired: unknown
): { always_locked: boolean; unlock_required: number | null } {
  if (type !== 'item') return { always_locked: false, unlock_required: null }
  const parsed = parseUnlockRequired(rawUnlockRequired)
  return { always_locked: alwaysLocked === true, unlock_required: parsed === 'invalid' ? null : parsed }
}
