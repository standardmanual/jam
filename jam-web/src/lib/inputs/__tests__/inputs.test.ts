/**
 * lib/inputs — 기상청 단기예보·특일정보 정규화 및 실패 시 폴백 (티켓 20260923_2254)
 *
 * 실행: cd jam-web && npx vitest run src/lib/inputs/__tests__/inputs.test.ts
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { normalizeWeatherItems, latestKmaBaseTime } from '../weather'
import { normalizeSpecialDayItems } from '../holidays'

// 카드 조회 경로는 저장소만 읽는다 — 저장소는 목으로 대체한다(티켓 20260923_2333)
const { readDailyInputMock } = vi.hoisted(() => ({ readDailyInputMock: vi.fn() }))
vi.mock('../daily-store', () => ({
  readDailyInput: readDailyInputMock,
  ymdToDateKst: (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
}))

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

describe('getTodayWeather — 저장값만 읽는다(vitest 모듈 격리로 캐시 리셋)', () => {
  beforeEach(() => {
    vi.resetModules()
    readDailyInputMock.mockReset()
  })

  it('저장값이 없으면 null이고 외부 API(fetch)를 부르지 않는다', async () => {
    readDailyInputMock.mockResolvedValue(null)
    mockFetchOnce(200, {})
    const { getTodayWeather } = await import('../weather')
    await expect(getTodayWeather()).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('저장된 날씨 구분을 반환한다', async () => {
    readDailyInputMock.mockResolvedValue({ kind: 'rain' })
    const { getTodayWeather } = await import('../weather')
    await expect(getTodayWeather()).resolves.toBe('rain')
  })

  it('저장값 형식이 잘못되면 null', async () => {
    readDailyInputMock.mockResolvedValue({ kind: 'snow' })
    const { getTodayWeather } = await import('../weather')
    await expect(getTodayWeather()).resolves.toBeNull()
  })

  it('같은 날 저장값을 찾은 뒤 두 번째 호출은 저장소를 다시 읽지 않는다', async () => {
    readDailyInputMock.mockResolvedValue({ kind: 'clear' })
    const { getTodayWeather } = await import('../weather')
    await getTodayWeather()
    await getTodayWeather()
    expect(readDailyInputMock).toHaveBeenCalledTimes(1)
  })

  it('값이 없을 때는 캐시하지 않아 cron 저장 직후부터 반영된다', async () => {
    readDailyInputMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ kind: 'mild' })
    const { getTodayWeather } = await import('../weather')
    await expect(getTodayWeather()).resolves.toBeNull()
    await expect(getTodayWeather()).resolves.toBe('mild')
  })
})

describe('refreshTodayWeather — cron 전용 외부 호출(실패 시 null)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('KMA_API_KEY 미설정이면 오류 없이 null', async () => {
    vi.stubEnv('KMA_API_KEY', '')
    const { refreshTodayWeather } = await import('../weather')
    await expect(refreshTodayWeather()).resolves.toBeNull()
  })

  it('HTTP 오류 응답이어도 오류 없이 null', async () => {
    vi.stubEnv('KMA_API_KEY', 'dummy-key')
    mockFetchOnce(500, {})
    const { refreshTodayWeather } = await import('../weather')
    await expect(refreshTodayWeather()).resolves.toBeNull()
  })

  it('정상 응답이면 날씨 구분을 반환한다', async () => {
    vi.stubEnv('KMA_API_KEY', 'dummy-key')
    const now = new Date('2026-09-23T21:00:00Z') // KST 2026-09-24 06:00
    mockFetchOnce(200, {
      response: { body: { items: { item: [{ category: 'PTY', fcstDate: '20260924', fcstValue: '1' }] } } },
    })
    const { refreshTodayWeather } = await import('../weather')
    await expect(refreshTodayWeather(now)).resolves.toBe('rain')
  })

  it('발표시각을 받은 now로 계산한다(현재 시각과 무관, 티켓 20260924_0648)', async () => {
    vi.stubEnv('KMA_API_KEY', 'dummy-key')
    vi.useFakeTimers()
    try {
      // 실제 현재 시각은 며칠 뒤로 고정 — now 인자를 무시하면 base_date가 어긋난다
      vi.setSystemTime(new Date('2026-10-05T03:00:00Z'))
      const now = new Date('2026-09-23T21:00:00Z') // KST 2026-09-24 06:00 → 05시 발표분
      mockFetchOnce(200, { response: { body: { items: { item: [] } } } })
      const { refreshTodayWeather } = await import('../weather')
      await refreshTodayWeather(now)
      const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      expect(url).toContain('base_date=20260924')
      expect(url).toContain('base_time=0500')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('getTodaySpecialDays — 저장값만 읽는다(vitest 모듈 격리로 캐시 리셋)', () => {
  beforeEach(() => {
    vi.resetModules()
    readDailyInputMock.mockReset()
  })

  it('저장값이 없으면 빈 배열이고 외부 API(fetch)를 부르지 않는다', async () => {
    readDailyInputMock.mockResolvedValue(null)
    mockFetchOnce(200, {})
    const { getTodaySpecialDays } = await import('../holidays')
    await expect(getTodaySpecialDays()).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('저장된 특일을 반환한다', async () => {
    readDailyInputMock.mockResolvedValue([{ name: '추석', type: 'holiday' }])
    const { getTodaySpecialDays } = await import('../holidays')
    await expect(getTodaySpecialDays()).resolves.toEqual([{ name: '추석', type: 'holiday' }])
  })

  it('캐시 히트 — 같은 날 두 번째 호출은 저장소를 다시 읽지 않는다', async () => {
    readDailyInputMock.mockResolvedValue([{ name: '한글날', type: 'holiday' }])
    const { getTodaySpecialDays } = await import('../holidays')
    await getTodaySpecialDays()
    const second = await getTodaySpecialDays()
    expect(second).toEqual([{ name: '한글날', type: 'holiday' }])
    expect(readDailyInputMock).toHaveBeenCalledTimes(1)
  })

  it('"오늘 특일 없음"으로 저장된 빈 배열도 캐시된다', async () => {
    readDailyInputMock.mockResolvedValue([])
    const { getTodaySpecialDays } = await import('../holidays')
    await getTodaySpecialDays()
    await expect(getTodaySpecialDays()).resolves.toEqual([])
    expect(readDailyInputMock).toHaveBeenCalledTimes(1)
  })

  it('값이 없을 때는 캐시하지 않아 cron 저장 직후부터 반영된다', async () => {
    readDailyInputMock.mockResolvedValueOnce(null).mockResolvedValueOnce([{ name: '추석', type: 'holiday' }])
    const { getTodaySpecialDays } = await import('../holidays')
    await expect(getTodaySpecialDays()).resolves.toEqual([])
    await expect(getTodaySpecialDays()).resolves.toEqual([{ name: '추석', type: 'holiday' }])
  })
})

describe('refreshTodaySpecialDays — cron 전용 외부 호출', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('DATA_GO_KR_API_KEY 미설정이면 오류 없이 null', async () => {
    vi.stubEnv('DATA_GO_KR_API_KEY', '')
    const { refreshTodaySpecialDays } = await import('../holidays')
    await expect(refreshTodaySpecialDays()).resolves.toBeNull()
  })

  it('네 오퍼레이션 모두 HTTP 오류여도 오류 없이 null', async () => {
    vi.stubEnv('DATA_GO_KR_API_KEY', 'dummy-key')
    mockFetchOnce(500, {})
    const { refreshTodaySpecialDays } = await import('../holidays')
    await expect(refreshTodaySpecialDays()).resolves.toBeNull()
  })

  it('성공했지만 오늘 특일이 없으면 빈 배열(실패 null과 구분)', async () => {
    vi.stubEnv('DATA_GO_KR_API_KEY', 'dummy-key')
    mockFetchOnce(200, { response: { body: { items: '' } } })
    const { refreshTodaySpecialDays } = await import('../holidays')
    await expect(refreshTodaySpecialDays()).resolves.toEqual([])
  })

  it('오늘 날짜 항목만 정규화해 반환한다', async () => {
    vi.stubEnv('DATA_GO_KR_API_KEY', 'dummy-key')
    const now = new Date('2026-09-24T21:00:00Z') // KST 2026-09-25 06:00
    mockFetchOnce(200, { response: { body: { items: { item: { dateName: '추석', locdate: 20260925 } } } } })
    const { refreshTodaySpecialDays } = await import('../holidays')
    const result = await refreshTodaySpecialDays(now)
    expect(result).toEqual([
      { name: '추석', type: 'holiday' },
      { name: '추석', type: 'anniversary' },
      { name: '추석', type: 'seasonal' },
      { name: '추석', type: 'sundry' },
    ])
  })
})
