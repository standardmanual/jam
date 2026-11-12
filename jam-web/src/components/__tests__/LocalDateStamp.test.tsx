import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LocalDate, { formatDateTimeMinute, formatDateTimeStamp } from '../LocalDate'

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

  it('stampBreak는 같은 글자를 날짜와 시각 두 조각으로 나눠, 줄이 꺾일 때 둘 사이에서만 꺾이게 한다', () => {
    const html = renderToStaticMarkup(<LocalDate iso="2026-12-21T17:22:33Z" stamp stampBreak />)

    expect(html).toBe('<span style="white-space:nowrap">2026-12-22</span> <span style="white-space:nowrap">AM 02:22:33</span>')
    // 글자는 stamp만 쓸 때와 같다
    expect(html.replace(/<[^>]*>/g, '')).toBe('2026-12-22 AM 02:22:33')
  })

  it('stampBreak만 있고 stamp가 없으면 기존 경로 그대로다', () => {
    expect(renderToStaticMarkup(<LocalDate iso="2026-12-21T17:22:33Z" stampBreak />)).not.toContain('nowrap')
  })
})

describe('formatDateTimeMinute: 포인트 내역의 일시 형식(초 없음)', () => {
  it('KST 12시간제로 «2026-11-11 AM 10:29» 모양을 만든다', () => {
    // 2026-11-11 01:29:45 UTC = 2026-11-11 10:29:45 KST
    expect(formatDateTimeMinute('2026-11-11T01:29:45Z')).toBe('2026-11-11 AM 10:29')
  })

  it('오후와 자정·정오 표기는 초 있는 형식과 같다', () => {
    expect(formatDateTimeMinute('2026-12-22T06:05:09Z')).toBe('2026-12-22 PM 03:05')
    expect(formatDateTimeMinute('2026-12-21T15:00:00Z')).toBe('2026-12-22 AM 12:00')
  })

  it('값이 없으면 빈 문자열이다', () => {
    expect(formatDateTimeMinute(null)).toBe('')
    expect(formatDateTimeMinute(undefined)).toBe('')
  })
})
