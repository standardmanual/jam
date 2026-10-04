/**
 * 등록 전 DB 검사·되돌림 참조 확인(티켓 20261002_0827) — 세 DB 검사와 세 참조 확인을 최소 스텁으로 직접 부른다.
 * 스크립트 쪽 동작은 `scripts/asset-generator/__tests__/register*Flow.test.ts`가 같은 함수를 flow 래퍼로 시험한다.
 * 여기서는 서버가 가져다 쓸 TS 모듈 자체의 통과·실패·조회 오류와, 이 폴더가 `node:`·`scripts/`에 의존하지 않는 계약을 본다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runBadgeDbChecks } from '../badge'
import { runCollectionDbChecks } from '../collection'
import { runHomeFeedDbChecks } from '../homeFeed'
import { missionPeriodsOverlap, runMissionDbChecks } from '../mission'
import { findUnlaunchedCollectionBadges } from '../recipe'
import {
  AMBIENT_SCHEDULE_UNFINISHED_STATUSES,
  BADGE_UNDO_ARRAY_REFERENCE_COLUMNS,
  BADGE_UNDO_REFERENCES,
  BADGE_UNDO_REFERENCE_TABLES,
  HOME_FEED_UNDO_REFERENCE_TABLES,
  ITEM_BOOK_UNDO_ARRAY_REFERENCE_COLUMNS,
  ITEM_BOOK_UNDO_REFERENCES,
  ITEM_BOOK_UNDO_REFERENCE_TABLES,
  MISSION_UNDO_REFERENCE_TABLES,
  findBadgeUndoReferences,
  findHomeFeedUndoReferences,
  findItemBookUndoReferences,
  findMissionUndoReferences,
} from '../references'
import type { RegisterChecksClient, RegisterQuery, RegisterQueryResult, RegisterRow } from '../shared'

type Entry = {
  table: string
  columns: string
  options?: { count?: 'exact'; head?: boolean }
  filters: unknown[][]
  terminal: 'await' | 'maybeSingle'
}
type StubResult = { data?: RegisterRow[] | RegisterRow | null; error?: { message: string } | null; count?: number | null }

/** 호출을 `entries`에 순서대로 남기는 최소 스텁. `resolve`가 질의마다 결과를 정한다(던지면 질의가 던진다). */
function createStub(resolve: (entry: Entry) => StubResult = () => ({ data: [], error: null })) {
  const entries: Entry[] = []

  const client: RegisterChecksClient = {
    from: (table) => ({
      select(columns, options) {
        const entry: Entry = { table, columns, options, filters: [], terminal: 'await' }
        const settle = <T>(): Promise<RegisterQueryResult<T>> => {
          entries.push(entry)
          try {
            return Promise.resolve(resolve(entry) as RegisterQueryResult<T>)
          } catch (e) {
            return Promise.reject(e)
          }
        }
        const builder: RegisterQuery = {
          eq: (column, value) => (entry.filters.push(['eq', column, value]), builder),
          is: (column, value) => (entry.filters.push(['is', column, value]), builder),
          in: (column, values) => (entry.filters.push(['in', column, values]), builder),
          contains: (column, value) => (entry.filters.push(['contains', column, value]), builder),
          limit: () => builder,
          maybeSingle: () => {
            entry.terminal = 'maybeSingle'
            return settle<RegisterRow>()
          },
          then: (onfulfilled, onrejected) => settle<RegisterRow[]>().then(onfulfilled, onrejected),
        }
        return builder
      },
    }),
  }

  return { client, entries }
}

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const statuses = (r: { checks: { status: string }[] }) => r.checks.map((c) => c.status)

/** 목록 조회는 «없음»(빈 배열), 단건 조회(maybeSingle)는 «있음»으로 답한다 — 모든 검사가 통과하는 기본 DB. */
const allPresent = (e: Entry): StubResult => (e.terminal === 'maybeSingle' ? { data: { id: 'x' } } : { data: [] })

