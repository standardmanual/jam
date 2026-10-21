/**
 * 트라이브 게이트 — 서버 전용 (티켓 20261021_1247 1회, 운영 로직 2장)
 *
 * 「이 유저가 트라이브를 골랐는가」를 한 곳에서 판정한다. 동기화·Strava 연결 시작·콜백이 쓰고, 화면 쪽(레이아웃 등)은
 * 이미 읽는 `users` 행의 `tribe_id`를 `gate-contract.ts`의 `hasTribe`로 같은 기준에 맞춰 판정한다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 상수·판정은 `gate-contract.ts`에 있다.
 *
 * 조회가 실패하면 «트라이브 있음»으로 보지 않고 던진다 — 트라이브가 없는 유저가 읽기 실패 틈에 동기화로 아이템 배지를
 * 받으면 안 된다(`assertNotSuspended`와 같은 원칙). 던진 오류는 `TribeRequiredError`가 아니라 일반 `Error`라서,
 * 라우트는 «트라이브 없음(403)»이 아니라 서버 오류로 다룬다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasTribe } from './gate-contract'

/** 트라이브가 없어 동작을 막을 때 던진다. API 라우트가 403(`code: 'tribe_required'`)으로 바꾼다. */
export class TribeRequiredError extends Error {
  constructor() {
    super('트라이브를 고르지 않은 유저라 이 동작을 막는다')
    this.name = 'TribeRequiredError'
  }
}

/** 유저가 고른 트라이브 id. 아직 고르지 않았거나 `users` 행이 없으면 null. 읽지 못하면 던진다. */
export async function getUserTribeId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
  if (error) throw new Error(`users.tribe_id 조회 실패: ${error.message}`)
  const tribeId = (data as { tribe_id?: unknown } | null)?.tribe_id
  return hasTribe(tribeId) ? tribeId : null
}

/** 트라이브가 없으면 `TribeRequiredError`를 던지고, 있으면 아무 일도 하지 않는다. 조회가 실패하면 그 오류를 던진다. */
export async function assertHasTribe(supabase: SupabaseClient, userId: string): Promise<void> {
  const tribeId = await getUserTribeId(supabase, userId)
  if (tribeId === null) throw new TribeRequiredError()
}
