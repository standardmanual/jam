/**
 * 트렌드 레이더 읽기 (티켓 20261026_2033 2회차, 어드민 상황판 PRD §6.4). 서버에서만 쓴다.
 *
 * 최근 14일에 받은 묶음(`ops_bundles`)과 그 묶음들의 항목(`ops_bundle_items`)을 읽어 `collectRadar`가 계산할 입력으로 돌려준다.
 * 시험 포함이 꺼져 있으면 시험 묶음은 읽지 않는다. `trends`가 없는 묶음은 레이더에 낼 것이 없어 항목도 읽지 않는다.
 * 읽기 실패는 던진다(호출부가 그 구역만 안내 카드로 바꾼다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { TREND_RADAR_WINDOW_DAYS, type RadarBundle, type RadarItem } from '@/lib/admin/opsTrends/radar'

type ServiceClient = ReturnType<typeof createServiceClient>

const DAY_MS = 24 * 60 * 60 * 1000
const BUNDLE_LIMIT = 200
const BUNDLE_COLUMNS = 'id, week, title, received_at, trends, is_sample'
const ITEM_COLUMNS = 'id, bundle_id, status, original, edited'

export async function loadTrendRadarInput(
  service: ServiceClient,
  options: { now: Date; includeSample: boolean }
): Promise<RadarBundle[]> {
  const since = new Date(options.now.getTime() - TREND_RADAR_WINDOW_DAYS * DAY_MS).toISOString()
  let query = service.from('ops_bundles').select(BUNDLE_COLUMNS).gte('received_at', since).not('trends', 'is', null)
  if (!options.includeSample) query = query.eq('is_sample', false)
  const { data: bundleRows, error: bundleError } = await query.order('received_at', { ascending: false }).limit(BUNDLE_LIMIT)
  if (bundleError) throw new Error(`트렌드 레이더 묶음 조회 실패: ${bundleError.message}`)
  const bundles = bundleRows ?? []
  if (bundles.length === 0) return []

  const { data: itemRows, error: itemError } = await service
    .from('ops_bundle_items')
    .select(ITEM_COLUMNS)
    .in(
      'bundle_id',
      bundles.map((bundle) => bundle.id)
    )
  if (itemError) throw new Error(`트렌드 레이더 항목 조회 실패: ${itemError.message}`)

  const itemsByBundle = new Map<string, RadarItem[]>()
  for (const row of itemRows ?? []) {
    const list = itemsByBundle.get(row.bundle_id) ?? []
    list.push({ id: row.id, status: row.status, original: row.original, edited: row.edited })
    itemsByBundle.set(row.bundle_id, list)
  }

  return bundles.map((bundle) => ({
    id: bundle.id,
    week: bundle.week,
    title: bundle.title,
    receivedAt: bundle.received_at,
    trends: bundle.trends,
    isSample: bundle.is_sample,
    items: itemsByBundle.get(bundle.id) ?? [],
  }))
}
