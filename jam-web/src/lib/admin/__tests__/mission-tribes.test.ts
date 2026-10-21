/**
 * 어드민 미션 «참가할 수 있는 트라이브» 저장 규칙 (티켓 20261019_1318 1회)
 * 입력 검증·접근을 줄이는 변경 판정·저장 순서를 고정한다. DB는 메모리 스텁이다.
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/mission-tribes.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  findMissingTribeIds,
  hasParticipationOrCompletion,
  narrowsTribeAccess,
  parseMissionTribeSelection,
  planTribeChange,
  readAllowedTribeIds,
  replaceAllowedTribes,
  TRIBE_IDS_INVALID_MESSAGE,
  TRIBE_REQUIRED_MESSAGE,
  TRIBE_SCOPE_INVALID_MESSAGE,
} from '../mission-tribes'

type Row = Record<string, unknown>
type Filter = ['eq' | 'in', string, unknown]

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const MISSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

interface Stub {
  client: Parameters<typeof findMissingTribeIds>[0]
  tables: Record<string, Row[]>
  /** 호출 순서: `표.동작` */
  calls: string[]
  /** 이 표·동작이면 오류를 돌려준다(예: `mission_allowed_tribes.insert`) */
  failOn: Set<string>
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([kind, col, val]) => (kind === 'eq' ? row[col] === val : (val as unknown[]).includes(row[col])))
}

function createStub(tables: Record<string, Row[]> = {}): Stub {
  const stub: Stub = { client: null as never, tables, calls: [], failOn: new Set() }
  const run = (table: string, op: string, filters: Filter[], payload?: Row[], head?: boolean) => {
    stub.calls.push(`${table}.${op}`)
    if (stub.failOn.has(`${table}.${op}`)) return { data: null, count: null, error: { message: `${table}.${op} 실패` } }
    const rows = (stub.tables[table] ??= [])
    if (op === 'insert') {
      rows.push(...(payload ?? []))
      return { data: null, count: null, error: null }
    }
    if (op === 'delete') {
      stub.tables[table] = rows.filter((row) => !matches(row, filters))
      return { data: null, count: null, error: null }
    }
    const found = rows.filter((row) => matches(row, filters))
    return { data: head ? null : found, count: found.length, error: null }
  }
  const chain = (table: string, op: string, payload?: Row[], head?: boolean) => {
    const filters: Filter[] = []
    const api = {
      eq(col: string, val: unknown) {
        filters.push(['eq', col, val])
        return api
      },
      in(col: string, vals: unknown[]) {
        filters.push(['in', col, vals])
        return api
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run(table, op, filters, payload, head)).then(resolve, reject)
      },
    }
    return api
  }
  stub.client = {
    from: (table: string) => ({
      select: (_cols: string, opts?: { head?: boolean }) => chain(table, 'select', undefined, opts?.head),
      insert: (payload: Row[]) => chain(table, 'insert', payload),
      delete: () => chain(table, 'delete'),
    }),
  } as unknown as Stub['client']
  return stub
}

describe('parseMissionTribeSelection — 본문 검증', () => {
  it('scope가 없으면 건드리지 않는다(selection null)', () => {
    expect(parseMissionTribeSelection({ title: 'x' })).toEqual({ ok: true, selection: null })
    // 목록만 오고 scope가 없어도 건드리지 않는다
    expect(parseMissionTribeSelection({ allowed_tribe_ids: [A] })).toEqual({ ok: true, selection: null })
  })

  it('scope가 common/tribe가 아니면 거절한다', () => {
    for (const scope of ['all', '', null, 1, ['common']]) {
      expect(parseMissionTribeSelection({ scope })).toEqual({ ok: false, error: TRIBE_SCOPE_INVALID_MESSAGE })
    }
  })

  it('common은 같이 온 목록을 무시하고 빈 목록으로 지운다', () => {
    expect(parseMissionTribeSelection({ scope: 'common', allowed_tribe_ids: [A, B] })).toEqual({
      ok: true,
      selection: { scope: 'common', tribeIds: [] },
    })
    expect(parseMissionTribeSelection({ scope: 'common' })).toEqual({ ok: true, selection: { scope: 'common', tribeIds: [] } })
  })

  it('tribe는 UUID 배열이어야 하고 중복은 없앤다(순서는 처음 나온 순서)', () => {
    expect(parseMissionTribeSelection({ scope: 'tribe', allowed_tribe_ids: [B, A, B] })).toEqual({
      ok: true,
      selection: { scope: 'tribe', tribeIds: [B, A] },
    })
  })

  it('tribe인데 목록이 없거나 비어 있으면 거절한다', () => {
    for (const body of [{ scope: 'tribe' }, { scope: 'tribe', allowed_tribe_ids: null }, { scope: 'tribe', allowed_tribe_ids: [] }]) {
      expect(parseMissionTribeSelection(body)).toEqual({ ok: false, error: TRIBE_REQUIRED_MESSAGE })
    }
  })

  it('tribe의 목록이 배열이 아니거나 UUID가 아닌 값이 있으면 거절한다', () => {
    for (const ids of ['a', { 0: A }, [A, 'not-a-uuid'], [A, 3], [A, null]]) {
      expect(parseMissionTribeSelection({ scope: 'tribe', allowed_tribe_ids: ids })).toEqual({
        ok: false,
        error: TRIBE_IDS_INVALID_MESSAGE,
      })
    }
  })
})

