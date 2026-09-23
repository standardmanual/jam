/**
 * GET /api/cron/external-inputs
 * 매일 21:00(UTC) = 06:00(KST) 실행: 날씨(기상청)·특일(공공데이터포털)을 미리 받아
 * external_input_daily에 저장한다. Vercel Cron: "0 21 * * *"
 *
 * 티켓 20260923_2333: 카드 조회(computeUserExposureTags)가 외부 API를 직접 기다리지 않도록
 * 외부 호출을 요청 경로 밖으로 옮겼다. 카드 조회는 이 라우트가 저장한 값만 읽는다.
 * 한쪽이 실패해도 다른 쪽은 저장하고, 실패한 쪽은 응답에 표시한다(값이 없으면 태그만 빠진다).
 */
import { NextRequest, NextResponse } from 'next/server'
import { writeDailyInput } from '@/lib/inputs/daily-store'
import { refreshTodayWeather, todayWeatherDateKst } from '@/lib/inputs/weather'
import { refreshTodaySpecialDays, todaySpecialDaysDateKst } from '@/lib/inputs/holidays'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const [weather, specialDays] = await Promise.all([refreshTodayWeather(now), refreshTodaySpecialDays(now)])

  const result: { weather: string; specialDays: string } = { weather: 'failed', specialDays: 'failed' }

  if (weather) {
    try {
      await writeDailyInput('weather', todayWeatherDateKst(now), { kind: weather })
      result.weather = 'saved'
    } catch (e) {
      console.error('[external-inputs] 날씨 저장 오류:', e)
    }
  } else {
    console.error('[external-inputs] 날씨 갱신 실패 — 저장하지 않음')
  }

  if (specialDays) {
    try {
      await writeDailyInput('special_days', todaySpecialDaysDateKst(now), specialDays.map(({ name, type }) => ({ name, type })))
      result.specialDays = 'saved'
    } catch (e) {
      console.error('[external-inputs] 특일 저장 오류:', e)
    }
  } else {
    console.error('[external-inputs] 특일 갱신 실패 — 저장하지 않음')
  }

  const ok = result.weather === 'saved' && result.specialDays === 'saved'
  return NextResponse.json(result, { status: ok ? 200 : 502 })
}
