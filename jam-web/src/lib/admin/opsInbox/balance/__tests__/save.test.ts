/**
 * 규칙 읽기·저장 (티켓 20260930_1459 조각 B)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 `ops_rules` 테이블로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 400: 값 검증 칸별 오류(`fieldErrors`), 바꿀 내용 없음, 낯선 경고 수준·켜기, 수정 시각 없음, R6·R7·R8의 값 변경
 * - 404: 없는 규칙(밸런스 규칙 키가 아니거나 행이 없음)
 * - 409: 화면이 본 수정 시각이 낡았을 때, 읽은 뒤 쓰기 전에 다른 곳이 바꿨을 때(조건부 update 0행)
 * - 값이 바뀌면 `previous_value`에 이전 값을, 켜기·수준만 바뀌면 직전 값은 그대로 두고 `updated_by`·`updated_at`을 채운다
 * - 모두 현재 값과 같으면 쓰지 않는다(`changed: false`), 직전 값으로 되돌리기도 같은 저장이다
 * - 읽기·쓰기 오류는 500이고 로그만 남긴다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listOpsRules, saveOpsRule, RULE_CONFLICT_MESSAGE } from '../save'

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  readError: null as string | null,
  writeError: null as string | null,
  /** 조회 직후·update 직전에 다른 곳이 같은 규칙을 바꾼 것처럼 보이게 하는 훅. */
  beforeUpdate: null as null | (() => void),
  updates: [] as Row[],
  calls: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private mode: 'select' | 'update' = 'select'
  private patch: Row = {}
  private filters: Array<(row: Row) => boolean> = []
  constructor(private table: string) {}
  select() {
    db.calls.push(`${this.table}.select`)
    return this
  }
  update(patch: Row) {
    db.calls.push(`${this.table}.update`)
    this.mode = 'update'
    this.patch = patch
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push((row) => row[col] === val)
    return this
  }
  async maybeSingle() {
    const result = await this.run()
    const rows = (result.data as Row[] | null) ?? []
    return { data: rows[0] ?? null, error: result.error }
  }
  private run(): Promise<{ data: unknown; error: { message: string } | null }> {
    if (this.mode === 'select') {
      if (db.readError) return Promise.resolve({ data: null, error: { message: db.readError } })
      return Promise.resolve({ data: db.rows.filter((row) => this.filters.every((f) => f(row))).map((row) => ({ ...row })), error: null })
    }
    db.beforeUpdate?.()
    if (db.writeError) return Promise.resolve({ data: null, error: { message: db.writeError } })
    const hit = db.rows.filter((row) => this.filters.every((f) => f(row)))
    db.updates.push(this.patch)
    for (const row of hit) Object.assign(row, this.patch)
    return Promise.resolve({ data: hit.map((row) => ({ ...row })), error: null })
  }
  then<T1, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.run().then(onfulfilled, onrejected)
  }
}

const client = { from: (table: string) => new Query(table) } as unknown as Parameters<typeof saveOpsRule>[0]

const T0 = '2026-10-01T05:00:00.123456+00:00'
const ACTOR = '11111111-1111-4111-8111-111111111111'

function seedRow(key: string, value: unknown, overrides: Row = {}): Row {
  return {
    rule_key: key,
    rule_group: 'balance',
    value,
    level: 'warn',
    enabled: true,
    updated_at: T0,
    updated_by: null,
    previous_value: null,
    ...overrides,
  }
}

const R1 = { max: 6, provisional: true }
const R5 = {
  kinds: {
    count_badge: { max: 10, provisional: true },
    achievement_badge: { max: 100, provisional: false },
    mission: { max: 50, provisional: true },
    collection_completion: { max: 20, provisional: false },
    recipe: { max: 30, provisional: false },
  },
}

