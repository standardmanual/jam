import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toastBottom } from './Toast'

// 티켓 20261125_1840: 토스트가 화면 아래에 붙지 않고 탭바보다 약 30px 높이 떠 있던 문제.
// 위치 숫자(88px)를 서비스 파일에 두지 않고 DS 토큰(--toast-bottom → --tabbar-bottom)을 읽게 했다.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf-8')

describe('toastBottom', () => {
  it('하단 오버레이가 없으면 DS 토큰만 쓴다 (숫자·safe-area 계산이 서비스 파일에 없다)', () => {
    expect(toastBottom(0, 16)).toBe('var(--toast-bottom)')
  })

  it('점유 높이가 신고되면 그 위 간격만큼 띄우되 기본 위치보다 아래로 내려가지 않는다', () => {
    expect(toastBottom(300, 16)).toBe(
      'max(var(--toast-bottom), calc(env(safe-area-inset-bottom) + 316px))',
    )
  })

  it('음수·NaN 같은 비정상 값은 신고가 없는 것으로 본다', () => {
    expect(toastBottom(-5, 16)).toBe('var(--toast-bottom)')
    expect(toastBottom(Number.NaN, 16)).toBe('var(--toast-bottom)')
  })
})

describe('하단 기준선 토큰 단일 원천', () => {
  const tokens = read('../../../design-system/tokens/spacing.css')

  it('--tabbar-bottom은 DS 토큰에 한 번만 정의되고 --toast-bottom이 그것을 따른다', () => {
    expect(tokens.match(/^\s*--tabbar-bottom:\s*max\(/gm)).toHaveLength(1)
    expect(tokens).toMatch(/--toast-bottom:\s*var\(--tabbar-bottom\)/)
  })

  it('서비스·DS 탭바와 지도 버튼이 같은 토큰을 읽는다', () => {
    expect(read('./TabBar.tsx')).toContain("bottom: 'var(--tabbar-bottom)'")
    expect(read('../../../design-system/components/navigation/TabBar.jsx')).toContain(
      "bottom: 'var(--tabbar-bottom)'",
    )
    expect(read('../map/MapView.tsx')).toContain('calc(var(--tabbar-bottom) + 49px + 18px)')
  })

  it('토스트 컨테이너에 옛 고정값 88px가 남아 있지 않다', () => {
    const src = read('./Toast.tsx')
    expect(src).not.toMatch(/DEFAULT_BOTTOM_PX/)
    expect(src).toContain('toastBottom(reservedBottom, overlayGapPx())')
  })
})
