/**
 * 어드민 포인트 대시보드용 집계 (서버 사이드 전용).
 *
 * 정합성 불변식(Phase12_02 §5):
 *   Σ point_wallets.balance = treasury.total_minted − treasury.total_reclaimed
 *                           = Σ point_transactions.amount
 * 세 값을 각각 독립적으로 계산해서 비교한다 — 하나라도 어긋나면 원장 버그 신호.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { HIGH_VALUE_THRESHOLD } from '@/lib/points/reasons'
import type { PointTransactionRow, PointTreasuryRow } from '@/types/database'

export interface RankingEntry {
  id: string
  name: string
  total: number
}

export interface PointsSummary {
  totalMinted: number
  totalReclaimed: number
  circulation: number // minted − reclaimed (= 이론상 유통량)
  walletSum: number // 실제 유저 보유 합계
  txnSum: number // 원장 합계
  /** 세 값(circulation, walletSum, txnSum)이 모두 일치하는가 */
  integrityOk: boolean
  badgeRanking: RankingEntry[]
  missionRanking: RankingEntry[]
  highValueThreshold: number
}

export async function getPointsSummary(): Promise<PointsSummary> {
  const supabase = createServiceClient()

  const [treasuryRes, walletsRes, txnsRes] = await Promise.all([
    supabase.from('point_treasury').select('*').eq('id', 1).maybeSingle(),
    supabase.from('point_wallets').select('balance'),
    supabase.from('point_transactions').select('*').order('created_at', { ascending: false }).limit(50000),
  ])

  const treasury = (treasuryRes.data as PointTreasuryRow | null) ?? {
    id: 1, total_minted: 0, total_reclaimed: 0, updated_at: '',
  }
  const wallets = (walletsRes.data ?? []) as { balance: number }[]
  const txns = (txnsRes.data ?? []) as PointTransactionRow[]

  const totalMinted = Number(treasury.total_minted)
  const totalReclaimed = Number(treasury.total_reclaimed)
  const circulation = totalMinted - totalReclaimed
  const walletSum = wallets.reduce((s, w) => s + w.balance, 0)
  const txnSum = txns.reduce((s, t) => s + t.amount, 0)
  const integrityOk = circulation === walletSum && walletSum === txnSum

  // 배지·미션별 발행량 순위 (적립 = 양수만 집계)
  const badgeTotals = new Map<string, number>()
  const missionTotals = new Map<string, number>()
  for (const t of txns) {
    if (t.reason === 'badge_point_reward' && t.source_badge_id) {
      badgeTotals.set(t.source_badge_id, (badgeTotals.get(t.source_badge_id) ?? 0) + t.amount)
    } else if (t.reason === 'mission_point_reward' && t.source_mission_id) {
      missionTotals.set(t.source_mission_id, (missionTotals.get(t.source_mission_id) ?? 0) + t.amount)
    }
  }

  const topBadgeIds = [...badgeTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const topMissionIds = [...missionTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

  const [badgesRes, missionsRes] = await Promise.all([
    topBadgeIds.length > 0
      ? supabase.from('badges').select('id, name').in('id', topBadgeIds.map(([id]) => id))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    topMissionIds.length > 0
      ? supabase.from('missions').select('id, title').in('id', topMissionIds.map(([id]) => id))
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])

  const badgeName = new Map(((badgesRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]))
  const missionTitle = new Map(((missionsRes.data ?? []) as { id: string; title: string }[]).map((m) => [m.id, m.title]))

  const badgeRanking: RankingEntry[] = topBadgeIds.map(([id, total]) => ({
    id, total, name: badgeName.get(id) ?? '(삭제된 배지)',
  }))
  const missionRanking: RankingEntry[] = topMissionIds.map(([id, total]) => ({
    id, total, name: missionTitle.get(id) ?? '(삭제된 미션)',
  }))

  return {
    totalMinted,
    totalReclaimed,
    circulation,
    walletSum,
    txnSum,
    integrityOk,
    badgeRanking,
    missionRanking,
    highValueThreshold: HIGH_VALUE_THRESHOLD,
  }
}