describe('runBadgeDbChecks', () => {
  const badge = {
    name: '새 배지',
    tribe_id: ID_A,
    item_book_id: ID_B,
    condition_json: { checkin_badge_count: { count: 2, checkin_badge_names: ['가', '나'] } },
  } as Parameters<typeof runBadgeDbChecks>[0]['badge']

  it('통과: 네 검사를 이 순서로 읽고 모두 통과로 기록한다', async () => {
    const { client, entries } = createStub((e) => {
      if (e.table === 'badges' && e.filters.some((f) => f[0] === 'in')) return { data: [{ name: '가' }, { name: '나' }] }
      return allPresent(e)
    })
    const result = await runBadgeDbChecks({ supabase: client, badge })
    expect(statuses(result)).toEqual(['통과', '통과', '통과', '통과'])
    expect(result.errors).toEqual([])
    expect(entries.map((e) => e.table)).toEqual(['badges', 'tribes', 'item_books', 'badges'])
    expect(entries[0].filters).toEqual([
      ['eq', 'name', '새 배지'],
      ['is', 'deleted_at', null],
    ])
  })

  it('실패: 같은 이름의 배지가 있으면 이름 중복을 실패로 기록하고 errors에 «라벨: 사유»로 담는다', async () => {
    const { client } = createStub((e) => (e.table === 'badges' ? { data: [{ id: 'dup-id' }] } : allPresent(e)))
    const result = await runBadgeDbChecks({ supabase: client, badge: { name: '새 배지' } })
    expect(result.checks[0]).toEqual({
      label: '이름 중복',
      status: '실패',
      detail: '같은 이름의 배지가 이미 있어요(id: dup-id). 기존 배지 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.',
    })
    expect(result.errors).toEqual([`이름 중복: ${result.checks[0].detail}`])
    expect(statuses(result)).toEqual(['실패', '해당 없음', '해당 없음', '해당 없음'])
  })

  it('실패: 트라이브가 없으면 «tribe_id에 해당하는 트라이브가 없어요»', async () => {
    const { client } = createStub((e) => (e.table === 'tribes' ? { data: null } : { data: [] }))
    const result = await runBadgeDbChecks({ supabase: client, badge: { name: 'n', tribe_id: ID_A } })
    expect(result.checks[1]).toMatchObject({ label: '트라이브 존재', status: '실패', detail: `tribe_id에 해당하는 트라이브가 없어요: ${ID_A}` })
  })

  it('실패: 체크인 배지 이름 목록에 없는 이름이 있으면 어드민 API와 같은 문장으로 실패한다', async () => {
    const { client } = createStub((e) => (e.filters.some((f) => f[0] === 'in') ? { data: [{ name: '가' }] } : { data: [] }))
    const result = await runBadgeDbChecks({ supabase: client, badge: { name: 'n', condition_json: badge.condition_json } })
    expect(result.checks[3].status).toBe('실패')
    expect(result.checks[3].detail).toContain('체크인 배지 이름 목록에 존재하지 않는 이름이 있습니다 — 나.')
  })

  it('조회 오류: 응답의 error와 던져진 예외를 모두 «DB 조회에 실패했어요»로 기록한다', async () => {
    const withError = createStub((e) => (e.table === 'tribes' ? { data: null, error: { message: 'boom' } } : { data: [] }))
    const r1 = await runBadgeDbChecks({ supabase: withError.client, badge: { name: 'n', tribe_id: ID_A } })
    expect(r1.checks[1]).toMatchObject({ status: '실패', detail: 'DB 조회에 실패했어요: boom' })

    const withThrow = createStub(() => {
      throw new Error('kaboom')
    })
    const r2 = await runBadgeDbChecks({ supabase: withThrow.client, badge: { name: 'n' } })
    expect(r2.checks[0]).toMatchObject({ status: '실패', detail: 'DB 조회에 실패했어요: kaboom' })
    expect(r2.errors).toEqual(['이름 중복: DB 조회에 실패했어요: kaboom'])
  })

  it('클라이언트가 없으면 적용 대상 검사는 «건너뜀», 아니면 «해당 없음»이고 아무것도 읽지 않는다', async () => {
    const result = await runBadgeDbChecks({ supabase: null, badge: { name: 'n', tribe_id: ID_A } })
    expect(statuses(result)).toEqual(['건너뜀', '건너뜀', '해당 없음', '해당 없음'])
    expect(result.checks[0].detail).toBe('서비스 키(.env.local)가 없어 DB를 읽지 않았어요')
    expect(result.errors).toEqual([])
  })
})

describe('runMissionDbChecks', () => {
  it('통과: 보상 배지 id는 대소문자를 가리지 않고 찾는다', async () => {
    const { client, entries } = createStub((e) => {
      if (e.table === 'badges' && e.filters.some((f) => f[0] === 'in')) return { data: [{ id: ID_A.toUpperCase() }] }
      return allPresent(e)
    })
    const result = await runMissionDbChecks({ supabase: client, mission: { title: '미션', reward_badge_ids: [ID_A] } })
    expect(statuses(result)).toEqual(['통과', '통과', '해당 없음', '해당 없음'])
    expect(entries.map((e) => e.table)).toEqual(['missions', 'badges'])
  })

  it('통과: 조건 유형에 따라 조건 배지(item_collect)·조건 지점(checkin)을 읽는다', async () => {
    const collect = await runMissionDbChecks({
      supabase: createStub(allPresent).client,
      mission: { title: 'm', mission_type: 'item_collect', condition_json: { badge_id: ID_A } },
    })
    expect(statuses(collect)).toEqual(['통과', '해당 없음', '통과', '해당 없음'])
    const checkin = await runMissionDbChecks({
      supabase: createStub(allPresent).client,
      mission: { title: 'm', mission_type: 'checkin', condition_json: { poi_id: ID_B } },
    })
    expect(checkin.checks[3]).toEqual({ label: '조건 지점 존재', status: '통과', detail: '' })
  })

  it('실패: 같은 제목·없는 보상 배지·없는 조건 지점을 각각 문장으로 알려 준다', async () => {
    const dup = await runMissionDbChecks({
      supabase: createStub((e) => (e.table === 'missions' ? { data: [{ id: 'dup' }] } : { data: [] })).client,
      mission: { title: '미션' },
    })
    // 공개 시각을 넘기지 않으면 겹침을 가를 수 없어 같은 제목이 있는 것만으로 막힌다(안전 규칙).
    expect(dup.checks[0].detail).toBe('같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: dup).')

    const missingBadge = await runMissionDbChecks({
      supabase: createStub(() => ({ data: [] })).client,
      mission: { title: '미션', reward_badge_ids: [ID_A, ID_B] },
    })
    expect(missingBadge.checks[1]).toMatchObject({
      label: '보상 배지 존재',
      status: '실패',
      detail: `reward_badge_ids에 해당하는 배지가 없거나 삭제됐어요: ${ID_A}, ${ID_B}`,
    })

    const missingPoi = await runMissionDbChecks({
      supabase: createStub(() => ({ data: null })).client,
      mission: { title: '미션', mission_type: 'checkin', condition_json: { poi_id: ID_A } },
    })
    expect(missingPoi.checks[3].detail).toBe(`condition_json.poi_id에 해당하는 지점이 없어요: ${ID_A}`)
  })

  it('조회 오류: error 응답을 «DB 조회에 실패했어요»로 기록한다', async () => {
    const { client } = createStub(() => ({ data: null, error: { message: 'boom' } }))
    const result = await runMissionDbChecks({ supabase: client, mission: { title: '미션' } })
    expect(result.checks[0]).toEqual({ label: '제목 중복', status: '실패', detail: 'DB 조회에 실패했어요: boom' })
    expect(result.errors).toEqual(['제목 중복: DB 조회에 실패했어요: boom'])
  })
})

