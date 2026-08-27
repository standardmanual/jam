/**
 * 알림(소식) 묶음 키 빌더 — 티켓 20260824_019
 * 스펙: DATA_MODEL.md §4-2 「group_key 설계」
 *
 * ## 왜 모든 키에 type을 접두로 붙이는가
 *
 * UNIQUE 인덱스가 `(user_id, group_key)`라 **type이 키에 들어있지 않다.** type을 빼고
 * 시간창(scope)만 키로 쓰면 서로 다른 종류의 소식이 **같은 행으로 병합**되어 payload가
 * 서로를 덮어쓰고 type도 먼저 들어온 하나로 고정된다(착지점이 통째로 어긋난다).
 *
 * 실제로 겪은 사례가 근거다 — **구** §4-2 표(014 이전)는 구 소식 1(활동배지)·3(아이템배지)·
 * 4(POI배지)에 모두 같은 `sync:{strava_activity_id}`를 배정했고, 그대로 구현하면 한 번의
 * 동기화에서 세 종류가 충돌했다. (세 종류는 티켓 20260827_014에서 활동 결산
 * `activity_recap` 1종으로 재편되며 묶음 축이 KST 하루(`dailyGroupKey`)로 바뀌었다 —
 * 지금은 `sync` 축을 쓰는 소식이 없어 **현행 §4-2 표에는 그 행이 없다.** 표를 열어
 * `sync` 행을 찾지 말 것)
 *
 * 그래서 키를 `{type}:{scope}` 형태로 만든다. 현행 §4-2 표의 다른 키들
 * (`followed:…`·`drop_picked_up:…`·`collection_completable:…`)도 전부 type을 접두로 쓰고,
 * `mission_milestone:{mission_id}:{50|80}`은 정확히 이 규칙이다.
 * scope의 의미는 그대로 유지된다 — 시간창(하루/6시간)이거나, 014에서 추가된
 * 대상 집합의 지문(`groupedTargetsKey`)이다.
 */
import type { NotificationType } from '@/types/database'
import { kstDateString, kstSixHourBlock } from './kst'

/** `{type}:{parts…}` — 모든 키 빌더의 기반. 빈 조각은 버린다. */
export function scopedGroupKey(type: NotificationType, ...parts: (string | number)[]): string {
  return [type, ...parts.filter((p) => p !== '' && p !== null && p !== undefined)].join(':')
}

/** 하루 단위 (KST) — `{type}:{YYYY-MM-DD}` */
export function dailyGroupKey(type: NotificationType, at: Date | string | number = new Date()): string {
  return scopedGroupKey(type, kstDateString(at))
}

/** 6시간 단위 (KST) — `{type}:{YYYY-MM-DD-H{0..3}}` */
export function sixHourGroupKey(type: NotificationType, at: Date | string | number = new Date()): string {
  return scopedGroupKey(type, kstSixHourBlock(at))
}

/**
 * R11 묶음 키 — 대상 2건 이상을 한 행으로 접을 때 쓴다 (티켓 20260827_014).
 *
 * ## 왜 대상 집합의 지문(fingerprint)인가
 *
 * 묶기 전 각 소식은 대상 단위 키 + `once`로 **재발송을 막고 있었다**
 * (`collection_near_complete:{book_id}`는 컬렉션당 평생 1회). 묶음 키를 날짜 단위로
 * 바꾸면 그 보장이 사라져 같은 상태를 매일 다시 알린다.
 *
 * 그래서 키에 **대상 집합 자체**를 넣는다. 집합이 그대로면 키가 같아 `once`가 막고,
 * 대상이 하나라도 늘거나 빠지면 새 상태이므로 새 키가 된다.
 *
 * 대상 id를 그대로 이어 붙이면 컬렉션 100개 × UUID 36자로 키가 3KB를 넘어
 * `(user_id, group_key)` UNIQUE 인덱스의 btree 상한(≈2704B)에 걸린다. 그래서 **해시**한다.
 * 충돌해도 같은 유저의 같은 종류 안에서만 문제가 되고 확률이 무시할 수준이라
 * 암호학적 해시를 쓰지 않는다(FNV-1a 32비트 2벌 = 64비트).
 */
export function groupFingerprint(parts: readonly string[]): string {
  const joined = [...parts].sort().join('|')
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** `{type}:group:{scope…}:{지문}` — R11로 접힌 행의 묶음 키 */
export function groupedTargetsKey(
  type: NotificationType,
  targetKeys: readonly string[],
  ...scope: (string | number)[]
): string {
  return scopedGroupKey(type, 'group', ...scope, groupFingerprint(targetKeys))
}
