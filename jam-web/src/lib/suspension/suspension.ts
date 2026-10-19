/**
 * 이용 정지 검사 — 서버 전용 (티켓 20261017_1426, 운영 로직 16.1·16.4절)
 *
 * 「이 유저가 지금 이용 정지 중인가」를 한 곳에서 판정한다. 동기화와 보류 받기가 쓰고, 이후 묶음(캡슐·믹스·드랍·픽업·미션)도
 * 같은 함수를 쓴다. 정지는 운영자만 걸고 풀며, 상태는 `user_suspensions`(service_role 전용)에 있다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 타입·상수·구간 판정은 `suspension-contract.ts`에 있다.
 *
 * 조회가 실패하면 «정지 아님»으로 보지 않고 던진다 — 정지 중인 유저가 조회 실패 틈에 보상을 받으면 안 된다
 * (`countPendingItems`와 같은 원칙).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SuspensionPeriod } from './suspension-contract'

/** 지금 진행 중인 정지 */
export interface ActiveSuspension {
  id: string
  reason: string
  /** ISO 8601 */
  suspendedAt: string
}

/** 이용 정지 중이라 동작을 막을 때 던진다. API 라우트가 403(`code: 'user_suspended'`)으로 바꾼다. */
export class UserSuspendedError extends Error {
  readonly reason: string
  readonly suspendedAt: string

  constructor(suspension: Pick<ActiveSuspension, 'reason' | 'suspendedAt'>) {
    super('이용 정지 중인 유저라 이 동작을 막는다')
    this.name = 'UserSuspendedError'
    this.reason = suspension.reason
    this.suspendedAt = suspension.suspendedAt
  }
}

/** 진행 중인 정지(`lifted_at IS NULL`). 없으면 null. 읽지 못하면 던진다. */
export async function getActiveSuspension(supabase: SupabaseClient, userId: string): Promise<ActiveSuspension | null> {
  const { data, error } = await supabase
    .from('user_suspensions')
    .select('id, reason, suspended_at')
    .eq('user_id', userId)
    .is('lifted_at', null)
    .maybeSingle()
  if (error) throw new Error(`user_suspensions 조회 실패: ${error.message}`)
  if (!data) return null
  const row = data as { id: string; reason: string; suspended_at: string }
  return { id: row.id, reason: row.reason, suspendedAt: row.suspended_at }
}

/** 한 번에 `in()`으로 묻는 유저 수. URL이 길어지지 않게 나눈다 */
const SUSPENDED_LOOKUP_CHUNK = 100

/**
 * 주어진 유저 가운데 지금 이용 정지 중인 유저의 id (티켓 20261019_1311, 미션 순위에서 정지 유저를 빼는 데 쓴다).
 * 진행 중인 정지(`lifted_at IS NULL`)만 센다 — 풀린 유저는 다시 포함된다. 읽지 못하면 던진다.
 */
export async function getSuspendedUserIds(supabase: SupabaseClient, userIds: readonly string[]): Promise<Set<string>> {
  const suspended = new Set<string>()
  const uniqueIds = [...new Set(userIds)]
  for (let i = 0; i < uniqueIds.length; i += SUSPENDED_LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from('user_suspensions')
      .select('user_id')
      .in('user_id', uniqueIds.slice(i, i + SUSPENDED_LOOKUP_CHUNK))
      .is('lifted_at', null)
    if (error) throw new Error(`user_suspensions 목록 조회 실패: ${error.message}`)
    for (const row of (data ?? []) as { user_id: string }[]) suspended.add(row.user_id)
  }
  return suspended
}

/** 지금까지 건 모든 정지의 구간(끝난 것과 진행 중인 것). 없으면 빈 배열. 읽지 못하면 던진다. */
export async function getSuspensionPeriods(supabase: SupabaseClient, userId: string): Promise<SuspensionPeriod[]> {
  const { data, error } = await supabase
    .from('user_suspensions')
    .select('suspended_at, lifted_at')
    .eq('user_id', userId)
  if (error) throw new Error(`user_suspensions 구간 조회 실패: ${error.message}`)
  return ((data ?? []) as { suspended_at: string; lifted_at: string | null }[]).map((row) => ({
    suspendedAt: row.suspended_at,
    liftedAt: row.lifted_at,
  }))
}

/** 이용 정지 중이면 `UserSuspendedError`를 던지고, 아니면 아무 일도 하지 않는다. 조회가 실패하면 그 오류를 던진다. */
export async function assertNotSuspended(supabase: SupabaseClient, userId: string): Promise<void> {
  const active = await getActiveSuspension(supabase, userId)
  if (active) throw new UserSuspendedError(active)
}
