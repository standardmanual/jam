'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { d } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'

interface SyncResponse {
  synced: number
  badges: number
  itemBooksCompleted: number
  missionsCompleted: number
  /** 서버가 10건까지 잘라 내려준 획득 배지 상세 (20260823_008) */
  earnedBadges?: RevealBadge[]
  /** 상세를 싣지 못한 잔여 개수 */
  earnedBadgesMore?: number
  /** 이번에 받은 배지가 유저의 전체 첫 배지인지 — GA4 first_badge_earned (20260903_1034) */
  isFirstBadgeEver?: boolean
  /** 이번 싱크에서 새로 완료된 미션 id — GA4 mission_complete */
  completedMissionIds?: string[]
}

/**
 * 스트라바 수동 동기화 버튼(연동된 유저 전용) + 획득 배지 연출.
 *
 * 20260824_010: 홈 화면 카드 전용이었던 컴포넌트를 공용 위치(`src/components`)로 옮겨
 * TopNav 중앙 슬롯(모든 페이지 공통)에서도 재사용한다. 동작(POST /api/strava/sync →
 * 배지 캐러셀 또는 완료 토스트)은 변경 없음 — 호출 위치만 늘었다.
 */
export default function SyncButton({ username }: { username: string | null }) {
  const [loading, setLoading] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)
  const [earnedBadges, setEarnedBadges] = useState<RevealBadge[]>([])
  const [earnedBadgesMore, setEarnedBadgesMore] = useState(0)
  const { toast } = useToast()
  const router = useRouter()

  // "배지 전부 보기" 이동 경로 — TopNav 우측 아바타 링크(20260824_010)와 같은 값
  const profileHref = username ? `/${username}` : '/profile'

  async function handleSync() {
    setLoading(true)
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' })
      if (res.ok) {
        const data: SyncResponse = await res.json()
        const badges = data.earnedBadges ?? []

        // GA4 mission_complete — 완료 INSERT 자체가 유니크 제약으로 평생 1회만 성공하므로
        // (checkMissions), 이번 응답에 실린 id는 항상 "새로 완료된" 것만이다.
        for (const missionId of data.completedMissionIds ?? []) {
          trackEvent('mission_complete', { mission_id: missionId })
        }

        /* 노출 판단은 earnedBadges.length 단일 기준이다.
           badges 카운터에는 아이템 드랍 배지·미션 보상 배지가 빠져 있어, 그 값을 쓰면
           아이템배지만 드랍된 날 배지를 받고도 연출이 뜨지 않는다 (20260823_008 확정). */
        if (badges.length > 0) {
          // GA4 first_badge_earned — 서버가 user_activity_badges 전체 카운트로 판정한 값을
          // 그대로 신뢰한다 (StravaConnectReveal과 동일 계약).
          if (data.isFirstBadgeEver) trackEvent('first_badge_earned')
          setEarnedBadges(badges)
          setEarnedBadgesMore(data.earnedBadgesMore ?? 0)
          setRevealOpen(true)
          // router.refresh()는 오버레이를 닫을 때로 미룬다 —
          // 연출이 떠 있는 동안 뒤 페이지가 리렌더되지 않도록.
        } else {
          // 배지 0개면 연출이 없으므로 기존 완료 토스트를 유지한다(무반응 방지).
          toast(d.today.syncDone, 'success')
          router.refresh()
        }
      } else {
        toast(d.today.syncFailed, 'error')
      }
    } catch {
      toast(d.common.networkError, 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleRevealClose() {
    setRevealOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button
        variant="outline"
        surface="sub"
        size="xs"
        style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-base-white)' }}
        onClick={handleSync}
        loading={loading}
      >
        {d.today.syncButton}
      </Button>

      <BadgeRevealOverlay
        open={revealOpen}
        items={earnedBadges}
        moreCount={earnedBadgesMore}
        profileHref={profileHref}
        onClose={handleRevealClose}
      />
    </>
  )
}
