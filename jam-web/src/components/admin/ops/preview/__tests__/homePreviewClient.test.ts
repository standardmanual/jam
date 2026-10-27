/**
 * 홈피드 미리보기 화면의 순수 로직 (티켓 20261026_2025 2회차)
 *
 * 조건·날짜가 바뀌면 API를 다시 부르는 것은 «요청 주소(쿼리)가 달라지고, 부품의 이펙트가 그 주소에 걸려 있다»로 성립한다.
 * jsdom이 없어 이펙트를 돌릴 수 없으므로, 여기서는 «조건이 달라지면 주소가 달라진다»와 «같은 조건이면 같은 주소다»,
 * 그리고 요청 함수(취소 신호 전달·실패를 던짐)를 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/preview/__tests__/homePreviewClient.test.ts
 */
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CONDITIONS,
  buildHomePreviewQuery,
  dayCellLabel,
  fetchHomePreview,
  missingStoredInputs,
  shapeSegments,
  type HomePreviewConditions,
} from '../homePreviewClient'
import { live, makeDay } from './fixtures'

const TRIBE = '11111111-1111-4111-8111-111111111111'
const BUNDLE = '22222222-2222-4222-8222-222222222222'

const query = (conditions: HomePreviewConditions, extra: { date?: string; bundleId?: string | null } = {}) =>
  buildHomePreviewQuery({ date: extra.date ?? '2026-10-05', conditions, bundleId: extra.bundleId })

describe('buildHomePreviewQuery', () => {
  it('기본 조건은 날짜·7일·아침만 보낸다(날씨·특일은 저장된 값이라 보내지 않는다)', () => {
    expect(query(DEFAULT_CONDITIONS)).toBe('date=2026-10-05&days=7&time=time_morning')
  })

  it('고른 조건을 API 쿼리 이름으로 보낸다', () => {
    const q = new URLSearchParams(
      query(
        { tribeId: TRIBE, timeOfDay: 'time_night', weather: 'rain', special: ['holiday_today', 'anniversary_today'], newUser: true },
        { bundleId: BUNDLE },
      ),
    )
    expect(Object.fromEntries(q)).toEqual({
      date: '2026-10-05',
      days: '7',
      tribe: TRIBE,
      time: 'time_night',
      weather: 'rain',
      special: 'holiday_today,anniversary_today',
      newUser: '1',
      bundle: BUNDLE,
    })
  })

  it('특일을 «고른 뒤 모두 껐을 때»는 special=none(특일 없음)이고, 저장된 값과 다르다', () => {
    expect(new URLSearchParams(query({ ...DEFAULT_CONDITIONS, special: [] })).get('special')).toBe('none')
    expect(new URLSearchParams(query(DEFAULT_CONDITIONS)).has('special')).toBe(false)
  })

  it('조건이나 날짜가 바뀌면 주소가 달라지고(= 다시 부른다), 같으면 같다', () => {
    const base = query(DEFAULT_CONDITIONS)
    expect(query(DEFAULT_CONDITIONS)).toBe(base)
    expect(query({ ...DEFAULT_CONDITIONS, tribeId: TRIBE })).not.toBe(base)
    expect(query({ ...DEFAULT_CONDITIONS, timeOfDay: 'time_night' })).not.toBe(base)
    expect(query({ ...DEFAULT_CONDITIONS, weather: 'clear' })).not.toBe(base)
    expect(query({ ...DEFAULT_CONDITIONS, special: ['seasonal_today'] })).not.toBe(base)
    expect(query({ ...DEFAULT_CONDITIONS, newUser: true })).not.toBe(base)
    expect(query(DEFAULT_CONDITIONS, { date: '2026-10-12' })).not.toBe(base)
  })
})

describe('fetchHomePreview', () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

  it('조회 주소와 취소 신호를 넘기고 응답을 돌려준다', async () => {
    const fetchImpl = ok({ days: [], tribes: [{ id: TRIBE, name: '러너' }] })
    const controller = new AbortController()
    const result = await fetchHomePreview('date=2026-10-05&days=7', { signal: controller.signal, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result).toEqual({ days: [], tribes: [{ id: TRIBE, name: '러너' }] })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/home-preview?date=2026-10-05&days=7')
    expect(init.signal).toBe(controller.signal)
  })

  it('성공이 아닌 응답과 모양이 틀린 응답은 던진다(빈 목록으로 보이지 않는다)', async () => {
    const failing = vi.fn(async () => new Response('{}', { status: 500 }))
    await expect(fetchHomePreview('x', { fetchImpl: failing as unknown as typeof fetch })).rejects.toThrow()
    await expect(fetchHomePreview('x', { fetchImpl: ok({ days: [] }) as unknown as typeof fetch })).rejects.toThrow()
  })
})

describe('표시 값', () => {
  it('dayCellLabel: 요일과 월/일', () => {
    expect(dayCellLabel('2026-10-05')).toEqual({ weekday: '월', monthDay: '10/5' })
    expect(dayCellLabel('2026-12-31')).toEqual({ weekday: '목', monthDay: '12/31' })
  })

  it('shapeSegments: 모양 순서대로 개수가 있는 것만 낸다', () => {
    const segments = shapeSegments({ brief: 1, hero: 2, square: 0 })
    expect(segments.map((s) => [s.shape, s.count])).toEqual([
      ['hero', 2],
      ['brief', 1],
    ])
  })

  it('missingStoredInputs: 저장된 값을 쓰기로 했는데 그날 저장된 값이 없는 항목만 알린다', () => {
    const day = makeDay('2026-12-30', [live('a')], { weather: null, specialDays: null, stored: false })
    expect(missingStoredInputs(day, DEFAULT_CONDITIONS)).toEqual(['날씨', '특일'])
    expect(missingStoredInputs(day, { ...DEFAULT_CONDITIONS, weather: 'clear' })).toEqual(['특일'])
    expect(missingStoredInputs(day, { ...DEFAULT_CONDITIONS, weather: 'clear', special: [] })).toEqual([])
    const stored = makeDay('2026-10-05', [live('a')], { weather: 'rain', specialDays: [] })
    expect(missingStoredInputs(stored, DEFAULT_CONDITIONS)).toEqual([])
    expect(missingStoredInputs(undefined, DEFAULT_CONDITIONS)).toEqual([])
  })
})
