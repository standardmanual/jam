/**
 * 세그먼트 확장 1차 — 컬렉션 잔여·동기화 경과 태그 통합 테스트 (티켓 20260923_2253)
 *
 * `computeUserExposureTags()`가 실제로 Supabase 조회 결과를 조합해 두 태그
 * (`itembook_remaining_le{N}`, `strava_stale_{N}d`)를 판정하는지 확인한다. 1차 게이트
 * 재작업 사유: 단위 테스트(`today-logic.test.ts`)는 순수 함수(`minRemainingSlots`,
 * `daysSinceLastSync`)만 검증해 DB 조회 경로(테이블명·필터·데이터 조합)의 회귀를 못
 * 잡는다 — 이 파일은 Supabase 클라이언트를 모킹해 그 경로를 통합적으로 확인한다.
 *
 * `today/__tests__` 폴더는 원래 node:assert + tsx로 도는 순수 함수 테스트
 * (today-logic.test.ts) 전용이었지만, admin/__tests__ 폴더의 today-calendar.test.ts
 * 사례(파일 단위 제외)와 같은 방식으로 이 파일만 vitest 스위트로 공존시킨다
 * (vitest.config.ts exclude, package.json test:node 참조).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/exposure-tags-segment.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

type FilterState = { eq: Record<string, unknown>; in: Record<string, unknown[]> }

const fixtures = vi.hoisted(() => ({
  slotsByUser: {} as Record<string, { item_book_id: string; badge_id: string }[]>,
  badgesByBook: {} as Record<
    string,
    { id: string; item_book_id: string; type: string; drop_excluded: boolean }[]
  >,
  stravaByUser: {} as Record<string, { last_synced_at: string | null } | undefined>,
  /** 테이블별 from() 호출 횟수 — 조회 중복 회귀 검증용 (티켓 20260923_2353) */
  fromCalls: {} as Record<string, number>,
  /** true인 유저는 해당 조회가 Supabase error를 반환한다 (티켓 20260924_0853) */
  slotsErrorUsers: {} as Record<string, boolean>,
  stravaErrorUsers: {} as Record<string, boolean>,
  /** 날씨·특일 조립 검증용 — 기본값은 기존 테스트와 같은 null/빈 배열 (티켓 20260924_0853) */
  weather: null as string | null,
  specialDays: [] as { name: string; type: string }[],
}))

/** supabase-js 쿼리 빌더 흉내 — usage-badges.test.ts의 mockSupabase()와 같은 최소 체인.
 *  테이블명 + eq/in 필터로 분기하고, user_mission_* 는 항상 빈 배열(미션 관련 태그는
 *  이 테스트의 검증 대상이 아니다). */
