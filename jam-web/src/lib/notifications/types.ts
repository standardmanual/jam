/**
 * 알림(소식) 타입 계약 — 티켓 20260824_019 / 20260827_014(전면 개편)
 * 스펙: docs/service/prd/notification/PRD.md §3 / DATA_MODEL.md §5·§6
 *       docs/service/prd/notification/RECAP_CASEBOOK.md · REST_CASEBOOK.md (문구 규칙 R1~R15)
 */
import type { BadgeRarity, NotificationType } from '@/types/database'

export type { NotificationType }

/**
 * dot을 켜지 않는 소식 — ① 보상 획득(활동 결산).
 *
 * Strava 동기화는 webhook이 없어 100% 수동이라, 유저가 버튼을 눌러
 * `BadgeRevealOverlay`로 방금 확인한 것의 재방송이다. dot을 켜면 "새 소식"이 아니라
 * "동기화했음"의 동의어가 되어 신호가 죽는다. 리스트에는 그대로 남는다.
 *
 * **호출부가 `bumps_badge`를 넘기지 않는다.** type 하나로 결정되는 값이라 호출부마다
 * 넘기게 하면 곧 갈린다 — 이 매핑이 유일한 진실이다.
 *
 * 20260827_014 — 결산(`activity_recap`)이 레거시 6종을 대체했다.
 * 20260827_016 — 레거시 6종 행이 전량 삭제돼(`seed_20260827_notifications_reset.sql`)
 * 목록에서도 뺐다. 대상 행이 0이라 dot 규칙이 갈릴 여지가 없다.
 */
export const NON_BUMPING_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'activity_recap',
])

