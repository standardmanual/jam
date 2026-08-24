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
import type {
  CreateNotificationArgs,
  NotificationRow,
  NotificationType,
  PoiViewRow,
} from '@/types/database'
import { bumpsBadgeFor, type NotificationPayload } from './types'
import { kstDateString, toValidDate } from './kst'

export * from './types'
export * from './groupKey'
export * from './kst'

/**
 * ## `@ts-expect-error` 대신 좁은 캐스팅을 쓰는 이유
 *
 * `src/types/database.ts`의 `XxxRow`·`XxxArgs`가 `interface`로 선언돼 있어 supabase-js의
 * `GenericSchema` 제약(`Row: Record<string, unknown>`)을 만족하지 못한다 — 인터페이스는
 * 암묵적 인덱스 시그니처를 얻지 못하기 때문이다. 그 결과 `SupabaseClient`의 `Schema`가
 * `never`로 접혀 `.rpc()` 인자는 `undefined`, `.upsert()` 인자는 `never[]`로 추론된다.
 * (리포 전역 문제이고 해소하려면 89곳의 억제 주석을 함께 걷어내야 해 이 티켓 범위 밖이다)
 *
 * `@ts-expect-error`로 덮으면 **원인이 해소되는 순간 그 주석 줄 자체가 컴파일 오류**가
 * 되어 무관한 작업이 빌드를 깨뜨린다. 대신 이 두 호출부만 실제 계약으로 좁혀 둔다 —
 * 인자는 `CreateNotificationArgs`·`PoiViewRow`로 **여전히 타입 검사를 받는다.**
 * (메서드 형태로 호출해야 `this`가 유지되므로 함수만 떼어내지 않고 객체째 캐스팅한다)
 */
interface PostgrestFailure {
  message: string
}

type CreateNotificationRpcClient = {
  rpc: (
    fn: 'create_notification',
    args: CreateNotificationArgs
  ) => PromiseLike<{ data: NotificationRow | null; error: PostgrestFailure | null }>
}

type PoiViewInsert = Omit<PoiViewRow, 'id'>

/**
 * 소식 생성에 쓸 Supabase 클라이언트.
 *
 * 025 배치는 한 번 실행에 수백~수천 건을 만드는데, 호출마다 `createServiceClient()`를
 * 새로 만들면 그만큼 클라이언트 객체가 생성된다. 배치는 클라이언트를 한 번 만들어
 * 주입한다(T1 인라인 호출부는 생략하면 기존과 동일하게 동작).
 */
export type NotificationServiceClient = ReturnType<typeof createServiceClient>

type PoiViewTable = {
  upsert: (
    values: PoiViewInsert,
    options: { onConflict: string; ignoreDuplicates: boolean }
  ) => PromiseLike<{ error: PostgrestFailure | null }>
}

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
  /**
   * 병합 시 **배열로 이어붙이고 중복을 제거**할 payload 키.
   *
   * 행위자가 있는 묶음 소식은 `actor_ids`를 여기에 넣는다 — `actor_count`가
   * 병합 횟수가 아니라 **고유 인원**(`actor_ids`의 중복 제거 후 길이)으로 갱신된다
   * (DATA_MODEL §4-1). 한 사람이 6시간 안에 내 드랍 3건을 픽업해도 1명이어야 한다.
   *
   * 배열 값 필드(#13 `badge_ids` 등)도 넣어야 한다. 기본 병합은 얕은 덮어쓰기라
   * 직전 값이 통째로 사라진다.
   */
  appendKeys?: string[]
  /**
   * 재사용할 service_role 클라이언트. 생략하면 호출마다 새로 만든다.
   * 025 배치처럼 한 실행에서 수백 건을 만드는 경로만 주입한다.
   */
  client?: NotificationServiceClient
}

/**
 * 소식 1건 생성(또는 기존 묶음에 병합).
 *
 * @returns 생성/갱신된 행. **실패해도 예외를 던지지 않고 `null`을 반환한다.**
 */
export async function createNotification<T extends NotificationType>(
  input: CreateNotificationInput<T>
): Promise<NotificationRow | null> {
  const { userId, type, payload, actorUserId, groupKey, mode = 'merge', sumKeys, appendKeys, client } = input

  if (!userId) {
    console.error(`[notifications] createNotification: userId 없음 — type: ${type}`)
    return null
  }

  try {
    const supabase = (client ?? createServiceClient()) as unknown as CreateNotificationRpcClient
    const args: CreateNotificationArgs = {
      p_user_id: userId,
      p_type: type,
      p_payload: (payload ?? {}) as Record<string, unknown>,
      // 호출부가 아니라 type에서 파생 — 매핑의 유일한 진실은 types.ts다
      p_bumps_badge: bumpsBadgeFor(type),
      p_actor_user_id: actorUserId ?? null,
      p_group_key: groupKey ?? null,
      p_mode: mode,
      p_sum_keys: sumKeys ?? null,
      p_append_keys: appendKeys ?? null,
    }
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
    const row: PoiViewInsert = {
      poi_id: poiId,
      user_id: userId,
      viewed_on: kstDateString(at),
      // viewed_on과 같은 가드를 통과한 값이어야 한다 — Invalid Date면 toISOString()이 던진다
      viewed_at: toValidDate(at).toISOString(),
    }
    const table = supabase.from('poi_views') as unknown as PoiViewTable
    const { error } = await table.upsert(row, {
      onConflict: 'poi_id,user_id,viewed_on',
      ignoreDuplicates: true,
    })

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