beforeEach(() => {
  db.rows = [
    seedRow('open_collections_max', R1),
    seedRow('point_reward_max', R5),
    seedRow('single_action_points', {}),
    seedRow('economy_keys', { keys: ['rarity_common'] }),
    seedRow('some_signal', { n: 1 }, { rule_group: 'signal' }),
  ]
  db.readError = null
  db.writeError = null
  db.beforeUpdate = null
  db.updates = []
  db.calls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function save(overrides: Record<string, unknown> = {}) {
  return saveOpsRule(client, {
    ruleKey: 'open_collections_max',
    value: { max: 9, provisional: false },
    expectedUpdatedAt: T0,
    actor: ACTOR,
    ...overrides,
  } as Parameters<typeof saveOpsRule>[1])
}

describe('listOpsRules', () => {
  it('그룹의 규칙만 규칙 순서(R1~R8)대로 camelCase로 돌려준다', async () => {
    db.rows.reverse()
    const rules = await listOpsRules(client, 'balance')
    expect(rules.map((r) => r.ruleKey)).toEqual(['open_collections_max', 'point_reward_max', 'single_action_points', 'economy_keys'])
    expect(rules[0]).toMatchObject({ group: 'balance', level: 'warn', enabled: true, updatedAt: T0, updatedBy: null, previousValue: null })
    expect((await listOpsRules(client, 'signal')).map((r) => r.ruleKey)).toEqual(['some_signal'])
  })

  it('조회 오류는 던진다', async () => {
    db.readError = 'down'
    await expect(listOpsRules(client, 'balance')).rejects.toThrow('규칙 조회 실패')
  })
})

describe('saveOpsRule 400·404', () => {
  it('값 검증 오류는 칸별 fieldErrors와 함께 400이고 아무것도 쓰지 않는다', async () => {
    const outcome = await save({ value: { max: 0, provisional: 'x' } })
    expect(outcome).toEqual({
      ok: false,
      status: 400,
      error: '값을 확인해 주세요.',
      fieldErrors: { max: '1 이상의 정수로 적어 주세요', provisional: '임시값 표시는 켜짐이나 꺼짐으로 정해 주세요' },
    })
    expect(db.updates).toEqual([])
  })

  it('R6·R7·R8은 값을 보내면 400이다(켜기·수준만 바꾼다)', async () => {
    for (const ruleKey of ['single_action_points', 'economy_keys']) {
      const outcome = await save({ ruleKey, value: {} })
      expect(outcome).toMatchObject({ ok: false, status: 400, fieldErrors: { value: expect.stringContaining('값을 바꿀 수 없어요') } })
    }
    expect(db.updates).toEqual([])
    const toggled = await save({ ruleKey: 'economy_keys', value: undefined, enabled: false })
    expect(toggled).toMatchObject({ ok: true, changed: true })
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0]).not.toHaveProperty('value')
    expect(db.updates[0]).not.toHaveProperty('previous_value')
  })

  it('바꿀 내용이 없으면 400이다', async () => {
    expect(await save({ value: undefined })).toMatchObject({ ok: false, status: 400, error: '바꿀 내용이 없어요.' })
  })

  it('낯선 경고 수준·켜기 값은 400이다', async () => {
    expect(await save({ value: undefined, level: 'critical' })).toMatchObject({ ok: false, status: 400 })
    expect(await save({ value: undefined, enabled: 'yes' })).toMatchObject({ ok: false, status: 400 })
    expect(db.updates).toEqual([])
  })

  it('수정 시각이 없거나 글이 아니면 400이다', async () => {
    for (const expectedUpdatedAt of [undefined, '', 5, null]) {
      expect(await save({ expectedUpdatedAt })).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('밸런스 규칙 키가 아니거나 행이 없으면 404이고 DB를 부르지 않거나 쓰지 않는다', async () => {
    expect(await save({ ruleKey: 'some_signal' })).toMatchObject({ ok: false, status: 404 })
    expect(db.calls).toEqual([])
    db.rows = db.rows.filter((row) => row.rule_key !== 'open_collections_max')
    expect(await save()).toMatchObject({ ok: false, status: 404 })
    expect(db.updates).toEqual([])
  })
})

describe('saveOpsRule 409 충돌', () => {
  it('화면이 본 수정 시각이 낡았으면 409이고 쓰지 않는다', async () => {
    const outcome = await save({ expectedUpdatedAt: '2026-10-01T04:00:00+00:00' })
    expect(outcome).toEqual({ ok: false, status: 409, error: RULE_CONFLICT_MESSAGE })
    expect(db.updates).toEqual([])
  })

  it('읽은 뒤 쓰기 전에 다른 곳이 바꿨으면 조건부 update가 0행이라 409이고 앞선 변경은 그대로다', async () => {
    db.beforeUpdate = () => {
      const row = db.rows.find((r) => r.rule_key === 'open_collections_max')!
      row.value = { max: 3, provisional: false }
      row.updated_at = '2026-10-01T05:00:01+00:00'
    }
    const outcome = await save({ value: { max: 9, provisional: true } })
    expect(outcome).toMatchObject({ ok: false, status: 409 })
    expect(db.rows.find((r) => r.rule_key === 'open_collections_max')!.value).toEqual({ max: 3, provisional: false })
  })

  it('두 탭에서 같은 규칙을 바꾸면 늦게 저장한 쪽만 409다', async () => {
    const first = await save({ value: { max: 8, provisional: true } })
    expect(first).toMatchObject({ ok: true, changed: true })
    const second = await save({ value: { max: 4, provisional: true } }) // 같은 T0를 들고 온 두 번째 탭
    expect(second).toMatchObject({ ok: false, status: 409 })
    expect(db.rows.find((r) => r.rule_key === 'open_collections_max')!.value).toEqual({ max: 8, provisional: true })
  })
})

describe('saveOpsRule 저장', () => {
  it('값이 바뀌면 이전 값을 previous_value에 넣고 바꾼 사람·시각을 채운다', async () => {
    const outcome = await save({ value: { max: 9, provisional: false } })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changed).toBe(true)
    expect(outcome.rule).toMatchObject({
      ruleKey: 'open_collections_max',
      value: { max: 9, provisional: false },
      previousValue: R1,
      updatedBy: ACTOR,
      level: 'warn',
      enabled: true,
    })
    expect(outcome.rule.updatedAt).not.toBe(T0)
    expect(db.updates[0]).toMatchObject({ value: { max: 9, provisional: false }, previous_value: R1, updated_by: ACTOR })
  })

  it('켜기·경고 수준만 바꾸면 값과 직전 값은 그대로 두고 바꾼 사람·시각만 채운다', async () => {
    db.rows[0].previous_value = { max: 5, provisional: true }
    const outcome = await save({ value: undefined, level: 'info', enabled: false })
    expect(outcome).toMatchObject({ ok: true, changed: true })
    if (!outcome.ok) return
    expect(outcome.rule).toMatchObject({ value: R1, previousValue: { max: 5, provisional: true }, level: 'info', enabled: false, updatedBy: ACTOR })
    expect(db.updates[0]).toEqual({ updated_at: expect.any(String), updated_by: ACTOR, level: 'info', enabled: false })
  })

  it('R5는 종류별 값을 한 번에 저장하고 직전 값에 이전 값 전체를 남긴다', async () => {
    const next = { kinds: { ...R5.kinds, mission: { max: 40, provisional: false } } }
    const outcome = await save({ ruleKey: 'point_reward_max', value: next })
    expect(outcome).toMatchObject({ ok: true, changed: true })
    if (!outcome.ok) return
    expect(outcome.rule.value).toEqual(next)
    expect(outcome.rule.previousValue).toEqual(R5)
  })

  it('현재와 모두 같으면 쓰지 않고 현재 규칙을 돌려준다(키 순서가 달라도 같은 값이다)', async () => {
    const outcome = await save({ value: { provisional: true, max: 6 }, level: 'warn', enabled: true })
    expect(outcome).toMatchObject({ ok: true, changed: false })
    expect(db.updates).toEqual([])
    if (outcome.ok) expect(outcome.rule.updatedAt).toBe(T0)
  })

  it('직전 값으로 되돌리기는 직전 값을 새 값으로 보내는 같은 저장이다(되돌린 뒤 직전 값은 방금 값이 된다)', async () => {
    const first = await save({ value: { max: 9, provisional: false } })
    if (!first.ok) throw new Error('첫 저장 실패')
    const revert = await save({ value: first.rule.previousValue, expectedUpdatedAt: first.rule.updatedAt })
    expect(revert).toMatchObject({ ok: true, changed: true })
    if (!revert.ok) return
    expect(revert.rule.value).toEqual(R1)
    expect(revert.rule.previousValue).toEqual({ max: 9, provisional: false })
  })

  it('다른 규칙의 행은 건드리지 않는다', async () => {
    await save()
    expect(db.rows.find((r) => r.rule_key === 'point_reward_max')!.updated_by).toBeNull()
    expect(db.rows.find((r) => r.rule_key === 'some_signal')!.value).toEqual({ n: 1 })
  })
})

describe('saveOpsRule 오류', () => {
  it('규칙 조회 오류는 500이고 원문은 응답에 싣지 않는다', async () => {
    db.readError = 'secret relation detail'
    const outcome = await save()
    expect(outcome).toMatchObject({ ok: false, status: 500 })
    if (!outcome.ok) expect(outcome.error).not.toContain('secret')
    expect(console.error).toHaveBeenCalled()
  })

  it('저장 오류는 500이다', async () => {
    db.writeError = 'write failed'
    expect(await save()).toMatchObject({ ok: false, status: 500 })
  })
})
