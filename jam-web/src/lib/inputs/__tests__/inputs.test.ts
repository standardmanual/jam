/**
 * lib/inputs — 기상청 단기예보·특일정보 정규화 및 실패 시 폴백 (티켓 20260923_2254)
 *
 * 실행: cd jam-web && npx vitest run src/lib/inputs/__tests__/inputs.test.ts
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { normalizeWeatherItems, latestKmaBaseTime } from '../weather'
import { normalizeSpecialDayItems } from '../holidays'

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    }))
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('normalizeWeatherItems — 오늘 날씨 구분 판정', () => {
  it('강수형태(PTY)가 0이 아니면 rain', () => {
    const items = [
      { category: 'PTY', fcstDate: '20260923', fcstValue: '1' },
      { category: 'SKY', fcstDate: '20260923', fcstValue: '1' },
    ]
    expect(normalizeWeatherItems(items, '20260923')).toBe('rain')
  })

  it('기온이 33도 이상이면 extreme', () => {
    const items = [
      { category: 'PTY', fcstDate: '20260923', fcstValue: '0' },
      { category: 'TMX', fcstDate: '20260923', fcstValue: '35' },
    ]
    expect(normalizeWeatherItems(items, '20260923')).toBe('extreme')
  })

  it('기온이 -12도 이하이면 extreme', () => {
    const items = [
      { category: 'PTY', fcstDate: '20260923', fcstValue: '0' },
      { category: 'TMN', fcstDate: '20260923', fcstValue: '-15' },
    ]
    expect(normalizeWeatherItems(items, '20260923')).toBe('extreme')
  })

  it('하늘상태(SKY)가 맑음(1)이면 clear', () => {
    const items = [
      { category: 'PTY', fcstDate: '20260923', fcstValue: '0' },
      { category: 'TMP', fcstDate: '20260923', fcstValue: '20' },
      { category: 'SKY', fcstDate: '20260923', fcstValue: '1' },
    ]
    expect(normalizeWeatherItems(items, '20260923')).toBe('clear')
  })

  it('강수 없고 극값도 아니고 흐림/구름많음이면 mild', () => {
    const items = [
      { category: 'PTY', fcstDate: '20260923', fcstValue: '0' },
      { category: 'SKY', fcstDate: '20260923', fcstValue: '4' },
    ]
    expect(normalizeWeatherItems(items, '20260923')).toBe('mild')
  })

  it('오늘 날짜가 아닌 항목은 판정에서 제외한다', () => {
    const items = [
      { category: 'PTY', fcstDate: '20260924', fcstValue: '1' },
      { category: 'SKY', fcstDate: '20260923', fcstValue: '1' },
    ]
    expect(normalizeWeatherItems(items, '20260923')).toBe('clear')
  })
})

describe('latestKmaBaseTime — 발표주기 기준 최근 base_date/base_time', () => {
  it('KST 09:30이면 08시(+10분) 발표분을 쓴다', () => {
    // UTC 00:30 = KST 09:30
    const result = latestKmaBaseTime(new Date('2026-09-23T00:30:00Z'))
    expect(result).toEqual({ baseDate: '20260923', baseTime: '0800' })
  })

  it('자정~02:10 KST 사이는 전날 23시 발표분을 쓴다', () => {
    // UTC 2026-09-22T16:00:00Z = KST 2026-09-23T01:00
    const result = latestKmaBaseTime(new Date('2026-09-22T16:00:00Z'))
    expect(result).toEqual({ baseDate: '20260922', baseTime: '2300' })
  })
})

describe('normalizeSpecialDayItems — 오늘 날짜 특일 항목 정규화', () => {
  it('item이 배열이면 오늘 날짜만 골라 정규화한다', () => {
    const items = [
      { dateName: '추석', locdate: 20260925 },
      { dateName: '어제 기념일', locdate: 20260922 },
    ]
    expect(normalizeSpecialDayItems(items, 'holiday', '20260925')).toEqual([{ name: '추석', type: 'holiday' }])
  })

  it('item이 단일 객체(배열 아님)여도 처리한다', () => {
    const item = { dateName: '한글날', locdate: 20261009 }
    expect(normalizeSpecialDayItems(item, 'holiday', '20261009')).toEqual([{ name: '한글날', type: 'holiday' }])
  })

  it('items가 undefined면 빈 배열', () => {
    expect(normalizeSpecialDayItems(undefined, 'anniversary', '20260923')).toEqual([])
  })

  it('dateName이 없는 항목은 제외한다', () => {
    const items = [{ locdate: 20260923 }]
    expect(normalizeSpecialDayItems(items, 'seasonal', '20260923')).toEqual([])
  })
})

describe('getTodayWeather — 인증키 없음·호출 실패 시 폴백(vitest 모듈 격리로 캐시 리셋)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('KMA_API_KEY 미설정이면 오류 없이 null', async () => {
    vi.stubEnv('KMA_API_KEY', '')
    const { getTodayWeather } = await import('../weather')
    await expect(getTodayWeather()).resolves.toBeNull()
  })

  it('HTTP 오류 응답이어도 오류 없이 null', async () => {
    vi.stubEnv('KMA_API_KEY', 'dummy-key')
    mockFetchOnce(500, {})
    const { getTodayWeather } = await import('../weather')
    await expect(getTodayWeather()).resolves.toBeNull()
  })

  it('같은 날 두 번째 호출은 캐시를 써서 fetch를 다시 부르지 않는다', async () => {
    vi.stubEnv('KMA_API_KEY', 'dummy-key')
    mockFetchOnce(500, {})
    const { getTodayWeather } = await import('../weather')
    await getTodayWeather()
    const callsAfterFirst = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    await getTodayWeather()
    const callsAfterSecond = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfterSecond).toBe(callsAfterFirst)
  })
})

describe('getTodaySpecialDays — 인증키 없음·호출 실패 시 폴백(vitest 모듈 격리로 캐시 리셋)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('DATA_GO_KR_API_KEY 미설정이면 오류 없이 빈 배열', async () => {
    vi.stubEnv('DATA_GO_KR_API_KEY', '')
    const { getTodaySpecialDays } = await import('../holidays')
    await expect(getTodaySpecialDays()).resolves.toEqual([])
  })

  it('세 오퍼레이션 모두 HTTP 오류여도 오류 없이 빈 배열', async () => {
    vi.stubEnv('DATA_GO_KR_API_KEY', 'dummy-key')
    mockFetchOnce(500, {})
    const { getTodaySpecialDays } = await import('../holidays')
    await expect(getTodaySpecialDays()).resolves.toEqual([])
  })
})
