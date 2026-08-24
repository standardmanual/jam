/**
 * 알림(소식) 묶음 키 빌더 — 티켓 20260824_019
 * 스펙: DATA_MODEL.md §4 「group_key 설계」
 *
 * ## 왜 모든 키에 type을 접두로 붙이는가
 *
 * UNIQUE 인덱스가 `(user_id, group_key)`라 **type이 키에 들어있지 않다.** 그런데
 * DATA_MODEL §4 표는 소식 1(활동배지)·3(아이템배지)·4(POI배지)에 모두 같은
 * `sync:{strava_activity_id}`를 배정한다. 그대로 구현하면 한 번의 동기화에서
 * 세 종류가 **같은 행으로 병합**되어 payload가 서로를 덮어쓰고 type도 먼저 들어온
 * 하나로 고정된다(착지점이 통째로 어긋난다).
 *
 * 그래서 키를 `{type}:{scope}` 형태로 만든다. 표에 이미 나온 다른 키들
 * (`points:…`·`follow:…`·`slottable:…`)도 사실상 type을 접두로 쓰는 형태이고,
 * 티켓 본문이 제시한 `mission_milestone:{mission_id}:{50|80}`은 정확히 이 규칙이다.
 * 시간창의 의미(하루/6시간/동기화 1회)는 그대로 유지된다.
 */
import type { NotificationType } from '@/types/database'
import { kstDateString, kstSixHourBlock } from './kst'

/** `{type}:{parts…}` — 모든 키 빌더의 기반. 빈 조각은 버린다. */
export function scopedGroupKey(type: NotificationType, ...parts: (string | number)[]): string {
  return [type, ...parts.filter((p) => p !== '' && p !== null && p !== undefined)].join(':')
}

/**
 * 동기화 1회 단위 — `{type}:sync:{stravaActivityId}`
 * 인스타그램의 "게시물 A"에 해당하는 묶음 단위다.
 */
export function syncGroupKey(type: NotificationType, stravaActivityId: number | string): string {
  return scopedGroupKey(type, 'sync', String(stravaActivityId))
}

/** 하루 단위 (KST) — `{type}:{YYYY-MM-DD}` */
export function dailyGroupKey(type: NotificationType, at: Date | string | number = new Date()): string {
  return scopedGroupKey(type, kstDateString(at))
}

/** 6시간 단위 (KST) — `{type}:{YYYY-MM-DD-H{0..3}}` */
export function sixHourGroupKey(type: NotificationType, at: Date | string | number = new Date()): string {
  return scopedGroupKey(type, kstSixHourBlock(at))
}
