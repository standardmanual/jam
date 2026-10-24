/**
 * 어드민 정기 배포 설정 저장 라우트 — 스위치와 세 축 고르기 여섯 열만 쓴다 (티켓 20261022_1134 3회, 이전에 20261018_1813·20261022_0938)
 *
 * 숫자 8열(배포 시각, 상호 배제 창, 배치 규모, 지점당 한도, 등급 비율 4칸)은 밸런스 설정 «시스템 드랍» 구역이 바꾼다. 이 라우트가 `current`로 모든 열을 채워 다시 쓰면
 * 밸런스 설정이 방금 바꾼 숫자를 낡은 값으로 덮어쓸 수 있어서, 쓰는 열을 여섯 개로 줄이고 이 시험이 지킨다:
 * - 저장 값의 열은 정확히 여섯 개이고, 본문에 숫자 8칸(과 `all_random`, `last_auto_run_on`)이 어떤 값으로 들어와도 싣지 않는다
 * - 스위치와 세 축 고르기는 그대로 저장된다. 검증 오류는 400이고 저장하지 않는다
 * - `rarity_mode`가 explicit이 되면 등급 비율 합 1 검사는 **저장된 값(`current`)** 으로 한다. 본문의 비율은 보지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/ambient-drop/config/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
  current: {} as Record<string, unknown>,
  update: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin }))
vi.mock('@/lib/ambient-drop/config', () => ({
  getAmbientDropConfig: async () => state.current,
  updateAmbientDropConfig: (...args: unknown[]) => state.update(...args),
}))

import { PUT } from '../route'

function put(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/ambient-drop/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** 이 라우트가 쓰는 열의 전부. */
const AXIS_KEYS = ['auto_enabled', 'category_mode', 'category_slug', 'collection_ids', 'collection_mode', 'rarity_mode']
/** 밸런스 설정 구역이 바꾸는 숫자 8열. */
const NUMERIC_KEYS = [
  'schedule_hour_kst',
  'exclusion_window_minutes',
  'batch_size',
  'max_active_per_poi',
  'rarity_common',
  'rarity_rare',
  'rarity_epic',
  'rarity_mystic',
]
const COLLECTION_ID = '5d6b3a38-5c8e-4b4a-9a52-0a1b2c3d4e5f'

const saved = () => state.update.mock.calls[0][0] as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  state.admin = { id: 'admin-1', email: 'admin@example.com' }
  state.current = {
    auto_enabled: false,
    schedule_hour_kst: 3,
    last_auto_run_on: '2026-10-23',
    exclusion_window_minutes: 15,
    category_mode: 'random',
    category_slug: null,
    rarity_mode: 'explicit',
    rarity_common: 1,
    rarity_rare: 0,
    rarity_epic: 0,
    rarity_mystic: 0,
    collection_mode: 'explicit',
    collection_ids: [],
    batch_size: 30,
    max_active_per_poi: 1,
  }
})

