import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { logQueryError, throwOnQueryError } from '../queryError'

let errorSpy: MockInstance

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

describe('throwOnQueryError', () => {
  it('오류가 없으면 던지지도 로그를 남기지도 않는다', () => {
    expect(() => throwOnQueryError(null, 'today')).not.toThrow()
    expect(() => throwOnQueryError(undefined, 'today')).not.toThrow()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('오류가 있으면 라벨과 원인이 담긴 메시지로 던지고 로그도 남긴다', () => {
    expect(() => throwOnQueryError({ message: 'column "x" does not exist' }, 'today')).toThrow(
      '[admin/today] 조회 실패: column "x" does not exist'
    )
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

describe('logQueryError', () => {
  it('오류가 있어도 던지지 않고 로그만 남긴다', () => {
    expect(() => logQueryError({ message: 'boom' }, 'missions/type-summary')).not.toThrow()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('missions/type-summary')
  })

  it('오류가 없으면 로그도 남기지 않는다', () => {
    logQueryError(null, 'missions/type-summary')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
