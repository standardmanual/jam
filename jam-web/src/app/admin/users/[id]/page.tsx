import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { UserRow, BadgeConditionSnapshot } from '@/types/database'
import UserGrantForm from '../../points/UserGrantForm'

interface Props {
  params: Promise<{ id: string }>
}

interface BadgeHistoryRow {
  id: string
  earned_at: string
  triggered_by: string | null
  triggered_by_activity_name: string | null
  condition_snapshot: BadgeConditionSnapshot | null
  badges: { id: string; name: string; rarity: string } | null
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', legendary: 'Legendary', mythic: 'Mythic',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatActivity(a: NonNullable<BadgeConditionSnapshot['trigger_activity']>): string {
  const parts: string[] = []
  if (a.name) parts.push(a.name)
  if (a.activityType) parts.push(a.activityType)
  if (a.distanceKm != null) parts.push(`${a.distanceKm}km`)
  if (a.movingTimeSec != null) parts.push(`${Math.round(a.movingTimeSec / 60)}분`)
  if (a.elevationGainM != null) parts.push(`고도 ${a.elevationGainM}m`)
  if (a.averageSpeedKmh != null) parts.push(`평속 ${a.averageSpeedKmh}km/h`)
  return parts.join(' · ')
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params
  const service = createServiceClient()

  const { data: userRaw } = await service.from('users').select('*').eq('id', id).single()
  if (!userRaw) notFound()
  const user = userRaw as UserRow

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: badgeHistoryRaw } = await (service as any)
    .from('user_activity_badges')
    .select('id, earned_at, triggered_by, triggered_by_activity_name, condition_snapshot, badges(id, name, rarity)')
    .eq('user_id', id)
    .order('earned_at', { ascending: false })

  const badgeHistory = (badgeHistoryRaw ?? []) as unknown as BadgeHistoryRow[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/users" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← 유저 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">{user.username ?? '(닉네임 없음)'}</h1>
        <p className="text-[#6b7280] text-sm mt-1">
          {user.email} · {user.region || '지역 미설정'} · 가입 {formatDateTime(user.created_at)}
        </p>
      </div>

      {/* 잼 포인트 지급/회수 (공용 폼 — /admin/points와 동일 실행 로직) */}
      <div className="mb-8 max-w-xl">
        <UserGrantForm userId={user.id} username={user.username} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">배지 발급 히스토리</h2>
        <p className="text-[#6b7280] text-sm">총 {badgeHistory.length}개</p>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
              <th className="px-5 py-3 font-medium">배지</th>
              <th className="px-5 py-3 font-medium">등급</th>
              <th className="px-5 py-3 font-medium">발급 경로</th>
              <th className="px-5 py-3 font-medium">발급 근거 (실측값)</th>
              <th className="px-5 py-3 font-medium">트리거 활동</th>
              <th className="px-5 py-3 font-medium">발급일시</th>
            </tr>
          </thead>
          <tbody>
            {badgeHistory.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[#898989]">
                  발급된 배지가 없습니다.
                </td>
              </tr>
            )}
            {badgeHistory.map((row) => {
              const snapshot = row.condition_snapshot
              return (
                <tr key={row.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors align-top">
                  <td className="px-5 py-3 font-medium">{row.badges?.name ?? '(삭제된 배지)'}</td>
                  <td className="px-5 py-3 text-[#374151]">{RARITY_LABEL[row.badges?.rarity ?? ''] ?? row.badges?.rarity ?? '—'}</td>
                  <td className="px-5 py-3 text-[#374151]">{row.triggered_by ?? '—'}</td>
                  <td className="px-5 py-3 text-[#374151]">
                    {snapshot ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[#111111]">{snapshot.actual || '—'}</span>
                        <span className="text-[#898989] text-xs">기준: {snapshot.required || '—'}</span>
                      </div>
                    ) : (
                      <span className="text-[#898989]">기록 없음</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#374151]">
                    {snapshot?.trigger_activity
                      ? formatActivity(snapshot.trigger_activity)
                      : (row.triggered_by_activity_name ?? '—')}
                  </td>
                  <td className="px-5 py-3 text-[#6b7280] text-xs whitespace-nowrap">
                    {formatDateTime(row.earned_at)}
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