describe('PUT /api/admin/ambient-drop/config — 쓰는 열', () => {
  it('저장 값의 열은 스위치와 세 축 고르기 여섯 개뿐이다(숫자 8열과 last_auto_run_on을 싣지 않는다)', async () => {
    const res = await PUT(put(state.current))

    expect(res.status).toBe(200)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(Object.keys(saved()).sort()).toEqual(AXIS_KEYS)
    for (const key of [...NUMERIC_KEYS, 'last_auto_run_on']) expect(saved(), key).not.toHaveProperty(key)
  })

  it('본문에 숫자 8칸이 다른 값으로 들어와도 저장하지 않는다(열려 있던 옛 화면의 낡은 숫자가 밸런스 설정 값을 덮어쓰지 못한다)', async () => {
    const res = await PUT(
      put({
        ...state.current,
        schedule_hour_kst: 9,
        exclusion_window_minutes: 99,
        batch_size: 7,
        max_active_per_poi: 5,
        rarity_common: 0.5,
        rarity_rare: 0.3,
        rarity_epic: 0.1,
        rarity_mystic: 0.1,
        auto_enabled: true,
      })
    )

    expect(res.status).toBe(200)
    expect(Object.keys(saved()).sort()).toEqual(AXIS_KEYS)
    for (const key of NUMERIC_KEYS) expect(saved(), key).not.toHaveProperty(key)
    // 숫자 칸을 무시해도 같은 본문의 스위치는 저장된다
    expect(saved()).toMatchObject({ auto_enabled: true })
  })

  it('본문에 all_random·last_auto_run_on이 들어와도 저장 값에 싣지 않는다(DB 칸을 건드리지 않는다)', async () => {
    const res = await PUT(put({ ...state.current, all_random: false, last_auto_run_on: '2030-01-01' }))

    expect(res.status).toBe(200)
    expect(saved()).not.toHaveProperty('all_random')
    expect(saved()).not.toHaveProperty('last_auto_run_on')
  })

  it('숫자 칸만 들어온 본문도 200이고 저장 값은 현재 값으로 채운 여섯 열이다', async () => {
    const res = await PUT(put({ batch_size: 10, schedule_hour_kst: 12 }))

    expect(res.status).toBe(200)
    expect(saved()).toEqual({
      auto_enabled: false,
      category_mode: 'random',
      category_slug: null,
      rarity_mode: 'explicit',
      collection_mode: 'explicit',
      collection_ids: [],
    })
  })

  it('상호 배제 창이 코드 상한을 넘거나 720이어도 이 라우트는 읽지 않는다(상한 검사는 밸런스 설정 구역의 몫이다)', async () => {
    const res = await PUT(put({ ...state.current, exclusion_window_minutes: 720 }))

    expect(res.status).toBe(200)
    expect(saved()).not.toHaveProperty('exclusion_window_minutes')
    expect(JSON.stringify(await res.json())).not.toContain('720')
  })
})

describe('PUT /api/admin/ambient-drop/config — 스위치와 세 축', () => {
  it('스위치와 세 축 고르기를 저장한다', async () => {
    const res = await PUT(
      put({
        auto_enabled: true,
        category_mode: 'explicit',
        category_slug: 'cafe',
        rarity_mode: 'random',
        collection_mode: 'explicit',
        collection_ids: [COLLECTION_ID],
      })
    )

    expect(res.status).toBe(200)
    expect(saved()).toEqual({
      auto_enabled: true,
      category_mode: 'explicit',
      category_slug: 'cafe',
      rarity_mode: 'random',
      collection_mode: 'explicit',
      collection_ids: [COLLECTION_ID],
    })
  })

  it('본문에 없는 축은 현재 값을 그대로 쓴다', async () => {
    state.current = { ...state.current, category_mode: 'explicit', category_slug: 'park', collection_ids: [COLLECTION_ID] }
    const res = await PUT(put({ auto_enabled: true }))

    expect(res.status).toBe(200)
    expect(saved()).toMatchObject({ auto_enabled: true, category_mode: 'explicit', category_slug: 'park', collection_ids: [COLLECTION_ID] })
  })

  it('잘못된 모드·카테고리·컬렉션 id는 400이고 저장하지 않는다', async () => {
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ category_mode: 'all' }, 'category_mode'],
      [{ category_slug: 3 }, 'category_slug'],
      [{ rarity_mode: 'x' }, 'rarity_mode'],
      [{ collection_mode: null }, 'collection_mode'],
      [{ collection_ids: ['not-a-uuid'] }, 'collection_ids'],
      [{ collection_ids: 'x' }, 'collection_ids'],
    ]
    for (const [body, name] of bad) {
      const res = await PUT(put(body))
      expect(res.status, name).toBe(400)
      expect(((await res.json()) as { error: string }).error, name).toContain(name)
    }
    expect(state.update).not.toHaveBeenCalled()
  })

  it('저장이 DB 제약(없는 카테고리 등)에 걸리면 400이고 원인을 알린다', async () => {
    state.update.mockRejectedValueOnce(new Error('violates foreign key constraint'))
    const res = await PUT(put({ category_mode: 'explicit', category_slug: 'nope' }))

    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('category_slug 등 참조 값을 확인해주세요: violates foreign key constraint')
  })
})