describe('미션 제목 중복 — 기간이 겹칠 때만 건다, 스크립트와 운영툴이 같은 규칙 (티켓 20261002_1944·20261002_2024)', () => {
  const T1 = '2026-10-10T00:00:00.000Z'
  const T2 = '2026-10-20T00:00:00.000Z'
  const T3 = '2026-10-30T00:00:00.000Z'
  const sameTitle = (...rows: Array<{ id: string; starts_at: string; ends_at: string | null }>) =>
    createStub((e) => (e.table === 'missions' ? { data: rows } : { data: [] }))
  const overlap = (stub: ReturnType<typeof createStub>, starts_at: string | null, ends_at: string | null) =>
    runMissionDbChecks({ supabase: stub.client, mission: { title: '미션', starts_at, ends_at } })

  describe('missionPeriodsOverlap — 기간은 [공개, 종료)', () => {
    it('한쪽의 종료 시각과 다른 쪽의 공개 시각이 같으면 겹치지 않는다(양쪽 방향)', () => {
      expect(missionPeriodsOverlap({ starts_at: T1, ends_at: T2 }, { starts_at: T2, ends_at: T3 })).toBe(false)
      expect(missionPeriodsOverlap({ starts_at: T2, ends_at: T3 }, { starts_at: T1, ends_at: T2 })).toBe(false)
    })

    it('1밀리초라도 겹치면 겹친다', () => {
      const justBefore = new Date(Date.parse(T2) - 1).toISOString()
      expect(missionPeriodsOverlap({ starts_at: T1, ends_at: T2 }, { starts_at: justBefore, ends_at: T3 })).toBe(true)
    })

    it('종료가 없으면 끝없음이다: 뒤에 시작하는 기간과 겹치고, 그 앞에서 끝나는 기간과는 겹치지 않는다', () => {
      expect(missionPeriodsOverlap({ starts_at: T2, ends_at: null }, { starts_at: T3, ends_at: null })).toBe(true)
      expect(missionPeriodsOverlap({ starts_at: T2, ends_at: null }, { starts_at: T3, ends_at: undefined })).toBe(true)
      expect(missionPeriodsOverlap({ starts_at: T2, ends_at: null }, { starts_at: T1, ends_at: T2 })).toBe(false)
      expect(missionPeriodsOverlap({ starts_at: T2, ends_at: null }, { starts_at: T1, ends_at: T3 })).toBe(true)
    })

    it('시각을 읽을 수 없으면 겹친 것으로 본다(판단할 수 없는데 통과시키지 않는다)', () => {
      expect(missionPeriodsOverlap({ starts_at: 'x', ends_at: T2 }, { starts_at: T2, ends_at: T3 })).toBe(true)
      expect(missionPeriodsOverlap({ starts_at: T1, ends_at: T2 }, { starts_at: null, ends_at: T3 })).toBe(true)
      expect(missionPeriodsOverlap({ starts_at: T1, ends_at: 'x' }, { starts_at: T2, ends_at: T3 })).toBe(true)
    })
  })

  it('같은 제목이 없으면 통과하고, 같은 제목의 기존 미션은 id·공개·종료를 모두 읽는다(건수 제한 없음)', async () => {
    const stub = sameTitle()
    const result = await overlap(stub, T1, T2)
    expect(result.checks[0]).toEqual({ label: '제목 중복', status: '통과', detail: '' })
    expect(stub.entries[0]).toMatchObject({ table: 'missions', columns: 'id, starts_at, ends_at', terminal: 'await' })
    expect(stub.entries[0].filters).toEqual([['eq', 'title', '미션']])
  })

  it('같은 제목이어도 기간이 겹치지 않으면 통과한다(뒤에서 이어 여는 미션)', async () => {
    const result = await overlap(sameTitle({ id: 'old', starts_at: T1, ends_at: T2 }), T2, T3)
    expect(result.errors).toEqual([])
    expect(statuses(result)[0]).toBe('통과')
  })

  it('기간이 겹치는 같은 제목이 있으면 막고 문장에 기존 id를 싣는다', async () => {
    const result = await overlap(sameTitle({ id: 'old', starts_at: T1, ends_at: T3 }), T2, null)
    expect(result.checks[0]).toEqual({ label: '제목 중복', status: '실패', detail: '같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: old).' })
    expect(result.errors).toEqual(['제목 중복: 같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: old).'])
  })

  it('기존 미션의 종료가 없어도 새 미션이 그 뒤에 열리면 겹친다. 새 미션이 기존 공개 시각에 끝나면 겹치지 않는다', async () => {
    const open = { id: 'open', starts_at: T2, ends_at: null }
    expect((await overlap(sameTitle(open), T3, null)).errors).toHaveLength(1)
    expect((await overlap(sameTitle(open), T1, T2)).errors).toEqual([])
    expect((await overlap(sameTitle(open), T1, T3)).errors).toHaveLength(1)
  })

  it('여러 개 중 하나라도 겹치면 막는다', async () => {
    const result = await overlap(sameTitle({ id: 'far', starts_at: T1, ends_at: T2 }, { id: 'near', starts_at: T3, ends_at: null }), T2, null)
    expect(result.errors).toEqual(['제목 중복: 같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: near).'])
  })

  it('읽은 미션의 시각을 읽을 수 없거나 새 미션의 공개 시각이 없으면 겹친 것으로 본다', async () => {
    expect((await overlap(sameTitle({ id: 'bad', starts_at: 'not-a-time', ends_at: null }), T1, T2)).errors).toHaveLength(1)
    expect((await overlap(sameTitle({ id: 'old', starts_at: T1, ends_at: T2 }), null, null)).errors).toHaveLength(1)
  })

  it('조회 오류는 «DB 조회에 실패했어요»로 기록한다', async () => {
    const result = await overlap(createStub(() => ({ data: null, error: { message: 'boom' } })), T1, T2)
    expect(result.checks[0]).toEqual({ label: '제목 중복', status: '실패', detail: 'DB 조회에 실패했어요: boom' })
  })

  it('입력에 titleDuplicate: any 같은 옛 모드 키가 섞여 와도 읽지 않고 겹침 규칙으로 가른다(묶음 JSON의 mission을 그대로 넘기는 스크립트)', async () => {
    // 모드 칸은 사라졌다. 타입에는 없으므로 JSON에서 온 값처럼 캐스팅해 넘긴다.
    const withModeKey = (extra: Record<string, unknown>) =>
      ({ title: '미션', starts_at: T2, ends_at: T3, ...extra }) as Parameters<typeof runMissionDbChecks>[0]['mission']

    const notOverlapping = sameTitle({ id: 'old', starts_at: T1, ends_at: T2 })
    const passed = await runMissionDbChecks({ supabase: notOverlapping.client, mission: withModeKey({ titleDuplicate: 'any' }) })
    expect(passed.errors).toEqual([])
    expect(passed.checks[0]).toEqual({ label: '제목 중복', status: '통과', detail: '' })
    expect(notOverlapping.entries[0].columns).toBe('id, starts_at, ends_at')

    const overlapping = sameTitle({ id: 'old', starts_at: T1, ends_at: T3 })
    const blocked = await runMissionDbChecks({ supabase: overlapping.client, mission: withModeKey({ titleDuplicate: 'any' }) })
    expect(blocked.errors).toEqual(['제목 중복: 같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: old).'])

    // 값이 'overlap'이든 알 수 없는 값이든 결과는 같다.
    for (const titleDuplicate of ['overlap', 'whatever', null]) {
      const stub = sameTitle({ id: 'old', starts_at: T1, ends_at: T2 })
      const result = await runMissionDbChecks({ supabase: stub.client, mission: withModeKey({ titleDuplicate }) })
      expect(result.errors).toEqual([])
    }
  })

  it('공개 시각을 넘기지 않아도 같은 제목이 있으면 막는다(시각을 읽을 수 없으면 겹친 것으로 본다)', async () => {
    const stub = sameTitle({ id: 'old', starts_at: T1, ends_at: T2 })
    const result = await runMissionDbChecks({ supabase: stub.client, mission: { title: '미션' } })
    expect(result.errors).toEqual(['제목 중복: 같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: old).'])
  })
})

