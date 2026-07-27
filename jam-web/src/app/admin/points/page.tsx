import Link from 'next/link'
import { getPointsSummary } from '@/lib/points/summary'
import AdminUserSearch from './AdminUserSearch'

export const dynamic = 'force-dynamic'

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default async function AdminPointsPage() {
  const s = await getPointsSummary()

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">포인트 관리</h1>
        <p className="text-[#6b7280] text-sm mt-1">잼 포인트 발행 현황 · 정합성 · 유저 지급/회수</p>
      </div>

      {/* 정합성 경고 배너 */}
      {!s.integrityOk && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="text-red-600 font-bold text-sm mb-1">⚠ 포인트 정합성 오류</p>
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
        <RankingTable title="배지별 발행량" rows={s.badgeRanking} href={(id) => `/admin/badges/${id}`} />
        <RankingTable title="미션별 발행량" rows={s.missionRanking} href={() => `/admin/missions`} />
      </div>

      {/* 최근 고액 지급/회수 */}
      <div>
        <h2 className="text-lg font-bold mb-1">최근 고액 지급/회수</h2>
        <p className="text-[#6b7280] text-xs mb-3">기준액({fmt(s.highValueThreshold)}P) 이상 원장 최근 20건 (사후 감사)</p>
        <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
                <th className="px-5 py-3 font-medium">유저</th>
                <th className="px-5 py-3 font-medium">금액</th>
                <th className="px-5 py-3 font-medium">사유</th>
                <th className="px-5 py-3 font-medium">일시</th>
              </tr>
            </thead>
            <tbody>
              {s.recentHighValue.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-[#898989]">해당 없음</td></tr>
              )}
              {s.recentHighValue.map((h) => (
                <tr key={h.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa]">
                  <td className="px-5 py-3">
                    <Link href={`/admin/users/${h.user_id}`} className="hover:text-[#111111] transition-colors">
                      {h.username ?? h.user_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className={`px-5 py-3 font-bold ${h.amount > 0 ? 'text-[#111111]' : 'text-red-600'}`}>
                    {h.amount > 0 ? '+' : '−'}{fmt(Math.abs(h.amount))}P
                  </td>
                  <td className="px-5 py-3 text-[#374151]">{h.label}</td>
                  <td className="px-5 py-3 text-[#6b7280] text-xs whitespace-nowrap">{formatDate(h.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <div className={`rounded-2xl border p-5 ${accent ? 'bg-[#111111]/10 border-[#111111]/30' : 'bg-white border-[#e5e7eb]'}`}>
      <p className="text-xs text-[#6b7280] mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-[#111111]' : 'text-[#111111]'}`}>{value}</p>
    </div>
  )
}

function RankingTable({
  title, rows, href,
}: {
  title: string
  rows: { id: string; name: string; total: number }[]
  href: (id: string) => string
}) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.length === 0 && (
              <tr><td className="px-5 py-8 text-center text-[#898989]">발행 내역 없음</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f8f9fa]">
                <td className="px-5 py-3 text-[#898989] w-8">{i + 1}</td>
                <td className="px-5 py-3">
                  <Link href={href(r.id)} className="hover:text-[#111111] transition-colors">{r.name}</Link>
                </td>
                <td className="px-5 py-3 text-right font-bold text-[#111111]">{r.total.toLocaleString('ko-KR')}P</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
