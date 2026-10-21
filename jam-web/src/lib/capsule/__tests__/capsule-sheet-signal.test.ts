/**
 * 캡슐 시트 열기 신호 (티켓 20261021_1248 2회)
 *
 * 저장소에 jsdom이 없어 브라우저 `window` 대신 EventTarget을 넘겨 고정한다.
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule-sheet-signal.test.ts
 */
import { describe, expect, it, vi } from 'vitest'
import { CAPSULE_SHEET_OPEN_EVENT, requestCapsuleSheetOpen, subscribeCapsuleSheetOpen } from '../capsule-sheet-signal'

describe('캡슐 시트 열기 신호', () => {
  it('요청하면 구독한 위젯의 핸들러가 한 번 불린다', () => {
    const target = new EventTarget()
    const handler = vi.fn()
    subscribeCapsuleSheetOpen(handler, target)

    requestCapsuleSheetOpen(target)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('구독을 풀면 더 이상 불리지 않는다', () => {
    const target = new EventTarget()
    const handler = vi.fn()
    const unsubscribe = subscribeCapsuleSheetOpen(handler, target)

    unsubscribe()
    requestCapsuleSheetOpen(target)

    expect(handler).not.toHaveBeenCalled()
  })

  it('받는 위젯이 없어도 던지지 않는다', () => {
    expect(() => requestCapsuleSheetOpen(new EventTarget())).not.toThrow()
  })

  it('브라우저가 아니면(target 없음) 아무것도 하지 않고 던지지 않는다', () => {
    expect(() => requestCapsuleSheetOpen(null)).not.toThrow()
    const unsubscribe = subscribeCapsuleSheetOpen(() => {}, null)
    expect(() => unsubscribe()).not.toThrow()
  })

  it('다른 이름의 이벤트에는 반응하지 않는다', () => {
    const target = new EventTarget()
    const handler = vi.fn()
    subscribeCapsuleSheetOpen(handler, target)

    target.dispatchEvent(new Event('jam:something-else'))

    expect(handler).not.toHaveBeenCalled()
    expect(CAPSULE_SHEET_OPEN_EVENT).toBe('jam:capsule-sheet-open')
  })
})
