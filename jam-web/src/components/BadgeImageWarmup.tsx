'use client'

// 곧 열 화면(배지함·인벤토리)의 배지 그림을 메인 화면이 뜬 뒤 한가한 시점에 미리 받아 브라우저 캐시에 넣는다.
// 아무것도 그리지 않는다. 규칙은 docs/service/prd/asset-generator/PRD.md §9.1 (티켓 20261115_1344).

import { useEffect } from 'react'
import { warmImageSrcs } from '@/lib/warmImages'
import { BADGE_CARD_DISPLAY_WIDTH, nextImageWidthFor, optimizedImageUrl } from '@/lib/imageSrc'

export const WARMUP_SESSION_KEY = 'jam:badge-image-warmup'
const IDLE_TIMEOUT_MS = 4000
const FALLBACK_DELAY_MS = 2000

type NetworkInformationLike = { saveData?: boolean }

let inFlight = false

export async function warmUpBadgeImages() {
  if (inFlight) return
  inFlight = true
  try {
    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
    if (conn?.saveData) return
    if (sessionStorage.getItem(WARMUP_SESSION_KEY)) return

    const res = await fetch('/api/badge-images/warmup', { credentials: 'same-origin' })
    if (!res.ok) return
    const body = (await res.json()) as { urls?: unknown }
    if (!Array.isArray(body.urls)) return
    // 목록을 받은 뒤에 기록한다. 먼저 기록하면 첫 시도가 통신 오류로 실패했을 때 그 탭에서는 다시 시도하지 못한다
    sessionStorage.setItem(WARMUP_SESSION_KEY, '1')

    const width = nextImageWidthFor(BADGE_CARD_DISPLAY_WIDTH, window.devicePixelRatio || 1)
    const srcs = body.urls
      .filter((u): u is string => typeof u === 'string')
      .map((u) => optimizedImageUrl(u, width))
      .filter((s): s is string => !!s)

    await warmImageSrcs(srcs)
  } catch {
    // 미리 받기는 덤이다 — 실패해도 화면에 아무 영향이 없어야 한다
  } finally {
    inFlight = false
  }
}

export default function BadgeImageWarmup() {
  useEffect(() => {
    let cancelled = false
    let idleId: number | undefined
    let timerId: ReturnType<typeof setTimeout> | undefined

    const start = () => {
      if (cancelled) return
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => void warmUpBadgeImages(), { timeout: IDLE_TIMEOUT_MS })
      } else {
        timerId = setTimeout(() => void warmUpBadgeImages(), FALLBACK_DELAY_MS)
      }
    }

    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', start)
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      if (timerId !== undefined) clearTimeout(timerId)
    }
  }, [])

  return null
}