describe('narrowsTribeAccess — 접근을 줄이는 변경', () => {
  const tribe = (...ids: string[]) => ({ scope: 'tribe' as const, tribeIds: ids })
  const common = { scope: 'common' as const, tribeIds: [] }

  it('공통 → 트라이브 제한은 줄이는 변경이다', () => {
    expect(narrowsTribeAccess([], tribe(A))).toBe(true)
  })

  it('허용 트라이브를 빼거나 바꿔치기하면 줄이는 변경이다', () => {
    expect(narrowsTribeAccess([A, B], tribe(A))).toBe(true)
    expect(narrowsTribeAccess([A], tribe(B))).toBe(true)
    expect(narrowsTribeAccess([A, B], tribe(A, C))).toBe(true)
  })

  it('트라이브를 더하기만 하거나 그대로 두면 줄이는 변경이 아니다', () => {
    expect(narrowsTribeAccess([A], tribe(A, B))).toBe(false)
    expect(narrowsTribeAccess([A, B], tribe(B, A))).toBe(false)
  })

  it('공통으로 바꾸는 것은 넓히는 변경이다', () => {
    expect(narrowsTribeAccess([A, B], common)).toBe(false)
    expect(narrowsTribeAccess([], common)).toBe(false)
  })
})

describe('읽기 함수', () => {
  it('findMissingTribeIds는 tribes에 없는 id만 돌려준다', async () => {
    const stub = createStub({ tribes: [{ id: A }, { id: B }] })
    expect(await findMissingTribeIds(stub.client, [A, C])).toEqual([C])
    expect(await findMissingTribeIds(stub.client, [A, B])).toEqual([])
  })

  it('findMissingTribeIds는 빈 목록이면 DB를 읽지 않는다', async () => {
    const stub = createStub()
    expect(await findMissingTribeIds(stub.client, [])).toEqual([])
    expect(stub.calls).toEqual([])
  })

  it('readAllowedTribeIds는 그 미션의 행만 읽는다', async () => {
    const stub = createStub({
      mission_allowed_tribes: [
        { mission_id: MISSION, tribe_id: A },
        { mission_id: 'other', tribe_id: B },
      ],
    })
    expect(await readAllowedTribeIds(stub.client, MISSION)).toEqual([A])
  })

  it('읽지 못하면 던진다', async () => {
    const stub = createStub()
    stub.failOn.add('mission_allowed_tribes.select')
    await expect(readAllowedTribeIds(stub.client, MISSION)).rejects.toThrow('mission_allowed_tribes 조회 실패')
    stub.failOn.clear()
    stub.failOn.add('tribes.select')
    await expect(findMissingTribeIds(stub.client, [A])).rejects.toThrow('tribes 조회 실패')
  })
})

describe('hasParticipationOrCompletion — 참가·완료 기록', () => {
  it('참가도 완료도 없으면 false', async () => {
    const stub = createStub()
    expect(await hasParticipationOrCompletion(stub.client, MISSION)).toBe(false)
  })

  it('참가만 있어도 true이고 완료 표는 읽지 않는다', async () => {
    const stub = createStub({ user_mission_participations: [{ mission_id: MISSION }] })
    expect(await hasParticipationOrCompletion(stub.client, MISSION)).toBe(true)
    expect(stub.calls).toEqual(['user_mission_participations.select'])
  })

  it('완료만 있어도 true이고, 다른 미션의 기록은 세지 않는다', async () => {
    const stub = createStub({
      user_mission_participations: [{ mission_id: 'other' }],
      user_mission_completions: [{ mission_id: MISSION }],
    })
    expect(await hasParticipationOrCompletion(stub.client, MISSION)).toBe(true)
  })

  it('읽지 못하면 던진다(기록이 없다고 보고 줄이지 않는다)', async () => {
    const stub = createStub()
    stub.failOn.add('user_mission_completions.select')
    await expect(hasParticipationOrCompletion(stub.client, MISSION)).rejects.toThrow('user_mission_completions 조회 실패')
  })
})

