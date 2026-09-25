import Link from 'next/link'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/admin/ui/button'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { checkRankingModeIntegrity } from '@/lib/ranking/rankingDataSource'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { sanitizeSearchTerm } from '@/lib/admin/search-term'
import { throwOnQueryError } from '@/lib/admin/queryError'
import { fetchLiveCardsByMode, type RankingModeReferenceClient } from '@/lib/admin/ranking-mode-references'
import { RANKING_MODE_SORT_COLUMN, parseRankingModeSort } from '@/lib/admin/ranking-mode-list'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import type { RankingModeRow } from '@/types/database'
import RankingModesTable, { type RankingModeListRow } from './RankingModesTable'

function integrityMessage(issue: NonNullable<Awaited<ReturnType<typeof checkRankingModeIntegrity>>>): string {
  switch (issue.code) {
    case 'mission_deleted':
      return '연결된 미션을 찾을 수 없어요'
    case 'mission_not_ranking_type':
      return '연결된 미션이 더 이상 랭킹형이 아니에요'
    case 'no_target_users':
      return '지정된 유저가 없어요'
  }
}

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면 Next가 배열을 넘긴다.
 * `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수한다(티켓 20260906_1312).
 */
interface AdminRankingModesPageProps {
  searchParams: SearchParamsPromise
}

/**
 * 랭킹모드 목록 — 티켓 20260911_1440. 투데이 카드(랭킹보드 카드 종류)가 참조할 랭킹모드를
 * 미리 만들어두는 화면이다. 티켓 20260924_0947에서 공통 목록 부품(행 클릭 이동·제목 검색·서버
 * 정렬·번호 페이지 이동)으로 바꾸고 "연결된 카드 수" 칸을 더했다. 카드 수는 규칙 전체를 한 번의
 * 조회 흐름으로 센다(규칙마다 따로 묻지 않는다).
 */
export default async function AdminRankingModesPage({ searchParams }: AdminRankingModesPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const q = sanitizeSearchTerm(rawParams.q ?? '')
  const sort = parseRankingModeSort(rawParams.sort)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)
  const [sortColumn, ascending] = RANKING_MODE_SORT_COLUMN[sort]

  const supabase = createServiceClient()
  let query = supabase.from('ranking_modes').select('*', { count: 'exact' })
  if (q) query = query.ilike('title', `%${q}%`)
  const { data, count, error } = await query
    .order(sortColumn, { ascending })
    .order('id', { ascending: true })
    .range(from, to)
  throwOnQueryError(error, 'ranking-modes')
  const modes = (data ?? []) as RankingModeRow[]

  const [issues, liveCardsByMode] = await Promise.all([
    Promise.all(modes.map((m) => checkRankingModeIntegrity(m, supabase))),
    fetchLiveCardsByMode(
      supabase as unknown as RankingModeReferenceClient,
      modes.map((m) => m.id)
    ),
  ])

  const rows: RankingModeListRow[] = modes.map((mode, i) => ({
    id: mode.id,
    title: mode.title,
    target_type: mode.target_type,
    metric_type: mode.metric_type,
    starts_at: mode.starts_at,
    ends_at: mode.ends_at,
    liveCardCount: liveCardsByMode.get(mode.id)?.length ?? 0,
    integrityMessage: issues[i] ? integrityMessage(issues[i]!) : null,
  }))

  const total = count ?? 0

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">랭킹 규칙 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            홈 피드 랭킹 카드에 연결할 랭킹을 미리 만들어 둡니다. 누구를 줄 세울지와 어떤
            지표로 줄 세울지를 여기서 정합니다. 연결된 카드 수는 활성이고 아직 끝나지 않은 카드만 셉니다.
          </p>
        </div>
        <Link href="/admin/ranking-modes/new">
          <Button>+ 랭킹 규칙 추가</Button>
        </Link>
      </div>

      <div className="space-y-4">
        <Suspense>
          <RankingModesTable modes={rows} />
        </Suspense>

        <div className="text-sm text-muted-foreground">
          총 {total}개
          {q && ' (검색 적용 중)'}
        </div>

        <DataTablePagination page={page} totalPages={totalPagesOf(total, ADMIN_LIST_PAGE_SIZE)} />
      </div>
    </div>
  )
}
