/**
 * 어드민 기간 입력(KST `datetime-local`) 변환 회귀 테스트(티켓 20261004_2043).
 * 컬렉션·배지 폼이 날짜만 받던 때는 저장할 때마다 공개 시각이 UTC 자정으로 바뀌었다.
 * 바꾸지 않은 칸은 원래 ISO를 그대로 보내고, 새로 고른 값은 `+09:00` 기준으로 저장함을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { kstLocalInputToIso, resolvePeriodInputIso, toKstLocalInputValue } from '@/lib/admin/kst-format'

describe('kstLocalInputToIso', () => {
  it('KST 10/20 00:00을 UTC 10/19 15:00으로 바꾼다', () => {
    expect(kstLocalInputToIso('2026-10-20T00:00')).toBe('2026-10-19T15:00:00.000Z')
  })

  it('브라우저 시간대와 무관하게 +09:00 기준이다', () => {
    expect(kstLocalInputToIso('2026-10-20T09:30')).toBe('2026-10-20T00:30:00.000Z')
  })

  it('읽을 수 없는 값은 null이다', () => {
    expect(kstLocalInputToIso('')).toBeNull()
    expect(kstLocalInputToIso('날짜아님')).toBeNull()
    expect(kstLocalInputToIso('2026-13-40T99:99')).toBeNull()
  })
})

describe('resolvePeriodInputIso', () => {
  it('칸을 바꾸지 않았으면 밀리초가 있는 원래 ISO를 그대로 돌려준다', () => {
    const original = '2026-10-19T15:00:00.123Z'
    expect(resolvePeriodInputIso(original, toKstLocalInputValue(original))).toBe(original)
  })

  it('칸을 바꾸지 않았으면 UTC 자정 값도 그대로 돌려준다(KST 09:00으로 보이는 기존 값)', () => {
    const original = '2026-10-19T00:00:00+00:00'
    const shown = toKstLocalInputValue(original)
    expect(shown).toBe('2026-10-19T09:00')
    expect(resolvePeriodInputIso(original, shown)).toBe(original)
  })

  it('KST 10/20 00:00 값은 칸을 바꾸지 않고 저장해도 바뀌지 않는다', () => {
    const original = '2026-10-19T15:00:00.000Z'
    const shown = toKstLocalInputValue(original)
    expect(shown).toBe('2026-10-20T00:00')
    expect(resolvePeriodInputIso(original, shown)).toBe(original)
  })

  it('칸을 바꿨으면 입력값을 +09:00 기준 ISO로 바꾼다', () => {
    expect(resolvePeriodInputIso('2026-10-19T15:00:00.000Z', '2026-10-21T10:00')).toBe('2026-10-21T01:00:00.000Z')
  })

  it('빈 칸이면 null이다(원래 값이 있어도)', () => {
    expect(resolvePeriodInputIso('2026-10-19T15:00:00.000Z', '')).toBeNull()
    expect(resolvePeriodInputIso(null, '')).toBeNull()
    expect(resolvePeriodInputIso(undefined, '')).toBeNull()
  })

  it('원래 값이 없을 때 새 값은 +09:00 기준으로 읽는다', () => {
    expect(resolvePeriodInputIso(null, '2026-10-20T00:00')).toBe('2026-10-19T15:00:00.000Z')
    expect(resolvePeriodInputIso(undefined, '2026-10-20T00:00')).toBe('2026-10-19T15:00:00.000Z')
  })

  it('읽을 수 없는 새 값은 null이다', () => {
    expect(resolvePeriodInputIso(null, '날짜아님')).toBeNull()
  })
})
