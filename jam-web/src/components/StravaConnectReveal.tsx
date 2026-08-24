'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'

/**
 * 최초 Strava 연동 직후 도착 화면 피드백 (20260824_003, 20260824_008).
 *
 * `/api/strava/callback`은 동기화를 await한 **뒤 곧바로 리다이렉트**하므로 응답 본문에
 * 배지를 실을 수 없다. 그래서 콜백이 목적지에 `?reveal=1` 플래그를 붙이고, 도착한 화면에서
 * `/api/badges/recent-earned`로 방금 받은 배지를 되읽어 연출을 띄운다.
 * (되읽기 판정 기준은 `user_activity_feed.created_at` — 마이그레이션 093에서 추가한 기록 시각)
 *
 * 되읽는 구간에는 버튼이 없어 스피너를 걸 자리가 없다(수동 동기화는 `SyncButton`의 loading이
 * 담당). 이 구간의 대기 표현은 `WanderingEyesLoader`다 — `NavigationLoader`에서 이미 쓰는
 * JAM 전용 로더라 브랜드 일관성이 있다.
 *
 * 배지 0개(연출 없음)나 연동 자체 실패는 `?strava=connected|error&reason=...`을 토스트로
 * 소비한다 — 캐러셀이 뜨는 경우와 겹치지 않도록 배지가 있을 때는 토스트를 띄우지 않는다
 * (20260824_008).
 *
 * `(main)/layout.tsx`에 마운트한다. 콜백 목적지가 `/profile` → `/{username}` 리다이렉트를
 * 거치므로, 특정 페이지가 아니라 레이아웃에 두어야 도착 지점과 무관하게 동작한다.
 */

interface RecentEarnedResponse {
  earnedBadges?: RevealBadge[]
  earnedBadgesMore?: number
}

type Phase = 'idle' | 'loading' | 'open'

/** 되읽기 타임아웃. 넘기면 연출을 포기하고 원래 화면으로 돌아간다(갇히지 않는 것이 우선). */
const RECENT_EARNED_TIMEOUT_MS = 8000

/**
 * 연동 실패 사유별 토스트 문구. `access_denied`(Strava 인가 화면에서 사용자가 직접 거부)는
 * 시스템 오류가 아니라 사용자의 선택이므로 "취소" 톤으로 따로 안내한다. 그 외
 * (`missing_params`·`token_exchange`·`db_error`·`server_error` 등 기술적 원인)는 사용자
 * 입장에서 취할 행동이 "다시 시도"로 동일해 하나의 안내로 묶는다 (20260824_008).
 */
function stravaErrorToastMessage(reason: string | null): string {
  if (reason === 'access_denied') return d.profile.stravaConnectCancelledToast
  return d.profile.stravaConnectFailedToast
}