describe('planTribeChange — 저장 전 계획', () => {
  it('줄이는 변경이 아니면 기록을 읽지 않고 통과한다', async () => {
    const stub = createStub({ mission_allowed_tribes: [{ mission_id: MISSION, tribe_id: A }] })
    const plan = await planTribeChange(stub.client, MISSION, { scope: 'tribe', tribeIds: [A, B] })
    expect(plan).toEqual({ before: [A], blocked: false })
    expect(stub.calls).toEqual(['mission_allowed_tribes.select'])
  })

  it('줄이는 변경이어도 참가·완료 기록이 없으면 통과한다', async () => {
    const stub = createStub()
    const plan = await planTribeChange(stub.client, MISSION, { scope: 'tribe', tribeIds: [A] })
    expect(plan).toEqual({ before: [], blocked: false })
  })

  it('줄이는 변경이고 기록이 있으면 막는다', async () => {
    const stub = createStub({ user_mission_completions: [{ mission_id: MISSION }] })
    const plan = await planTribeChange(stub.client, MISSION, { scope: 'tribe', tribeIds: [A] })
    expect(plan.blocked).toBe(true)
  })

  it('기록이 있어도 공통으로 넓히는 변경은 막지 않는다', async () => {
    const stub = createStub({
      mission_allowed_tribes: [{ mission_id: MISSION, tribe_id: A }],
      user_mission_participations: [{ mission_id: MISSION }],
    })
    const plan = await planTribeChange(stub.client, MISSION, { scope: 'common', tribeIds: [] })
    expect(plan).toEqual({ before: [A], blocked: false })
  })
})

describe('replaceAllowedTribes — 저장 순서', () => {
  it('없는 것을 먼저 넣고 남는 것을 나중에 지운다(바꿔치기 중 목록이 비지 않는다)', async () => {
    const stub = createStub({
      mission_allowed_tribes: [
        { mission_id: MISSION, tribe_id: A },
        { mission_id: 'other', tribe_id: A },
      ],
    })
    await replaceAllowedTribes(stub.client, MISSION, [B, C], [A])
    expect(stub.calls).toEqual(['mission_allowed_tribes.insert', 'mission_allowed_tribes.delete'])
    const mine = stub.tables.mission_allowed_tribes.filter((r) => r.mission_id === MISSION).map((r) => r.tribe_id)
    expect(mine.sort()).toEqual([B, C].sort())
    // 다른 미션의 행은 건드리지 않는다
    expect(stub.tables.mission_allowed_tribes.filter((r) => r.mission_id === 'other')).toHaveLength(1)
  })

  it('공통으로 바꾸면 모두 지우고, 새 미션은 넣기만 한다', async () => {
    const stub = createStub({ mission_allowed_tribes: [{ mission_id: MISSION, tribe_id: A }] })
    await replaceAllowedTribes(stub.client, MISSION, [], [A])
    expect(stub.tables.mission_allowed_tribes).toEqual([])

    const fresh = createStub()
    await replaceAllowedTribes(fresh.client, MISSION, [A, B], [])
    expect(fresh.calls).toEqual(['mission_allowed_tribes.insert'])
  })

  it('이미 같으면 아무것도 쓰지 않는다', async () => {
    const stub = createStub({ mission_allowed_tribes: [{ mission_id: MISSION, tribe_id: A }] })
    await replaceAllowedTribes(stub.client, MISSION, [A], [A])
    expect(stub.calls).toEqual([])
  })

  it('before를 넘기지 않으면 지금 목록을 읽어서 맞춘다', async () => {
    const stub = createStub({ mission_allowed_tribes: [{ mission_id: MISSION, tribe_id: A }] })
    await replaceAllowedTribes(stub.client, MISSION, [A, B])
    expect(stub.calls).toEqual(['mission_allowed_tribes.select', 'mission_allowed_tribes.insert'])
  })

  it('넣기가 실패하면 던지고 기존 목록은 그대로이며 지우기는 시도하지 않는다', async () => {
    const stub = createStub({ mission_allowed_tribes: [{ mission_id: MISSION, tribe_id: A }] })
    stub.failOn.add('mission_allowed_tribes.insert')
    await expect(replaceAllowedTribes(stub.client, MISSION, [B], [A])).rejects.toThrow('추가 실패')
    expect(stub.calls).toEqual(['mission_allowed_tribes.insert'])
    expect(stub.tables.mission_allowed_tribes).toEqual([{ mission_id: MISSION, tribe_id: A }])
  })

  it('지우기가 실패하면 던진다(목록은 요청보다 넓은 채로 남고 비지 않는다)', async () => {
    const stub = createStub({ mission_allowed_tribes: [{ mission_id: MISSION, tribe_id: A }] })
    stub.failOn.add('mission_allowed_tribes.delete')
    await expect(replaceAllowedTribes(stub.client, MISSION, [B], [A])).rejects.toThrow('삭제 실패')
    expect(stub.tables.mission_allowed_tribes.map((r) => r.tribe_id).sort()).toEqual([A, B].sort())
  })
})
