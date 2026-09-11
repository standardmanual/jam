import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/admin/ui/button'
import { checkRankingModeIntegrity } from '@/lib/ranking/rankingDataSource'
import type { RankingModeRow } from '@/types/database'

const TARGET_TYPE_LABEL: Record<RankingModeRow['target_type'], string> = {
  mission_participants: '미션 참가자 전원',
  manual_users: '유저 직접 지정',
}

const METRIC_TYPE_LABEL: Record<RankingModeRow['metric_type'], string> = {
  mission_progress: '미션 진행도',
  condition_field: '배지 조건 필드',
  badge_count: '배지 보유 개수',
}

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
 * 랭킹모드 목록 — 티켓 20260911_1440. 투데이 카드(랭킹보드 카드 종류)가 참조할 랭킹모드를
 * 미리 만들어두는 화면이다. 카드가 여러 개 있는 다른 어드민 화면과 달리 예상 개수가 적어
 * (운영 큐레이션 목적) 간단한 테이블로 충분하다고 판단했다 — 투데이/배지 화면의 DataTable
 * (정렬·열 숨김·일괄 작업)까지는 이번 범위에서 두지 않는다.
 */
export default async function AdminRankingModesPage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('ranking_modes').select('*').order('created_at', { ascending: false })
  const modes = (data ?? []) as RankingModeRow[]

  const issues = await Promise.all(modes.map((m) => checkRankingModeIntegrity(m, supabase)))

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">랭킹모드 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            홈 피드 랭킹보드 카드가 연결할 순위 정의 — 대상 선정과 정렬 지표를 미리 만들어 둔다
          </p>
        </div>
        <Link href="/admin/ranking-modes/new">
          <Button>+ 랭킹모드 추가</Button>
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">제목</th>
              <th className="px-4 py-2 font-medium">대상</th>
              <th className="px-4 py-2 font-medium">정렬 지표</th>
              <th className="px-4 py-2 font-medium">집계 기간</th>
              <th className="px-4 py-2 font-medium">상태</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {modes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  아직 만든 랭킹모드가 없어요.
                </td>
              </tr>
            )}
            {modes.map((mode, i) => {
              const issue = issues[i]
              return (
                <tr key={mode.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{mode.title}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{TARGET_TYPE_LABEL[mode.target_type]}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{METRIC_TYPE_LABEL[mode.metric_type]}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(mode.starts_at).toLocaleDateString('ko-KR')} ~ {new Date(mode.ends_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {issue ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">{integrityMessage(issue)}</span>
                    ) : (
                      <span className="text-muted-foreground">정상</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/ranking-modes/${mode.id}/edit`} className="text-xs hover:opacity-70">
                      수정
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
