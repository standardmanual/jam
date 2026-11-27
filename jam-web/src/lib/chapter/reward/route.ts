/**
 * 챕터 오름 보상의 발급 경로 값 (티켓 20261127_1732 C3b)
 *
 * 발급 기록(`item_issue_log.route`)의 경로 값을 한 곳에서 정의한다. DB 함수 `chapter_reward_claim`이 `chapter_reward`로 기록한다.
 * 활동 피드에서 뺄 경로(챕터 보상과 옛 캡슐)도 여기서 정해, 프로필 «아이템 드랍» 카드 합성과 잠긴 개체 열기 피드가 같은 목록을 쓴다.
 * 옛 캡슐 값은 리터럴로 둔다 — 이 파일은 `lib/capsule/*`를 가져오지 않는다. 순수 모듈이다.
 */

/** 챕터 오름 보상의 발급 경로 값 */
export const CHAPTER_REWARD_ISSUE_ROUTE = 'chapter_reward'

/** 옛 캡슐의 발급 경로 값(`lib/capsule/open.ts`의 `CAPSULE_ISSUE_ROUTE`와 같다) */
const LEGACY_CAPSULE_ISSUE_ROUTE = 'capsule'

/** 활동 피드에 올리지 않는 발급 경로 */
export const FEED_EXCLUDED_ISSUE_ROUTES: readonly string[] = [CHAPTER_REWARD_ISSUE_ROUTE, LEGACY_CAPSULE_ISSUE_ROUTE]

export function isFeedExcludedIssueRoute(route: string | null | undefined): boolean {
  return typeof route === 'string' && FEED_EXCLUDED_ISSUE_ROUTES.includes(route)
}
