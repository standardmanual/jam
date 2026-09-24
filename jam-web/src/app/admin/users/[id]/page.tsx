import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser, isAdminAccount } from '@/lib/admin/auth'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import type { UserRow } from '@/types/database'
import UserGrantForm from '../../points/UserGrantForm'
import { ResetUserButton } from '../ResetUserButton'
import { DeleteUserButton } from '../DeleteUserButton'
import { BadgeHistoryTable, type BadgeHistoryRow } from './BadgeHistoryTable'
import { AdminRoleToggle } from './AdminRoleToggle'
import { BadgeDiagnosisButton } from './BadgeDiagnosisButton'
import { CombineFailTable, type CombineFailRow } from './CombineFailTable'

interface Props {
  params: Promise<{ id: string }>
  /** 배지 획득 히스토리의 번호 페이지 이동(`page`) — 같은 키가 두 번 오면 배열이라 정규화한다(티켓 20260906_1312) */
  searchParams: SearchParamsPromise
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default async function AdminUserDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const rawParams = pickSingleQueryParams(await searchParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)
  const service = createServiceClient()

  const { data: userRaw } = await service.from('users').select('*').eq('id', id).single()
  if (!userRaw) notFound()
  const user = userRaw as UserRow

  // 배지 획득 히스토리 — 50건씩 서버 페이지 이동(티켓 20260924_0951). 총 개수는 count 값이다
  // (배열 길이로 세면 PostgREST 1,000행 상한에서 조용히 잘린다). 같은 시각에 획득한 행이 쪽 경계에서
  // 새거나 겹치지 않도록 id를 보조 정렬 키로 둔다.
  const [historyFrom, historyTo] = pageRange(page, ADMIN_LIST_PAGE_SIZE)
  const { data: badgeHistoryRaw, count: badgeHistoryTotal } = await service
    .from('user_activity_badges')
    .select(
      'id, earned_at, triggered_by, triggered_by_activity_name, condition_snapshot, badges(id, name, rarity)',
      { count: 'exact' }
    )
    .eq('user_id', id)
    .order('earned_at', { ascending: false })
    .order('id', { ascending: true })
    .range(historyFrom, historyTo)

  const badgeHistory = (badgeHistoryRaw ?? []) as unknown as BadgeHistoryRow[]
  const badgeHistoryCount = badgeHistoryTotal ?? badgeHistory.length

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

  // 유저 조회 목록에서 옮겨 온 초기화·완전 삭제(티켓 20260924_0951). 어드민 계정·본인은 서버가 거부하므로 버튼을 숨긴다.
  const currentAdmin = await getAdminUser()
  const isSelf = currentAdmin?.id === user.id
  const isAdmin = isAdminAccount(user)

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

      {/* 계정 작업 — 목록에서 뺀 초기화·완전 삭제 */}
      <div className="mb-8 max-w-xl bg-white border border-border rounded-2xl p-5 space-y-3">
        <h3 className="font-bold">계정 작업</h3>
        {isSelf ? (
          <p className="text-muted-foreground text-sm">본인 계정은 이 화면에서 초기화하거나 삭제할 수 없어요.</p>
        ) : (
          <div className="flex items-center gap-4">
            {isAdmin ? (
              <p className="text-muted-foreground text-sm">어드민 계정은 초기화할 수 없어요.</p>
            ) : (
              <ResetUserButton userId={user.id} userName={user.username ?? user.email} />
            )}
            <DeleteUserButton userId={user.id} userName={user.username ?? user.email} userEmail={user.email} />
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">배지 획득 히스토리</h2>
        <div className="flex items-center gap-3">
          <p className="text-muted-foreground text-sm">총 {badgeHistoryCount}개</p>
          {/* 조건 충족·미발급 진단 (티켓 20260906_1432) */}
          <BadgeDiagnosisButton userId={user.id} />
        </div>
      </div>

      <BadgeHistoryTable rows={badgeHistory} />
      <Suspense>
        <DataTablePagination page={page} totalPages={totalPagesOf(badgeHistoryCount, ADMIN_LIST_PAGE_SIZE)} />
      </Suspense>

      <div className="mt-10 mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">믹스 실패 이력</h2>
        <p className="text-muted-foreground text-sm">총 {combineFails.length}건</p>
      </div>

      <CombineFailTable rows={combineFails} badgeNames={failBadgeNames} />
    </div>
  )
}