describe('PUT /api/admin/ambient-drop/config — 등급 «명시» 전환의 합 검사 (저장된 값 기준)', () => {
  it('저장된 등급 비율 합이 1이면 명시로 저장된다', async () => {
    state.current = { ...state.current, rarity_mode: 'random', rarity_common: 0.333, rarity_rare: 0.333, rarity_epic: 0.334, rarity_mystic: 0 }
    const res = await PUT(put({ rarity_mode: 'explicit' }))

    expect(res.status).toBe(200)
    expect(saved()).toMatchObject({ rarity_mode: 'explicit' })
  })

  it('저장된 합이 1이 아니면 400이고, 밸런스 설정에서 맞추라고 알리며 저장하지 않는다', async () => {
    state.current = { ...state.current, rarity_mode: 'random', rarity_common: 0.5, rarity_rare: 0.2, rarity_epic: 0, rarity_mystic: 0 }
    const res = await PUT(put({ rarity_mode: 'explicit' }))

    expect(res.status).toBe(400)
    const { error } = (await res.json()) as { error: string }
    expect(error).toContain('70%')
    expect(error).toContain('밸런스 설정')
    expect(error).toContain('100')
    expect(state.update).not.toHaveBeenCalled()
  })

  it('본문의 등급 비율은 보지 않는다: 저장된 합이 어긋나면 본문이 합 1이어도 400이다', async () => {
    state.current = { ...state.current, rarity_mode: 'random', rarity_common: 0.5, rarity_rare: 0.2, rarity_epic: 0, rarity_mystic: 0 }
    const res = await PUT(put({ rarity_mode: 'explicit', rarity_common: 1, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 0 }))

    expect(res.status).toBe(400)
    expect(state.update).not.toHaveBeenCalled()
  })

  it('본문의 등급 비율은 보지 않는다: 저장된 합이 1이면 본문이 어긋나도 200이고 그 비율은 저장하지 않는다', async () => {
    const res = await PUT(put({ rarity_mode: 'explicit', rarity_common: 0.2, rarity_rare: 0.2, rarity_epic: 0.2, rarity_mystic: 0.2 }))

    expect(res.status).toBe(200)
    expect(saved()).not.toHaveProperty('rarity_common')
  })

  it('이미 명시인 채로 다른 칸을 저장해도 같은 검사를 지난다', async () => {
    state.current = { ...state.current, rarity_mode: 'explicit', rarity_common: 0.5, rarity_rare: 0.2, rarity_epic: 0, rarity_mystic: 0 }
    const res = await PUT(put({ auto_enabled: true }))

    expect(res.status).toBe(400)
    expect(state.update).not.toHaveBeenCalled()
  })

  it('무작위로 저장할 때는 합을 보지 않는다', async () => {
    state.current = { ...state.current, rarity_mode: 'explicit', rarity_common: 0.5, rarity_rare: 0.2, rarity_epic: 0, rarity_mystic: 0 }
    const res = await PUT(put({ rarity_mode: 'random' }))

    expect(res.status).toBe(200)
    expect(saved()).toMatchObject({ rarity_mode: 'random' })
  })
})

describe('PUT /api/admin/ambient-drop/config — 권한', () => {
  it('비관리자는 403이고 저장하지 않는다', async () => {
    state.admin = null
    const res = await PUT(put({}))

    expect(res.status).toBe(403)
    expect(state.update).not.toHaveBeenCalled()
  })
})