describe('runHomeFeedDbChecks', () => {
  const payload = {
    title: '카드',
    starts_at: '2026-10-02T00:00:00.000Z',
    mission_id: ID_A,
    item_book_id: ID_B,
    badge_ids: [ID_A],
    ranking_mode_id: ID_B,
  }

  it('통과: 다섯 검사를 이 순서로 읽는다(제목·시작 일시는 둘 다 eq로 건다)', async () => {
    const { client, entries } = createStub((e) => {
      if (e.table === 'badges') return { data: [{ id: ID_A }] }
      return allPresent(e)
    })
    const result = await runHomeFeedDbChecks({ supabase: client, payload })
    expect(statuses(result)).toEqual(['통과', '통과', '통과', '통과', '통과'])
    expect(entries.map((e) => e.table)).toEqual(['today_cards', 'missions', 'item_books', 'badges', 'ranking_modes'])
    expect(entries[0].filters).toEqual([
      ['eq', 'title', '카드'],
      ['eq', 'starts_at', '2026-10-02T00:00:00.000Z'],
    ])
  })

  it('실패: 같은 제목·시작 일시와 없는 참조를 문장으로 알려 준다', async () => {
    const dup = await runHomeFeedDbChecks({
      supabase: createStub((e) => (e.table === 'today_cards' ? { data: [{ id: 'dup' }] } : allPresent(e))).client,
      payload: { title: '카드', starts_at: 's', badge_ids: [] },
    })
    expect(dup.checks[0].detail).toBe('같은 제목·같은 시작 일시의 카드가 이미 있어요(id: dup). 기존 카드 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.')

    const missing = await runHomeFeedDbChecks({
      supabase: createStub((e) => (e.table === 'today_cards' ? { data: [] } : { data: null })).client,
      payload,
    })
    expect(missing.checks.map((c) => c.detail)).toEqual([
      '',
      `mission_id에 해당하는 미션이 없어요: ${ID_A}`,
      `item_book_id에 해당하는 컬렉션이 없어요: ${ID_B}`,
      `badge_ids에 해당하는 배지가 없거나 삭제됐어요: ${ID_A}`,
      `ranking_mode_id에 해당하는 랭킹 모드가 없어요: ${ID_B}`,
    ])
    expect(missing.errors).toHaveLength(4)
  })

  it('조회 오류: 던져진 예외를 «DB 조회에 실패했어요»로 기록한다', async () => {
    const { client } = createStub(() => {
      throw new Error('kaboom')
    })
    const result = await runHomeFeedDbChecks({ supabase: client, payload: { title: '카드', starts_at: 's', badge_ids: [] } })
    expect(result.checks[0]).toMatchObject({ status: '실패', detail: 'DB 조회에 실패했어요: kaboom' })
  })
})