function Inner({ username }: { username: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [phase, setPhase] = useState<Phase>('idle')
  const [items, setItems] = useState<RevealBadge[]>([])
  const [moreCount, setMoreCount] = useState(0)

  /* 한 번 시작한 조회는 다시 시작하지 않는다. 아래에서 플래그를 지우려고 router.replace를
     호출하면 searchParams가 바뀌며 이펙트가 다시 도는데, 그때 재요청이 나가면 안 된다. */
  const startedRef = useRef(false)
  /* 연동 실패(strava=error) 토스트도 한 번만 띄운다 — 아래 URL 정리로 인한 재실행 방지용. */
  const startedErrorRef = useRef(false)
  /* 언마운트 이후 setState 방지용. 이펙트 정리 함수로 취소 플래그를 세우면 위의 router.replace
     때문에 요청이 살아 있는 동안 취소되어 결과가 버려진다 — 그래서 마운트 수명으로만 판단한다. */
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /* Escape로 이미 빠져나왔으면 뒤늦게 도착한 응답으로 다시 열지 않기 위한 취소 플래그.
     예전에는 이 판정을 `phase` state(를 ref로 미러링한 값)로 했는데, `router.replace()`
     직후 호출되는 `setPhase('loading')`는 그 replace가 만든 트랜지션에 밀려 커밋이
     수백 ms 지연될 수 있다(실측: 이 컴포넌트가 Suspense 안에서 useSearchParams를 쓰기
     때문). `/api/badges/recent-earned`가 그보다 먼저 응답하면 "아직 로딩 중"인데도
     phase가 여전히 'idle'로 읽혀 정상 응답을 "취소됨"으로 오판해 캐러셀·토스트가 둘 다
     사라지는 레이스가 있었다 (20260824_008 구현 중 발견). React 렌더/커밋과 무관하게
     동기로 갱신되는 이 ref로만 취소 여부를 판정해 레이스를 없앤다. */
  const cancelledRef = useRef(false)

  /* 아래 Escape 리스너(마운트 시 1회 등록, 항상 살아있음)가 "지금 취소 가능한 구간인가"를
     판정하는 데 쓰는 ref. `phase === 'loading'`로 게이트하면 그 커밋이 지연되는 동안
     Escape가 무시된다(위 cancelledRef 주석과 같은 레이스). 그렇다고 이 값을 이 컴포넌트
     안의 다른 이펙트(`shouldReveal` 이펙트)의 cleanup에 묶을 수도 없다 — 그 이펙트는
     `router.replace()`가 바꾸는 `searchParams`에 의존하므로, replace 직후 곧바로
     재실행되면서 cleanup이 먼저 발화해 방금 세운 리스닝 상태를 즉시 꺼버린다. 그래서
     "지금 취소 가능한가"는 이 ref 하나로만 동기 갱신하고, 리스너 자체는 컴포넌트
     생애주기 동안 한 번만 등록한다 (20260824_008 WARN 대응). */
  const listeningRef = useRef(false)

  const shouldReveal = searchParams.get('reveal') === '1'

  useEffect(() => {
    if (!shouldReveal || startedRef.current) return
    startedRef.current = true
    cancelledRef.current = false

    // 배지 캐러셀이 뜨면 그걸로 충분하므로, 캐러셀이 뜨지 않는 경우(배지 0개)에만
    // 연동 성공 토스트를 띄운다 — 판정은 replace로 URL을 지우기 전에 미리 읽어둔다.
    const stravaConnected = searchParams.get('strava') === 'connected'

    // 새로고침·뒤로가기로 연출·토스트가 다시 뜨지 않도록 URL에서 플래그를 지운다.
    const params = new URLSearchParams(searchParams.toString())
    params.delete('reveal')
    params.delete('strava')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })

    listeningRef.current = true
    setPhase('loading')
    void (async () => {
      try {
        /* 타임아웃 필수 — 이 구간은 오버레이가 탭바를 DOM에서 제거하고 main 스크롤을 잠근
           상태다. 요청이 응답도 거부도 하지 않고 매달리면 사용자가 전체화면에 갇힌다.
           (게이트 리뷰 20260824_003 WARN 2) */
        const res = await fetch('/api/badges/recent-earned', {
          signal: AbortSignal.timeout(RECENT_EARNED_TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`recent-earned ${res.status}`)
        const data: RecentEarnedResponse = await res.json()
        if (!mountedRef.current || cancelledRef.current) return
        listeningRef.current = false
        const badges = data.earnedBadges ?? []
        if (badges.length === 0) {
          // 획득한 배지가 없으면 캐러셀 대신 가벼운 토스트로 연동 성공을 알린다 (20260824_008).
          if (stravaConnected) toast(d.profile.stravaConnectSuccessToast, 'success')
          setPhase('idle')
          return
        }
        setItems(badges)
        setMoreCount(data.earnedBadgesMore ?? 0)
        setPhase('open')
      } catch (err) {
        console.error('[StravaConnectReveal] 최근 획득 배지 조회 실패:', err)
        listeningRef.current = false
        if (mountedRef.current) setPhase('idle')
      }
    })()
  }, [shouldReveal, searchParams, pathname, router, toast])

  const stravaError = searchParams.get('strava') === 'error'

  // 연동 실패(?strava=error&reason=...) 피드백 — reveal 플래그 없이 단독으로 붙으므로
  // 배지 연출 이펙트와 별도로 처리한다 (20260824_008).
  useEffect(() => {
    if (!stravaError || startedErrorRef.current) return
    startedErrorRef.current = true

    const reason = searchParams.get('reason')

    // 새로고침·뒤로가기로 토스트가 다시 뜨지 않도록 URL에서 파라미터를 지운다.
    const params = new URLSearchParams(searchParams.toString())
    params.delete('strava')
    params.delete('reason')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })

    toast(stravaErrorToastMessage(reason), 'error')
  }, [stravaError, searchParams, pathname, router, toast])

  const handleClose = useCallback(() => {
    setPhase('idle')
    router.refresh()
  }, [router])

  /* 대기 중 Escape 탈출. 타임아웃이 상한을 보장하지만, 8초를 기다리는 대신 사용자가 즉시
     빠져나올 수단도 둔다. 진행 중인 요청은 그대로 두고 화면만 닫는다 — cancelledRef를
     세워 뒤늦게 도착하는 응답이 화면을 다시 열지 못하게 한다.

     리스너는 마운트 시 한 번만 등록한다(빈 deps) — `phase` state로 게이트하면 그 상태
     커밋이 지연되는 구간에서 Escape가 씹힌다(위 listeningRef 주석 참고). 실제로 취소
     가능한지는 매 keydown마다 `listeningRef.current`를 그 자리에서 읽어 판정한다. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !listeningRef.current) return
      listeningRef.current = false
      cancelledRef.current = true
      setPhase('idle')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

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
