import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getWallet, listTransactions } from '@/lib/points'
import { adminReasonLabel } from '@/lib/points/reasons'
import type { PointTransactionRow } from '@/types/database'

/** 포인트 내역 화면이 렌더링할 항목 (사유 라벨 + 관련 배지/미션 링크 포함) */
export interface PointHistoryItem {
  id: string
  amount: number
  created_at: string
  reason: PointTransactionRow['reason']
  /** 사람이 읽는 사유/제목 (배지·미션 이름 또는 어드민 사유 라벨) */
  title: string
  /** admin_reason_label='other'일 때 자유 입력 노트 */
  note: string | null
  /** 관련 상세로 이동할 링크 (없으면 null) */
  href: string | null
}

const REASON_KIND: Record<PointTransactionRow['reason'], string> = {
  badge_point_reward: '배지 보상',
  mission_point_reward: '미션 보상',
  admin_grant: '운영자 지급',
  admin_deduct: '운영자 회수',
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cursor = req.nextUrl.searchParams.get('cursor')

  const [balance, page] = await Promise.all([
    getWallet(user.id),
    listTransactions(user.id, cursor),
  ])

  // 관련 배지/미션 이름 일괄 조회 (service role — 배지/미션 마스터는 공개 정보)
  const service = createServiceClient()
  const badgeIds = [...new Set(page.items.filter((t) => t.source_badge_id).map((t) => t.source_badge_id as string))]
  const missionIds = [...new Set(page.items.filter((t) => t.source_mission_id).map((t) => t.source_mission_id as string))]

  const [badgesRes, missionsRes] = await Promise.all([
    badgeIds.length > 0
      ? service.from('badges').select('id, name').in('id', badgeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    missionIds.length > 0
      ? service.from('missions').select('id, title').in('id', missionIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])

  const badgeName = new Map(((badgesRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]))
  const missionTitle = new Map(((missionsRes.data ?? []) as { id: string; title: string }[]).map((m) => [m.id, m.title]))

  const items: PointHistoryItem[] = page.items.map((t) => {
    let title = REASON_KIND[t.reason]
    let href: string | null = null

    if (t.reason === 'badge_point_reward' && t.source_badge_id) {
      title = badgeName.get(t.source_badge_id) ?? '배지 보상'
      href = `/badges/${t.source_badge_id}`
    } else if (t.reason === 'mission_point_reward' && t.source_mission_id) {
      title = missionTitle.get(t.source_mission_id) ?? '미션 보상'
      href = `/missions/${t.source_mission_id}`
    } else if (t.reason === 'admin_grant' || t.reason === 'admin_deduct') {
      title = adminReasonLabel(t.admin_reason_label)
    }

    return {
      id: t.id,
      amount: t.amount,
      created_at: t.created_at,
      reason: t.reason,
      title,
      note: t.admin_reason_label === 'other' ? t.admin_reason_note : null,
      href,
    }
  })

  return NextResponse.json({ balance, items, nextCursor: page.nextCursor })
}
