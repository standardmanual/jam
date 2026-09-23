/**
 * 유형별 선별 발췌 (티켓 20260923_2256, PRD §4)
 *
 * `selectCorpusForType`은 코퍼스 전체를 읽지 않는다 — `CONTENT_CORPUS_MAPPING`이 정한
 * 종류(tribe·item_book·badge)만, 호출부가 넘긴 ID 목록에서 `limit`건 이내로 조회한다.
 * 원문(`description`·`tagline`·`story_text`)은 요약·재작성 없이 그대로 돌려준다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { fetchActiveBadges } from './active'
import {
  CONTENT_CORPUS_MAPPING,
  DEFAULT_CORPUS_EXCERPT_LIMIT,
  type ContentCorpusContext,
  type ContentCorpusTypeId,
  type CorpusQuote,
  type CorpusSelection,
  type CorpusTarget,
} from './types'

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

async function fetchItemBooksRaw(ids: string[]): Promise<{ id: string; story_text: string | null }[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('item_books').select('id, story_text').in('id', ids)
  if (error) throw error
  return data ?? []
}

export async function selectCorpusForType(
  typeId: ContentCorpusTypeId,
  ctx: ContentCorpusContext,
  limit: number = DEFAULT_CORPUS_EXCERPT_LIMIT
): Promise<CorpusSelection> {
  const mapping = CONTENT_CORPUS_MAPPING[typeId]
  if (!mapping) return { typeId, targets: [], quotes: [] }

  const targets: CorpusTarget[] = []
  const quotes: CorpusQuote[] = []

  if (mapping.role === 'recommend') {
    // 추천·소개형: 대상은 활성만 선택하고, 같은 대상의 설명을 그대로 인용한다.
    if (mapping.kinds.includes('badge')) {
      const ids = (ctx.badgeIds ?? []).slice(0, limit)
      const rows = await fetchActiveBadges(ids)
      for (const row of rows) {
        targets.push({ kind: 'badge', id: row.id, name: row.name })
        quotes.push({ kind: 'badge', id: row.id, text: row.description })
      }
    }
    return { typeId, targets, quotes }
  }

  // 글·세계관 노출형: 대상 선택 없이 본문 인용만 채운다. 비활성 컨텐츠도 인용될 수 있다.
  if (mapping.kinds.includes('tribe')) {
    const ids = (ctx.tribeIds ?? []).slice(0, limit)
    const rows = await fetchTribesRaw(ids)
    for (const row of rows) {
      const text = [row.tagline, row.description].filter(Boolean).join('\n')
      if (text) quotes.push({ kind: 'tribe', id: row.id, text })
    }
  }
  if (mapping.kinds.includes('item_book')) {
    const ids = (ctx.itemBookIds ?? []).slice(0, limit)
    const rows = await fetchItemBooksRaw(ids)
    for (const row of rows) {
      if (row.story_text) quotes.push({ kind: 'item_book', id: row.id, text: row.story_text })
    }
  }
  return { typeId, targets, quotes }
}
