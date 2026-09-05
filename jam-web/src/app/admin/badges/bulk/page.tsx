/**
 * 배지 일괄 작업 도구 (티켓 20260905_0034)
 *
 * 기존 카탈로그를 계열·종목 단위로 **폐기(소프트삭제)** 하고, 폐기 대상을 가리키는 콘텐츠
 * 참조를 정리하고, 필요하면 획득 이력을 지우는 화면이다. 실행 전에 영향 분석을 반드시
 * 거치게 하고, 대상 건수·영향 건수를 손으로 타이핑해야 실행된다.
 *
 * ⚠️ 하드삭제 버튼은 없다 — 폐기는 `deleted_at`이고 되살리기도 일괄로 있다
 * (2026-09-05 사용자 확정, 티켓 판단 ①). 실행 로그는 마이그레이션 136의
 * `admin_badge_bulk_runs`에 남는다.
 */
import Link from 'next/link'
import { fetchRecentBulkRuns } from '@/lib/admin/badge-bulk-query'
import BulkToolManager from './BulkToolManager'

interface AdminBadgeBulkPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AdminBadgeBulkPage({ searchParams }: AdminBadgeBulkPageProps) {
  const params = await searchParams
  const { runs, error } = await fetchRecentBulkRuns()

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <Link href="/admin/badges" className="text-sm text-muted-foreground underline underline-offset-4">
          ← 배지 관리
        </Link>
        <h1 className="mt-2 text-2xl md:text-3xl font-bold">배지 일괄 작업</h1>
        <p className="text-muted-foreground text-sm mt-1">
          필터에 맞는 배지를 페이지 경계 없이 전부 골라 한 번에 처리해요. 실행 전에 영향 분석을
          거치고, 대상·영향 건수를 그대로 입력해야 실행돼요.
        </p>
      </div>

      <BulkToolManager
        initialFilter={{
          type: params.type ?? null,
          activityType: params.activity_type ?? null,
          rarity: params.rarity ?? null,
          status: params.status === 'inactive' || params.status === 'all' ? params.status : 'active',
          q: params.q ?? null,
          familyKey: params.family_key ?? null,
        }}
        recentRuns={runs}
        runsError={error}
      />
    </div>
  )
}
