/**
 * POST /api/admin/missions — 순위형 금지·기온 키 거부·판정 불가 키 경고의 라우트 배선 (티켓 20261019_1312).
 * 기간을 걸 수 없는 키 5개의 거절과 DB 기록 키의 경고 없는 저장도 함께 고정한다 (티켓 20261019_1445).
 * 순수 함수(`condition-keys.test.ts`)만으로는 라우트가 틀을 넘기지 않아도 통과하므로 라우트 단위로 고정한다.
 * DB는 기록형 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/missions/route.condition-rules.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
}))

const fakeClient = {
  from: () => ({
    insert: (row: Record<string, unknown>) => {
      state.inserts.push(row)
      return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new', ...row }, error: null }) }) }
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { POST } = await import('./route')

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

const NIGHT = { time_range: { start: '22:00', end: '05:00' }, activity_type: 'running' }

const base = {
  title: '테스트 미션',
  mission_type: 'engine_condition',
  condition_json: NIGHT,
  reward_badge_ids: [],
  starts_at: '2026-10-19T00:00:00.000Z',
}

beforeEach(() => {
  state.inserts = []
})

describe('POST /api/admin/missions — 순위형 금지', () => {
  it('순위형 + 밤 조건은 400이고 저장하지 않는다', async () => {
    const res = await post({ ...base, status_display_type: 'ranking' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('순위형 미션에는 쓸 수 없는 조건')
    expect(state.inserts).toHaveLength(0)
  })

  it('틀을 비우면 DB 기본값(순위형)과 같게 검사한다', async () => {
    const res = await post({ ...base })
    expect(res.status).toBe(400)
    expect(state.inserts).toHaveLength(0)
  })

  it('순위형 + capsule_open_count는 400이다', async () => {
    const res = await post({
      ...base,
      status_display_type: 'ranking',
      condition_json: { capsule_open_count: 3 },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('capsule_open_count')
    expect(state.inserts).toHaveLength(0)
  })

  it.each(['achievement', 'individual'])('%s는 밤 조건과 캡슐 연 횟수를 저장한다', async (frame) => {
    const night = await post({ ...base, status_display_type: frame })
    expect(night.status).toBe(200)
    const capsule = await post({ ...base, status_display_type: frame, condition_json: { capsule_open_count: 3 } })
    expect(capsule.status).toBe(200)
    expect(state.inserts).toHaveLength(2)
  })

  it('순위형이어도 밤이 아닌 시간대 조건은 저장한다', async () => {
    const res = await post({
      ...base,
      status_display_type: 'ranking',
      condition_json: { activity_type: 'running', distance_km: 10, time_range: { start: '05:00', end: '08:00' } },
    })
    expect(res.status).toBe(200)
    expect(state.inserts).toHaveLength(1)
  })
})

describe('POST /api/admin/missions — 기온 키', () => {
  it.each(['temperature_min_c', 'temperature_max_c'])('%s는 400이다', async (key) => {
    const res = await post({
      ...base,
      status_display_type: 'achievement',
      condition_json: { distance_km: 10, [key]: 30 },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('날씨와 기온')
    expect(state.inserts).toHaveLength(0)
  })
})

describe('POST /api/admin/missions — 기간을 걸 수 없는 키', () => {
  it.each(['jam_total_earned', 'chapter_reached', 'days_since_signup', 'other_tribe_item_kinds_count', 'signup_recent_active_days'])(
    '%s는 400이고 저장하지 않는다',
    async (key) => {
      const res = await post({
        ...base,
        status_display_type: 'achievement',
        condition_json: { distance_km: 10, [key]: 5 },
      })
      expect(res.status).toBe(400)
      const error = (await res.json()).error as string
      expect(error).toContain(key)
      expect(error).toContain('셀 수 없는 조건')
      expect(error).not.toContain('날씨와 기온')
      expect(state.inserts).toHaveLength(0)
    }
  )
})

describe('POST /api/admin/missions — DB 기록 키', () => {
  it('판정하는 키라 경고 없이 저장한다 (조건은 그대로 저장)', async () => {
    const condition = { combine_success_count: 3, mission_complete_count: 2 }
    const res = await post({ ...base, status_display_type: 'achievement', condition_json: condition })
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('warning')
    expect(state.inserts[0].condition_json).toEqual(condition)
  })

  it('2회(티켓 20261019_1445): 날짜·체크인 5개 키도 경고 없이 저장한다 (객체 값은 모양 그대로)', async () => {
    const condition = {
      weekly_active_days: 3,
      same_spot_checkin_days: 2,
      new_checkin_badge_count: 4,
      checkin_category_count: { category: 'train_subway', count: 2 },
      checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 },
    }
    const res = await post({ ...base, status_display_type: 'achievement', condition_json: condition })
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('warning')
    expect(state.inserts[0].condition_json).toEqual(condition)
  })
})

describe('POST /api/admin/missions — 기간 동안 모은 잼 (티켓 20261019_1445 3-A회)', () => {
  it('순위형·달성형·개인형 어느 틀로든 경고 없이 저장한다 (모은 잼은 순위 기준으로 쓸 수 있다)', async () => {
    for (const frame of ['ranking', 'achievement', 'individual']) {
      state.inserts = []
      const condition = { jam_period_earned: 500 }
      const res = await post({ ...base, status_display_type: frame, condition_json: condition })
      expect(res.status, frame).toBe(200)
      expect(await res.json(), frame).not.toHaveProperty('warning')
      expect(state.inserts[0].condition_json, frame).toEqual(condition)
    }
  })

  it('틀을 비워도(DB 기본값 순위형) 저장한다', async () => {
    const res = await post({ ...base, condition_json: { jam_period_earned: 500 } })
    expect(res.status).toBe(200)
  })

  it('순위형이어도 밤 조건·캡슐 연 횟수는 계속 거부한다 (순위형 금지는 바뀌지 않았다)', async () => {
    const night = await post({ ...base, status_display_type: 'ranking', condition_json: { jam_period_earned: 500, ...NIGHT } })
    expect(night.status).toBe(400)
    const capsule = await post({ ...base, status_display_type: 'ranking', condition_json: { jam_period_earned: 500, capsule_open_count: 3 } })
    expect(capsule.status).toBe(400)
    expect(state.inserts).toEqual([])
  })
})

describe('POST /api/admin/missions — 판정하지 않는 조건 경고', () => {
  it('저장은 하고 응답에 경고를 싣는다', async () => {
    const res = await post({
      ...base,
      status_display_type: 'achievement',
      condition_json: { distance_km: 10, active_week_streak: 4 },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('new')
    expect(body.warning).toContain('판정하지 않는 조건')
    expect(body.warning).toContain('active_week_streak')
    // 경고는 응답에만 싣고 DB 행에는 넣지 않는다
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).not.toHaveProperty('warning')
    expect(state.inserts[0].condition_json).toEqual({ distance_km: 10, active_week_streak: 4 })
  })

  it('경고할 것이 없으면 응답 모양은 그대로다(warning 키 없음)', async () => {
    const res = await post({
      ...base,
      status_display_type: 'achievement',
      condition_json: { distance_km: 10, activity_type: 'running' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('warning')
  })
})
