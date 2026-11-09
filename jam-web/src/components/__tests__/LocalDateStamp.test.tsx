import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LocalDate, { formatDateTimeStamp } from '../LocalDate'

describe('formatDateTimeStamp: 배지 상세의 일시 형식', () => {
  it('KST 12시간제로 «2026-12-22 AM 02:22:33» 모양을 만든다', () => {
    // 2026-12-21 17:22:33 UTC = 2026-12-22 02:22:33 KST
    expect(formatDateTimeStamp('2026-12-21T17:22:33Z')).toBe('2026-12-22 AM 02:22:33')
  })

  it('오후는 PM, 자정과 정오는 12시로 쓴다', () => {
    expect(formatDateTimeStamp('2026-12-22T06:05:09Z')).toBe('2026-12-22 PM 03:05:09')
    expect(formatDateTimeStamp('2026-12-21T15:00:00Z')).toBe('2026-12-22 AM 12:00:00')
    expect(formatDateTimeStamp('2026-12-22T03:00:00Z')).toBe('2026-12-22 PM 12:00:00')
  })

  it('값이 없으면 빈 문자열이다', () => {
    expect(formatDateTimeStamp(null)).toBe('')
    expect(formatDateTimeStamp(undefined)).toBe('')
  })

  it('LocalDate의 stamp 속성이 같은 형식을 그린다', () => {
    expect(renderToStaticMarkup(<LocalDate iso="2026-12-21T17:22:33Z" stamp />)).toBe('2026-12-22 AM 02:22:33')
  })
})
