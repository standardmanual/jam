/**
 * 숨김 배지(`badges.is_hidden`)의 «받기 전 비노출» 판정 — 단일 출처 (티켓 20261018_1815 3회).
 *
 * 숨김 배지는 받기 전까지 배지 트리·다음 목표·상세·공유 응답·개수 어디에도 이름과 조건을 내리지 않는다.
 * 이미 받은 숨김 배지는 다른 배지와 똑같이 보인다. 서버가 화면용 배지 목록을 만들 때 이 함수로 거른다.
 *
 * - 발급·평가 경로(`evaluateBadgesDetailed` 등)는 이 함수를 쓰지 않는다. 숨김 배지도 조건을 채우면 받는다.
 * - 숨김 배지는 액티비티 배지에만 걸 수 있다(마이그레이션 243 제약 `badges_hidden_activity_only`).
 * - 획득 여부는 `user_activity_badges`의 `badge_id` 집합이다. 소프트 삭제 배지는 호출부가 이미 거른다.
 */

/** 숨김 판정에 필요한 최소 필드. 칸이 없는 옛 행·테스트 값은 숨김이 아닌 것으로 본다 */
export interface HiddenFlagged {
  id: string
  is_hidden?: boolean | null
}

/** 받기 전 숨김 배지인가 — true면 이 유저의 응답에 내리지 않는다 */
export function isHiddenUnearned(badge: HiddenFlagged, earnedBadgeIds: ReadonlySet<string>): boolean {
  return badge.is_hidden === true && !earnedBadgeIds.has(badge.id)
}

/** 받기 전 숨김 배지를 뺀 목록. 받은 숨김 배지와 일반 배지는 그대로 남는다 */
export function excludeHiddenUnearned<T extends HiddenFlagged>(badges: readonly T[], earnedBadgeIds: ReadonlySet<string>): T[] {
  return badges.filter((badge) => !isHiddenUnearned(badge, earnedBadgeIds))
}
