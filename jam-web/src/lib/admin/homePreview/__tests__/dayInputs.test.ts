/**
 * 홈피드 미리보기의 그날 저장 입력(날씨·특일) 읽기 (티켓 20261026_2025 1회차).
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/homePreview/__tests__/dayInputs.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fx = vi.hoisted(() => ({ stored: {} as Record<string, unknown>, reads: [] as string[] }))

vi.mock('@/lib/inputs/daily-store', () => ({
  readDailyInput: async (kind: string, dateKst: string) => {
    fx.reads.push(`${kind}:${dateKst}`)
    return fx.stored[`${kind}:${dateKst}`] ?? null
  },
  ymdToDateKst: (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
}))

import { readDayInputs } from '../dayInputs'

beforeEach(() => {
  fx.stored = {}
  fx.reads = []
})

describe('readDayInputs', () => {
  it('저장된 날씨와 특일을 그 날짜 키로 읽는다', async () => {
    fx.stored['weather:2026-10-05'] = { kind: 'rain' }
    fx.stored['special_days:2026-10-05'] = [{ name: '한글날', type: 'holiday' }]
    await expect(readDayInputs('2026-10-05')).resolves.toEqual({
      weather: 'rain',
      specialDays: [{ name: '한글날', type: 'holiday' }],
      stored: true,
    })
    expect(fx.reads.sort()).toEqual(['special_days:2026-10-05', 'weather:2026-10-05'])
  })

  it('저장된 값이 없으면 null이고 stored는 거짓이다(미래 날짜)', async () => {
    await expect(readDayInputs('2026-12-31')).resolves.toEqual({ weather: null, specialDays: null, stored: false })
  })

  it('«특일 없음»으로 저장된 날은 빈 배열이고 stored는 참이다', async () => {
    fx.stored['special_days:2026-10-06'] = []
    await expect(readDayInputs('2026-10-06')).resolves.toEqual({ weather: null, specialDays: [], stored: true })
  })

  it('알 수 없는 날씨 값과 모양이 틀린 특일 원소는 버린다', async () => {
    fx.stored['weather:2026-10-07'] = { kind: 'snow' }
    fx.stored['special_days:2026-10-07'] = [{ name: '입동', type: 'seasonal' }, { name: 3 }, 'x']
    await expect(readDayInputs('2026-10-07')).resolves.toEqual({
      weather: null,
      specialDays: [{ name: '입동', type: 'seasonal' }],
      stored: true,
    })
  })
})
