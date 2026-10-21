import { getAdminUser } from '@/lib/admin/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { ADMIN_LIST_PAGE_SIZE, totalPagesOf } from '@/lib/admin/list-params'
import {
  fetchAbusingTabCounts,
  fetchPoiBlockListPage,
  parseAbusingListParams,
  type PoiBlockRow,
} from '@/lib/admin/abusing-list'
import { fetchSuspensionListPage, parseSuspensionListParams, type SuspensionRow } from '@/lib/admin/suspension-list'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import AbusingClient, { type Tab } from './AbusingClient'

export const dynamic = 'force-dynamic'

/**
 * URL `?tab=policy|suspensions|poi-blocks&status=&q=&sort=&page=`로(이용 정지 탭의 status는 active|lifted|all) 탭·필터·쪽을 서버에서
 * 나눈다(티켓 20260924_0952). 목록은 현재 탭 것만 읽는다.
 *
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — `pickSingleQueryParams`가 같은 키가 두 번 온
 * 경우(배열)를 「값 없음」으로 흡수한다 (티켓 20260906_1312).
 */
interface AbusingPageProps {
  searchParams: SearchParamsPromise
}

export default async function AbusingPage({ searchParams }: AbusingPageProps) {
  const admin = await getAdminUser()
  if (!admin) redirect('/admin/login')

  const raw = pickSingleQueryParams(await searchParams)
  const tab: Tab = raw.tab === 'suspensions' || raw.tab === 'poi-blocks' ? raw.tab : 'policy'
  const page = Math.max(1, parseInt(raw.page ?? '1', 10) || 1)

  const supabase = createServiceClient()
  const now = new Date()

  const emptyList = { suspensions: [] as SuspensionRow[], poiBlocks: [] as PoiBlockRow[], total: 0, error: null as string | null }
  const listPromise = (async () => {
    if (tab === 'suspensions') {
      const result = await fetchSuspensionListPage(supabase, parseSuspensionListParams(raw), page)
      return { ...emptyList, suspensions: result.rows, total: result.total, error: result.error }
    }
    if (tab === 'poi-blocks') {
      const result = await fetchPoiBlockListPage(supabase, parseAbusingListParams(raw, 'poi-blocks'), page, now)
      return { ...emptyList, poiBlocks: result.rows, total: result.total, error: result.error }
    }
    return emptyList
  })()

  const [policy, counts, list] = await Promise.all([getAbusingPolicy(), fetchAbusingTabCounts(supabase, now), listPromise])

  // 조회 실패를 0건으로 보여 주면 정지·제재가 없는 것처럼 읽힌다 — 오류 화면(admin/error.tsx)으로 보낸다
  if (list.error) throw new Error(`어뷰징 목록을 불러오지 못했어요. (${list.error})`)

  return (
    <AbusingClient
      policy={policy}
      tab={tab}
      counts={counts}
      suspensions={list.suspensions}
      poiBlocks={list.poiBlocks}
      listTotal={list.total}
      page={page}
      totalPages={totalPagesOf(list.total, ADMIN_LIST_PAGE_SIZE)}
    />
  )
}