function mockSupabase() {
  const from = (table: string) => {
    fixtures.fromCalls[table] = (fixtures.fromCalls[table] ?? 0) + 1
    const state: FilterState = { eq: {}, in: {} }
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (col: string, val: unknown) => {
      state.eq[col] = val
      return builder
    }
    builder.in = (col: string, vals: unknown[]) => {
      state.in[col] = vals
      return builder
    }
    builder.is = () => builder
    builder.gte = () => builder
    builder.lte = () => builder
    builder.order = () => builder
    builder.limit = () => Promise.resolve({ data: [], error: null })
    builder.maybeSingle = () => {
      if (table !== 'strava_connections') return Promise.resolve({ data: null, error: null })
      const userId = state.eq.user_id as string
      if (fixtures.stravaErrorUsers[userId]) {
        return Promise.resolve({ data: null, error: { message: 'Strava 연결 조회 실패' } })
      }
      return Promise.resolve({ data: fixtures.stravaByUser[userId] ?? null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (
        table === 'user_mission_participations' ||
        table === 'user_mission_completions' ||
        table === 'missions'
      ) {
        return Promise.resolve({ data: [], error: null }).then(resolve)
      }
      if (table === 'user_item_book_slots') {
        const userId = state.eq.user_id as string
        if (fixtures.slotsErrorUsers[userId]) {
          return Promise.resolve({ data: null, error: { message: '슬롯 조회 실패' } }).then(resolve)
        }
        return Promise.resolve({ data: fixtures.slotsByUser[userId] ?? [], error: null }).then(resolve)
      }
      if (table === 'user_item_book_completions') {
        // 이 테스트의 모든 유저는 시작만 했을 뿐 완성한 북이 없다 — 항상 빈 배열
        return Promise.resolve({ data: [], error: null }).then(resolve)
      }
      if (table === 'badges') {
        const ids = (state.in.item_book_id ?? []) as string[]
        const rows = ids.flatMap((id) => fixtures.badgesByBook[id] ?? [])
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
// 날씨·특일정보는 외부 API 호출이다 — fixtures.weather/specialDays로 값을 지정한다
// (기본값 null/빈 배열은 기존 테스트와 동일, 티켓 20260924_0853)
vi.mock('@/lib/inputs/weather', () => ({ getTodayWeather: async () => fixtures.weather }))
vi.mock('@/lib/inputs/holidays', () => ({ getTodaySpecialDays: async () => fixtures.specialDays }))

import { computeUserExposureTags, ITEMBOOK_REMAINING_MAX, STRAVA_STALE_DAYS } from '../exposure'

describe('computeUserExposureTags 통합 — 컬렉션 잔여·동기화 경과 태그 (티켓 20260923_2253)', () => {
  it('조건 충족·미충족·Strava 미연결 유저가 같은 시각에 서로 다른 태그 집합을 받는다', async () => {
    const now = new Date('2026-09-23T03:00:00Z')

    const USER_SATISFY = 'user-satisfy'
    const USER_NOT_SATISFY = 'user-not-satisfy'
    const USER_NO_STRAVA = 'user-no-strava'

    // 조건 충족 유저: 미완성 컬렉션 잔여 2개(임계값 이하) + Strava 동기화 20일 경과(임계값 이상)
    fixtures.slotsByUser[USER_SATISFY] = [
      { item_book_id: 'book-a', badge_id: 'badge-1' },
      { item_book_id: 'book-a', badge_id: 'badge-2' },
    ]
    fixtures.badgesByBook['book-a'] = [
      { id: 'badge-1', item_book_id: 'book-a', type: 'item', drop_excluded: false },
      { id: 'badge-2', item_book_id: 'book-a', type: 'item', drop_excluded: false },
      { id: 'badge-3', item_book_id: 'book-a', type: 'item', drop_excluded: false },
      { id: 'badge-4', item_book_id: 'book-a', type: 'item', drop_excluded: false },
    ]
    fixtures.stravaByUser[USER_SATISFY] = {
      last_synced_at: new Date(now.getTime() - 20 * 24 * 3600_000).toISOString(),
    }

    // 조건 미충족 유저: 미완성 컬렉션 잔여 5개(임계값 초과) + Strava 동기화 2일 경과(임계값 미달)
    fixtures.slotsByUser[USER_NOT_SATISFY] = [{ item_book_id: 'book-b', badge_id: 'badge-5' }]
    fixtures.badgesByBook['book-b'] = [
      { id: 'badge-5', item_book_id: 'book-b', type: 'item', drop_excluded: false },
      { id: 'badge-6', item_book_id: 'book-b', type: 'item', drop_excluded: false },
      { id: 'badge-7', item_book_id: 'book-b', type: 'item', drop_excluded: false },
      { id: 'badge-8', item_book_id: 'book-b', type: 'item', drop_excluded: false },
      { id: 'badge-9', item_book_id: 'book-b', type: 'item', drop_excluded: false },
      { id: 'badge-10', item_book_id: 'book-b', type: 'item', drop_excluded: false },
    ]
    fixtures.stravaByUser[USER_NOT_SATISFY] = {
      last_synced_at: new Date(now.getTime() - 2 * 24 * 3600_000).toISOString(),
    }

    // Strava 미연결 유저: 미완성 컬렉션 잔여 3개(경계, 임계값 이하) + strava_connections 행 자체 없음
    fixtures.slotsByUser[USER_NO_STRAVA] = [{ item_book_id: 'book-c', badge_id: 'badge-11' }]
    fixtures.badgesByBook['book-c'] = [
      { id: 'badge-11', item_book_id: 'book-c', type: 'item', drop_excluded: false },
      { id: 'badge-12', item_book_id: 'book-c', type: 'item', drop_excluded: false },
      { id: 'badge-13', item_book_id: 'book-c', type: 'item', drop_excluded: false },
      { id: 'badge-14', item_book_id: 'book-c', type: 'item', drop_excluded: false },
    ]
    // fixtures.stravaByUser[USER_NO_STRAVA]를 설정하지 않는다 → maybeSingle이 null을 돌려준다
    // (연결 자체가 없는 유저 — "연결했지만 오래 안 한 유저"와 달리 태그 대상이 아니다)

    const [tagsSatisfy, tagsNotSatisfy, tagsNoStrava] = await Promise.all([
      computeUserExposureTags(USER_SATISFY, now),
      computeUserExposureTags(USER_NOT_SATISFY, now),
      computeUserExposureTags(USER_NO_STRAVA, now),
    ])

    const remainingTag = `itembook_remaining_le${ITEMBOOK_REMAINING_MAX}`
    const staleTag = `strava_stale_${STRAVA_STALE_DAYS}d`

    expect(tagsSatisfy).toContain(remainingTag)
    expect(tagsSatisfy).toContain(staleTag)

    expect(tagsNotSatisfy).not.toContain(remainingTag)
    expect(tagsNotSatisfy).not.toContain(staleTag)

    expect(tagsNoStrava).toContain(remainingTag)
    expect(tagsNoStrava).not.toContain(staleTag)

    // 같은 시각(now)에 세 유저가 서로 다른 태그 집합을 받는다
    const sorted = (arr: string[]) => [...arr].sort()
    expect(sorted(tagsSatisfy)).not.toEqual(sorted(tagsNotSatisfy))
    expect(sorted(tagsSatisfy)).not.toEqual(sorted(tagsNoStrava))
    expect(sorted(tagsNotSatisfy)).not.toEqual(sorted(tagsNoStrava))
  })

  it('컬렉션 관련 조회는 유저당 3회(슬롯·완료 북·배지)만 수행한다 — 두 태그가 완료 맵을 공유 (티켓 20260923_2353)', async () => {
    const now = new Date('2026-09-23T03:00:00Z')
    const USER = 'user-query-count'
    fixtures.slotsByUser[USER] = [{ item_book_id: 'book-q', badge_id: 'badge-q1' }]
    fixtures.badgesByBook['book-q'] = [
      { id: 'badge-q1', item_book_id: 'book-q', type: 'item', drop_excluded: false },
      { id: 'badge-q2', item_book_id: 'book-q', type: 'item', drop_excluded: false },
    ]

    fixtures.fromCalls = {}
    const tags = await computeUserExposureTags(USER, now)

    expect(fixtures.fromCalls['user_item_book_slots']).toBe(1)
    expect(fixtures.fromCalls['user_item_book_completions']).toBe(1)
    expect(fixtures.fromCalls['badges']).toBe(1)
    // 결과는 그대로 — 미완성 + 잔여 1개
    expect(tags).toContain('has_incomplete_itembook')
    expect(tags).toContain(`itembook_remaining_le${ITEMBOOK_REMAINING_MAX}`)
  })

  it('날씨·특일 값이 있으면 weather_*, specialDayTags 결과가 다른 태그와 함께 조립된다 (티켓 20260924_0853)', async () => {
    const now = new Date('2026-09-23T03:00:00Z')
    const USER = 'user-weather-special'
    fixtures.slotsByUser[USER] = [{ item_book_id: 'book-w', badge_id: 'badge-w1' }]
    fixtures.badgesByBook['book-w'] = [
      { id: 'badge-w1', item_book_id: 'book-w', type: 'item', drop_excluded: false },
      { id: 'badge-w2', item_book_id: 'book-w', type: 'item', drop_excluded: false },
    ]
    fixtures.stravaByUser[USER] = {
      last_synced_at: new Date(now.getTime() - 20 * 24 * 3600_000).toISOString(),
    }
    fixtures.weather = 'clear'
    fixtures.specialDays = [{ name: '식목일', type: 'anniversary' }]

    const tags = await computeUserExposureTags(USER, now)

    // 날씨·특일 태그가 컬렉션·Strava 태그와 함께 조립됐는지 확인한다 — 지금까지는
    // 두 값을 null/빈 배열로 고정해 이 조립 자체가 검증되지 않았다
    expect(tags).toContain('weather_clear')
    expect(tags).toContain('anniversary_today')
    expect(tags).toContain('has_incomplete_itembook')
    expect(tags).toContain(`itembook_remaining_le${ITEMBOOK_REMAINING_MAX}`)
    expect(tags).toContain(`strava_stale_${STRAVA_STALE_DAYS}d`)

    fixtures.weather = null
    fixtures.specialDays = []
  })

  it('user_item_book_slots·strava_connections 조회가 오류를 받으면 console.error를 남기고 해당 태그만 빠진다 (티켓 20260924_0853)', async () => {
    const now = new Date('2026-09-23T03:00:00Z')
    const USER = 'user-db-error'
    fixtures.slotsErrorUsers[USER] = true
    fixtures.stravaErrorUsers[USER] = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const tags = await computeUserExposureTags(USER, now)

    expect(tags).not.toContain('has_incomplete_itembook')
    expect(tags).not.toContain(`itembook_remaining_le${ITEMBOOK_REMAINING_MAX}`)
    expect(tags).not.toContain(`strava_stale_${STRAVA_STALE_DAYS}d`)
    expect(errorSpy).toHaveBeenCalledWith('[getItemBookProgress] user_item_book_slots 조회 오류:', '슬롯 조회 실패')
    expect(errorSpy).toHaveBeenCalledWith('[stravaStaleDays] strava_connections 조회 오류:', 'Strava 연결 조회 실패')

    errorSpy.mockRestore()
  })
})
