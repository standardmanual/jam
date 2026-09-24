import Link from 'next/link'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { countRowsByKey, type CountRowsClient } from '@/lib/admin/list-counts'
import {
  MISSION_LIST_COLUMNS,
  MISSION_TYPE_SUMMARY_COLUMNS,
  applyMissionListQuery,
  isGateMission,
  missionStatusOf,
  missionTypesForKind,
  parseMissionListParams,
  type MissionListQuery,
  type MissionListRow,
  type MissionTypeSummaryRow,
} from '@/lib/admin/mission-list-query'
import MissionFilterBar from './MissionFilterBar'
import { MissionTable, type MissionTableRow } from './MissionTable'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface AdminMissionsPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminMissionsPage({ searchParams }: AdminMissionsPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const params = parseMissionListParams(rawParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)
  // 상태 필터 조건과 행에 실어 보내는 상태가 같은 시각을 쓰도록 요청마다 한 번만 정한다
  const now = new Date()

  const supabase = createServiceClient()

  let query = supabase
    .from('missions')
    .select(MISSION_LIST_COLUMNS, { count: 'exact' }) as unknown as MissionListQuery<MissionListRow>
  query = applyMissionListQuery(query, params, now)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  const [{ data: missionsRaw, count }, { data: summaryRaw }] = await Promise.all([
    query.range(from, to),
    // 연쇄 필터 "미션 유형" 선택지용 — 구분마다 실제로 있는 유형만 보이게 한다(53건 규모라 한 번에 읽는다)
    supabase.from('missions').select(MISSION_TYPE_SUMMARY_COLUMNS).range(0, 999),
  ])

  const missions = (missionsRaw ?? []) as MissionListRow[]
  const totalCount = count ?? 0

  // 완료 수는 행째로 받아 세지 않고 정확 집계(1,000행 상한을 넘겨 읽는다)로 센다
  const completionCounts = await countRowsByKey(
    supabase as unknown as CountRowsClient,
    'user_mission_completions',
    'mission_id',
    missions.map((m) => m.id)
  )

  const rows: MissionTableRow[] = missions.map((mission) => ({
    mission,
    status: missionStatusOf(mission, now),
    completionCount: completionCounts[mission.id] ?? 0,
    isGate: isGateMission(mission),
  }))

  const typeOptions = missionTypesForKind((summaryRaw ?? []) as MissionTypeSummaryRow[], params.kind)

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">미션 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">다이나믹 미션 생성 및 모니터링</p>
        </div>
        <Link
          href="/admin/missions/new"
          className="inline-block rounded-xl bg-primary px-4 py-2 text-center text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          + 미션 생성
        </Link>
      </div>

      <Suspense>
        <MissionFilterBar typeOptions={typeOptions} />
      </Suspense>

      <div className="text-sm text-muted-foreground">총 {totalCount}개</div>

      <MissionTable rows={rows} totalCount={totalCount} />

      <DataTablePagination page={page} totalPages={totalPagesOf(totalCount, ADMIN_LIST_PAGE_SIZE)} />
    </div>
  )
}
