/**
 * 컨텐츠 코퍼스 접근 계층 — 공통 타입 (티켓 20260923_2256)
 *
 * 생성 층이 컨텐츠 유형 ID(T01~T17)를 주면 그 유형에 필요한 발췌만 돌려준다.
 * 트라이브 10·컬렉션 100·아이템배지 900의 설명 코퍼스 전체를 프롬프트에 통째로
 * 넣지 않는다는 PRD §4 규칙 4를 지키는 진입점이다 — 자세한 배경은
 * `docs/specs/prd/content-automation/PRD.md` §4·§6 참고.
 */

export const CONTENT_CORPUS_TYPE_IDS = [
  'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09',
  'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17',
] as const

export type ContentCorpusTypeId = (typeof CONTENT_CORPUS_TYPE_IDS)[number]

export function isContentCorpusTypeId(value: string): value is ContentCorpusTypeId {
  return (CONTENT_CORPUS_TYPE_IDS as readonly string[]).includes(value)
}

export type CorpusKind = 'tribe' | 'item_book' | 'badge'

/** 유형별 발췌 상한 기본값(PRD §4 규칙4: "관련 배지·컬렉션·트라이브 각 1~3건"). */
export const DEFAULT_CORPUS_EXCERPT_LIMIT = 3

/** 호출부가 이미 알고 있는 대상 ID(배지 진행률·믹스 레시피·트라이브 소속 등, 이 계층 밖에서 판단). */
export interface ContentCorpusContext {
  tribeIds?: string[]
  itemBookIds?: string[]
  badgeIds?: string[]
}

/** 추천·소개 대상 — 활성 판정을 통과한 것만 여기 담긴다. */
export interface CorpusTarget {
  kind: CorpusKind
  id: string
  name: string
}

/** 본문 인용 — 원문 그대로. 요약·재작성하지 않는다. */
export interface CorpusQuote {
  kind: CorpusKind
  id: string
  text: string
}

/** 종류별 후보 ID 선택 방식 — `explicit`은 호출부가 ID를 준 경우, `auto`는 API가 활성 후보 중에서 순환 선택한 경우다. */
export type CorpusSelectionMode = 'auto' | 'explicit'

export interface CorpusSelection {
  typeId: ContentCorpusTypeId
  targets: CorpusTarget[]
  quotes: CorpusQuote[]
  /** 이번 호출에서 조회한 종류(tribe·item_book·badge)마다 선택 방식을 담는다. 매핑에 없는 유형은 비어 있다. */
  selection: Partial<Record<CorpusKind, CorpusSelectionMode>>
}

/**
 * 유형 → 코퍼스 매핑 (PRD §4·§6, 이 티켓 범위).
 *
 * - `role: 'recommend'`(PRD §4 "추천·소개형" ②⑤⑥⑦⑩⑬⑯): 대상은 활성일 때만 선택되고,
 *   그 대상의 설명이 그대로 quotes에도 실린다. 비활성 대상은 targets·quotes 어디에도
 *   나타나지 않는다.
 * - `role: 'narrative'`(PRD §4 "글·세계관 노출형" ①④⑨⑪⑰ 서사 부분): targets는 비워 두고
 *   quotes만 채운다. 비활성 컨텐츠의 글도 배경 인용으로 포함될 수 있다(PRD §4 규칙2) —
 *   "획득·방문 대상 안내"가 아니라 세계관 배경이라서 활성 여부를 가리지 않는다.
 *
 * 이 티켓 범위 밖 유형(T03·T05·T08·T12·T13·T14·T15·T16)은 날씨·활동기록·POI 등 코퍼스가
 * 아닌 다른 데이터원을 쓰거나 이후 티켓에서 매핑을 추가한다 — 매핑표에 없는 유형 ID는
 * `selectCorpusForType`이 빈 결과를 돌려준다.
 */
export const CONTENT_CORPUS_MAPPING: Partial<
  Record<ContentCorpusTypeId, { role: 'recommend' | 'narrative'; kinds: readonly CorpusKind[] }>
> = {
  T01: { role: 'narrative', kinds: ['tribe', 'item_book'] },
  T02: { role: 'recommend', kinds: ['badge'] },
  T04: { role: 'narrative', kinds: ['tribe', 'item_book'] },
  T06: { role: 'recommend', kinds: ['badge'] },
  T07: { role: 'recommend', kinds: ['badge'] },
  T09: { role: 'narrative', kinds: ['tribe'] },
  T10: { role: 'recommend', kinds: ['badge'] },
  T11: { role: 'narrative', kinds: ['tribe'] },
  T17: { role: 'narrative', kinds: ['tribe'] },
}
