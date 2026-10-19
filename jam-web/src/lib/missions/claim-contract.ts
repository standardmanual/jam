/**
 * 미션 아이템 배지 보상 — DB 함수 반환 계약 (티켓 20261019_1313, 마이그레이션 250, 운영 로직 13.2절·6.4절)
 *
 * `mission_grant_item_rewards`(지급)와 `mission_claim_item_rewards`(받기)가 돌려주는 JSON을 앱이 다루는 모양으로 읽는다.
 * 모양이 계약과 다르면 `null`이다 — 호출한 쪽이 «성공으로 보지 않고» 기록한 뒤 멈춘다(fail-closed).
 *
 * 서버 의존이 없는 순수 모듈이다. 클라이언트가 타입이나 오류 코드를 가져와도 안전하다.
 */

/** 지급 함수의 실패 코드 */
export type GrantItemRewardsErrorCode = 'mission_not_found' | 'inventory_not_found'

export type GrantItemRewardsResult =
  | {
      ok: true
      /** none: 줄 것이 없음(아이템 배지가 없거나 이미 기록됨) · granted: 모두 새 개체로 줌 · pending: 빈칸이 모자라 모두 받지 않은 보상으로 기록 */
      status: 'none' | 'granted' | 'pending'
      itemIds: string[]
      pendingCount: number
      /** `pending`일 때 지금 인벤토리 빈칸 수 */
      free?: number
      /** `pending`일 때 모두 받으려면 필요한 빈칸 수 */
      needed?: number
    }
  | { ok: false; error: GrantItemRewardsErrorCode }

/** 받기 함수의 실패 코드 */
export type ClaimItemRewardsErrorCode = 'user_suspended' | 'no_pending' | 'insufficient_slots' | 'inventory_not_found'

export type ClaimItemRewardsResult =
  | { ok: true; granted: number; itemIds: string[] }
  | {
      ok: false
      error: ClaimItemRewardsErrorCode
      /** `insufficient_slots`일 때 지금 인벤토리 빈칸 수 */
      free?: number
      /** `insufficient_slots`일 때 받으려면 필요한 빈칸 수 */
      needed?: number
    }

/**
 * 받기 API가 실패 코드마다 돌려주는 HTTP 상태. `user_suspended`는 이용 정지 공통 응답(403, `USER_SUSPENDED_CODE`)이라 여기에 없다.
 * 문구는 라우트가 `d.missions.claim`에서 고른다.
 */
export const CLAIM_ITEM_REWARDS_ERROR_STATUS: Record<Exclude<ClaimItemRewardsErrorCode, 'user_suspended'>, number> = {
  no_pending: 409,
  insufficient_slots: 409,
  inventory_not_found: 404,
}

const GRANT_ERROR_CODES: readonly string[] = ['mission_not_found', 'inventory_not_found']
const GRANT_STATUSES: readonly string[] = ['none', 'granted', 'pending']
const CLAIM_ERROR_CODES: readonly string[] = ['user_suspended', 'no_pending', 'insufficient_slots', 'inventory_not_found']

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/** 문자열 배열이면 그대로, 없으면 빈 배열, 그 밖의 모양이면 null */
function readIdList(value: unknown): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return null
  return value as string[]
}

function readCount(value: unknown): number | null {
  if (value === undefined || value === null) return 0
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** `mission_grant_item_rewards` 응답을 읽는다. 계약 밖의 모양이면 null. */
export function parseGrantItemRewardsResult(raw: unknown): GrantItemRewardsResult | null {
  const r = asRecord(raw)
  if (!r || typeof r.ok !== 'boolean') return null

  if (!r.ok) {
    if (typeof r.error !== 'string' || !GRANT_ERROR_CODES.includes(r.error)) return null
    return { ok: false, error: r.error as GrantItemRewardsErrorCode }
  }

  if (typeof r.status !== 'string' || !GRANT_STATUSES.includes(r.status)) return null
  const itemIds = readIdList(r.itemIds)
  const pendingCount = readCount(r.pendingCount)
  if (itemIds === null || pendingCount === null) return null

  const result: GrantItemRewardsResult = {
    ok: true,
    status: r.status as 'none' | 'granted' | 'pending',
    itemIds,
    pendingCount,
  }
  if (r.free !== undefined) result.free = Number(r.free)
  if (r.needed !== undefined) result.needed = Number(r.needed)
  return result
}

/** `mission_claim_item_rewards` 응답을 읽는다. 계약 밖의 모양이면 null. */
export function parseClaimItemRewardsResult(raw: unknown): ClaimItemRewardsResult | null {
  const r = asRecord(raw)
  if (!r || typeof r.ok !== 'boolean') return null

  if (r.ok) {
    const itemIds = readIdList(r.itemIds)
    const granted = readCount(r.granted)
    if (itemIds === null || granted === null) return null
    return { ok: true, granted, itemIds }
  }

  if (typeof r.error !== 'string' || !CLAIM_ERROR_CODES.includes(r.error)) return null
  const result: ClaimItemRewardsResult = { ok: false, error: r.error as ClaimItemRewardsErrorCode }
  if (r.free !== undefined) result.free = Number(r.free)
  if (r.needed !== undefined) result.needed = Number(r.needed)
  return result
}
