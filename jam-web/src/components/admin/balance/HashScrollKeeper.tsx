'use client'

/**
 * 구역 앵커(`#구역`)로 들어온 직후 목표 구역에 머물게 한다 (티켓 20261022_1136 1회 b, 로컬 실렌더에서 발견).
 *
 * 밸런스 설정은 구역마다 `Suspense`로 따로 읽어서, 다른 쪽(밸런스 지표)에서 `/admin/balance#inventory`로 들어오면
 * 브라우저가 앵커로 스크롤하는 순간에는 위쪽 구역이 아직 작은 skeleton이다. 구역이 차례로 채워지며 문서가 길어지면
 * 목표 구역이 아래로 밀려나 엉뚱한 구역에서 멈춘다(실측: 목표 구역이 화면 아래 6,444px로 밀렸고 스크롤은 3,309px에 있었다).
 * 그래서 들어온 직후 잠깐 동안 문서 높이가 바뀔 때마다 목표 구역을 다시 맞춘다. 화면을 직접 움직이기 시작하거나
 * 시간이 지나면(`HOLD_MS`) 멈춘다. 화면에는 아무것도 그리지 않는다.
 */
import { useEffect } from 'react'

/** 구역이 모두 채워질 때까지 기다리는 상한. 이 뒤에는 사용자가 움직인 위치를 건드리지 않는다 */
const HOLD_MS = 6000

/** 사용자가 직접 화면을 움직이기 시작했다고 보는 입력들 */
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

export function HashScrollKeeper() {
  useEffect(() => {
    let id = ''
    try {
      id = decodeURIComponent(window.location.hash.slice(1))
    } catch {
      return
    }
    if (!id) return

    const align = () => {
      document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' })
    }

    const observer = new ResizeObserver(align)
    const stop = () => {
      observer.disconnect()
      window.clearTimeout(timer)
      for (const type of USER_INPUT_EVENTS) window.removeEventListener(type, stop)
    }
    const timer = window.setTimeout(stop, HOLD_MS)

    for (const type of USER_INPUT_EVENTS) window.addEventListener(type, stop, { passive: true })
    observer.observe(document.body)
    align()

    return stop
  }, [])

  return null
}
