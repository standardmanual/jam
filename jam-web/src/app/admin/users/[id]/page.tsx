import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { UserRow } from '@/types/database'
import UserGrantForm from '../../points/UserGrantForm'
import { BadgeHistoryTable, type BadgeHistoryRow } from './BadgeHistoryTable'
import { AdminRoleToggle } from './AdminRoleToggle'
import { BadgeDiagnosisButton } from './BadgeDiagnosisButton'
import { CombineFailTable, type CombineFailRow } from './CombineFailTable'

interface Props {
  params: Promise<{ id: string }>
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params
  const service = createServiceClient()

  const { data: userRaw } = await service.from('users').select('*').eq('id', id).single()
  if (!userRaw) notFound()
  const user = userRaw as UserRow

    const { data: badgeHistoryRaw } = await service
    .from('user_activity_badges')
    .select('id, earned_at, triggered_by, triggered_by_activity_name, condition_snapshot, badges(id, name, rarity)')
    .eq('user_id', id)
    .order('earned_at', { ascending: false })

  const badgeHistory = (badgeHistoryRaw ?? []) as unknown as BadgeHistoryRow[]

  // 믹스 실패 이력 (티켓 20260910_1408) — 최신순. 재료 배지 이름은 실제로 쓰인 id만
  // 골라 조회한다(배지 전체를 훑으면 PostgREST 응답 상한에 절단된다 — recipes/page.tsx 주석 참고).
  const { data: combineFailsRaw } = await service
    .from('user_combine_fail_logs')
    .select('id, attempted_at, ingredient_badge_ids, fail_reason, points_awarded')
    .eq('user_id', id)
    .order('attempted_at', { ascending: false })
    .limit(200)
  const combineFails = (combineFailsRaw ?? []) as CombineFailRow[]

  const failBadgeIds = [...new Set(combineFails.flatMap((r) => r.ingredient_badge_ids ?? []))]
  const { data: failBadgesRaw } = failBadgeIds.length > 0
    ? await service.from('badges').select('id, name').in('id', failBadgeIds)
    : { data: [] as { id: string; name: string }[] }
  const failBadgeNames = Object.fromEntries(
    ((failBadgesRaw ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name])
  )

  // ADMIN_EMAILS 화이트리스트 계정인지 (20260827_015) — 안내 문구에만 사용, 판정 로직은 lib/admin/auth.ts 공용
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  const isWhitelisted = adminEmails.includes(user.email)

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/users" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 유저 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">{user.username ?? '(닉네임 없음)'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {user.email} · 가입 {formatDateTime(user.created_at)}
        </p>
      </div>

      {/* 잼 포인트 지급/회수 (공용 폼 — /admin/points와 동일 실행 로직) */}
      <div className="mb-8 max-w-xl">
        <UserGrantForm userId={user.id} username={user.username} />
      </div>

      {/* 어드민 권한 부여/해제 (20260827_015) */}
      <div className="mb-8">
        <AdminRoleToggle
          userId={user.id}
          userName={user.username ?? user.email}
          initialIsAdmin={user.is_admin}
          isWhitelisted={isWhitelisted}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">배지 획득 히스토리</h2>
        <div className="flex items-center gap-3">
          <p className="text-muted-foreground text-sm">총 {badgeHistory.length}개</p>
          {/* 조건 충족·미발급 진단 (티켓 20260906_1432) */}
          <BadgeDiagnosisButton userId={user.id} />
        </div>
      </div>

      <BadgeHistoryTable rows={badgeHistory} />

      <div className="mt-10 mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">믹스 실패 이력</h2>
        <p className="text-muted-foreground text-sm">총 {combineFails.length}건</p>
      </div>

      <CombineFailTable rows={combineFails} badgeNames={failBadgeNames} />
    </div>
  )
}
