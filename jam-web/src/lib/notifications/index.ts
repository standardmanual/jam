/**
 * 알림(소식) 생성 라이브러리 (서버 사이드 전용) — 티켓 20260824_019
 * 스펙: Specs/PRD/Notification/PRD.md · DATA_MODEL.md
 *
 * 다른 코드가 한 줄로 소식을 남길 수 있게 하는 것이 이 모듈의 목적이다.
 *
 * ## 설계 원칙 4가지
 *
 * 1. **본 트랜잭션을 절대 깨뜨리지 않는다.** 배지 발급·픽업이 알림 INSERT 실패로
 *    롤백되는 건 본말전도다. 이 모듈의 함수는 예외를 던지지 않는다.
 * 2. **다만 조용히 삼키지 않는다.** 실패는 반드시 `console.error`로 남긴다.
 *    (조용한 실패는 이 프로젝트의 기존 구조적 이슈다 — 새로 만들지 않는다)
 * 3. **`bumps_badge`는 호출부가 넘기지 않는다.** `type`에서 파생한다(types.ts).
 * 4. **닉네임을 `payload`에 박제하지 않는다.** `actor_user_id`로 조인해 렌더 시점에 읽는다.
 *
 * ## 왜 RPC인가
 *
 * 묶음 병합은 `actor_count = actor_count + 1` 같은 **증분 갱신**이 필요한데,
 * PostgREST(`supabase-js`)의 `.upsert()`는 "행 전체 교체"만 표현할 수 있어 이걸
 * 만들 수 없다. 그래서 마이그레이션 096의 `create_notification()` 함수를 호출한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { NotificationRow, NotificationType } from '@/types/database'
import { bumpsBadgeFor, type NotificationPayload } from './types'
import { kstDateString } from './kst'

export * from './types'
export * from './groupKey'
export * from './kst'

export interface CreateNotificationInput<T extends NotificationType> {
  /** 받는 사람 (행위자가 아니다) */
  userId: string
  type: T
  payload?: NotificationPayload<T>
  /** 아바타 탭 대상 — 팔로우·픽업됨·팔로잉 활동에만 있다 */
  actorUserId?: string | null
  /** 묶음 키. 생략/NULL이면 항상 새 행 (groupKey.ts의 빌더 사용) */
  groupKey?: string | null
  /**
   * - `merge`(기본): 같은 `group_key`가 있으면 `actor_count` +1, payload 병합, `updated_at` 갱신
   * - `once`: 같은 `group_key`가 이미 있으면 **아무것도 하지 않는다**.
   *   "구간당 1회"(#20)·"컬렉션당 1회"(#10·#11)처럼 재발송이 곧 다크패턴인 소식용.
   *   merge로 두면 매 동기화마다 `updated_at`이 갱신돼 dot이 다시 켜진다.
   */
  mode?: 'merge' | 'once'
  /** 병합 시 숫자로 더할 payload 키 (예: #5 포인트 적립의 `amount` 일 합계) */
  sumKeys?: string[]
}

/**
 * 소식 1건 생성(또는 기존 묶음에 병합).
 *
 * @returns 생성/갱신된 행. **실패해도 예외를 던지지 않고 `null`을 반환한다.**
 */
export async function createNotification<T extends NotificationType>(
  input: CreateNotificationInput<T>
): Promise<NotificationRow | null> {
  const { userId, type, payload, actorUserId, groupKey, mode = 'merge', sumKeys } = input

  if (!userId) {
    console.error(`[notifications] createNotification: userId 없음 — type: ${type}`)
    return null
  }

  try {
    const supabase = createServiceClient()
    const args = {
      p_user_id: userId,
      p_type: type,
      p_payload: (payload ?? {}) as Record<string, unknown>,
      // 호출부가 아니라 type에서 파생 — 매핑의 유일한 진실은 types.ts다
      p_bumps_badge: bumpsBadgeFor(type),
      p_actor_user_id: actorUserId ?? null,
      p_group_key: groupKey ?? null,
      p_mode: mode,
      p_sum_keys: sumKeys ?? null,
    }
    // @ts-expect-error Supabase rpc() 인자 타입 매칭 제한(옵셔널 필드가 섞인 RPC에서 발생하는 라이브러리 특이 케이스) 우회 — 실제 인자는 create_notification() RPC 시그니처와 일치
    const { data, error } = await supabase.rpc('create_notification', args)

    if (error) {
      console.error(
        `[notifications] 생성 실패 — userId: ${userId}, type: ${type}, groupKey: ${groupKey ?? 'null'}:`,
        error
      )
      return null
    }
    return data as NotificationRow
  } catch (err) {
    // 본 트랜잭션(배지 발급·픽업 등)을 절대 끌고 들어가지 않는다
    console.error(
      `[notifications] 생성 중 예외 — userId: ${userId}, type: ${type}, groupKey: ${groupKey ?? 'null'}:`,
      err
    )
    return null
  }
}

/**
 * POI 열람 기록 — 소식 #18("내 드랍 지점 활성") 계측.
 *
 * `(poi_id, user_id, viewed_on)` UNIQUE + `ON CONFLICT DO NOTHING`이라 같은 유저가
 * 같은 POI를 하루에 여러 번 열어도 1행만 남는다(볼륨 억제 + 고유 인원 집계).
 * `viewed_on`은 **KST 기준 날짜** — UTC로 두면 KST 09:00에 날짜가 바뀌어 하루 중복
 * 억제가 어긋난다.
 *
 * 이 티켓에서는 함수만 만든다. 실제 호출(`PoiCarouselModal` 열림 지점)은 020에서 연결한다.
 *
 * @returns 성공 여부. **실패해도 예외를 던지지 않는다** (계측이 화면을 막으면 안 된다)
 */
export async function recordPoiView(
  poiId: string,
  userId: string,
  at: Date | string | number = new Date()
): Promise<boolean> {
  if (!poiId || !userId) {
    console.error(`[notifications] recordPoiView: 인자 누락 — poiId: ${poiId}, userId: ${userId}`)
    return false
  }

  try {
    const supabase = createServiceClient()
    const row = {
      poi_id: poiId,
      user_id: userId,
      viewed_on: kstDateString(at),
      viewed_at: new Date(at).toISOString(),
    }
    const { error } = await supabase
      .from('poi_views')
      // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiViewRow와 일치
      .upsert(row, { onConflict: 'poi_id,user_id,viewed_on', ignoreDuplicates: true })

    if (error) {
      console.error(`[notifications] recordPoiView 실패 — poiId: ${poiId}, userId: ${userId}:`, error)
      return false
    }
    return true
  } catch (err) {
    console.error(`[notifications] recordPoiView 예외 — poiId: ${poiId}, userId: ${userId}:`, err)
    return false
  }
}
