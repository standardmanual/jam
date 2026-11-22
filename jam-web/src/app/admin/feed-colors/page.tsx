import { createServiceClient } from '@/lib/supabase/server'
import { throwOnQueryError } from '@/lib/admin/queryError'
import type { FeedColorCardInput } from '@/lib/admin/feedColorImpact'
import { fetchFeedColorOverrides } from '@/lib/today/feedColorOverridesRead'
import FeedColorsEditor from './FeedColorsEditor'

/**
 * 홈피드 컬러셋 (`/admin/feed-colors`) — 티켓 20261121_2146 (상위 20261120_2026 후속).
 *
 * 서버가 저장된 덮어쓰기와 «노출 기간이 아직 끝나지 않은 카드»의 색 키 조합을 읽어 편집기에 넘긴다. 쓰기는 이 화면이 하지 않는다
 * (`PUT /api/admin/feed-colors`). 덮어쓰기는 캐시 없이 표에서 바로 읽는다 — 어드민이 «저장돼 있는 값»을 늘 정확히 봐야 해서다.
 *
 * 레이아웃: 큰 화면에서는 헤더(높이 3.5rem)를 뺀 화면 높이를 이 화면이 채우고, 안의 «색 설정»과 «미리보기»가 각자 스크롤한다(문서 스크롤 없음).
 */
export default async function AdminFeedColorsPage() {
  const supabase = createServiceClient()
  const [overrides, cardsResult] = await Promise.all([
    fetchFeedColorOverrides(supabase, '[어드민 홈피드 컬러셋 조회 오류]'),
    supabase
      .from('today_cards')
      .select('id, title, feed_type, bg_color_key, chip_color_key, box_color_key')
      .gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: false }),
  ])
  // 조회 오류를 «영향받는 카드 없음»으로 보이지 않게 던져 어드민 오류 화면으로 보낸다(티켓 20260925_1941)
  throwOnQueryError(cardsResult.error, 'feed-colors')

  const cards: FeedColorCardInput[] = (cardsResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    feedType: row.feed_type,
    bgColorKey: row.bg_color_key,
    chipColorKey: row.chip_color_key,
    boxColorKey: row.box_color_key,
  }))

  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6 lg:h-[calc(100svh-3.5rem)]">
      <h1 className="text-lg font-bold">홈피드 컬러셋</h1>
      <FeedColorsEditor savedOverrides={overrides} cards={cards} />
    </div>
  )
}
