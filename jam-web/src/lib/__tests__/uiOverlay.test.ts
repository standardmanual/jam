/**
 * 하단 오버레이 점유 높이 스토어 회귀 테스트 (20260826_005).
 *
 * 이 값이 잘못되면 토스트가 시트 액션 버튼 위로 안 올라가(겹침 재발) 버튼 탭이 토스트
 * 디스미스로 먹히거나, 반대로 해제 누수로 "모든 토스트가 영구히 밀려 올라간" 상태가 된다.
 */
import { describe, it, expect } from 'vitest'
import { pushBottomOverlay, getBottomOverlayReserved } from '@/lib/uiOverlay'

describe('pushBottomOverlay / getBottomOverlayReserved', () => {
  it('중첩해서 열리면 가장 높이 점유하는 값을 유지한다', () => {
    const releaseLow = pushBottomOverlay(60)
    expect(getBottomOverlayReserved()).toBe(60)

    const releaseHigh = pushBottomOverlay(136)
    expect(getBottomOverlayReserved()).toBe(136)

    // 낮은 쪽이 먼저 닫혀도 남아 있는 오버레이 기준값이 유지된다
    releaseLow()
    expect(getBottomOverlayReserved()).toBe(136)

    releaseHigh()
    expect(getBottomOverlayReserved()).toBe(0)
  })

  it('전부 해제하면 0으로 복귀한다 (해제 순서 무관)', () => {
    const releaseA = pushBottomOverlay(100)
    const releaseB = pushBottomOverlay(200)
    const releaseC = pushBottomOverlay(50)

    releaseB()
    expect(getBottomOverlayReserved()).toBe(100)
    releaseA()
    expect(getBottomOverlayReserved()).toBe(50)
    releaseC()
    expect(getBottomOverlayReserved()).toBe(0)
  })

  it('음수·NaN은 0으로 클램프하고, 해제를 여러 번 불러도 남의 항목이 지워지지 않는다', () => {
    const releaseNegative = pushBottomOverlay(-50)
    expect(getBottomOverlayReserved()).toBe(0)

    const releaseNaN = pushBottomOverlay(Number.NaN)
    expect(getBottomOverlayReserved()).toBe(0)

    const releaseReal = pushBottomOverlay(136)
    expect(getBottomOverlayReserved()).toBe(136)

    // StrictMode 이중 정리 등으로 같은 해제 함수가 두 번 호출돼도 멱등해야 한다
    releaseNegative()
    releaseNegative()
    releaseNaN()
    releaseNaN()
    expect(getBottomOverlayReserved()).toBe(136)

    releaseReal()
    releaseReal()
    expect(getBottomOverlayReserved()).toBe(0)
  })
})