describe('되돌림 참조 확인', () => {
  it('배지: 외래 키는 eq, 배열 컬럼은 contains로 목록 순서대로 읽고 아무것도 없으면 빈 목록을 돌려준다', async () => {
    const { client, entries } = createStub(() => ({ count: 0, error: null }))
    expect(await findBadgeUndoReferences(client, ID_A)).toEqual([])
    expect(entries.map((e) => `${e.table}.${e.columns}`)).toEqual(BADGE_UNDO_REFERENCES.map((r) => `${r.table}.${r.column}`))
    expect(entries.every((e) => e.options?.count === 'exact' && e.options.head === true)).toBe(true)
    expect(entries.slice(0, BADGE_UNDO_REFERENCE_TABLES.length).every((e) => e.filters[0][0] === 'eq' && e.filters[0][2] === ID_A)).toBe(true)
    expect(entries.slice(BADGE_UNDO_REFERENCE_TABLES.length).map((e) => e.filters[0])).toEqual(
      BADGE_UNDO_ARRAY_REFERENCE_COLUMNS.map((r) => ['contains', r.column, [ID_A]])
    )
  })

  it('배지: 붙어 있는 곳이 있으면 건수와 영향을 담아 던진다', async () => {
    const { client } = createStub((e) => ({ count: e.table === 'user_activity_badges' ? 2 : e.columns === 'reward_badge_ids' && e.table === 'missions' ? 1 : 0, error: null }))
    await expect(findBadgeUndoReferences(client, ID_A)).rejects.toThrow(
      '이미 사용자 데이터나 다른 항목의 연결이 붙어서 되돌리지 않고 중단했어요 — user_activity_badges.badge_id 2건(삭제 차단), missions.reward_badge_ids 1건(배열에 id가 남음). 삭제 대신 어드민에서 배지를 소프트 삭제해 주세요.'
    )
  })

  it('배지: 읽지 못하면 «확인 없이 지우지 않아요» 문장으로 던지고 그 뒤 표는 읽지 않는다', async () => {
    const { client, entries } = createStub((e) => (e.table === 'inventory_items' ? { count: null, error: { message: 'boom' } } : { count: 0, error: null }))
    await expect(findBadgeUndoReferences(client, ID_A)).rejects.toThrow(
      'inventory_items.badge_id 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): boom'
    )
    expect(entries.map((e) => e.table)).toEqual(['user_activity_badges', 'inventory_items'])
  })

  it('미션: 목록 순서대로 eq로 읽고, 붙었으면 «표 건수» 문장으로 던진다', async () => {
    const clean = createStub(() => ({ count: 0, error: null }))
    expect(await findMissionUndoReferences(clean.client, ID_A)).toEqual([])
    expect(clean.entries.map((e) => `${e.table}.${e.columns}`)).toEqual(MISSION_UNDO_REFERENCE_TABLES.map((r) => `${r.table}.${r.column}`))
    expect(clean.entries.every((e) => e.filters.length === 1 && e.filters[0][0] === 'eq')).toBe(true)

    const used = createStub((e) => ({ count: e.table === 'today_cards' ? 3 : 0, error: null }))
    await expect(findMissionUndoReferences(used.client, ID_A)).rejects.toThrow(
      '이미 사용자 데이터가 붙어서 되돌리지 않고 중단했어요 — today_cards 3건. 삭제 대신 어드민에서 미션 노출을 숨김으로 바꿔 주세요.'
    )

    const failing = createStub(() => ({ error: { message: 'boom' } }))
    await expect(findMissionUndoReferences(failing.client, ID_A)).rejects.toThrow(
      'user_mission_completions 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): boom'
    )
  })

  it('홈피드: today_card_events만 읽고, 붙었으면 노출·열람 기록 문장으로 던진다', async () => {
    const clean = createStub(() => ({ count: 0, error: null }))
    expect(await findHomeFeedUndoReferences(clean.client, ID_A)).toEqual([])
    expect(clean.entries.map((e) => `${e.table}.${e.columns}`)).toEqual(HOME_FEED_UNDO_REFERENCE_TABLES.map((r) => `${r.table}.${r.column}`))

    const used = createStub(() => ({ count: 5, error: null }))
    await expect(findHomeFeedUndoReferences(used.client, ID_A)).rejects.toThrow(
      '이미 노출·열람 기록이 붙어서 되돌리지 않고 중단했어요 — today_card_events 5건. 지우면 그 기록의 card_id가 비게 돼요. 삭제 대신 어드민에서 카드를 비활성으로 바꿔 주세요.'
    )

    const failing = createStub(() => {
      throw new Error('kaboom')
    })
    await expect(findHomeFeedUndoReferences(failing.client, ID_A)).rejects.toThrow('kaboom')
  })
})

