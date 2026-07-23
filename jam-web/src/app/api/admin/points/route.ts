import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getWallet, listTransactions } from '@/lib/points'
import { getPointsSummary } from '@/lib/points/summary'
import { adminReasonLabel } from '@/lib/points/reasons'
import type { PointTransactionRow, UserRow } from '@/types/database'

const REASON_KIND: Record<PointTransactionRow['reason'], string> = {
  badge_point_reward: '배지 보상',
  mission_point_reward: '미션 보상',
  admin_grant: '운영자 지급',
  admin_deduct: '운영자 회수',
}

export interface AdminUserPointHistoryItem {
  id: string
  amount: number
  created_at: string
  title: string
  note: string | null
}

/**
 * GET /api/admin/points            → 대시보드 요약 통계
 * GET /api/admin/points?userId=... → 대상 유저의 잔액 + 최근 내역 (지급/회수 폼용)
 * GET /api/admin/points?q=...      → 유저 검색 (username/email, 잔액 포함)
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userId = req.nextUrl.searchParams.get('userId')
  const q = req.nextUrl.searchParams.get('q')

  // ── 유저 검색 ──────────────────────────────────────────────
  if (q !== null) {
    const term = q.trim()
    if (term.length === 0) return NextResponse.json({ users: [] })
    const service = createServiceClient()
    // 콤마/괄호는 PostgREST or 필터 문법과 충돌 → 제거해서 안전하게 검색
    const safe = term.replace(/[,()]/g, ' ').trim()
    const { data } = await service
      .from('users')
      .select('id, username, email')
      .or(`username.ilike.%${safe}%,email.ilike.%${safe}%`)
      .limit(20)
    const users = (data ?? []) as Pick<UserRow, 'id' | 'username' | 'email'>[]

    const withBalance = await Promise.all(
      users.map(async (u) => ({ ...u, balance: await getWallet(u.id) }))
    )
    return NextResponse.json({ users: withBalance })
  }

  // ── 특정 유저 상세 (잔액 + 최근 내역) ───────────────────────
  if (userId) {
    const service = createServiceClient()
    const [userRes, balance, page] = await Promise.all([
      service.from('users').select('id, username, email').eq('id', userId).maybeSingle(),
      getWallet(userId),
      listTransactions(userId, null, 15),
    ])
    const targetUser = userRes.data as Pick<UserRow, 'id' | 'username' | 'email'> | null
    if (!targetUser) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

    const badgeIds = [...new Set(page.items.filter((t) => t.source_badge_id).map((t) => t.source_badge_id as string))]
    const missionIds = [...new Set(page.items.filter((t) => t.source_mission_id).map((t) => t.source_mission_id as string))]
    const [badgesRes, missionsRes] = await Promise.all([
      badgeIds.length > 0 ? service.from('badges').select('id, name').in('id', badgeIds) : Promise.resolve({ data: [] }),
      missionIds.length > 0 ? service.from('missions').select('id, title').in('id', missionIds) : Promise.resolve({ data: [] }),
    ])
    const badgeName = new Map(((badgesRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]))
    const missionTitle = new Map(((missionsRes.data ?? []) as { id: string; title: string }[]).map((m) => [m.id, m.title]))

    const items: AdminUserPointHistoryItem[] = page.items.map((t) => {
      let title = REASON_KIND[t.reason]
      if (t.reason === 'badge_point_reward' && t.source_badge_id) title = `배지 · ${badgeName.get(t.source_badge_id) ?? '삭제됨'}`
      else if (t.reason === 'mission_point_reward' && t.source_mission_id) title = `미션 · ${missionTitle.get(t.source_mission_id) ?? '삭제됨'}`
      else if (t.reason === 'admin_grant' || t.reason === 'admin_deduct') title = `${REASON_KIND[t.reason]} · ${adminReasonLabel(t.admin_reason_label)}`
      return {
        id: t.id,
        amount: t.amount,
        created_at: t.created_at,
        title,
        note: t.admin_reason_label === 'other' ? t.admin_reason_note : null,
      }
    })

    return NextResponse.json({ user: targetUser, balance, items })
  }

  // ── 대시보드 요약 ──────────────────────────────────────────
  const summary = await getPointsSummary()
  return NextResponse.json(summary)
}
