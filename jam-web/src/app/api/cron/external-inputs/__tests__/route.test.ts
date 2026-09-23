/**
 * GET /api/cron/external-inputs — 인증과 응답 계약 (티켓 20260923_2333 게이트 WARN 후속)
 *
 * 이 라우트가 external_input_daily를 채우는 유일한 경로다. 저장이 실패했는데 200을 주면
 * Vercel cron 대시보드에서 성공으로 보여 태그가 조용히 비게 되므로, 실패는 502로 알린다.
 */
import { NextRequest } from 'next/server'

const { refreshWeather, refreshSpecialDays, writeDailyInput } = vi.hoisted(() => ({
  refreshWeather: vi.fn(),
  refreshSpecialDays: vi.fn(),
  writeDailyInput: vi.fn(),
}))

vi.mock('@/lib/inputs/weather', () => ({
  refreshTodayWeather: refreshWeather,
  todayWeatherDateKst: () => '2026-09-24',
}))
vi.mock('@/lib/inputs/holidays', () => ({
  refreshTodaySpecialDays: refreshSpecialDays,
  todaySpecialDaysDateKst: () => '2026-09-24',
}))
vi.mock('@/lib/inputs/daily-store', () => ({ writeDailyInput }))

const { GET } = await import('../route')

const SECRET = 'test-cron-secret'

function requestWith(auth?: string): NextRequest {
  return new NextRequest('https://j-a-m.app/api/cron/external-inputs', {
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET)
  refreshWeather.mockReset().mockResolvedValue('clear')
  refreshSpecialDays.mockReset().mockResolvedValue([{ name: '개천절', type: 'holiday', extra: 'x' }])
  writeDailyInput.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('인증', () => {
  it('Authorization 헤더가 없거나 틀리면 401이고 외부 호출·저장을 하지 않는다', async () => {
    for (const auth of [undefined, 'Bearer wrong']) {
      const res = await GET(requestWith(auth))
      expect(res.status).toBe(401)
    }
    expect(refreshWeather).not.toHaveBeenCalled()
    expect(refreshSpecialDays).not.toHaveBeenCalled()
    expect(writeDailyInput).not.toHaveBeenCalled()
  })
})

describe('응답 계약', () => {
  it('둘 다 저장하면 200이고 특일은 name·type만 저장한다', async () => {
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ weather: 'saved', specialDays: 'saved' })
    expect(writeDailyInput).toHaveBeenCalledWith('weather', '2026-09-24', { kind: 'clear' })
    expect(writeDailyInput).toHaveBeenCalledWith('special_days', '2026-09-24', [{ name: '개천절', type: 'holiday' }])
  })

  it('날씨 갱신이 실패하면 502이고 특일은 그대로 저장한다', async () => {
    refreshWeather.mockResolvedValue(null)
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ weather: 'failed', specialDays: 'saved' })
    expect(writeDailyInput).toHaveBeenCalledTimes(1)
    expect(writeDailyInput).toHaveBeenCalledWith('special_days', '2026-09-24', expect.any(Array))
  })

  it('특일 갱신이 실패(null)하면 502이고 날씨는 그대로 저장한다', async () => {
    refreshSpecialDays.mockResolvedValue(null)
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ weather: 'saved', specialDays: 'failed' })
    expect(writeDailyInput).toHaveBeenCalledTimes(1)
  })

  it('오늘 특일이 없어 빈 배열이면 실패가 아니라 빈 배열로 저장한다', async () => {
    refreshSpecialDays.mockResolvedValue([])
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(writeDailyInput).toHaveBeenCalledWith('special_days', '2026-09-24', [])
  })

  it('저장 함수가 던지면 해당 쪽만 failed로 표시하고 502를 준다', async () => {
    writeDailyInput.mockImplementation(async (kind: string) => {
      if (kind === 'weather') throw new Error('DB 오류')
    })
    const res = await GET(requestWith(`Bearer ${SECRET}`))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ weather: 'failed', specialDays: 'saved' })
  })
})
