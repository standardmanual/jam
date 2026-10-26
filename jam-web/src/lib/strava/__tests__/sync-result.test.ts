/**
 * 동기화 결과 판정 — 이번에 받은 잼의 합계와 결과 갈래 (티켓 20261025_2050)
 *
 * 값 접기(`foldJamEarned`), 한 줄 문구(`jamEarnedMessage`), 갈래 판정(`resolveSyncResult`)을 고정한다.
 * 갈래: (a) 배지 있음 → 연출(+헤더 한 줄), (b) 배지 0개 → 토스트, (c) 고르기 뒤 배지 0개 → 잼이 있을 때만 토스트.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-result.test.ts
 */
import { describe, expect, it } from 'vitest'
import { foldJamEarned, jamEarnedMessage, resolveSyncResult } from '@/lib/strava/sync-result'
import { d } from '@/lib/i18n'

describe('foldJamEarned — 응답 값을 화면에 쓸 값으로 접는다', () => {
  it('양의 정수는 그대로다', () => {
    expect(foldJamEarned(1)).toBe(1)
    expect(foldJamEarned(1240)).toBe(1240)
  })

  it('소수는 내린다', () => {
    expect(foldJamEarned(90.9)).toBe(90)
  })

  it('1 미만의 소수는 내려서 0이 된다', () => {
    expect(foldJamEarned(0.5)).toBe(0)
  })

  it.each([
    ['없음', undefined],
    ['null', null],
    ['0', 0],
    ['NaN', Number.NaN],
    ['음수', -5],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['숫자 문자열', '120'],
    ['객체', {}],
  ])('%s는 0으로 접는다', (_label, value) => {
    expect(foldJamEarned(value)).toBe(0)
  })
})

describe('jamEarnedMessage — 잼 한 줄', () => {
  it('합계를 쉼표 형식으로 넣은 한 줄을 돌려준다', () => {
    expect(jamEarnedMessage(1240)).toBe('이번에 잼 1,240만큼 받았어요')
    expect(jamEarnedMessage(90)).toBe('이번에 잼 90만큼 받았어요')
  })

  it('합계가 0이거나 없거나 이상한 값이면 줄 자체가 없다', () => {
    for (const value of [0, undefined, null, Number.NaN, -3, '12']) {
      expect(jamEarnedMessage(value)).toBeUndefined()
    }
  })

  it('«받은 잼이 없어요»·«잼 0» 같은 빈 상태 문구를 만들지 않는다', () => {
    expect(jamEarnedMessage(0)).toBeUndefined()
    expect(JSON.stringify(d.today)).not.toContain('받은 잼이 없어요')
  })

  it('이모지·느낌표·마침표 없이 해요체 한 문장이다', () => {
    const message = jamEarnedMessage(1240) as string
    expect(message).not.toMatch(/[!.]/u)
    expect(message).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(message.endsWith('요')).toBe(true)
  })
})

describe('resolveSyncResult — 결과 갈래', () => {
  const JAM = '이번에 잼 1,240만큼 받았어요'

  it('(a) 배지가 있고 잼이 있으면 연출에 헤더 한 줄을 얹는다', () => {
    expect(resolveSyncResult({ badgeCount: 3, pickedFirst: false, jamEarned: 1240 })).toEqual({ kind: 'reveal', summaryMessage: JAM })
  })

  it('(a) 고르기를 먼저 보여 준 뒤에도 배지가 있으면 연출이다', () => {
    expect(resolveSyncResult({ badgeCount: 1, pickedFirst: true, jamEarned: 1240 })).toEqual({ kind: 'reveal', summaryMessage: JAM })
  })

  it("(a') 배지가 있고 잼이 없으면 헤더 없는 연출이다(지금 그대로)", () => {
    for (const jamEarned of [undefined, 0, Number.NaN, -1, '9']) {
      expect(resolveSyncResult({ badgeCount: 2, pickedFirst: false, jamEarned })).toEqual({ kind: 'reveal', summaryMessage: undefined })
    }
  })

  it('(b) 배지 0개이고 잼이 있으면 «동기화 완료» 대신 잼 문구 토스트다', () => {
    const result = resolveSyncResult({ badgeCount: 0, pickedFirst: false, jamEarned: 1240 })
    expect(result).toEqual({ kind: 'toast', message: JAM })
    expect(JSON.stringify(result)).not.toContain(d.today.syncDone)
  })

  it("(b') 배지 0개이고 잼이 없으면 «동기화 완료» 토스트 그대로다", () => {
    for (const jamEarned of [undefined, 0, Number.NaN, -1, '9']) {
      expect(resolveSyncResult({ badgeCount: 0, pickedFirst: false, jamEarned })).toEqual({ kind: 'toast', message: d.today.syncDone })
    }
  })

  it('(c) 고르기 뒤 배지 0개이고 잼이 있으면 (b)와 같은 잼 문구 토스트다', () => {
    expect(resolveSyncResult({ badgeCount: 0, pickedFirst: true, jamEarned: 1240 })).toEqual({ kind: 'toast', message: JAM })
  })

  it("(c') 고르기 뒤 배지 0개이고 잼이 없으면 토스트 없이 새로 읽기만 한다(지금 그대로)", () => {
    for (const jamEarned of [undefined, 0, Number.NaN, -1, '9']) {
      expect(resolveSyncResult({ badgeCount: 0, pickedFirst: true, jamEarned })).toEqual({ kind: 'refresh' })
    }
  })

  it('«동기화 완료»와 잼 문구를 이어 붙이지 않는다', () => {
    const result = resolveSyncResult({ badgeCount: 0, pickedFirst: false, jamEarned: 50 })
    expect(result.kind).toBe('toast')
    if (result.kind === 'toast') expect(result.message).not.toContain(d.today.syncDone)
  })
})
