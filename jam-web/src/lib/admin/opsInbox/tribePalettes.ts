/**
 * 승인 색 쌍 (티켓 20261007_1145, 상위 20261006_1804). 서버·클라이언트 공용 순수 모듈이다(`server-only`를 두지 않는다).
 *
 * 정본은 `docs/service/content/TRIBES.md`의 「승인 색 쌍」 절이고 이 상수는 같은 값이다(한쪽을 고치면 다른 쪽도 함께 고친다).
 * 트라이브가 있는 카드는 그 트라이브의 쌍만, `tribe_id`가 없는 카드는 공통 쌍만 쓴다. 이력이 없는 트라이브는 목록이 비어 있다.
 * hex는 소문자 `#rrggbb`다.
 */

export interface ApprovedColorPair {
  name: string
  /** 시작색(`image_spec.bg`). */
  bg: string
  /** 끝색(`image_spec.end`). */
  end: string
}

const FOREST_GANG = '73f0f601-2382-900c-8ca2-5cc7c93ed95d'
const POTION_ALCHEMIST = '68f3673f-7d73-996b-b4b9-49600d0f2615'
const ANALOG_COLLECTOR = 'd6969aef-2039-c997-4b55-a7ee861b32c5'

/** 트라이브 ID → 승인 쌍. 목록에 없는 트라이브는 승인 쌍이 없다. */
export const TRIBE_APPROVED_PAIRS: Readonly<Record<string, readonly ApprovedColorPair[]>> = {
  [FOREST_GANG]: [
    { name: '도토리 정산철', bg: '#8a5a2e', end: '#3d2812' },
    { name: '그루터기 살롱', bg: '#8a5a2e', end: '#2a1a0d' },
  ],
  [POTION_ALCHEMIST]: [{ name: '카페인 과부하', bg: '#1a1a1a', end: '#0a5c3d' }],
  [ANALOG_COLLECTOR]: [{ name: '잃어버린 시간', bg: '#6e4a2f', end: '#c9663f' }],
}

/** 트라이브가 없는(`tribe_id` null) 카드의 공통 쌍. */
export const COMMON_APPROVED_PAIRS: readonly ApprovedColorPair[] = [
  { name: '진행 붉은색', bg: '#b83618', end: '#5c1a0c' },
  { name: '날씨 청록', bg: '#158293', end: '#0a3d47' },
  { name: '주말 초록', bg: '#037a49', end: '#052e1c' },
  { name: '컬렉션 마젠타', bg: '#c91f68', end: '#5c0f30' },
  { name: '주간 회색', bg: '#4a4a4a', end: '#171717' },
]

/** 그 카드가 고를 수 있는 승인 쌍. `tribeId`가 null이면 공통 쌍, 트라이브가 있으면 그 트라이브의 쌍만이다(없으면 빈 목록). */
export function approvedPairsOf(tribeId: string | null): readonly ApprovedColorPair[] {
  if (tribeId === null) return COMMON_APPROVED_PAIRS
  return Object.prototype.hasOwnProperty.call(TRIBE_APPROVED_PAIRS, tribeId) ? TRIBE_APPROVED_PAIRS[tribeId] : []
}

/** 그 카드의 승인 쌍 중 이 시작색·끝색과 같은 쌍(대소문자 무시). 없으면 null. */
export function findApprovedPair(tribeId: string | null, bg: string, end: string): ApprovedColorPair | null {
  const lowerBg = bg.toLowerCase()
  const lowerEnd = end.toLowerCase()
  return approvedPairsOf(tribeId).find((pair) => pair.bg === lowerBg && pair.end === lowerEnd) ?? null
}

export function isApprovedPair(tribeId: string | null, bg: string, end: string): boolean {
  return findApprovedPair(tribeId, bg, end) !== null
}
