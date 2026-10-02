/**
 * 등록 전 DB 검사·되돌림 참조 확인(티켓 20261002_0827) — 세 DB 검사와 세 참조 확인을 최소 스텁으로 직접 부른다.
 * 스크립트 쪽 동작은 `scripts/asset-generator/__tests__/register*Flow.test.ts`가 같은 함수를 flow 래퍼로 시험한다.
 * 여기서는 서버가 가져다 쓸 TS 모듈 자체의 통과·실패·조회 오류와, 이 폴더가 `node:`·`scripts/`에 의존하지 않는 계약을 본다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runBadgeDbChecks } from '../badge'
import { runHomeFeedDbChecks } from '../homeFeed'
import { runMissionDbChecks } from '../mission'
import {
  BADGE_UNDO_ARRAY_REFERENCE_COLUMNS,
  BADGE_UNDO_REFERENCES,
  BADGE_UNDO_REFERENCE_TABLES,
  HOME_FEED_UNDO_REFERENCE_TABLES,
  MISSION_UNDO_REFERENCE_TABLES,
  findBadgeUndoReferences,
  findHomeFeedUndoReferences,
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
    expect(dup.checks[0].detail).toBe('같은 제목의 미션이 이미 있어요(id: dup). 기존 미션 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.')

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

describe('registerChecks 계약 — 서버에서 가져올 수 있어야 한다', () => {
  const dir = path.join(__dirname, '..')
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.ts'))
  const NODE_BUILTINS = ['fs', 'path', 'os', 'child_process', 'crypto', 'url', 'util', 'stream', 'process']

  it('모듈 여덟 개가 있다', () => {
    expect(files.sort()).toEqual(['badge.ts', 'bundleRules.ts', 'homeFeed.ts', 'homeFeedFields.ts', 'mission.ts', 'missionFields.ts', 'references.ts', 'shared.ts'])
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