describe('runCollectionDbChecks (티켓 20261004_2039)', () => {
  const collection = { name: '[TEST] 가을 컬렉션', tribe_id: ID_A, reward_badge_id: ID_B }
  /** 이름이 같은 컬렉션은 없고(목록 빈 배열), 트라이브·활동 배지는 있는(단건) DB. */
  const clean = (e: Entry): StubResult => {
    if (e.table === 'badges') return { data: { id: ID_B, type: 'activity', deleted_at: null } }
    return allPresent(e)
  }

  it('통과: 이름 중복·트라이브·보상 배지 존재·보상 배지 종류를 이 순서로 읽고 모두 통과로 기록한다', async () => {
    const { client, entries } = createStub(clean)
    const result = await runCollectionDbChecks({ supabase: client, collection })
    expect(statuses(result)).toEqual(['통과', '통과', '통과', '통과'])
    expect(result.checks.map((c) => c.label)).toEqual(['이름 중복', '트라이브 존재', '보상 배지 존재', '보상 배지 종류'])
    expect(result.errors).toEqual([])
    // 보상 배지는 한 번만 읽는다(존재·삭제·종류를 같은 행으로 가른다).
    expect(entries.map((e) => e.table)).toEqual(['item_books', 'tribes', 'badges'])
    expect(entries[0].filters).toEqual([['eq', 'name', '[TEST] 가을 컬렉션']])
    expect(entries[2].columns).toBe('id, type, deleted_at')
  })

  it('실패: 정확히 같은 이름의 컬렉션이 있으면 이름 중복을 실패로 기록한다(소프트 삭제 개념이 없어 삭제 필터가 없다)', async () => {
    const { client } = createStub((e) => (e.table === 'item_books' ? { data: [{ id: 'dup-id' }] } : clean(e)))
    const result = await runCollectionDbChecks({ supabase: client, collection })
    expect(result.checks[0]).toEqual({ label: '이름 중복', status: '실패', detail: '같은 이름의 컬렉션이 이미 있어요(id: dup-id).' })
    expect(result.errors).toEqual([`이름 중복: ${result.checks[0].detail}`])
  })

  it('실패: 트라이브가 없으면 «tribe_id에 해당하는 트라이브가 없어요»', async () => {
    const { client } = createStub((e) => (e.table === 'tribes' ? { data: null } : clean(e)))
    const result = await runCollectionDbChecks({ supabase: client, collection })
    expect(result.checks[1]).toMatchObject({ label: '트라이브 존재', status: '실패', detail: `tribe_id에 해당하는 트라이브가 없어요: ${ID_A}` })
  })

  it('실패: 보상 배지가 없으면 존재 검사가 실패하고, 없는 배지의 종류는 보지 않는다', async () => {
    const { client } = createStub((e) => (e.table === 'badges' ? { data: null } : clean(e)))
    const result = await runCollectionDbChecks({ supabase: client, collection })
    expect(result.checks[2]).toMatchObject({ label: '보상 배지 존재', status: '실패', detail: `reward_badge_id에 해당하는 배지가 없어요: ${ID_B}` })
    expect(result.checks[3].status).toBe('해당 없음')
  })

  it('실패: 소프트 삭제된 보상 배지는 삭제됐다고 실패하고, 종류는 보지 않는다', async () => {
    const { client } = createStub((e) => (e.table === 'badges' ? { data: { id: ID_B, type: 'activity', deleted_at: '2026-09-01T00:00:00.000Z' } } : clean(e)))
    const result = await runCollectionDbChecks({ supabase: client, collection })
    expect(result.checks[2]).toMatchObject({ status: '실패', detail: `reward_badge_id의 배지가 삭제됐어요: ${ID_B}` })
    expect(result.checks[3].status).toBe('해당 없음')
  })

  it('실패: 보상 배지가 활동 배지가 아니면 종류 검사가 실패한다', async () => {
    const { client } = createStub((e) => (e.table === 'badges' ? { data: { id: ID_B, type: 'item', deleted_at: null } } : clean(e)))
    const result = await runCollectionDbChecks({ supabase: client, collection })
    expect(statuses(result)).toEqual(['통과', '통과', '통과', '실패'])
    expect(result.checks[3]).toMatchObject({ label: '보상 배지 종류' })
    expect(result.checks[3].detail).toContain('활동 배지')
    expect(result.checks[3].detail).toContain('받은 종류: item')
  })

  it('보상 배지·트라이브가 없으면(연결로 채우는 배지는 호출부가 비운다) 이름 중복만 읽고 나머지는 해당 없음이다', async () => {
    const { client, entries } = createStub(clean)
    const result = await runCollectionDbChecks({ supabase: client, collection: { name: '새 컬렉션', tribe_id: null, reward_badge_id: null } })
    expect(statuses(result)).toEqual(['통과', '해당 없음', '해당 없음', '해당 없음'])
    expect(entries.map((e) => e.table)).toEqual(['item_books'])
  })

  it('조회 오류: 응답의 error와 던져진 예외를 모두 «DB 조회에 실패했어요»로 기록한다. 읽지 못한 배지의 종류는 해당 없음이다', async () => {
    const withError = createStub((e) => (e.table === 'badges' ? { data: null, error: { message: 'boom' } } : clean(e)))
    const r1 = await runCollectionDbChecks({ supabase: withError.client, collection })
    expect(r1.checks[2]).toMatchObject({ status: '실패', detail: 'DB 조회에 실패했어요: boom' })
    expect(r1.checks[3].status).toBe('해당 없음')

    const withThrow = createStub(() => {
      throw new Error('kaboom')
    })
    const r2 = await runCollectionDbChecks({ supabase: withThrow.client, collection: { name: 'n' } })
    expect(r2.checks[0]).toMatchObject({ status: '실패', detail: 'DB 조회에 실패했어요: kaboom' })
    expect(r2.errors).toEqual(['이름 중복: DB 조회에 실패했어요: kaboom'])
  })

  it('클라이언트가 없으면 적용 대상 검사는 «건너뜀», 아니면 «해당 없음»이고 아무것도 읽지 않는다', async () => {
    const result = await runCollectionDbChecks({ supabase: null, collection })
    expect(statuses(result)).toEqual(['건너뜀', '건너뜀', '건너뜀', '해당 없음'])
    expect(result.errors).toEqual([])
  })
})

