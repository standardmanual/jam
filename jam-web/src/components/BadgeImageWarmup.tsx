'use client'

// 곧 열 화면(배지함·인벤토리)의 배지 그림을 메인 화면이 뜬 뒤 한가한 시점에 미리 받아 브라우저 캐시에 넣는다.
// 아무것도 그리지 않는다. 규칙은 docs/service/prd/asset-generator/PRD.md §9.1 (티켓 20261115_1344).

import { useEffect } from 'react'
import { BADGE_CARD_DISPLAY_WIDTH, nextImageWidthFor, optimizedImageUrl } from '@/lib/imageSrc'

export const WARMUP_SESSION_KEY ='jam:badge-image-warmup'
const BATCH_SIZE = 6
const FALLBACK_DELAY_MS = 2000

type NetworkInformationLike = { saveData?: boolean }

function loadOne(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.fetchPriority = 'low'
    img.decoding = 'async'
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
  })
}

export async function warmUpBadgeImages() {
  try {
    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
    if (conn?.saveData) return
    if (sessionStorage.getItem(WARMUP_SESSION_KEY)) return
    sessionStorage.setItem(WARMUP_SESSION_KEY, '1')

    const res = await fetch('/api/badge-images/warmup', { credentials: 'same-origin' })
    if (!res.ok) return
    const body = (await res.json()) as { urls?: unknown }
    if (!Array.isArray(body.urls)) return

    const width = nextImageWidthFor(BADGE_CARD_DISPLAY_WIDTH, window.devicePixelRatio || 1)
    const srcs = body.urls
      .filter((u): u is string => typeof u === 'string')
      .map((u) => optimizedImageUrl(u, width))
      .filter((s): s is string => !!s)

    for (let i = 0; i < srcs.length; i += BATCH_SIZE) {
      await Promise.all(srcs.slice(i, i + BATCH_SIZE).map(loadOne))
    }
  } catch {
    // 미리 받기는 덤이다 — 실패해도 화면에 아무 영향이 없어야 한다
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
        idleId = window.requestIdleCallback(() => void warmUpBadgeImages())
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
