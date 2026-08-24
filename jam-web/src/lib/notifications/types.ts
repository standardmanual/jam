/**
 * 알림(소식) 타입 계약 — 티켓 20260824_019
 * 스펙: Specs/PRD/Notification/PRD.md §3 / DATA_MODEL.md §5·§6
 */
import type { BadgeRarity, NotificationType } from '@/types/database'

export type { NotificationType }

/**
 * dot을 켜지 않는 소식 — ① 보상 획득 6종.
 *
 * Strava 동기화는 webhook이 없어 100% 수동이라, 유저가 버튼을 눌러
 * `BadgeRevealOverlay`로 방금 확인한 것의 재방송이다. dot을 켜면 "새 소식"이 아니라
 * "동기화했음"의 동의어가 되어 신호가 죽는다. 리스트에는 그대로 남는다.
 *
 * **호출부가 `bumps_badge`를 넘기지 않는다.** type 하나로 결정되는 값이라 호출부마다
 * 넘기게 하면 곧 갈라진다 — 이 매핑이 유일한 진실이다.
 */
export const NON_BUMPING_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'badge_earned',
  'rare_badge_earned',
  'item_badge_earned',
  'poi_badge_earned',
  'points_earned',
  'first_badge',
])

/** type → bumps_badge 파생 (①보상 획득 6종만 false) */
export function bumpsBadgeFor(type: NotificationType): boolean {
  return !NON_BUMPING_NOTIFICATION_TYPES.has(type)
}

/**
 * `payload` 스키마 — 문구 슬롯 + 착지점 계산 재료 (DATA_MODEL §6).
 *
 * **닉네임을 담지 않는다.** 유저가 닉네임을 바꾸면 과거 소식도 따라와야 하므로
 * `actor_user_id`·`user_id`로 조인해 렌더 시점에 읽는다.
 *
 * 이 티켓(T1 인라인)에서 실제로 생성하는 종류만 정의한다. 나머지(T2 배치·어드민)는
 * 021 티켓에서 추가한다 — 정의되지 않은 type은 자유 형태 payload를 받는다.
 */
export interface NotificationPayloadMap {
  /** 1 활동배지 획득 — 묶음은 `/badges?tab=activity&highlight=`, 단건은 `/badges/[id]` */
  badge_earned: { badge_ids: string[]; count: number; activity_id?: number }
  /** 2 희귀 배지 획득 — badge_earned 묶음에서 승격 분리된 개별 소식 */
  rare_badge_earned: { badge_id: string; badge_name: string; rarity: BadgeRarity }
  /** 3 아이템 배지 획득 — 착지점이 도감이 아니라 **인벤토리 인스턴스**라 item id를 담는다 */
  item_badge_earned: { inventory_item_ids: string[]; count: number; activity_id?: number }
  /** 4 POI 배지 획득 — 단건 렌더는 badge_id/poi_name, 묶음 렌더는 배열+count */
  poi_badge_earned: {
    badge_id: string
    poi_name: string
    badge_ids: string[]
    poi_names: string[]
    count: number
    activity_id?: number
  }
  /** 5 포인트 적립 — 하루 단위 묶음이라 amount는 병합 시 합산된다(sumKeys) */
  points_earned: { amount: number; reason: string }
  /** 7 첫 배지 */
  first_badge: { badge_id: string }
  /** 11 컬렉션 완성 가능 — "완성할 수 있는데 아직 안 넣은" 시점 */
  collection_completable: { item_book_id: string; book_name: string }
  /**
   * 13 픽업됨 — 받는 사람은 **드랍한 사람**이다.
   *
   * `actor_ids`·`badge_ids`는 `appendKeys`로 누적한다(중복 제거). 얕은 병합으로 두면
   * 6시간 창의 픽업 3건이 **마지막 배지 하나만** 남기고, `actor_count`도 인원이 아니라
   * 병합 횟수가 되어 "예린님 외 2명"이라는 거짓말이 된다 (DATA_MODEL §4-1).
   */
  drop_picked_up: {
    /** 픽업한 사람들. 중복 제거 후 길이가 곧 `actor_count`(고유 인원)다 */
    actor_ids: string[]
    /** 픽업된 배지들. 개수 렌더는 이 배열의 길이를 쓴다 */
    badge_ids: string[]
    /** 병합 시 최신 값으로 덮어써진다 — **`badge_ids.length === 1`일 때만** 렌더에 쓴다 */
    badge_name: string
    poi_id: string | null
  }
  /** 20 미션 진행도 마일스톤 — 50%·80% 돌파, 구간당 1회 */
  mission_milestone: {
    mission_id: string
    mission_title: string
    current: number
    target: number
    unit: string
    milestone: 50 | 80
  }
  /** 22 미션 완료 + 보상 (한 건으로 합침) */
  mission_completed: {
    mission_id: string
    mission_title: string
    reward_badge_count: number
    reward_points: number
  }
  /**
   * 26 팔로우 — `actor_ids`를 누적해 "2명까지 이름 나열 → 3명+ 외 N명"(PRD §3 L2)을 만든다.
   * `actor_user_id` 1개(최신)만으로는 두 번째 이름을 알 수 없다.
   */
  followed: { actor_ids: string[] }
  /** 27 맞팔 성립 */
  mutual_follow: Record<string, never>
  /** 40 Strava 끊김 */
  strava_disconnected: Record<string, never>
  /** 44 포인트 지급/차감 (운영진) */
  admin_points_changed: {
    amount: number
    direction: 'grant' | 'deduct'
    /** admin_reason_label (사유 분류 코드). 없으면 null */
    reason: string | null
  }
}

/** 정의된 type은 전용 payload, 그 외에는 자유 형태 */
export type NotificationPayload<T extends NotificationType> = T extends keyof NotificationPayloadMap
  ? NotificationPayloadMap[T]
  : Record<string, unknown>
