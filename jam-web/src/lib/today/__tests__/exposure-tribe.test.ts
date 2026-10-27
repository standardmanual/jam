/**
 * 소속 트라이브 노출 태그 시험 (티켓 20261026_2030 2회차)
 *
 * 1) 순수 함수 경계(tribeTagOf·isTribeTag·tribeIdOfTag) 2) computeUserExposureTags 통합(Supabase 모의):
 *    users.tribe_id 읽기, 인자로 값이 오면 읽지 않음, 읽기 오류 시 그 태그만 빠짐.
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/exposure-tribe.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

const fixtures = vi.hoisted(() => ({
  users: {} as Record<string, Row | undefined>,
  usersError: null as string | null,
  fromCalls: {} as Record<string, number>,
}))

/** users 표만 유저별 고정 행을 돌려주고, 나머지 표는 빈 결과를 돌려주는 최소 쿼리 빌더 */
function mockSupabase() {
  const from = (table: string) => {
    fixtures.fromCalls[table] = (fixtures.fromCalls[table] ?? 0) + 1
    const eq: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = chain
    builder.eq = (col: string, val: unknown) => {
      eq[col] = val
      return builder
    }
    for (const m of ['in', 'is', 'gte', 'lte', 'order']) builder[m] = chain
    builder.limit = () => Promise.resolve({ data: [], error: null })
    builder.maybeSingle = () => {
      if (table === 'users') {
        if (fixtures.usersError) return Promise.resolve({ data: null, error: { message: fixtures.usersError } })
        return Promise.resolve({ data: fixtures.users[eq.id as string] ?? null, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve)
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/inputs/weather', () => ({ getTodayWeather: async () => null }))
vi.mock('@/lib/inputs/holidays', () => ({ getTodaySpecialDays: async () => [] }))

import { computeUserExposureTags } from '../exposure'
import { TRIBE_TAG_PREFIX, isTribeTag, tribeIdOfTag, tribeTagOf } from '../exposureTribe'

const TRIBE_A = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-27T03:00:00Z')

describe('tribeTagOf', () => {
  it('UUID면 tribe_<소문자 UUID>', () => {
    expect(tribeTagOf(TRIBE_A)).toBe(`tribe_${TRIBE_A}`)
    expect(tribeTagOf('ABCDEF12-1111-4111-8111-111111111111')).toBe('tribe_abcdef12-1111-4111-8111-111111111111')
  })

  it.each([[null], [undefined], [''], ['ranger'], ['11111111-1111-4111-8111-11111111111'], [`${TRIBE_A}0`], [` ${TRIBE_A}`]])(
    '%s는 태그 없음',
    (id) => {
      expect(tribeTagOf(id as string | null | undefined)).toBeNull()
    }
  )
})

describe('isTribeTag · tribeIdOfTag', () => {
  it('접두어 + 소문자 UUID 전체 일치만 트라이브 태그다', () => {
    expect(isTribeTag(`tribe_${TRIBE_A}`)).toBe(true)
    expect(tribeIdOfTag(`tribe_${TRIBE_A}`)).toBe(TRIBE_A)
  })

  it.each([
    ['tribe_abc'],
    ['tribe_'],
    ['tribe_gourmet'],
    [TRIBE_A],
    [`tribe_${TRIBE_A}x`],
    [`xtribe_${TRIBE_A}`],
    ['tribe_ABCDEF12-1111-4111-8111-111111111111'],
    ['all'],
    [5],
    [null],
    [undefined],
  ])('%s는 트라이브 태그가 아니다', (value) => {
    expect(isTribeTag(value)).toBe(false)
    expect(tribeIdOfTag(value)).toBeNull()
  })

  it('tribeTagOf가 만든 값은 항상 isTribeTag를 통과하고 ID로 되돌아간다', () => {
    const tag = tribeTagOf('ABCDEF12-1111-4111-8111-111111111111') as string
    expect(tag.startsWith(TRIBE_TAG_PREFIX)).toBe(true)
    expect(isTribeTag(tag)).toBe(true)
    expect(tribeIdOfTag(tag)).toBe('abcdef12-1111-4111-8111-111111111111')
  })
})

describe('computeUserExposureTags — 소속 트라이브 태그', () => {
  beforeEach(() => {
    fixtures.users = {}
    fixtures.usersError = null
    fixtures.fromCalls = {}
  })

  it('인자를 생략하면 users.tribe_id를 읽어 tribe_<ID> 하나를 붙인다', async () => {
    fixtures.users['u1'] = { tribe_id: TRIBE_A }
    const tags = await computeUserExposureTags('u1', NOW)
    expect(tags.filter((t) => isTribeTag(t))).toEqual([`tribe_${TRIBE_A}`])
    expect(tags[tags.length - 1]).toBe(`tribe_${TRIBE_A}`)
    expect(fixtures.fromCalls['users']).toBe(1)
  })

  it('트라이브가 없는 유저(온보딩 전)나 users 행이 없으면 태그가 없다', async () => {
    fixtures.users['u2'] = { tribe_id: null }
    expect((await computeUserExposureTags('u2', NOW)).some((t) => t.startsWith('tribe_'))).toBe(false)
    expect((await computeUserExposureTags('u-none', NOW)).some((t) => t.startsWith('tribe_'))).toBe(false)
  })

  it('인자로 값이 오면 users를 읽지 않는다(null 포함)', async () => {
    const withTribe = await computeUserExposureTags('u1', NOW, null, TRIBE_A)
    expect(withTribe).toContain(`tribe_${TRIBE_A}`)
    const withNull = await computeUserExposureTags('u1', NOW, null, null)
    expect(withNull.some((t) => t.startsWith('tribe_'))).toBe(false)
    expect(fixtures.fromCalls['users']).toBeUndefined()
  })

  it('인자로 온 값이 UUID가 아니면 태그를 붙이지 않는다', async () => {
    const tags = await computeUserExposureTags('u1', NOW, null, 'ranger')
    expect(tags.some((t) => t.startsWith('tribe_'))).toBe(false)
  })

  it('읽기 오류가 나면 그 태그만 빠지고 나머지는 붙는다', async () => {
    fixtures.usersError = 'boom'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tags = await computeUserExposureTags('u1', NOW)
    expect(tags.some((t) => t.startsWith('tribe_'))).toBe(false)
    expect(tags).toContain('all')
    expect(spy).toHaveBeenCalledWith('[getUserTribeId] users 조회 오류:', 'boom')
    spy.mockRestore()
  })
})
