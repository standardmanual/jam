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
  'streak_days', 'duration_minutes', 'elevation_gain_m',
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
}

/** 모르는 값이 들어와도 화면이 비지 않도록 원시값을 그대로 돌려준다 */
export function missionTypeLabel(type: string): string {
  return MISSION_TYPE_LABEL[type as MissionType] ?? type
}
