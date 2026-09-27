/**
 * 유형별 선별 발췌 (티켓 20260923_2256, PRD §4; 후보 ID 자동 선택 티켓 20260927_2034)
 *
 * `selectCorpusForType`은 코퍼스 전체를 읽지 않는다 — `CONTENT_CORPUS_MAPPING`이 정한
 * 종류(tribe·item_book·badge)만 조회한다. 종류별로 호출부가 ID 목록을 주면 그 안에서
 * `limit`건 이내로 조회하고(`explicit`), ID가 없거나 빈 목록이면 활성 후보 중에서
 * ISO 주차 순환으로 `limit`건을 자동 선택한다(`auto`). 원문(`description`·`tagline`·
 * `story_text`)은 요약·재작성 없이 그대로 돌려준다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { kstDateString } from '@/lib/notifications/kst'
import { fetchActiveBadges, listActiveBadgeIds, listActiveItemBookIds, listActiveTribeIds } from './active'
import {
  CONTENT_CORPUS_MAPPING,
  DEFAULT_CORPUS_EXCERPT_LIMIT,
  type ContentCorpusContext,
  type ContentCorpusTypeId,
  type CorpusQuote,
  type CorpusSelection,
  type CorpusSelectionMode,
  type CorpusTarget,
} from './types'

/**
 * KST 기준 ISO 8601 주차를 「연도×53+주차」 정수로 뭉친 값 — 연도가 바뀌어도 순환 시작
 * 위치가 튀지 않게 하나의 오름차순 값으로 쓴다(53은 ISO 주차가 가질 수 있는 최댓값).
 * `kstDateString`으로 KST 벽시계 날짜를 얻은 뒤 표준 ISO 주차 계산(목요일 기준)을 적용한다.
 */
export function isoWeekOrdinal(now: Date = new Date()): number {
  const [y, m, d] = kstDateString(now).split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const isoWeekday = date.getUTCDay() || 7 // 월=1 ... 일=7
  date.setUTCDate(date.getUTCDate() + 4 - isoWeekday) // 이번 주 목요일로 이동
  const isoYear = date.getUTCFullYear()
  const yearStart = Date.UTC(isoYear, 0, 1)
  const weekNo = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return isoYear * 53 + weekNo
}

/**
 * 정렬된 ID 배열에서 `weekOrdinal`로 시작 위치를 정해 `limit`건을 연속으로 고른다(끝에
 * 닿으면 처음으로 순환). 같은 주차 키로 호출하면 항상 같은 결과, 주차가 바뀌면 후보가
 * `limit`보다 많을 때 다른 결과가 나온다. 후보가 `limit`보다 적으면 전부 돌려준다.
 * DB 접근이 없는 순수 함수 — 단독으로 테스트한다.
 */
export function pickRotating(sortedIds: string[], limit: number, weekOrdinal: number): string[] {
  const n = sortedIds.length
  if (n === 0 || limit <= 0) return []
  if (n <= limit) return sortedIds
  const start = weekOrdinal % n
  return Array.from({ length: limit }, (_, i) => sortedIds[(start + i) % n])
}

// 활성 여부를 가리지 않는 원문 조회 — narrative 역할 유형의 quotes 전용(PRD §4 규칙2:
// 비활성 컨텐츠의 글·세계관 설정도 배경 인용으로 쓸 수 있다).
async function fetchTribesRaw(
  ids: string[]
): Promise<{ id: string; description: string | null; tagline: string | null }[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tribes')
    .select('id, description, tagline')
    .in('id', ids)
  if (error) throw error
  return data ?? []
}

async function fetchItemBooksRaw(ids: string[]): Promise<{ id: string; story_text: string | null; description: string | null }[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('item_books').select('id, story_text, description').in('id', ids)
  if (error) throw error
  return data ?? []
}

/** 종류별 후보 ID를 정한다 — 호출부가 준 ID가 있으면 그대로(explicit), 없으면 활성 후보에서 순환 자동 선택(auto)한다. */
async function resolveIds(
  kind: 'tribe' | 'item_book' | 'badge',
  explicitIds: string[] | undefined,
  limit: number,
  weekOrdinal: number
): Promise<{ ids: string[]; mode: CorpusSelectionMode }> {
  if (explicitIds && explicitIds.length > 0) {
    return { ids: explicitIds.slice(0, limit), mode: 'explicit' }
  }
  const activeIds =
    kind === 'tribe'
      ? await listActiveTribeIds()
      : kind === 'item_book'
        ? await listActiveItemBookIds()
        : await listActiveBadgeIds(new Date())
  return { ids: pickRotating([...activeIds].sort(), limit, weekOrdinal), mode: 'auto' }
}

export async function selectCorpusForType(
  typeId: ContentCorpusTypeId,
  ctx: ContentCorpusContext,
  limit: number = DEFAULT_CORPUS_EXCERPT_LIMIT,
  now: Date = new Date()
): Promise<CorpusSelection> {
  const mapping = CONTENT_CORPUS_MAPPING[typeId]
  if (!mapping) return { typeId, targets: [], quotes: [], selection: {} }

  const targets: CorpusTarget[] = []
  const quotes: CorpusQuote[] = []
  const selection: Partial<Record<'tribe' | 'item_book' | 'badge', CorpusSelectionMode>> = {}
  const weekOrdinal = isoWeekOrdinal(now)

  if (mapping.role === 'recommend') {
    // 추천·소개형: 대상은 활성만 선택하고, 같은 대상의 설명을 그대로 인용한다.
    // fetchActiveBadges의 활성 판정에는 배지 자체뿐 아니라 소속 컬렉션·트라이브의 활성 여부도
    // 반영된다(티켓 20260924_0015) — 이 분기는 그 판정 결과를 그대로 쓴다.
    if (mapping.kinds.includes('badge')) {
      const { ids, mode } = await resolveIds('badge', ctx.badgeIds, limit, weekOrdinal)
      selection.badge = mode
      const rows = await fetchActiveBadges(ids)
      for (const row of rows) {
        targets.push({ kind: 'badge', id: row.id, name: row.name })
        quotes.push({ kind: 'badge', id: row.id, text: row.description })
      }
    }
    return { typeId, targets, quotes, selection }
  }

  // 글·세계관 노출형: 대상 선택 없이 본문 인용만 채운다. 비활성 컨텐츠도 인용될 수 있다.
  // 자동 선택 후보는 활성만이다(PRD §4 규칙2는 ID를 명시한 인용에만 적용된다) — 여기서도
  // resolveIds가 활성 판정을 거친 ID만 넘긴다.
  if (mapping.kinds.includes('tribe')) {
    const { ids, mode } = await resolveIds('tribe', ctx.tribeIds, limit, weekOrdinal)
    selection.tribe = mode
    const rows = await fetchTribesRaw(ids)
    for (const row of rows) {
      const text = [row.tagline, row.description].filter(Boolean).join('\n')
      if (text) quotes.push({ kind: 'tribe', id: row.id, text })
    }
  }
  if (mapping.kinds.includes('item_book')) {
    const { ids, mode } = await resolveIds('item_book', ctx.itemBookIds, limit, weekOrdinal)
    selection.item_book = mode
    const rows = await fetchItemBooksRaw(ids)
    for (const row of rows) {
      // story_text가 비어 있으면 description으로 폴백한다(2026-09-24 실측: story_text 0건, description 96건)
      const text = row.story_text || row.description
      if (text) quotes.push({ kind: 'item_book', id: row.id, text })
    }
  }
  return { typeId, targets, quotes, selection }
}
