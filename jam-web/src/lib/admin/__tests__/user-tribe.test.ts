/**
 * 어드민의 유저 트라이브 변경 (티켓 20261021_1247 2회)
 *
 * 고정하는 것
 *  - 사유: 고정 목록 4종, «기타»는 메모 필수, 메모 길이 상한, 메모 앞뒤 공백 제거.
 *  - changeUserTribe: DB 함수(RPC)를 올바른 인자로 부르고, 거절 코드를 정리하고, 성공하면 소식 한 건(+ 취소된 미션이 있으면 취소 소식 한 건)을 보낸다.
 *    소식은 던지지 않고, 실패해도 변경 결과는 유지된다. RPC 오류·해석할 수 없는 응답은 던진다.
 *  - previewTribeChange: 취소 함수와 같은 기준으로 취소될 미션을 읽기만 한다.
 *  - fetchTribeChangeHistory: 최신순 이력에 트라이브 이름·사유 라벨·어드민 이메일을 붙인다. 읽지 못하면 던진다.
 *
 * DB 함수 자체(원자성·행 잠금·거절 코드·트리거)는 시험으로 고정할 수 없다 — 마이그레이션 259·260 파일의 롤백 실측으로 확인한다.
 * DB는 메모리 스텁이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-tribe.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createNotificationMock = vi.hoisted(() => vi.fn(async (): Promise<unknown> => null))
vi.mock('@/lib/notifications', () => ({ createNotification: createNotificationMock }))

import {
  TRIBE_CHANGE_MEMO_MAX_LENGTH,
  TRIBE_CHANGE_REASONS,
  changeUserTribe,
  fetchTribeChangeHistory,
  isTribeChangeReasonCode,
  parseChangeResult,
  parseTribeChangeInput,
  previewTribeChange,
  tribeChangeReasonLabel,
} from '../user-tribe'

type Row = Record<string, unknown>

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const FROM = '11111111-1111-4111-8111-111111111111'
const TO = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const CHANGE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// ─────────────────────────────────────────────────────────────────────────────
// 스텁
// ─────────────────────────────────────────────────────────────────────────────

interface RpcCall {
  fn: string
  args: Record<string, unknown>
}

/**
 * `rpc`와 `from(table).select().eq()/in()/order()/range()/limit()` 체인만 흉내 내는 스텁.
 * `tables`는 표 이름 → 행, `failTables`에 든 표는 오류를 돌려준다. `rpcResult`가 RPC 응답을 정한다.
 */
function createStub(opts: {
  tables?: Record<string, Row[]>
  failTables?: string[]
  rpcResult?: { data: unknown; error: { message: string } | null }
}) {
  const rpcCalls: RpcCall[] = []
  const reads: string[] = []
  const tables = opts.tables ?? {}
  const failTables = new Set(opts.failTables ?? [])

  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return opts.rpcResult ?? { data: null, error: null }
    },
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      const orders: Array<{ col: string; asc: boolean }> = []
      let rangeArgs: [number, number] | null = null
      let limitArg: number | null = null
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), builder),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), builder),
        order: (col: string, o?: { ascending?: boolean }) => (orders.push({ col, asc: o?.ascending !== false }), builder),
        range: (a: number, b: number) => ((rangeArgs = [a, b]), builder),
        limit: (n: number) => ((limitArg = n), builder),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          reads.push(table)
          if (failTables.has(table)) {
            return Promise.resolve({ data: null, error: { message: `${table} 실패` } }).then(resolve, reject)
          }
          let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
          for (const { col, asc } of [...orders].reverse()) {
            rows = [...rows].sort((x, y) => {
              const a = String(x[col])
              const b = String(y[col])
              return (a < b ? -1 : a > b ? 1 : 0) * (asc ? 1 : -1)
            })
          }
          if (rangeArgs) rows = rows.slice(rangeArgs[0], rangeArgs[1] + 1)
          if (limitArg !== null) rows = rows.slice(0, limitArg)
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { client: client as unknown as Parameters<typeof changeUserTribe>[0], rpcCalls, reads }
}

const OK_RESULT = {
  ok: true,
  changeId: CHANGE,
  fromTribeId: FROM,
  toTribeId: TO,
  toTribeName: '아스팔트 레인저',
  cancelled: [],
}

