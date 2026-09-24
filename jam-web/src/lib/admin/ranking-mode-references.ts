/**
 * 랭킹 규칙을 쓰는 투데이 카드 집계(티켓 20260924_0947) — 랭킹 규칙 목록의 "연결된 카드 수"와
 * 삭제 전 참조 보호(`DELETE /api/admin/ranking-modes/[id]`)가 같은 기준을 쓴다.
 *
 * `today_cards.ranking_mode_id`는 규칙을 지우면 NULL로 비워지도록 걸려 있어
 * (마이그레이션 158 `ON DELETE SET NULL`) DB가 삭제를 막아 주지 않는다. 그대로 지우면 홈 피드의
 * 랭킹보드 카드가 규칙 없이 빈 채로 남으므로, 아직 유저에게 보일 수 있는 카드 —
 * **활성이고 종료 시각이 지나지 않은 카드** — 가 하나라도 있으면 삭제를 막는다.
 * 비활성이거나 이미 끝난 카드는 더 이상 노출되지 않으므로 세지 않는다.
 */

export interface RankingModeCardRef {
  id: string
  title: string
}

interface CardRow extends RankingModeCardRef {
  ranking_mode_id: string | null
  is_active: boolean
  ends_at: string
}

/** 유저에게 아직 보일 수 있는 카드인가 — 활성이고 종료 시각이 지나지 않았다 */
export function isLiveCard(card: Pick<CardRow, 'is_active' | 'ends_at'>, now: Date): boolean {
  return card.is_active && new Date(card.ends_at).getTime() > now.getTime()
}

/** 카드 목록에서 활성·미종료 카드만 골라 규칙 ID별로 묶는다(순수 함수) */
export function groupLiveCardsByMode(cards: CardRow[], now: Date): Map<string, RankingModeCardRef[]> {
  const byMode = new Map<string, RankingModeCardRef[]>()
  for (const card of cards) {
    if (!card.ranking_mode_id || !isLiveCard(card, now)) continue
    const list = byMode.get(card.ranking_mode_id) ?? []
    list.push({ id: card.id, title: card.title })
    byMode.set(card.ranking_mode_id, list)
  }
  return byMode
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스(`list-counts.ts`와 동일 관례) */
export interface RankingModeReferenceQuery {
  eq(column: string, value: boolean): RankingModeReferenceQuery
  gt(column: string, value: string): RankingModeReferenceQuery
  in(column: string, values: string[]): RankingModeReferenceQuery
  order(column: string, options?: { ascending?: boolean }): RankingModeReferenceQuery
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
}

export interface RankingModeReferenceClient {
  from(table: string): { select(columns: string): RankingModeReferenceQuery }
}

/** `.in()` 한 번에 싣는 규칙 ID 개수(URL 16KB 상한 여유 기준, `list-counts.ts`와 동일) */
const ID_CHUNK_SIZE = 200
/** 한 번에 읽는 행 수(PostgREST 기본 상한) */
const PAGE_SIZE = 1000

/**
 * 주어진 규칙 ID들을 쓰는 활성·미종료 카드를 한 번의 조회 흐름으로 모은다. 결과에는 요청한
 * 규칙 ID가 전부 키로 있다(쓰는 카드가 없으면 빈 배열). 조회가 실패하면 throw한다 — 삭제 보호는
 * 조회에 실패했을 때 "참조 없음"으로 착각하지 않도록 호출부가 fail-closed로 다룬다.
 */
export async function fetchLiveCardsByMode(
  client: RankingModeReferenceClient,
  modeIds: string[],
  now: Date = new Date()
): Promise<Map<string, RankingModeCardRef[]>> {
  const uniqueIds = [...new Set(modeIds)]
  const result = new Map<string, RankingModeCardRef[]>(uniqueIds.map((id) => [id, []]))
  if (uniqueIds.length === 0) return result

  for (let i = 0; i < uniqueIds.length; i += ID_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + ID_CHUNK_SIZE)

    let from = 0
    for (;;) {
      const { data, error } = await client
        .from('today_cards')
        .select('id, title, ranking_mode_id, is_active, ends_at')
        .eq('is_active', true)
        .gt('ends_at', now.toISOString())
        .in('ranking_mode_id', chunk)
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        throw new Error(`[fetchLiveCardsByMode] today_cards 조회 실패: ${error.message}`)
      }

      const rows = (data ?? []) as unknown as CardRow[]
      for (const [modeId, cards] of groupLiveCardsByMode(rows, now)) {
        result.get(modeId)?.push(...cards)
      }
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return result
}

const TITLE_LIST_LIMIT = 5

/** 삭제가 막혔을 때 화면에 그대로 보여 줄 안내 문구 — 카드 제목을 최대 5개까지 적는다 */
export function formatRankingModeBlockedMessage(cards: RankingModeCardRef[]): string {
  const titles = cards.slice(0, TITLE_LIST_LIMIT).map((c) => `"${c.title}"`)
  const rest = cards.length - titles.length
  const list = rest > 0 ? `${titles.join(', ')} 외 ${rest}건` : titles.join(', ')
  return `이 랭킹 규칙을 쓰는 활성 카드가 ${cards.length}건 있어 삭제할 수 없어요. 카드를 비활성화하거나 다른 규칙으로 바꾼 뒤 다시 삭제해 주세요. (${list})`
}
