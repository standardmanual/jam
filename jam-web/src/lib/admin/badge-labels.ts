/**
 * 어드민 화면 공용 라벨 맵 (티켓 20260826_004)
 *
 * 어드민은 i18n(ko.ts)을 쓰지 않아 라벨이 화면마다 하드코딩돼 있었고, 배지 타입 라벨만
 * 4곳에 중복 정의돼 있었다. 그 결과 같은 배지 타입이 목록에서는 'POI', 필터바에서는 'POI',
 * 저작 폼의 <option>에서는 **원시 enum `poi`** 로 각각 다르게 보였다.
 * 여기 한 곳으로 모아 "한 곳만 고치면 나머지가 어긋나는" 상태를 없앤다.
 *
 * ⚠️ 어드민은 스테이징에서 검증할 수 없다 — 프로덕션 배포 후 확인한다(기존 운영 제약).
 */
import type { BadgeType, MissionType } from '@/types/database'

/** 저작 폼의 타입 <select> 순서이자 유효값 목록 */
export const BADGE_TYPES: BadgeType[] = ['activity', 'item', 'checkin']

/** badges.type → 어드민 표기. 유저 화면(ko.ts badges.tabActivity 등)과 같은 어휘를 쓴다 */
export const BADGE_TYPE_LABEL: Record<BadgeType, string> = {
  activity: '액티비티',
  item: '아이템',
  checkin: '체크인',
}

/** 모르는 값이 들어와도 화면이 비지 않도록 원시값을 그대로 돌려준다 */
export function badgeTypeLabel(type: string): string {
  return BADGE_TYPE_LABEL[type as BadgeType] ?? type
}

/** 저작 폼의 미션 타입 <select> 순서이자 유효값 목록 */
export const MISSION_TYPES: MissionType[] = [
  'distance', 'checkin', 'activity_count', 'item_collect',
  'streak_days', 'duration_minutes', 'elevation_gain_m', 'engine_condition',
]

/**
 * missions.mission_type → 어드민 표기.
 * 이 맵이 생기기 전에는 한글 라벨 자체가 없어 목록·저작 폼에 원시값(`poi_visit` 등)이
 * 그대로 노출됐다.
 */
export const MISSION_TYPE_LABEL: Record<MissionType, string> = {
  distance: '거리',
  checkin: '체크인',
  activity_count: '활동 횟수',
  item_collect: '아이템 픽업',
  streak_days: '연속 일수',
  duration_minutes: '단일 활동 시간',
  elevation_gain_m: '단일 활동 고도',
  // 티켓 20260906_2231 — 배지엔진 위임 + 미션 전용 어휘 결합 복합 조건(게이트 미션 40종)
  engine_condition: '복합 조건',
}

/** 모르는 값이 들어와도 화면이 비지 않도록 원시값을 그대로 돌려준다 */
export function missionTypeLabel(type: string): string {
  return MISSION_TYPE_LABEL[type as MissionType] ?? type
}

/**
 * 배지 목록 "지점 카테고리" 필터의 sentinel 값(티켓 20260830_1510) — 연결된 지점이
 * 하나도 없는 체크인 배지를 걸러 보는 옵션. 실제 `poi_categories.slug` 값과 충돌하지
 * 않도록 서버(`admin/badges/page.tsx`)와 클라이언트(`BadgesFilterBar.tsx`)가 공유한다.
 */
export const UNASSIGNED_POI_CATEGORY = '__unassigned__'

/**
 * `badges.admin_category` 화이트리스트(마이그레이션 156, 티켓 20260910_2055) — DB CHECK
 * 제약(`badges_admin_category_known_values`)과 같은 값 집합이다. 위 `category`(지점
 * 카테고리, 체크인 전용·poi_categories 참조)와는 완전히 별개다 — `admin_category`는
 * `type`과 무관하게 어느 타입에나 붙을 수 있는 어드민 전용 분류 태그다.
 *
 * 현재는 'jam' 1개뿐이다 — 서비스 사용량 지표(팔로워 수·팔로잉 수·일일 동기화 횟수) 조건
 * 배지를 어드민에서 구분·관리하기 위한 값. 새 값이 필요해지면 CHECK 제약을 넓히는 후속
 * 마이그레이션과 함께 여기도 늘린다.
 */
export const ADMIN_CATEGORIES = ['jam'] as const
export type AdminCategory = (typeof ADMIN_CATEGORIES)[number]

export const ADMIN_CATEGORY_LABEL: Record<AdminCategory, string> = {
  jam: 'JAM!',
}

/** 모르는 값이 들어와도 화면이 비지 않도록 원시값을 그대로 돌려준다. 값이 없으면 null */
export function adminCategoryLabel(category: string | null | undefined): string | null {
  if (!category) return null
  return ADMIN_CATEGORY_LABEL[category as AdminCategory] ?? category
}

/**
 * JAM! 카테고리(서비스 사용량 지표 배지) 판별 — `admin_category` 컬럼으로 직접 판별한다.
 *
 * 이전에는 `condition_json`이 `follower_count`/`following_count`/`daily_sync_count` 중
 * 하나를 갖고 있는지로 간접 판별했다(`badge-condition-guards.ts`의 비공개
 * `USAGE_METRIC_CONDITION_KEYS`). 그 방식은 저장 시점 가드 하나에만 쓰였고 어드민 화면
 * 전반의 분류 기준으로 쓰기엔 조건 필드 구성에 종속적이다 — 컬럼이 생긴 지금부터는 이
 * 함수가 단일 출처다(티켓 20260910_2055).
 */
export function isJamCategoryBadge(adminCategory: string | null | undefined): boolean {
  return adminCategory === 'jam'
}
