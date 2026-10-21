import type { ActivityType } from '@/types/database'

/**
 * 배지 계열 서열·종목 순서와 잠금 항목 타입 (티켓 20261019_1318 2회로 정리).
 *
 * 서비스의 배지 트리 화면(`/badges/tree`)은 티켓 20261018_1817(2회)에서 제거됐고, 그 화면의 그래프 빌더
 * `buildBadgeActivityTrees`와 그 타입들은 시험만 부르는 코드라 이번에 지웠다. 이 파일에 남은 것은 지금 쓰는 곳이 있는 셋뿐이다:
 *  - `TREE_ACTIVITY_ORDER`: 어드민의 게이트 미션 폼·배지 계열 관리·배지 일괄 변경·배지 목록이 쓰는 종목 순서
 *  - `sortRank`: `badges.sort_order`의 정렬키(어드민 배지 계열 관리·배지 목록)
 *  - `BadgeTreeLock`: 진행 계산 엔진(`badge-engine/badgeProgress.ts`)이 받는 잠금 항목 모양
 * 파일 이름(`badgeTree`)은 그대로 둔다 — 이름을 바꾸면 소스와 시험의 import가 여러 곳 바뀌어 묶음 6으로 미뤘다.
 */

/** 화면에 보여줄 종목 탭 순서 — 티켓 배경 문단의 순서(걷기/러닝/사이클링/등산/트레일러닝) */
export const TREE_ACTIVITY_ORDER: ActivityType[] = [
  'walking', 'running', 'cycling', 'hiking', 'trail_running',
]

/**
 * 표시 순서 정렬키 — `badges.sort_order`(마이그레이션 130, 티켓 20260905_0027)를 그대로 쓴다.
 *
 * `sort_order = 0`은 «아직 설정하지 않음»이라 맨 뒤로 민다.
 * DB 백필 규약: 계열 레일 1~99(계열 안 모든 등급이 같은 값) / 독립 발급 배지 101~ .
 */
const UNSET_SORT_ORDER = Number.MAX_SAFE_INTEGER
/**
 * `export`인 이유: 어드민 계열 관리 화면(`lib/admin/badge-families.ts`)이 같은 순서로 계열을
 * 늘어놓아야 한다. 「`sort_order = 0`은 맨 뒤」는 이 저장소의 다른 `sort_order`
 * (`today_cards`·`tribes`·`item_books`, 0이 앞)와 **반대 관습**이라, 다시 선언하면
 * 습관대로 오름차순 정렬해 배지 트리와 순서가 갈린다(티켓 20260905_0032 B).
 */
export function sortRank(sortOrder: number): number {
  return sortOrder > 0 ? sortOrder : UNSET_SORT_ORDER
}

export interface BadgeTreeLock {
  kind: 'badge' | 'mission'
  /** 선행 배지 이름 또는 미션 제목 — 잠금칩에서 볼드 처리 대상 (20260901 UI 수정) */
  name: string
  href: string
  /** kind='badge'일 때만 의미 있음 — 이 유저가 이 선행 배지를 이미 보유했는지 */
  fulfilled: boolean
  /** 선행 배지 대표 눈금 이미지 또는 미션 이미지 — 잠금 해제 조건 시트용 (20260903_2329) */
  imageUrl: string | null
  /**
   * 시트 항목의 부제를 덮어쓰는 한 줄(「배지 · 어느 등급이든 1개」·「배지 · Rare 이상」).
   *
   * DS 기본값을 「배지」로 낮췄으므로(0036 넘김 항목 4), **참인 문장만** 여기서 명시한다 —
   * 예전엔 「어느 등급이든 1개」가 DS에 하드코딩돼 있어서 등급이 없는 레벨형 계열을 가리킬 때
   * 조용히 거짓말이 나갔다.
   */
  note?: string | null
}
