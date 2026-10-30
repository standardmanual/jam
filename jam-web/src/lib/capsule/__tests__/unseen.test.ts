/**
 * lib/capsule/unseen — 보지 않은 캡슐 결과 읽기와 «봤어요» 처리 (티켓 20261028_1740 2회)
 *
 * 고정하는 것:
 * - 읽기: `seen_at IS NULL`인 본인 행을 오래된 순서로 최대 50건 읽고, 이벤트를 행 순서·행 안 순서 그대로 이어 붙여 하나로 합친다. 읽을 행이 없으면 null.
 * - 깨진 행(version 불일치, events가 배열이 아님, 이벤트 모양 불일치)은 건너뛰고 로그만 남기며 `ids`에 넣지 않는다. 읽을 수 있는 행이 하나도 없으면 null.
 * - 화면용 이벤트는 `openId`·`items`·`reachedChapters`만 싣는다(`buildCapsuleResultView`의 입력을 만족한다).
 * - 챕터 배지: 합친 `reachedChapters`의 챕터를 조건으로 하는 액티비티 배지 가운데 유저가 이미 가진 것만, 챕터가 낮은 순서로 싣는다. 오른 챕터가 없으면 조회하지 않는다.
 *   배지 조회가 실패(오류·예외)해도 결과는 내리고 `chapterBadges: []`다. 행 조회가 실패하면 던진다.
 * - «봤어요»: 본인의 아직 안 본 행만 `seen_at`을 채우고 바뀐 행 수를 돌려준다. 같은 요청을 두 번 보내면 두 번째는 0이다. 갱신이 실패하면 던진다.
 * 공용 DB는 호출하지 않는다 — 표별 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/unseen.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn() }))
vi.mock('../auto-fill', () => ({ runCapsuleAutoFill: vi.fn() }))

import { buildCapsuleResultView } from '../result-overlay-model'
import { markUnseenCapsuleResultsSeen, readUnseenCapsuleResult } from '../unseen'

const USER_ID = '11111111-1111-4111-8111-111111111111'

type Call = { method: string; args: unknown[] }
interface TableResult {
  data?: unknown
  error?: { message: string } | null
  throws?: boolean
}

/** 표 이름별로 결과를 돌려주는 체인 가짜. 호출한 메서드를 표별로 기록한다 */
function fakeClient(tables: Record<string, TableResult>) {
  const calls: Record<string, Call[]> = {}
  const client = {
    from(table: string) {
      const log = (calls[table] ??= [])
      const result = tables[table] ?? { data: [], error: null }
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'update', 'eq', 'in', 'is', 'order', 'limit']) {
        builder[method] = (...args: unknown[]) => {
          log.push({ method, args })
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (result.throws) return Promise.reject(new Error('network')).then(resolve, reject)
        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve, reject)
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const ITEM = { locked: false, inventoryItemId: 'inv-1', badgeId: 'b-1', name: '이름', imageUrl: null, rarity: 'rare', serialNumber: 3 }
const LOCKED = { locked: true, inventoryItemId: 'inv-2', rarity: 'epic', unlockRequired: 10 }

const event = (n: number, extra: Record<string, unknown> = {}) => ({
  openId: `open-${n}`,
  items: [ITEM],
  next: { required: 145, filled: 0 },
  chapterNo: 1,
  reachedChapters: [],
  chapterCount: n,
  ...extra,
})
const row = (id: string, events: unknown[], version = 1) => ({ id, payload: { version, events } })

const BADGE_ROWS = [
  { id: 'badge-5', name: '다섯째', description: '챕터 5', image_url: 'https://img/5.png', rarity: 'epic', level: 3, condition_json: { chapter_reached: 5 } },
  { id: 'badge-3', name: '셋째', description: '챕터 3', image_url: null, rarity: 'common', level: 1, condition_json: { chapter_reached: 3 } },
  { id: 'badge-4', name: '넷째', description: '챕터 4', image_url: null, rarity: null, level: null, condition_json: { chapter_reached: 4 } },
]

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('readUnseenCapsuleResult', () => {
  it('읽을 행이 없으면 null이고 챕터 배지도 조회하지 않는다', async () => {
    const { client, calls } = fakeClient({ capsule_unseen_results: { data: [] } })
    await expect(readUnseenCapsuleResult(client, USER_ID)).resolves.toBeNull()
    expect(calls.badges).toBeUndefined()
  })

  it('본인의 안 본 행을 오래된 순서로 최대 50건 읽는다', async () => {
    const { client, calls } = fakeClient({ capsule_unseen_results: { data: [] } })
    await readUnseenCapsuleResult(client, USER_ID)
    const log = calls.capsule_unseen_results
    expect(log).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(log).toContainEqual({ method: 'is', args: ['seen_at', null] })
    expect(log).toContainEqual({ method: 'order', args: ['created_at', { ascending: true }] })
    expect(log).toContainEqual({ method: 'limit', args: [50] })
  })

  it('여러 행의 이벤트를 행 순서·행 안 순서 그대로 이어 붙이고, 행 id를 모두 담는다', async () => {
    const { client } = fakeClient({
      capsule_unseen_results: { data: [row('r1', [event(1), event(2)]), row('r2', [event(3)])] },
    })
    const result = await readUnseenCapsuleResult(client, USER_ID)
    expect(result?.ids).toEqual(['r1', 'r2'])
    expect(result?.events.map((e) => e.openId)).toEqual(['open-1', 'open-2', 'open-3'])
    expect(result?.chapterBadges).toEqual([])
  })

  it('화면용 이벤트는 openId·items·reachedChapters만 싣고, 합친 연출의 표시 모델이 그대로 읽는다', async () => {
    const { client } = fakeClient({
      capsule_unseen_results: { data: [row('r1', [event(1, { items: [ITEM, LOCKED], reachedChapters: [] })])] },
    })
    const result = await readUnseenCapsuleResult(client, USER_ID)
    expect(result?.events[0]).toEqual({ openId: 'open-1', items: [ITEM, LOCKED], reachedChapters: [] })

    const view = buildCapsuleResultView(result!.events, result!.chapterBadges)
    expect(view?.titleKind).toBe('full')
    expect(view?.rewardCount).toBe(2)
  })

  it('깨진 행은 건너뛰고 로그만 남기며 ids에 넣지 않는다', async () => {
    const { client } = fakeClient({
      capsule_unseen_results: {
        data: [
          row('bad-version', [event(1)], 2),
          { id: 'bad-events', payload: { version: 1, events: 'nope' } },
          { id: 'bad-payload', payload: null },
          row('bad-event', [{ openId: 'x' }]),
          row('good', [event(2)]),
        ],
      },
    })
    const result = await readUnseenCapsuleResult(client, USER_ID)
    expect(result?.ids).toEqual(['good'])
    expect(result?.events.map((e) => e.openId)).toEqual(['open-2'])
    expect(console.error).toHaveBeenCalledTimes(4)
  })

  it('읽을 수 있는 행이 하나도 없으면 null이다', async () => {
    const { client } = fakeClient({ capsule_unseen_results: { data: [row('bad', [event(1)], 9)] } })
    await expect(readUnseenCapsuleResult(client, USER_ID)).resolves.toBeNull()
  })

  it('행 조회가 실패하면 던진다', async () => {
    const { client } = fakeClient({ capsule_unseen_results: { error: { message: 'boom' } } })
    await expect(readUnseenCapsuleResult(client, USER_ID)).rejects.toThrow('boom')
  })

  describe('챕터 배지', () => {
    const rose = (chapters: number[]) =>
      fakeClient({
        capsule_unseen_results: { data: [row('r1', [event(1, { reachedChapters: chapters })])] },
        badges: { data: BADGE_ROWS },
        user_activity_badges: { data: [{ badge_id: 'badge-5' }, { badge_id: 'badge-3' }] },
      })

    it('오른 챕터의 배지 가운데 이미 받은 것만, 챕터가 낮은 순서로 싣는다 (받지 않은 배지는 싣지 않는다)', async () => {
      const { client, calls } = rose([3, 4, 5])
      const result = await readUnseenCapsuleResult(client, USER_ID)
      expect(result?.chapterBadges).toEqual([
        { id: 'badge-3', name: '셋째', description: '챕터 3', imageUrl: null, rarity: 'common', level: 1 },
        { id: 'badge-5', name: '다섯째', description: '챕터 5', imageUrl: 'https://img/5.png', rarity: 'epic', level: 3 },
      ])
      expect(calls.badges).toContainEqual({ method: 'in', args: ['condition_json->>chapter_reached', ['3', '4', '5']] })
      expect(calls.badges).toContainEqual({ method: 'eq', args: ['type', 'activity'] })
      expect(calls.user_activity_badges).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    })

    it('오른 챕터에 속하지 않는 배지는 싣지 않는다', async () => {
      const { client } = rose([3])
      const result = await readUnseenCapsuleResult(client, USER_ID)
      expect(result?.chapterBadges.map((b) => b.id)).toEqual(['badge-3'])
    })

    it('여러 행의 오른 챕터를 합쳐 한 번에 조회하고 표시 모델은 가장 높은 챕터로 제목을 정한다', async () => {
      const { client, calls } = fakeClient({
        capsule_unseen_results: { data: [row('r1', [event(1, { reachedChapters: [2] })]), row('r2', [event(2, { reachedChapters: [3, 4] })])] },
        badges: { data: BADGE_ROWS },
        user_activity_badges: { data: [{ badge_id: 'badge-3' }] },
      })
      const result = await readUnseenCapsuleResult(client, USER_ID)
      expect(calls.badges.filter((c) => c.method === 'in')).toHaveLength(1)
      const view = buildCapsuleResultView(result!.events, result!.chapterBadges)
      expect(view).toMatchObject({ titleKind: 'chapter', chapterNo: 4 })
      expect(view?.rewards.at(-1)).toMatchObject({ kind: 'chapterBadge' })
    })

    it('오른 챕터가 없으면 배지를 조회하지 않는다', async () => {
      const { client, calls } = rose([])
      const result = await readUnseenCapsuleResult(client, USER_ID)
      expect(result?.chapterBadges).toEqual([])
      expect(calls.badges).toBeUndefined()
    })

    it.each([
      ['배지 조회 오류', { badges: { error: { message: 'x' } } }],
      ['배지 조회 예외', { badges: { throws: true } }],
      ['받은 배지 조회 오류', { badges: { data: BADGE_ROWS }, user_activity_badges: { error: { message: 'x' } } }],
      ['받은 배지 조회 예외', { badges: { data: BADGE_ROWS }, user_activity_badges: { throws: true } }],
    ] as const)('%s가 나도 결과는 내리고 chapterBadges는 빈 배열이다', async (_name, tables) => {
      const { client } = fakeClient({
        capsule_unseen_results: { data: [row('r1', [event(1, { reachedChapters: [3] })])] },
        ...tables,
      })
      const result = await readUnseenCapsuleResult(client, USER_ID)
      expect(result?.ids).toEqual(['r1'])
      expect(result?.chapterBadges).toEqual([])
      expect(console.error).toHaveBeenCalled()
    })
  })
})

describe('markUnseenCapsuleResultsSeen', () => {
  const NOW = new Date('2026-10-30T01:00:00.000Z')

  it('본인의 안 본 행만 seen_at을 채우고 바뀐 행 수를 돌려준다', async () => {
    const { client, calls } = fakeClient({ capsule_unseen_results: { data: [{ id: 'r1' }, { id: 'r2' }] } })
    await expect(markUnseenCapsuleResultsSeen(client, USER_ID, ['r1', 'r2', 'someone-elses'], NOW)).resolves.toBe(2)
    const log = calls.capsule_unseen_results
    expect(log).toContainEqual({ method: 'update', args: [{ seen_at: NOW.toISOString() }] })
    expect(log).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(log).toContainEqual({ method: 'in', args: ['id', ['r1', 'r2', 'someone-elses']] })
    expect(log).toContainEqual({ method: 'is', args: ['seen_at', null] })
  })

  it('이미 봤거나 남의 행뿐이면 0을 돌려준다 (같은 요청을 다시 보낸 경우)', async () => {
    const { client } = fakeClient({ capsule_unseen_results: { data: [] } })
    await expect(markUnseenCapsuleResultsSeen(client, USER_ID, ['r1'], NOW)).resolves.toBe(0)
  })

  it('id가 없으면 DB를 부르지 않고 0이다', async () => {
    const { client, calls } = fakeClient({})
    await expect(markUnseenCapsuleResultsSeen(client, USER_ID, [], NOW)).resolves.toBe(0)
    expect(calls.capsule_unseen_results).toBeUndefined()
  })

  it('갱신이 실패하면 던진다', async () => {
    const { client } = fakeClient({ capsule_unseen_results: { error: { message: 'boom' } } })
    await expect(markUnseenCapsuleResultsSeen(client, USER_ID, ['r1'], NOW)).rejects.toThrow('boom')
  })
})
