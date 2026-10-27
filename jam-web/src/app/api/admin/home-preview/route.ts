import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { normalizeDateParam } from '@/lib/admin/today-calendar'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import { loadHomePreview, type HomePreviewViewer } from '@/lib/admin/homePreview/load'
import type { TimeOfDayTag } from '@/lib/today/exposure'
import type { WeatherKind } from '@/lib/inputs/weather'
import type { SpecialDayTag } from '@/lib/inputs/special-days-config'

/**
 * 어드민 홈피드 미리보기(티켓 20261026_2025 1회차) — 날짜·기간·가상 유저 조건별 홈 카드 목록.
 * 쿼리: date(YYYY-MM-DD, 기본 오늘) · days(1~7, 기본 7) · tribe(UUID, 비우면 트라이브 없음) · time(시간대 태그, 기본 time_morning)
 * · weather(clear|mild|rain|extreme, 비우면 그날 저장된 값) · special(쉼표 목록, 비우면 그날 저장된 값, `none`이면 특일 없음) · newUser(1)
 * · bundle(UUID, 승인 전 카드를 읽을 묶음).
 * 응답은 `{ days, tribes }` — `tribes`는 화면의 트라이브 고르기 목록(이름순, 티켓 20261026_2025 2회차)이다. 읽기가 실패하면 빈 목록이 아니라 500이다.
 * 읽기 전용이고 캐시하지 않는다.
 */
const TIMES: readonly TimeOfDayTag[] = ['time_dawn', 'time_morning', 'time_afternoon', 'time_evening', 'time_night']
const WEATHERS: readonly WeatherKind[] = ['clear', 'mild', 'rain', 'extreme']
const SPECIALS: readonly SpecialDayTag[] = ['holiday_today', 'seasonal_today', 'anniversary_today']
const DEFAULT_DAYS = 7
/** `special=none`: 저장된 값을 쓰지 않고 특일이 없는 날로 본다 */
const SPECIAL_NONE = 'none'

const NO_STORE = { 'Cache-Control': 'no-store' }

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE })
}

/** 트라이브 고르기 목록(이름순). 읽기가 실패하면 던진다 — 빈 목록으로 보이지 않는다. */
async function readTribeOptions(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createServiceClient().from('tribes').select('id, name').order('name', { ascending: true })
  if (error) throw new Error(`홈피드 미리보기 트라이브 조회 실패: ${error.message}`)
  return (data ?? []).map((tribe) => ({ id: tribe.id, name: tribe.name }))
}

export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const q = new URL(req.url).searchParams
  const rawDate = q.get('date')
  const date = normalizeDateParam(rawDate ?? undefined)
  // normalizeDateParam은 틀린 값을 오늘로 바꾼다 — 값이 바뀌었으면 형식이나 달력이 틀린 것이다
  if (rawDate && date !== rawDate) return badRequest('date는 실제 있는 날짜의 YYYY-MM-DD 형식이어야 해요.')

  const rawDays = q.get('days')
  let days = DEFAULT_DAYS
  if (rawDays) {
    days = Number(rawDays)
    if (!Number.isInteger(days) || days < 1 || days > 7) return badRequest('days는 1~7 사이의 정수여야 해요.')
  }

  const tribe = q.get('tribe')
  if (tribe && !isUuid(tribe)) return badRequest('tribe는 UUID 형식이어야 해요.')

  const rawTime = q.get('time')
  if (rawTime && !(TIMES as readonly string[]).includes(rawTime)) return badRequest(`time은 ${TIMES.join(', ')} 중 하나여야 해요.`)
  const timeOfDay = (rawTime || 'time_morning') as TimeOfDayTag

  const rawWeather = q.get('weather')
  if (rawWeather && !(WEATHERS as readonly string[]).includes(rawWeather)) return badRequest(`weather는 ${WEATHERS.join(', ')} 중 하나여야 해요.`)

  const rawSpecial = q.get('special')
  let specialDays: SpecialDayTag[] | undefined
  if (rawSpecial === SPECIAL_NONE) {
    specialDays = []
  } else if (rawSpecial) {
    const parts = rawSpecial.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.some((p) => !(SPECIALS as readonly string[]).includes(p))) return badRequest(`special은 ${SPECIALS.join(', ')} 중에서 쉼표로 이어 주세요. 특일이 없는 날은 ${SPECIAL_NONE}이에요.`)
    specialDays = [...new Set(parts)] as SpecialDayTag[]
  }

  const bundle = q.get('bundle')
  if (bundle && !isUuid(bundle)) return badRequest('bundle은 UUID 형식이어야 해요.')

  const viewer: HomePreviewViewer = {
    tribeId: tribe || null,
    timeOfDay,
    weather: (rawWeather || undefined) as WeatherKind | undefined,
    specialDays,
    newUser: q.get('newUser') === '1',
  }

  try {
    const [result, tribes] = await Promise.all([
      loadHomePreview({ fromDate: date, days, viewer, bundleId: bundle || null }),
      readTribeOptions(),
    ])
    return NextResponse.json({ ...result, tribes }, { headers: NO_STORE })
  } catch (err) {
    console.error('[GET /api/admin/home-preview] 조회 실패:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '홈피드 미리보기를 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, { status: 500, headers: NO_STORE })
  }
}