/** type → bumps_badge 파생 (①보상 획득만 false) */
export function bumpsBadgeFor(type: NotificationType): boolean {
  return !NON_BUMPING_NOTIFICATION_TYPES.has(type)
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 활동 결산 payload 조각 (RECAP_CASEBOOK A~F)
// ─────────────────────────────────────────────────────────────────────────────

/** 결산에 담기는 활동배지 1개 */
export interface RecapActivityBadge {
  id: string
  name: string
  /**
   * 등급형은 등급 문자열, **무한레벨형은 `null`**이다 (마이그레이션 130 / 티켓 20260905_0030).
   * payload가 JSONB라 타입이 잡아주지 못하므로, 읽는 쪽(`recapContent`)이 `null`을 `'common'`
   * 으로 접지 않도록 여기서 nullable을 명시한다 — 접으면 Lv.3 배지가 결산에서 Common이 된다.
   */
  rarity: BadgeRarity | null
}

/** 결산에 담기는 체크인 배지 1건 — 같은 배지를 다시 찍으면 `visit`만 다른 새 항목이 된다 */
export interface RecapCheckinBadge {
  badge_id: string
  /** 체크인한 **지점** 이름 (20260826_004 경계 규칙 2 — 배지명이 아니다) */
  poi_name: string
  /** 최초 획득 여부. false면 A5(「N번째 체크인 했어요」) 후보 */
  first: boolean
  /** 몇 번째 체크인인지 */
  visit: number
}

/** 결산에 담기는 아이템 배지 1개 — 착지가 도감이 아니라 **내가 받은 개체**라 인스턴스 id가 축이다 */
export interface RecapItemBadge {
  inventory_item_id: string
  badge_id: string
  name: string
  /**
   * 등급형은 등급 문자열, 등급 없는 배지는 `null`. 드랍 엔진은 등급이 있는 배지만 담지만
   * (`drop-engine/index.ts`), 읽는 쪽이 `null`을 `'common'`으로 접지 않도록 타입을 열어 둔다 —
   * 접는 순간 등급 없는 배지가 조용히 Common으로 표시된다 (티켓 20260905_0030).
   */
  rarity: BadgeRarity | null
  /**
   * 잠긴 채 받은 개체(티켓 20261018_0051, 운영 로직 7.3절). `true`이면 서버가 `badge_id`·`name`을 빈 문자열, `rarity`를 `null`로 싣는다.
   * 결산 문구는 이름·그림·등급 없이 «잠긴 아이템 배지를 받았어요»로만 말한다. 열린 개체에는 이 키가 없다(옛 payload 모양과 같다).
   */
  locked?: boolean
}

/**
 * `payload` 스키마 — 문구 슬롯 + 착지점 계산 재료 (DATA_MODEL §6).
 *
 * **닉네임을 담지 않는다.** 유저가 닉네임을 바꾸면 과거 소식도 따라와야 하므로
 * `actor_user_id`·`user_id`로 조인해 렌더 시점에 읽는다.
 *
 * ## R11 묶음 — `target_count`
 *
 * 같은 종류의 소식이 **대상 2건 이상**이면 한 행으로 접고 착지를 목록 화면으로 올린다
 * (REST_CASEBOOK R11). 접힌 행은 `target_count >= 2`를 갖고, **대상 1건을 가리키는
 * 필드(mission_id·item_book_id·poi_id 등)는 비운다** — 그래서 그 필드들이 선택 필드다.
 * 렌더러·착지 계산이 `target_count`를 먼저 보고 갈라진다.
 */
export interface NotificationPayloadMap {
  /**
   * ① 활동 결산 — RECAP_CASEBOOK A~F가 이 payload의 명세다 (20260827_014).
   *
   * 묶음 단위는 **KST 하루**다. 활동 1건이면 A~E칸, 2건 이상이면 F2로 한 단계 올라간다.
   * 배열 필드는 전부 `appendKeys`로 누적하고 `points`만 `sumKeys`로 더한다 —
   * 보상 발급 지점(배지 엔진·드랍 엔진·포인트)이 서로를 모르는 채 같은 행을 키운다.
   */
  activity_recap: {
    /** 이 결산에 들어간 활동(strava id). 2건 이상이면 F2 — 「활동 N건에서…」 */
    activity_ids?: number[]
    activity_badges?: RecapActivityBadge[]
    checkin_badges?: RecapCheckinBadge[]
    item_badges?: RecapItemBadge[]
    /** 평생 1회 — 있으면 헤드라인을 가져간다(A8·E3) */
    first_badge_id?: string
    /** 포인트는 종류로 세지 않는다. 문장 꼬리에 붙는 부속이다 */
    points?: number
  }

  /**
   * 11 컬렉션 완성 가능 — "완성할 수 있는데 아직 안 넣은" 시점.
   * 묶음(R11)은 `target_count`만 채우고 `item_book_id`를 비운다.
   */
  collection_completable: { item_book_id?: string; book_name?: string; target_count?: number }
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
    /** 픽업된 열린 배지들. 개수 렌더는 이 배열과 `locked_item_ids`의 길이 합을 쓴다. 잠긴 개체만 픽업됐으면 없다 */
    badge_ids?: string[]
    /**
     * 잠긴 채 픽업된 드랍 id들(티켓 20261018_1817, 운영 로직 7.3절) — 어떤 아이템 배지인지 알 수 있는 값을 싣지 않으려고 배지 id 대신 센다.
     * `appendKeys`로 누적한다. 열린 개체만 픽업됐으면 없다.
     */
    locked_item_ids?: string[]
    /** 병합 시 최신 값으로 덮어써진다 — **열린 개체 1개만 픽업됐을 때만** 렌더에 쓴다. 잠긴 개체만 픽업됐으면 없다 */
    badge_name?: string
    poi_id: string | null
  }
  /** 20 미션 진행도 마일스톤 — 50%·80% 돌파, 구간당 1회 */
  mission_milestone: {
    mission_id?: string
    mission_title?: string
    current?: number
    target?: number
    unit?: string
    milestone?: 50 | 80
    /** R11 묶음 — 미션 N개가 목표에 가까워졌어요 */
    target_count?: number
  }
  /**
   * 22 미션 완료 — R4에 따라 **보상을 문구에 넣지 않는다.**
   * `reward_*`는 히스토리·디버깅용으로 남기고 렌더러는 쓰지 않는다.
   */
  mission_completed: {
    mission_id?: string
    mission_title?: string
    reward_badge_count?: number
    reward_points?: number
    /** R11 묶음 — 「{대표} 외 미션 N개를 완료했어요」 */
    target_count?: number
  }
  /**
   * 26 팔로우 — `actor_ids`를 누적해 "2명까지 이름 나열 → 3명+ 외 N명"(PRD §3 L2)을 만든다.
   * `actor_user_id` 1개(최신)만으로는 두 번째 이름을 알 수 없다.
   */
  followed: { actor_ids: string[] }
  /** 40 Strava 끊김 */
  strava_disconnected: Record<string, never>
  /** 44 포인트 지급/차감 (운영진) */
  admin_points_changed: {
    amount: number
    direction: 'grant' | 'deduct'
    /** admin_reason_label (사유 분류 코드). 없으면 null */
    reason: string | null
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 아래는 T2 배치가 생성하는 소식들이다.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 9 컬렉션 장착 가능 — `count`는 넣을 수 있는 **아이템 배지** 수.
   * 묶음(R11)은 컬렉션이 아니라 **배지를 센다** — `count`가 전체 합, `target_count`가 컬렉션 수.
   */
  collection_slottable: {
    item_book_id?: string
    book_name?: string
    count: number
    target_count?: number
  }
  /**
   * 10 완성 임박 — 잔여 1칸(컬렉션당 평생 1회).
   * `badge_name`은 R12(부족한 것을 이름으로)의 슬롯이다 — 단건에서만 성립한다.
   */
  collection_near_complete: {
    item_book_id?: string
    book_name?: string
    badge_name?: string
    target_count?: number
  }
  /** 18 내 드랍 지점 활성 — visitor_count는 POI 열람 고유 인원(본인 제외) */
  drop_spot_active: {
    poi_id?: string
    poi_name?: string
    visitor_count: number
    /** R11 묶음 — 드랍한 N곳에 M명이 다녀갔어요 */
    target_count?: number
  }
  /** 21 마감 임박 — days는 남은 일수, remaining/unit은 남은 목표치 */
  mission_deadline: {
    mission_id?: string
    mission_title?: string
    days: number
    remaining?: number
    unit?: string
    target_count?: number
  }
  /** 23 순위 상승 (상승 시에만 생성한다 — 하락 소식은 만들지 않는다) */
  mission_rank_up: {
    mission_id?: string
    mission_title?: string
    rank?: number
    target_count?: number
  }
  /**
   * 24 종료 결과 — **완료/미완료로 문구가 갈린다.** 목표를 못 채운 참가자에게
   * 「축하해요!」가 나가면 조롱이 된다(PRD §3 ④).
   */
  mission_ended: {
    mission_id?: string
    mission_title?: string
    /** 단건 — 이 유저가 그 미션을 완료했는가 */
    completed?: boolean
    /** 묶음 — 묶인 미션을 **전부** 완료했는가. 하나라도 미완료면 축하를 뺀다 */
    all_completed?: boolean
    target_count?: number
  }
  /**
   * 트라이브 변경에 따른 미션 참가 취소(티켓 20261019_1313, 운영 로직 13.2절).
   * `mission_cancel_for_tribe_change`가 돌려준 (미션 id, 이름) 목록이 한 번의 변경분이다.
   * 개수는 **`missions` 배열 길이**로 센다(`target_count`를 두지 않는다). 여러 개면 한 행으로 접는다.
   */
  mission_participation_cancelled: {
    missions: { mission_id: string; title: string }[]
  }
  /**
   * 챕터 오름(티켓 20261019_1316, 운영 로직 12.3절). 챕터 1 시작도 보낸다(티켓 20261021_1248 — 문구는 «챕터 1을 시작했어요»).
   * 한 번에 여러 챕터를 넘어도 한 건이고 `chapter_no`는 가장 높은 챕터다. 챕터는 숫자로만 표기하므로 이름은 싣지 않는다(2026-10-21 결정).
   * 묶음 키는 `chapter_up:{chapter_no}` + `once`라 같은 챕터 소식은 다시 만들어지지 않는다.
   */
  chapter_up: { chapter_no: number }
  /**
   * 어드민이 트라이브를 바꿨어요(티켓 20261021_1247, 운영 로직 2.4절). 유저 알림에는 사유(코드·메모)를 싣지 않는다 — 운영 기록은 `user_tribe_changes`에만 있다.
   * `new_tribe_name`은 바뀐 트라이브의 이름이다(트라이브 이름이 나중에 바뀌어도 이 소식은 바뀐 때의 이름을 말한다).
   * 묶음 키는 `tribe_changed:{변경 기록 id}` + `once`라 변경 한 번에 소식 한 건이다. 같은 유저를 여러 번 바꾸면 변경마다 한 건씩 쌓인다.
   */
  tribe_changed: { new_tribe_name: string }
  /**
   * 29 팔로잉 희귀 배지 — Epic·Mystic **또는** 무한레벨형 Lv.6 이상
   * (`FOLLOWING_LEVEL_THRESHOLD`, 티켓 20260905_0038).
   * `more_count`는 R15(사람 단위 묶음) — 「소식이 N건 더 있어요」
   */
  following_rare_badge: {
    badge_id: string
    badge_name: string
    /** 등급형·반복형만. 무한레벨형은 **키 자체가 없다**(등급이 존재하지 않는다) */
    rarity?: BadgeRarity
    /** 무한레벨형만. 등급과 배타다 — 둘 중 하나만 들어온다 */
    level?: number
    more_count?: number
  }
  /** 30 팔로잉 컬렉션 완성 */
  following_collection_complete: { item_book_id: string; book_name: string; more_count?: number }
  /** 31 팔로잉 미션 완료 — actor_ids를 누적해 "외 N명"을 만든다 */
  following_mission_complete: {
    mission_id: string
    mission_title: string
    actor_ids: string[]
    more_count?: number
  }
  /** 41 동기화 지연 */
  sync_stalled: { days: number }
  /** 42 인벤토리 포화 */
  inventory_full: { max_slots: number; used_slots: number }
  /**
   * 남은 칸 알림 — 남은 칸이 3개 이하 단계에 들어선 순간 지급 직후 한 번(티켓 20261018_0056, 운영 로직 6.4절). 0개는 만들지 않는다.
   * `remaining_slots`는 알림을 만든 때의 실제 남은 칸(1~3)이다(티켓 20261018_1613). 문구가 과거형(「줄었어요」)이라 시간이 지나도 거짓이 되지 않는다.
   */
  inventory_slots_low: { remaining_slots: 1 | 2 | 3; max_slots: number }
  /** 45 공지·점검 — 투데이 카드 CMS를 착지점으로 재사용한다 */
  announcement: { today_card_id: string; title: string }
}

/** 정의된 type은 전용 payload, 그 외에는 자유 형태 */
export type NotificationPayload<T extends NotificationType> = T extends keyof NotificationPayloadMap
  ? NotificationPayloadMap[T]
  : Record<string, unknown>

// ─────────────────────────────────────────────────────────────────────────────
// 전수 처리 안전망 (20260827_021)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 이미 경고를 남긴 미지 `type` — 프로세스/세션 단위 중복 억제용.
 *
 * 아래 헬퍼는 소식 **행마다·렌더마다** 호출된다. 미지 type 행이 30개 있는 목록을
 * 스크롤하면 억제가 없을 때 경고가 수백 건 쏟아진다.
 */
const warnedUnknownNotificationTypes = new Set<string>()

/**
 * 소식 종류 `switch`의 `default` 분기에서 호출하는 전수 처리 확인 헬퍼.
 *
 * 렌더러가 세 곳(`message.ts`·`href.ts`·`NotificationsClient.tsx`)이라 새 종류를 추가할 때
 * 하나를 빠뜨려도 컴파일이 통과하고 조용히 fallback으로 렌더됐다. 인자 타입이 `never`라
 * 남은 종류가 있으면 **호출 지점이 컴파일 에러**가 된다.
 *
 * **던지지 않는다.** 배포 시차·DB `notification_type` ENUM 잔존값 재유입에 대비한
 * 런타임 fallback은 그대로 살아 있어야 한다 — 던지면 미지 type 행 하나가 목록 전체를
 * 깨뜨린다. 호출부는 이 함수를 부른 뒤 기존 fallback 값을 그대로 반환한다.
 *
 * 로그에는 `type`만 남긴다 (유저 식별자·payload 원문 금지).
 */
export function unknownNotificationType(type: never): void {
  const key = String(type)
  if (warnedUnknownNotificationTypes.has(key)) return
  warnedUnknownNotificationTypes.add(key)
  console.warn('[notifications] 미지 소식 종류', { type: key })
}