beforeEach(() => {
  createNotificationMock.mockReset()
  createNotificationMock.mockImplementation(async () => null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─────────────────────────────────────────────────────────────────────────────
// 사유
// ─────────────────────────────────────────────────────────────────────────────

describe('사유 목록과 검증', () => {
  it('고정 목록은 네 가지이고 라벨이 정해진 문구다', () => {
    expect(TRIBE_CHANGE_REASONS.map((r) => r.label)).toEqual([
      '유저가 잘못 골랐어요',
      '유저가 옮기길 원해요',
      '운영 정정',
      '기타',
    ])
    expect(TRIBE_CHANGE_REASONS.map((r) => r.value)).toEqual(['wrong_pick', 'user_request', 'ops_fix', 'other'])
  })

  it('목록에 있는 코드만 유효하다', () => {
    for (const r of TRIBE_CHANGE_REASONS) expect(isTribeChangeReasonCode(r.value)).toBe(true)
    for (const bad of ['', 'WRONG_PICK', 'cs_compensation', null, undefined, 3, {}]) expect(isTribeChangeReasonCode(bad)).toBe(false)
  })

  it('코드가 목록에 없으면 거절한다', () => {
    expect(parseTribeChangeInput('nope', '메모')).toEqual({ ok: false, code: 'invalid_reason' })
    expect(parseTribeChangeInput(undefined, undefined)).toEqual({ ok: false, code: 'invalid_reason' })
    expect(parseTribeChangeInput(3, '메모')).toEqual({ ok: false, code: 'invalid_reason' })
  })

  it('«기타»는 메모가 필수이고, 공백뿐인 메모는 없는 것으로 본다', () => {
    expect(parseTribeChangeInput('other', undefined)).toEqual({ ok: false, code: 'memo_required' })
    expect(parseTribeChangeInput('other', null)).toEqual({ ok: false, code: 'memo_required' })
    expect(parseTribeChangeInput('other', '   ')).toEqual({ ok: false, code: 'memo_required' })
    expect(parseTribeChangeInput('other', '이벤트 정정')).toEqual({ ok: true, reasonCode: 'other', memo: '이벤트 정정' })
  })

  it('나머지 세 사유는 메모가 선택이다 — 없으면 null이다', () => {
    for (const code of ['wrong_pick', 'user_request', 'ops_fix'] as const) {
      expect(parseTribeChangeInput(code, undefined)).toEqual({ ok: true, reasonCode: code, memo: null })
      expect(parseTribeChangeInput(code, '   ')).toEqual({ ok: true, reasonCode: code, memo: null })
      expect(parseTribeChangeInput(code, '문의 접수')).toEqual({ ok: true, reasonCode: code, memo: '문의 접수' })
    }
  })

  it('메모는 앞뒤 공백을 지운다', () => {
    expect(parseTribeChangeInput('ops_fix', '  문의 접수  ')).toEqual({ ok: true, reasonCode: 'ops_fix', memo: '문의 접수' })
  })

  it('메모 길이 상한: 상한까지는 통과하고 넘으면 거절한다(공백을 지운 뒤 센다)', () => {
    const atLimit = '가'.repeat(TRIBE_CHANGE_MEMO_MAX_LENGTH)
    expect(parseTribeChangeInput('other', atLimit)).toEqual({ ok: true, reasonCode: 'other', memo: atLimit })
    expect(parseTribeChangeInput('other', `  ${atLimit}  `)).toEqual({ ok: true, reasonCode: 'other', memo: atLimit })
    expect(parseTribeChangeInput('other', atLimit + '가')).toEqual({ ok: false, code: 'memo_too_long' })
  })

  it('메모가 문자열이 아니면 없는 것으로 넘기지 않고 거절한다', () => {
    expect(parseTribeChangeInput('ops_fix', 123)).toEqual({ ok: false, code: 'invalid_memo' })
    expect(parseTribeChangeInput('other', { text: '메모' })).toEqual({ ok: false, code: 'invalid_memo' })
  })

  it('사유 라벨: 목록의 코드는 라벨, 옛 코드는 코드 그대로, 값이 없으면 «—»', () => {
    expect(tribeChangeReasonLabel('wrong_pick')).toBe('유저가 잘못 골랐어요')
    expect(tribeChangeReasonLabel('other')).toBe('기타')
    expect(tribeChangeReasonLabel('retired_code')).toBe('retired_code')
    expect(tribeChangeReasonLabel(null)).toBe('—')
    expect(tribeChangeReasonLabel('')).toBe('—')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RPC 응답 해석
// ─────────────────────────────────────────────────────────────────────────────

describe('parseChangeResult', () => {
  it('성공 응답을 앱 모양으로 옮긴다 — 취소 목록은 { id, title }이다', () => {
    expect(
      parseChangeResult({ ...OK_RESULT, cancelled: [{ missionId: 'm1', title: '한강 100km' }, { missionId: 'm2' }] })
    ).toEqual({
      ok: true,
      changeId: CHANGE,
      fromTribeId: FROM,
      toTribeId: TO,
      toTribeName: '아스팔트 레인저',
      cancelledMissions: [
        { id: 'm1', title: '한강 100km' },
        { id: 'm2', title: '' },
      ],
    })
  })

  it('DB 거절 코드를 앱 코드로 옮긴다 — reason_required는 invalid_reason이다', () => {
    for (const [db, app] of [
      ['reason_required', 'invalid_reason'],
      ['user_not_found', 'user_not_found'],
      ['no_tribe', 'no_tribe'],
      ['invalid_tribe', 'invalid_tribe'],
      ['same_tribe', 'same_tribe'],
    ] as const) {
      expect(parseChangeResult({ ok: false, code: db })).toEqual({ ok: false, code: app })
    }
  })

  it('모르는 거절 코드와 해석할 수 없는 응답은 던진다 — 성공으로 보지 않는다', () => {
    expect(() => parseChangeResult({ ok: false, code: 'something_new' })).toThrow()
    expect(() => parseChangeResult({ ok: false })).toThrow()
    expect(() => parseChangeResult({ ok: false, code: 'constructor' })).toThrow()
    expect(() => parseChangeResult(null)).toThrow()
    expect(() => parseChangeResult('ok')).toThrow()
    expect(() => parseChangeResult({ ok: true })).toThrow()
    expect(() => parseChangeResult({ ...OK_RESULT, toTribeName: undefined })).toThrow()
    expect(() => parseChangeResult({ ...OK_RESULT, cancelled: 'x' })).toThrow()
    expect(() => parseChangeResult({ ...OK_RESULT, cancelled: [{ title: '제목만' }] })).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// changeUserTribe
// ─────────────────────────────────────────────────────────────────────────────

describe('changeUserTribe', () => {
  const input = { adminId: ADMIN, userId: USER, newTribeId: TO, reasonCode: 'wrong_pick', memo: null as string | null }

  it('RPC를 어드민·유저·새 트라이브·사유 코드로 부른다 — 메모가 없으면 p_memo를 보내지 않는다', async () => {
    const { client, rpcCalls } = createStub({ rpcResult: { data: OK_RESULT, error: null } })

    const result = await changeUserTribe(client, input)

    expect(result).toEqual({
      ok: true,
      changeId: CHANGE,
      fromTribeId: FROM,
      toTribeId: TO,
      toTribeName: '아스팔트 레인저',
      cancelledMissions: [],
    })
    expect(rpcCalls).toEqual([
      {
        fn: 'admin_change_user_tribe',
        args: { p_admin_id: ADMIN, p_user_id: USER, p_new_tribe_id: TO, p_reason_code: 'wrong_pick' },
      },
    ])
  })

  it('메모는 앞뒤 공백을 지워 p_memo로 보낸다', async () => {
    const { client, rpcCalls } = createStub({ rpcResult: { data: OK_RESULT, error: null } })

    await changeUserTribe(client, { ...input, reasonCode: 'other', memo: '  이벤트 정정  ' })

    expect(rpcCalls[0].args).toMatchObject({ p_reason_code: 'other', p_memo: '이벤트 정정' })
  })

  it('성공하면 «트라이브가 바뀌었어요» 소식 한 건을 변경 기록 id 키로 한 번만 만든다 — 사유는 싣지 않는다', async () => {
    const { client } = createStub({ rpcResult: { data: OK_RESULT, error: null } })

    await changeUserTribe(client, { ...input, reasonCode: 'other', memo: '내부 메모' })

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith({
      userId: USER,
      type: 'tribe_changed',
      payload: { new_tribe_name: '아스팔트 레인저' },
      groupKey: `tribe_changed:${CHANGE}`,
      mode: 'once',
    })
    expect(JSON.stringify(createNotificationMock.mock.calls)).not.toContain('내부 메모')
    expect(JSON.stringify(createNotificationMock.mock.calls)).not.toContain('other')
  })

  it('취소된 미션이 없으면 참가 취소 소식은 보내지 않는다', async () => {
    const { client } = createStub({ rpcResult: { data: OK_RESULT, error: null } })

    await changeUserTribe(client, input)

    const types = (createNotificationMock.mock.calls as unknown as [{ type: string }][]).map(([c]) => c.type)
    expect(types).toEqual(['tribe_changed'])
  })

  it('취소된 미션이 있으면 참가 취소 소식 한 건을 더 보낸다 — 미션이 여럿이어도 한 건이다', async () => {
    const cancelled = [
      { missionId: 'm1', title: '한강 100km' },
      { missionId: 'm2', title: '남산 오르기' },
    ]
    const { client } = createStub({ rpcResult: { data: { ...OK_RESULT, cancelled }, error: null } })

    const result = await changeUserTribe(client, input)

    expect(result.ok && result.cancelledMissions).toEqual([
      { id: 'm1', title: '한강 100km' },
      { id: 'm2', title: '남산 오르기' },
    ])
    const calls = (createNotificationMock.mock.calls as unknown as [{ userId: string; type: string; payload: unknown }][]).map(([c]) => c)
    expect(calls.map((c) => c.type)).toEqual(['tribe_changed', 'mission_participation_cancelled'])
    expect(calls[1]).toMatchObject({
      userId: USER,
      payload: {
        missions: [
          { mission_id: 'm1', title: '한강 100km' },
          { mission_id: 'm2', title: '남산 오르기' },
        ],
      },
    })
  })

  it('거절 코드는 던지지 않고 돌려주며, 소식을 보내지 않는다', async () => {
    for (const code of ['user_not_found', 'no_tribe', 'invalid_tribe', 'same_tribe'] as const) {
      createNotificationMock.mockClear()
      const { client } = createStub({ rpcResult: { data: { ok: false, code }, error: null } })

      await expect(changeUserTribe(client, input)).resolves.toEqual({ ok: false, code })
      expect(createNotificationMock).not.toHaveBeenCalled()
    }
  })

  it('사유가 올바르지 않으면 RPC를 부르지 않고 거절한다', async () => {
    const { client, rpcCalls } = createStub({ rpcResult: { data: OK_RESULT, error: null } })

    await expect(changeUserTribe(client, { ...input, reasonCode: 'nope' })).resolves.toEqual({ ok: false, code: 'invalid_reason' })
    await expect(changeUserTribe(client, { ...input, reasonCode: 'other', memo: '' })).resolves.toEqual({ ok: false, code: 'memo_required' })
    await expect(
      changeUserTribe(client, { ...input, reasonCode: 'other', memo: '가'.repeat(TRIBE_CHANGE_MEMO_MAX_LENGTH + 1) })
    ).resolves.toEqual({ ok: false, code: 'memo_too_long' })
    expect(rpcCalls).toEqual([])
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('RPC 오류는 던진다 — 소식을 보내지 않고, 오류 문구에 원인이 남는다', async () => {
    const { client } = createStub({ rpcResult: { data: null, error: { message: 'connection reset' } } })

    await expect(changeUserTribe(client, input)).rejects.toThrow('connection reset')
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('해석할 수 없는 응답은 던진다 — 소식을 보내지 않는다', async () => {
    const { client } = createStub({ rpcResult: { data: { ok: true }, error: null } })

    await expect(changeUserTribe(client, input)).rejects.toThrow()
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('소식이 던져도 변경 결과는 그대로 돌려준다 — 두 소식을 각각 시도한다', async () => {
    createNotificationMock.mockRejectedValue(new Error('알림 DB 장애'))
    const { client } = createStub({
      rpcResult: { data: { ...OK_RESULT, cancelled: [{ missionId: 'm1', title: '한강 100km' }] }, error: null },
    })

    const result = await changeUserTribe(client, input)

    expect(result.ok).toBe(true)
    expect(createNotificationMock).toHaveBeenCalledTimes(2)
  })

  it('소식이 null을 돌려줘도(만들지 못함) 변경은 성공이다', async () => {
    createNotificationMock.mockResolvedValue(null)
    const { client } = createStub({ rpcResult: { data: OK_RESULT, error: null } })

    await expect(changeUserTribe(client, input)).resolves.toMatchObject({ ok: true, toTribeId: TO })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// previewTribeChange
// ─────────────────────────────────────────────────────────────────────────────

describe('previewTribeChange — 취소될 미션을 취소 함수와 같은 기준으로 읽는다', () => {
  const participations: Row[] = [
    { user_id: USER, mission_id: 'm-common', joined_at: '2026-10-01T00:00:00Z' },
    { user_id: USER, mission_id: 'm-from-only', joined_at: '2026-10-02T00:00:00Z' },
    { user_id: USER, mission_id: 'm-both', joined_at: '2026-10-03T00:00:00Z' },
    { user_id: USER, mission_id: 'm-other-only', joined_at: '2026-10-04T00:00:00Z' },
    { user_id: 'someone-else', mission_id: 'm-someone-else', joined_at: '2026-10-05T00:00:00Z' },
  ]
  const allowed: Row[] = [
    // m-common은 행이 없다 = 공통 미션
    { mission_id: 'm-from-only', tribe_id: FROM },
    { mission_id: 'm-both', tribe_id: FROM },
    { mission_id: 'm-both', tribe_id: TO },
    { mission_id: 'm-other-only', tribe_id: OTHER },
    { mission_id: 'm-someone-else', tribe_id: FROM },
  ]
  const missions: Row[] = [
    { id: 'm-common', title: '공통 미션' },
    { id: 'm-from-only', title: '옛 트라이브 전용' },
    { id: 'm-both', title: '둘 다 허용' },
    { id: 'm-other-only', title: '다른 트라이브 전용' },
  ]

  it('새 트라이브가 대상이 아닌 트라이브 제한 미션만 참가한 순서대로 돌려준다', async () => {
    const { client } = createStub({
      tables: { user_mission_participations: participations, mission_allowed_tribes: allowed, missions },
    })

    await expect(previewTribeChange(client, USER, TO)).resolves.toEqual([
      { id: 'm-from-only', title: '옛 트라이브 전용' },
      { id: 'm-other-only', title: '다른 트라이브 전용' },
    ])
  })

  it('공통 미션과 새 트라이브가 대상인 미션은 취소되지 않는다', async () => {
    const { client } = createStub({
      tables: { user_mission_participations: participations, mission_allowed_tribes: allowed, missions },
    })

    const ids = (await previewTribeChange(client, USER, TO)).map((m) => m.id)
    expect(ids).not.toContain('m-common')
    expect(ids).not.toContain('m-both')
    expect(ids).not.toContain('m-someone-else')
  })

  it('다른 트라이브를 새 트라이브로 두면 결과가 달라진다 — 기준은 새 트라이브다', async () => {
    const { client } = createStub({
      tables: { user_mission_participations: participations, mission_allowed_tribes: allowed, missions },
    })

    const ids = (await previewTribeChange(client, USER, OTHER)).map((m) => m.id)
    expect(ids).toEqual(['m-from-only', 'm-both'])
  })

  it('참가한 미션이 없으면 빈 목록이고 허용 트라이브 표를 읽지 않는다', async () => {
    const { client, reads } = createStub({
      tables: { user_mission_participations: [], mission_allowed_tribes: allowed, missions },
    })

    await expect(previewTribeChange(client, USER, TO)).resolves.toEqual([])
    expect(reads).toEqual(['user_mission_participations'])
  })

  it('읽기만 한다 — RPC를 부르지 않는다', async () => {
    const { client, rpcCalls } = createStub({
      tables: { user_mission_participations: participations, mission_allowed_tribes: allowed, missions },
    })

    await previewTribeChange(client, USER, TO)
    expect(rpcCalls).toEqual([])
  })

  it('미션 제목을 읽지 못한 행은 빈 제목으로 남긴다 — 미션 자체는 목록에서 빠지지 않는다', async () => {
    const { client } = createStub({
      tables: { user_mission_participations: participations, mission_allowed_tribes: allowed, missions: [] },
    })

    const result = await previewTribeChange(client, USER, TO)
    expect(result.map((m) => m.id)).toEqual(['m-from-only', 'm-other-only'])
    expect(result.every((m) => m.title === '')).toBe(true)
  })

  it('읽지 못하면 던진다 — 빈 목록(영향 없음)으로 보이지 않는다', async () => {
    for (const failing of ['user_mission_participations', 'mission_allowed_tribes', 'missions']) {
      const { client } = createStub({
        tables: { user_mission_participations: participations, mission_allowed_tribes: allowed, missions },
        failTables: [failing],
      })

      await expect(previewTribeChange(client, USER, TO)).rejects.toThrow(failing)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// fetchTribeChangeHistory
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchTribeChangeHistory', () => {
  const rows: Row[] = [
    {
      id: 'c1',
      user_id: USER,
      created_at: '2026-10-20T01:00:00Z',
      from_tribe_id: FROM,
      to_tribe_id: TO,
      reason_code: 'wrong_pick',
      memo: null,
      changed_by: ADMIN,
      cancelled_mission_count: 2,
    },
    {
      id: 'c2',
      user_id: USER,
      created_at: '2026-10-21T01:00:00Z',
      from_tribe_id: TO,
      to_tribe_id: OTHER,
      reason_code: 'other',
      memo: '이벤트 정정',
      changed_by: null,
      cancelled_mission_count: 0,
    },
    { id: 'c3', user_id: 'someone-else', created_at: '2026-10-22T01:00:00Z', from_tribe_id: FROM, to_tribe_id: TO, reason_code: 'ops_fix', memo: null, changed_by: null, cancelled_mission_count: 0 },
  ]
  const tribes: Row[] = [
    { id: FROM, name: '낭만 미식가' },
    { id: TO, name: '아스팔트 레인저' },
    { id: OTHER, name: '숲속의 갱단' },
  ]
  const users: Row[] = [{ id: ADMIN, email: 'ops@example.com' }]

  it('이 유저의 이력을 최신순으로, 트라이브 이름·사유 라벨·어드민 이메일을 붙여 돌려준다', async () => {
    const { client } = createStub({ tables: { user_tribe_changes: rows, tribes, users } })

    await expect(fetchTribeChangeHistory(client, USER)).resolves.toEqual([
      {
        id: 'c2',
        createdAt: '2026-10-21T01:00:00Z',
        fromTribeId: TO,
        fromTribeName: '아스팔트 레인저',
        toTribeId: OTHER,
        toTribeName: '숲속의 갱단',
        reasonCode: 'other',
        reasonLabel: '기타',
        memo: '이벤트 정정',
        changedByEmail: null,
        cancelledMissionCount: 0,
      },
      {
        id: 'c1',
        createdAt: '2026-10-20T01:00:00Z',
        fromTribeId: FROM,
        fromTribeName: '낭만 미식가',
        toTribeId: TO,
        toTribeName: '아스팔트 레인저',
        reasonCode: 'wrong_pick',
        reasonLabel: '유저가 잘못 골랐어요',
        memo: null,
        changedByEmail: 'ops@example.com',
        cancelledMissionCount: 2,
      },
    ])
  })

  it('건수 상한을 지킨다', async () => {
    const { client } = createStub({ tables: { user_tribe_changes: rows, tribes, users } })

    const history = await fetchTribeChangeHistory(client, USER, 1)
    expect(history.map((h) => h.id)).toEqual(['c2'])
  })

  it('이력이 없으면 빈 목록이고 이름 조회를 하지 않는다', async () => {
    const { client, reads } = createStub({ tables: { user_tribe_changes: [], tribes, users } })

    await expect(fetchTribeChangeHistory(client, USER)).resolves.toEqual([])
    expect(reads).toEqual(['user_tribe_changes'])
  })

  it('트라이브나 어드민을 읽지 못한 이름은 null로 남기고 이력은 그대로 돌려준다', async () => {
    const { client } = createStub({ tables: { user_tribe_changes: [rows[0]], tribes: [], users: [] } })

    const [item] = await fetchTribeChangeHistory(client, USER)
    expect(item.fromTribeName).toBeNull()
    expect(item.toTribeName).toBeNull()
    expect(item.changedByEmail).toBeNull()
    expect(item.id).toBe('c1')
  })

  it('읽지 못하면 던진다 — «이력 없음»과 같은 빈 목록으로 보이지 않는다', async () => {
    for (const failing of ['user_tribe_changes', 'tribes', 'users']) {
      const { client } = createStub({ tables: { user_tribe_changes: rows, tribes, users }, failTables: [failing] })

      await expect(fetchTribeChangeHistory(client, USER)).rejects.toThrow(failing)
    }
  })
})