describe('컬렉션 되돌림 참조 확인 (티켓 20261004_2039 가정 7)', () => {
  it('item_books를 가리키는 외래 키 6곳과 같다(생성 타입 대조)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'types', 'database.generated.ts'), 'utf8')
    const found: string[] = []
    const starts = [...source.matchAll(/^ {6}(\w+): \{\n {8}Row: \{/gm)].map((m) => ({ name: m[1], index: m.index }))
    starts.forEach((start, i) => {
      const block = source.slice(start.index, starts[i + 1]?.index ?? source.length)
      for (const fk of block.matchAll(/columns: \["(\w+)"\]\n\s+isOneToOne: \w+\n\s+referencedRelation: "item_books"/g)) found.push(`${start.name}.${fk[1]}`)
    })
    const declared = ITEM_BOOK_UNDO_REFERENCE_TABLES.map((r) => `${r.table}.${r.column}`)
    expect(declared.sort()).toEqual(found.sort())
    expect(found).toHaveLength(6)
  })

  it('외래 키는 eq, 배열 칸은 contains로 목록 순서대로 읽고, 드랍 예약은 끝나지 않은 상태(scheduled·running)만 센다', async () => {
    const { client, entries } = createStub(() => ({ count: 0, error: null }))
    expect(await findItemBookUndoReferences(client, ID_A)).toEqual([])
    expect(entries.map((e) => `${e.table}.${e.columns}`)).toEqual(ITEM_BOOK_UNDO_REFERENCES.map((r) => `${r.table}.${r.column}`))
    expect(entries.every((e) => e.options?.count === 'exact' && e.options.head === true)).toBe(true)

    const fkCount = ITEM_BOOK_UNDO_REFERENCE_TABLES.length
    expect(entries.slice(0, fkCount).every((e) => e.filters.length === 1 && e.filters[0][0] === 'eq' && e.filters[0][2] === ID_A)).toBe(true)
    expect(entries.slice(fkCount).map((e) => e.filters[0])).toEqual(ITEM_BOOK_UNDO_ARRAY_REFERENCE_COLUMNS.map((r) => ['contains', r.column, [ID_A]]))
    // 설정 표는 상태가 없다. 예약 표만 상태 조건이 붙는다.
    expect(entries.find((e) => e.table === 'ambient_drop_config')?.filters).toHaveLength(1)
    expect(entries.find((e) => e.table === 'ambient_drop_schedules')?.filters[1]).toEqual(['in', 'status', ['scheduled', 'running']])
    expect(AMBIENT_SCHEDULE_UNFINISHED_STATUSES).toEqual(['scheduled', 'running'])
  })

  it('아이템 배지(소프트 삭제 포함)·카드·유저 기록·포인트·드랍 상태·드랍 배열 칸이 모두 확인 대상이다', () => {
    expect(ITEM_BOOK_UNDO_REFERENCES.map((r) => `${r.table}.${r.column}`)).toEqual([
      'badges.item_book_id',
      'today_cards.item_book_id',
      'user_item_book_slots.item_book_id',
      'user_item_book_completions.item_book_id',
      'user_drop_state.last_drop_book_id',
      'point_transactions.source_item_book_id',
      'ambient_drop_config.collection_ids',
      'ambient_drop_schedules.collection_ids',
    ])
  })

  it('붙어 있는 곳이 있으면 건수와 영향을 담아 던진다', async () => {
    const { client } = createStub((e) => ({ count: e.table === 'badges' ? 2 : e.table === 'ambient_drop_schedules' ? 1 : 0, error: null }))
    await expect(findItemBookUndoReferences(client, ID_A)).rejects.toThrow(
      '이미 아이템 배지나 유저 기록·연결이 붙어서 되돌리지 않고 중단했어요 — badges.item_book_id 2건(연결 해제), ambient_drop_schedules.collection_ids 1건(배열에 id가 남음). 삭제 대신 어드민에서 컬렉션을 비활성으로 바꿔 주세요.'
    )
  })

  it('읽지 못하면 «확인 없이 지우지 않아요» 문장으로 던지고 그 뒤 표는 읽지 않는다. 예약 표의 오류도 같다', async () => {
    const { client, entries } = createStub((e) => (e.table === 'user_item_book_slots' ? { count: null, error: { message: 'boom' } } : { count: 0, error: null }))
    await expect(findItemBookUndoReferences(client, ID_A)).rejects.toThrow('user_item_book_slots.item_book_id 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): boom')
    expect(entries.map((e) => e.table)).toEqual(['badges', 'today_cards', 'user_item_book_slots'])

    const lastFails = createStub((e) => (e.table === 'ambient_drop_schedules' ? { count: null, error: { message: 'boom' } } : { count: 0, error: null }))
    await expect(findItemBookUndoReferences(lastFails.client, ID_A)).rejects.toThrow('ambient_drop_schedules.collection_ids 참조를 확인하지 못해서 중단했어요')
  })
})

describe('findUnlaunchedCollectionBadges — 레시피 공개 시각에 열리지 않은 컬렉션의 배지 (티켓 20261002_2221)', () => {
  const AT = '2026-10-10T00:00:00.000Z'
  const BADGE_1 = '10000000-0000-4000-8000-000000000001'
  const BADGE_2 = '10000000-0000-4000-8000-000000000002'
  const BADGE_3 = '10000000-0000-4000-8000-000000000003'
  const BOOK_1 = '20000000-0000-4000-8000-000000000001'
  const BOOK_2 = '20000000-0000-4000-8000-000000000002'
  const book = (id: string, over: Record<string, unknown> = {}) => ({ id, is_active: true, valid_from: null, valid_until: null, ...over })
  /** 배지 표와 컬렉션 표를 고정해 답하는 스텁. */
  const stubOf = (badges: RegisterRow[], books: RegisterRow[]) =>
    createStub((e) => ({ data: e.table === 'badges' ? badges : e.table === 'item_books' ? books : [] }))

  it('열린 컬렉션(활성이고 공개 시각이 레시피보다 이르다)의 배지는 통과한다. 배지와 컬렉션을 이 순서로 읽는다', async () => {
    const { client, entries } = stubOf(
      [
        { id: BADGE_1, item_book_id: BOOK_1 },
        { id: BADGE_2, item_book_id: BOOK_2 },
      ],
      [book(BOOK_1, { valid_from: '2026-10-09T00:00:00.000Z' }), book(BOOK_2)]
    )
    expect(await findUnlaunchedCollectionBadges(client, [BADGE_1, BADGE_2], AT)).toEqual([])

    expect(entries.map((e) => e.table)).toEqual(['badges', 'item_books'])
    expect(entries[0].columns).toBe('id, item_book_id')
    expect(entries[0].filters).toEqual([
      ['in', 'id', [BADGE_1, BADGE_2]],
      ['is', 'deleted_at', null],
    ])
    expect(entries[1].filters).toEqual([['in', 'id', [BOOK_1, BOOK_2]]])
  })

  it('컬렉션의 공개 시각이 레시피보다 늦으면 그 배지를 돌려준다', async () => {
    const { client } = stubOf([{ id: BADGE_1, item_book_id: BOOK_1 }], [book(BOOK_1, { valid_from: '2026-10-10T00:00:01.000Z' })])
    expect(await findUnlaunchedCollectionBadges(client, [BADGE_1], AT)).toEqual([{ badgeId: BADGE_1, itemBookId: BOOK_1 }])
  })

  it('컬렉션의 공개 시각이 레시피와 같은 시각이면 통과한다(경계 포함). 시간대 표기가 달라도 시각으로 견준다', async () => {
    const same = stubOf([{ id: BADGE_1, item_book_id: BOOK_1 }], [book(BOOK_1, { valid_from: AT })])
    expect(await findUnlaunchedCollectionBadges(same.client, [BADGE_1], AT)).toEqual([])

    const offset = stubOf([{ id: BADGE_1, item_book_id: BOOK_1 }], [book(BOOK_1, { valid_from: '2026-10-10T09:00:00+09:00' })])
    expect(await findUnlaunchedCollectionBadges(offset.client, [BADGE_1], AT)).toEqual([])
  })

  it('비활성 컬렉션은 공개 시각과 상관없이 열리지 않은 것이다', async () => {
    const { client } = stubOf([{ id: BADGE_1, item_book_id: BOOK_1 }], [book(BOOK_1, { is_active: false, valid_from: '2026-10-01T00:00:00.000Z' })])
    expect(await findUnlaunchedCollectionBadges(client, [BADGE_1], AT)).toEqual([{ badgeId: BADGE_1, itemBookId: BOOK_1 }])
  })

  it('컬렉션 종료 시각은 보지 않는다(이미 끝난 컬렉션도 공개된 적이 있어 열린 것으로 본다)', async () => {
    const { client } = stubOf([{ id: BADGE_1, item_book_id: BOOK_1 }], [book(BOOK_1, { valid_until: '2026-10-01T00:00:00.000Z' })])
    expect(await findUnlaunchedCollectionBadges(client, [BADGE_1], AT)).toEqual([])
  })

  it('컬렉션이 없는 배지는 무시하고, 모두 그렇다면 컬렉션 표를 읽지 않는다', async () => {
    const { client, entries } = stubOf(
      [
        { id: BADGE_1, item_book_id: null },
        { id: BADGE_2, item_book_id: '' },
      ],
      []
    )
    expect(await findUnlaunchedCollectionBadges(client, [BADGE_1, BADGE_2], AT)).toEqual([])
    expect(entries.map((e) => e.table)).toEqual(['badges'])
  })

  it('열린 배지와 안 열린 배지가 섞이면 안 열린 배지만 돌려주고, 같은 컬렉션은 한 번만 읽는다', async () => {
    const { client, entries } = stubOf(
      [
        { id: BADGE_1, item_book_id: BOOK_1 },
        { id: BADGE_2, item_book_id: BOOK_1 },
        { id: BADGE_3, item_book_id: BOOK_2 },
      ],
      [book(BOOK_1, { valid_from: '2026-10-20T00:00:00.000Z' }), book(BOOK_2)]
    )
    expect(await findUnlaunchedCollectionBadges(client, [BADGE_1, BADGE_2, BADGE_3], AT)).toEqual([
      { badgeId: BADGE_1, itemBookId: BOOK_1 },
      { badgeId: BADGE_2, itemBookId: BOOK_1 },
    ])
    expect(entries[1].filters).toEqual([['in', 'id', [BOOK_1, BOOK_2]]])
  })

  it('배지가 가리키는 컬렉션 행이 없으면 열리지 않은 것으로 본다(판단할 수 없는데 통과시키지 않는다)', async () => {
    const { client } = stubOf([{ id: BADGE_1, item_book_id: BOOK_1 }], [])
    expect(await findUnlaunchedCollectionBadges(client, [BADGE_1], AT)).toEqual([{ badgeId: BADGE_1, itemBookId: BOOK_1 }])
  })

  it('같은 배지 ID는 한 번만 읽고, 목록이 비면 아무것도 읽지 않는다', async () => {
    const dup = stubOf([], [])
    await findUnlaunchedCollectionBadges(dup.client, [BADGE_1, BADGE_1], AT)
    expect(dup.entries[0].filters).toEqual([
      ['in', 'id', [BADGE_1]],
      ['is', 'deleted_at', null],
    ])

    const empty = stubOf([], [])
    expect(await findUnlaunchedCollectionBadges(empty.client, [], AT)).toEqual([])
    expect(empty.entries).toEqual([])
  })

  it('배지가 많으면 80개씩 나눠 읽는다', async () => {
    const ids = Array.from({ length: 170 }, (_, i) => `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const { client, entries } = stubOf([], [])
    await findUnlaunchedCollectionBadges(client, ids, AT)
    expect(entries.map((e) => (e.filters[0][2] as string[]).length)).toEqual([80, 80, 10])
  })

  it('배지를 읽지 못하면 확인 없이 통과시키지 않고 던진다', async () => {
    const { client } = createStub(() => ({ error: { message: 'badges boom' } }))
    await expect(findUnlaunchedCollectionBadges(client, [BADGE_1], AT)).rejects.toThrow('DB 조회에 실패했어요: badges boom')
  })

  it('컬렉션을 읽지 못해도 던진다', async () => {
    const { client } = createStub((e) => (e.table === 'badges' ? { data: [{ id: BADGE_1, item_book_id: BOOK_1 }] } : { error: { message: 'books boom' } }))
    await expect(findUnlaunchedCollectionBadges(client, [BADGE_1], AT)).rejects.toThrow('DB 조회에 실패했어요: books boom')
  })
})

describe('registerChecks 계약 — 서버에서 가져올 수 있어야 한다', () => {
  const dir = path.join(__dirname, '..')
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.ts'))
  const NODE_BUILTINS = ['fs', 'path', 'os', 'child_process', 'crypto', 'url', 'util', 'stream', 'process']

  it('모듈 열 개가 있다', () => {
    expect(files.sort()).toEqual([
      'badge.ts',
      'bundleRules.ts',
      'collection.ts',
      'homeFeed.ts',
      'homeFeedFields.ts',
      'mission.ts',
      'missionFields.ts',
      'recipe.ts',
      'references.ts',
      'shared.ts',
    ])
  })

  it.each(files)('%s는 node: 모듈·내장 모듈과 scripts/ 아래 파일을 가져오지 않는다', (name) => {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    const specifiers = [...source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])
    for (const specifier of specifiers) {
      expect(specifier.startsWith('node:'), `${name}: ${specifier}`).toBe(false)
      expect(NODE_BUILTINS.includes(specifier), `${name}: ${specifier}`).toBe(false)
      expect(/(^|\/)scripts\//.test(specifier), `${name}: ${specifier}`).toBe(false)
    }
  })
})
