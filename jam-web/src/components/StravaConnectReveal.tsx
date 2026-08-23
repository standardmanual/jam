'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'

/**
 * 최초 Strava 연동 직후 획득 배지 연출 (20260823_008).
 *
 * `/api/strava/callback`은 동기화를 await한 **뒤 곧바로 리다이렉트**하므로 응답 본문에
 * 배지를 실을 수 없다. 그래서 콜백이 목적지에 `?reveal=1` 플래그를 붙이고, 도착한 화면에서
 * `/api/badges/recent-earned`로 방금 받은 배지를 되읽어 연출을 띄운다.
 *
 * 되읽는 구간에는 버튼이 없어 스피너를 걸 자리가 없다(수동 동기화는 `SyncButton`의 loading이
 * 담당). 이 구간의 대기 표현은 `WanderingEyesLoader`다 — `NavigationLoader`에서 이미 쓰는
 * JAM 전용 로더라 브랜드 일관성이 있다.
 *
 * `(main)/layout.tsx`에 마운트한다. 콜백 목적지가 `/profile` → `/{username}` 리다이렉트를
 * 거치므로, 특정 페이지가 아니라 레이아웃에 두어야 도착 지점과 무관하게 동작한다.
 */

interface RecentEarnedResponse {
  earnedBadges?: RevealBadge[]
  earnedBadgesMore?: number
}

type Phase = 'idle' | 'loading' | 'open'

function Inner({ username }: { username: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [phase, setPhase] = useState<Phase>('idle')
  const [items, setItems] = useState<RevealBadge[]>([])
  const [moreCount, setMoreCount] = useState(0)

  /* 한 번 시작한 조회는 다시 시작하지 않는다. 아래에서 플래그를 지우려고 router.replace를
     호출하면 searchParams가 바뀌며 이펙트가 다시 도는데, 그때 재요청이 나가면 안 된다. */
  const startedRef = useRef(false)
  /* 언마운트 이후 setState 방지용. 이펙트 정리 함수로 취소 플래그를 세우면 위의 router.replace
     때문에 요청이 살아 있는 동안 취소되어 결과가 버려진다 — 그래서 마운트 수명으로만 판단한다. */
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const shouldReveal = searchParams.get('reveal') === '1'

  useEffect(() => {
    if (!shouldReveal || startedRef.current) return
    startedRef.current = true

    // 새로고침·뒤로가기로 연출이 다시 뜨지 않도록 URL에서 플래그만 지운다.
    const params = new URLSearchParams(searchParams.toString())
    params.delete('reveal')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })

    setPhase('loading')
    void (async () => {
      try {
        const res = await fetch('/api/badges/recent-earned')
        if (!res.ok) throw new Error(`recent-earned ${res.status}`)
        const data: RecentEarnedResponse = await res.json()
        if (!mountedRef.current) return
        const badges = data.earnedBadges ?? []
        if (badges.length === 0) {
          // 획득한 배지가 없으면 조용히 원래 화면만 남긴다(연결 성공 자체는 화면에 이미 반영됨).
          setPhase('idle')
          return
        }
        setItems(badges)
        setMoreCount(data.earnedBadgesMore ?? 0)
        setPhase('open')
      } catch (err) {
        console.error('[StravaConnectReveal] 최근 획득 배지 조회 실패:', err)
        if (mountedRef.current) setPhase('idle')
      }
    })()
  }, [shouldReveal, searchParams, pathname, router])

  const handleClose = useCallback(() => {
    setPhase('idle')
    router.refresh()
  }, [router])

  return (
    <BadgeRevealOverlay
      open={phase !== 'idle'}
      loading={phase === 'loading'}
      items={items}
      moreCount={moreCount}
      profileHref={username ? `/${username}` : '/profile'}
      onClose={handleClose}
    />
  )
}

export default function StravaConnectReveal({ username }: { username: string | null }) {
  // useSearchParams()는 Suspense 경계 안에서만 쓸 수 있다 (NavigationLoader와 동일 패턴).
  return (
    <Suspense>
      <Inner username={username} />
    </Suspense>
  )
}
