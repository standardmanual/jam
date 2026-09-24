import { Suspense } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { getPointsSummary } from '@/lib/points/summary'
import { createServiceClient } from '@/lib/supabase/server'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import {
  LEDGER_COLUMNS,
  parseLedgerListParams,
  applyLedgerListQuery,
  ledgerReasonLabel,
  type LedgerEntry,
  type LedgerListQuery,
  type LedgerRow,
} from '@/lib/admin/points-ledger-query'
import AdminUserSearch from './AdminUserSearch'
import { RankingTable } from './RankingTable'
import { HighValueTable } from './HighValueTable'
import { LedgerFilters } from './LedgerFilters'

export const dynamic = 'force-dynamic'

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface AdminPointsPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminPointsPage({ searchParams }: AdminPointsPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const ledgerParams = parseLedgerListParams(rawParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)

  const supabase = createServiceClient()
  let ledgerQuery = supabase
    .from('point_transactions')
    .select(LEDGER_COLUMNS, { count: 'exact' }) as unknown as LedgerListQuery<LedgerRow>
  ledgerQuery = applyLedgerListQuery(ledgerQuery, ledgerParams)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  const [s, ledgerRes] = await Promise.all([getPointsSummary(), ledgerQuery.range(from, to)])

  const ledgerRows = ledgerRes.data ?? []
  const ledgerTotal = ledgerRes.count ?? 0
  const ledgerUserIds = [...new Set(ledgerRows.map((r) => r.user_id))]
  const { data: usersRaw } =
    ledgerUserIds.length > 0
      ? await supabase.from('users').select('id, username').in('id', ledgerUserIds)
      : { data: [] as { id: string; username: string | null }[] }
  const usernameById = new Map((usersRaw ?? []).map((u) => [u.id, u.username]))

  const ledgerEntries: LedgerEntry[] = ledgerRows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    username: usernameById.get(r.user_id) ?? null,
    amount: r.amount,
    label: ledgerReasonLabel(r.reason, r.admin_reason_label),
    created_at: r.created_at,
  }))

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">포인트 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">잼 포인트 발행 현황 · 정합성 · 유저 지급/회수</p>
      </div>

      {/* 정합성 경고 배너 */}
      {!s.integrityOk && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="flex items-center gap-1.5 text-red-600 font-bold text-sm mb-1">
            <IconAlertTriangle className="h-4 w-4" />
            포인트 정합성 오류
          </p>
          <p className="text-red-600 text-xs leading-relaxed">
            유통량({fmt(s.circulation)}) · 유저 보유 합계({fmt(s.walletSum)}) · 원장 합계({fmt(s.txnSum)})가
            일치하지 않습니다. 원장을 우회한 직접 SQL 수정 등이 있었는지 확인이 필요합니다.
          </p>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="총 발행량" value={`${fmt(s.totalMinted)}P`} />
        <SummaryCard label="총 회수량" value={`${fmt(s.totalReclaimed)}P`} />
        <SummaryCard label="현재 유통량" value={`${fmt(s.circulation)}P`} accent />
        <SummaryCard label="유저 보유 합계" value={`${fmt(s.walletSum)}P`} />
      </div>

      {/* 발행량 순위 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RankingTable title="배지별 발행량" rows={s.badgeRanking} hrefBase="/admin/badges" linkPerItem />
        <RankingTable title="미션별 발행량" rows={s.missionRanking} hrefBase="/admin/missions" linkPerItem={false} />
      </div>

      {/* 고액 지급/회수 원장 */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold mb-1">고액 지급/회수 원장</h2>
          <p className="text-muted-foreground text-xs">기준액({fmt(s.highValueThreshold)}P) 이상 원장 (사후 감사)</p>
        </div>
        <Suspense>
          <LedgerFilters />
        </Suspense>
        <div className="text-sm text-muted-foreground">총 {fmt(ledgerTotal)}건</div>
        <HighValueTable rows={ledgerEntries} totalCount={ledgerTotal} />
        <DataTablePagination page={page} totalPages={totalPagesOf(ledgerTotal, ADMIN_LIST_PAGE_SIZE)} />
      </div>

      {/* 유저 지급/회수 */}
      <div>
        <h2 className="text-lg font-bold mb-3">유저 지급 / 회수</h2>
        <AdminUserSearch />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? 'bg-primary/10 border-primary/30' : 'bg-white border-border'}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-foreground' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}
