/**
 * 신호 기준값 읽기·저장·되돌리기 (티켓 20260930_1459 조각 C)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 `ops_rules` 테이블로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 읽기: 기준값 25개를 키 순서로, 행이 없는 칸은 기본값 그대로. 응답에 관리자 사용자 ID가 없다(`updated_by`를 읽지도 않는다)
 * - 저장 400: 카드에 없는 칸·읽기 전용 칸·범위 밖 값(카드의 칸 하나라도 틀리면 아무것도 쓰지 않는다)·맞물림(한쪽만 따로 보내도 저장된 값·기본값과 합쳐서 확인)·수정 시각 없음
 * - 저장 404: 기준값이 없는 신호(형식 오류 등)·낯선 신호
 * - 저장 409: 칸별 수정 시각이 현재 행과 다를 때(행이 없던 칸에 행이 생긴 경우, 행이 사라진 경우 포함). 아무것도 쓰지 않는다
 * - 저장 동작: 기본값과 다른 값은 한 번의 upsert(직전 값 = 기존 저장값, 첫 저장은 기본값), 기본값과 같아진 값은 한 번의 delete, 기본값과 같은 값은 행을 만들지 않는다.
 *   현재 값과 같으면 쓰지 않는다. 응답의 수정 시각은 DB가 돌려준 값이다
 * - 되돌리기: 그 칸의 행만 지운다(`updated_at` 조건). 행이 없거나 그사이 바뀌었으면 409, 읽기 전용 칸은 400, 낯선 칸은 404
 * - 읽기·쓰기 오류는 500이고 로그만 남긴다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OPS_SIGNAL_THRESHOLD_KEYS } from '../thresholds'
import {
  THRESHOLD_CONFLICT_MESSAGE,
  listSignalThresholds,
  revertSignalThreshold,
  saveSignalThresholds,
} from '../saveThresholds'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

const db = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  readError: null as string | null,
  upsertError: null as string | null,
  deleteError: null as string | null,
  upserts: [] as Array<Array<Record<string, unknown>>>,
  deletes: [] as string[][],
  selectColumns: [] as string[],
  calls: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

/** DB가 돌려주는 모양으로 시각을 바꾼다(밀리초 `Z`를 `+00:00`으로). 응답의 수정 시각이 DB가 돌려준 값인지 가린다. */
function dbStamp(iso: unknown): string {
  return new Date(String(iso)).toISOString().replace('Z', '+00:00')
}

class Query implements PromiseLike<Result> {
  private mode: 'select' | 'upsert' | 'delete' = 'select'
  private filters: Array<(row: Row) => boolean> = []
  private payload: Row[] = []
  private returning = false
  constructor(private table: string) {}
  select(columns: string) {
    if (this.mode === 'select') db.selectColumns.push(columns)
    else this.returning = true
    db.calls.push(`${this.table}.select`)
    return this
  }
  upsert(rows: Row[]) {
    db.calls.push(`${this.table}.upsert`)
    this.mode = 'upsert'
    this.payload = rows
    return this
  }
  delete() {
    db.calls.push(`${this.table}.delete`)
    this.mode = 'delete'
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push((row) => row[col] === val)
    return this
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((row) => vals.includes(row[col]))
    return this
  }
  private run(): Result {
    if (this.mode === 'select') {
      if (db.readError) return { data: null, error: { message: db.readError } }
      return { data: db.rows.filter((row) => this.filters.every((f) => f(row))).map((row) => ({ ...row })), error: null }
    }
    if (this.mode === 'upsert') {
      if (db.upsertError) return { data: null, error: { message: db.upsertError } }
      db.upserts.push(this.payload.map((row) => ({ ...row })))
      const written: Row[] = []
      for (const row of this.payload) {
        const stored = { ...row, updated_at: dbStamp(row.updated_at) }
        const index = db.rows.findIndex((existing) => existing.rule_key === row.rule_key)
        if (index === -1) db.rows.push(stored)
        else db.rows[index] = stored
        written.push({ ...stored })
      }
      return { data: this.returning ? written : null, error: null }
    }
    if (db.deleteError) return { data: null, error: { message: db.deleteError } }
    const hit = db.rows.filter((row) => this.filters.every((f) => f(row)))
    db.deletes.push(hit.map((row) => String(row.rule_key)))
    db.rows = db.rows.filter((row) => !hit.includes(row))
    return { data: this.returning ? hit.map((row) => ({ ...row })) : null, error: null }
  }
  then<T1, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

const client = { from: (table: string) => new Query(table) } as unknown as Parameters<typeof saveSignalThresholds>[0]

const T0 = '2026-10-01T05:00:00.123456+00:00'
const T1 = '2026-10-01T06:00:00.654321+00:00'
const ACTOR = '11111111-1111-4111-8111-111111111111'

function seed(key: string, value: unknown, over: Row = {}): Row {
  return {
    rule_key: key,
    rule_group: 'signal',
    value: { value },
    level: 'warn',
    enabled: true,
    updated_at: T0,
    updated_by: ACTOR,
    previous_value: null,
    ...over,
  }
}

function save(signalKey: string, values: unknown, expectedUpdatedAt: unknown) {
  return saveSignalThresholds(client, { signalKey, values, expectedUpdatedAt, actor: ACTOR })
}

const rowOf = (key: string) => db.rows.find((row) => row.rule_key === key)
const recordOf = (outcome: Awaited<ReturnType<typeof save>>, key: string) => {
  if (!outcome.ok) throw new Error('저장 실패')
  return outcome.thresholds.find((record) => record.ruleKey === key)!
}

beforeEach(() => {
  db.rows = []
  db.readError = null
  db.upsertError = null
  db.deleteError = null
  db.upserts = []
  db.deletes = []
  db.selectColumns = []
  db.calls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('listSignalThresholds', () => {
  it('기준값 25개를 키 순서로 돌려주고 행이 없는 칸은 기본값 그대로다', async () => {
    const list = await listSignalThresholds(client)
    expect(list.map((record) => record.ruleKey)).toEqual([...OPS_SIGNAL_THRESHOLD_KEYS])
    expect(list.every((record) => !record.changed && record.updatedAt === null && record.value === record.defaultValue)).toBe(true)
  })

  it('바꾼 값은 현재 값·바꾼 값 여부·직전 값·수정 시각으로 보이고, 다른 그룹의 행과 모르는 키는 섞이지 않는다', async () => {
    db.rows = [
      seed('approvalDeadlineHours', 36, { previous_value: { value: 48 }, updated_at: T1 }),
      seed('balanceLookalike', 5, { rule_group: 'balance' }),
      seed('notAThreshold', 5),
    ]
    const list = await listSignalThresholds(client)
    expect(list).toHaveLength(25)
    expect(list.find((record) => record.ruleKey === 'approvalDeadlineHours')).toMatchObject({
      value: 36,
      defaultValue: 48,
      changed: true,
      unreadable: false,
      previousValue: 48,
      updatedAt: T1,
    })
    expect(list.filter((record) => record.changed)).toHaveLength(1)
  })

  it('관리자 사용자 ID는 읽지도 돌려주지도 않는다', async () => {
    db.rows = [seed('approvalDeadlineHours', 36)]
    const list = await listSignalThresholds(client)
    expect(JSON.stringify(list)).not.toContain(ACTOR)
    expect(db.selectColumns[0]).toBe('rule_key, value, updated_at, previous_value')
    expect(db.selectColumns[0]).not.toContain('updated_by')
  })

  it('읽을 수 없는 행(범위 밖)은 기본값으로 보이고 unreadable이다', async () => {
    db.rows = [seed('minLiveCards', 0)]
    const record = (await listSignalThresholds(client)).find((r) => r.ruleKey === 'minLiveCards')!
    expect(record).toMatchObject({ value: 3, changed: true, unreadable: true })
  })

  it('조회 오류는 던진다', async () => {
    db.readError = 'down'
    await expect(listSignalThresholds(client)).rejects.toThrow('기준값 조회 실패')
  })
})

describe('saveSignalThresholds — 400·404', () => {
  it('기준값이 없는 신호와 낯선 신호는 404다', async () => {
    for (const signalKey of ['format_error', 'balance_warning', 'nope']) {
      const outcome = await save(signalKey, { approvalDeadlineHours: 36 }, { approvalDeadlineHours: null })
      expect(outcome).toMatchObject({ ok: false, status: 404 })
    }
    expect(db.upserts).toEqual([])
  })

  it('바꿀 내용이 없거나 본문 모양이 틀리면 400이다', async () => {
    expect(await save('approval_deadline', {}, {})).toMatchObject({ ok: false, status: 400, error: '바꿀 내용이 없어요.' })
    expect(await save('approval_deadline', undefined, {})).toMatchObject({ ok: false, status: 400 })
    expect(await save('approval_deadline', [36], {})).toMatchObject({ ok: false, status: 400 })
    expect(await save('approval_deadline', { approvalDeadlineHours: 36 }, undefined)).toMatchObject({ ok: false, status: 400 })
    expect(await save('approval_deadline', { approvalDeadlineHours: 36 }, {})).toMatchObject({ ok: false, status: 400 })
    expect(await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: 5 })).toMatchObject({ ok: false, status: 400 })
    expect(db.calls.filter((call) => /upsert|delete/.test(call))).toEqual([])
  })

  it('카드에 없는 칸·읽기 전용 칸은 400이다(읽기 전용 시각은 쓸 수 없다)', async () => {
    const readOnly = await save('routine_failed', { routineCheckStartsAt: '2026-10-06T00:00:00+09:00' }, { routineCheckStartsAt: null })
    expect(readOnly).toMatchObject({ ok: false, status: 400, fieldErrors: { routineCheckStartsAt: expect.any(String) } })
    const otherCard = await save('missed_schedule', { minLiveCards: 4 }, { minLiveCards: null })
    expect(otherCard).toMatchObject({ ok: false, status: 400, fieldErrors: { minLiveCards: '이 신호에 없는 기준값이에요' } })
    const unknown = await save('missed_schedule', { nope: 1 }, { nope: null })
    expect(unknown).toMatchObject({ ok: false, status: 400, fieldErrors: { nope: '이 신호에 없는 기준값이에요' } })
    expect(db.upserts).toEqual([])
  })

  it('범위 밖 값은 칸별 오류이고 카드의 칸 하나라도 틀리면 맞는 칸도 쓰지 않는다', async () => {
    const outcome = await save(
      'routine_failed',
      { weeklyRoutineDeadlineHour: 24, monthlyRoutineDay: 29, monthlyRoutineDeadlineHour: 9 },
      { weeklyRoutineDeadlineHour: null, monthlyRoutineDay: null, monthlyRoutineDeadlineHour: null }
    )
    expect(outcome).toEqual({
      ok: false,
      status: 400,
      error: '값을 확인해 주세요.',
      fieldErrors: {
        weeklyRoutineDeadlineHour: '0 이상 23 이하의 정수로 적어 주세요',
        monthlyRoutineDay: '1 이상 28 이하의 정수로 적어 주세요 (29일부터는 없는 달이 있어요)',
      },
    })
    expect(db.upserts).toEqual([])
    expect(db.rows).toEqual([])
  })

  it('글자로 온 숫자·소수·요일 범위 밖도 칸별 400이다', async () => {
    const outcome = await save(
      'empty_content',
      { minLiveCards: '3', nextWeekCheckFromWeekday: 0 },
      { minLiveCards: null, nextWeekCheckFromWeekday: null }
    )
    expect(outcome).toMatchObject({
      ok: false,
      status: 400,
      fieldErrors: { minLiveCards: '정수로 적어 주세요 (예: 3)', nextWeekCheckFromWeekday: '월요일부터 토요일 중에서 골라 주세요' },
    })
    const spike = await save('action_spike', { actionSpikeMultiplier: 2.55 }, { actionSpikeMultiplier: null })
    expect(spike).toMatchObject({ ok: false, status: 400, fieldErrors: { actionSpikeMultiplier: expect.stringContaining('소수 첫째 자리까지') } })
  })

  it('맞물림: 최소만 6으로 따로 보내도 저장된 값이나 기본값(최대 5)과 합쳐 400이고 두 칸 모두 오류다', async () => {
    const outcome = await save('empty_content', { minLiveCards: 6 }, { minLiveCards: null })
    expect(outcome).toEqual({
      ok: false,
      status: 400,
      error: '값을 확인해 주세요.',
      fieldErrors: {
        minLiveCards: '최소 장수는 최대 장수(5장)보다 클 수 없어요',
        maxLiveCards: '최대 장수는 최소 장수(6장)보다 작을 수 없어요',
      },
    })
    expect(db.upserts).toEqual([])
    // 저장된 최대(8)가 있으면 최소 6만 보내도 통과한다
    db.rows = [seed('maxLiveCards', 8)]
    expect(await save('empty_content', { minLiveCards: 6 }, { minLiveCards: null })).toMatchObject({ ok: true, changed: true })
  })

  it('맞물림: 기간 5·연속 6은 두 칸 모두 오류이고, 기간만 따로 줄여도(저장된 연속 일수 6과 부딪히면) 400이다', async () => {
    const both = await save('monotony', { monotonyWindowDays: 5, monotonySameShapeDays: 6 }, { monotonyWindowDays: null, monotonySameShapeDays: null })
    expect(both).toMatchObject({
      ok: false,
      status: 400,
      fieldErrors: {
        monotonySameShapeDays: '되돌아보는 기간(5일)보다 클 수 없어요',
        monotonyWindowDays: '되돌아보는 기간은 6일보다 짧을 수 없어요',
      },
    })
    db.rows = [seed('monotonySameShapeDays', 6)]
    const alone = await save('monotony', { monotonyWindowDays: 5 }, { monotonyWindowDays: null })
    expect(alone).toMatchObject({ ok: false, status: 400, fieldErrors: { monotonyWindowDays: '되돌아보는 기간은 6일보다 짧을 수 없어요' } })
  })
})

describe('saveSignalThresholds — 409', () => {
  it('행이 없다고 본 칸에 그사이 행이 생겼으면 409다', async () => {
    db.rows = [seed('approvalDeadlineHours', 60, { updated_at: T1 })]
    const outcome = await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: null })
    expect(outcome).toEqual({ ok: false, status: 409, error: THRESHOLD_CONFLICT_MESSAGE })
    expect(db.upserts).toEqual([])
    expect(rowOf('approvalDeadlineHours')?.value).toEqual({ value: 60 })
  })

  it('화면이 본 수정 시각이 낡았으면 409다', async () => {
    db.rows = [seed('approvalDeadlineHours', 60, { updated_at: T1 })]
    expect(await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: T0 })).toMatchObject({ ok: false, status: 409 })
  })

  it('화면이 행을 봤는데 그사이 지워졌으면 409다', async () => {
    expect(await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: T0 })).toMatchObject({ ok: false, status: 409 })
  })

  it('한 칸이라도 충돌이면 같은 요청의 다른 칸도 쓰지 않는다', async () => {
    db.rows = [seed('monthlyRoutineDay', 5, { updated_at: T1 })]
    const outcome = await save(
      'routine_failed',
      { weeklyRoutineDeadlineHour: 9, monthlyRoutineDay: 6 },
      { weeklyRoutineDeadlineHour: null, monthlyRoutineDay: T0 }
    )
    expect(outcome).toMatchObject({ ok: false, status: 409 })
    expect(db.upserts).toEqual([])
    expect(rowOf('weeklyRoutineDeadlineHour')).toBeUndefined()
  })

  it('요청에 없는 칸의 수정 시각은 보지 않는다', async () => {
    db.rows = [seed('missedScheduleMinutes', 10, { updated_at: T1 })]
    expect(await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: null })).toMatchObject({ ok: true })
  })
})

describe('saveSignalThresholds — 쓰기', () => {
  it('첫 저장은 기본값과 다른 값만 행으로 남기고 직전 값은 기본값이다(한 번의 upsert)', async () => {
    const outcome = await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: null })
    expect(outcome).toMatchObject({ ok: true, changed: true })
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0]).toEqual([
      {
        rule_key: 'approvalDeadlineHours',
        rule_group: 'signal',
        value: { value: 36 },
        level: 'warn',
        enabled: true,
        updated_at: expect.any(String),
        updated_by: ACTOR,
        previous_value: { value: 48 },
      },
    ])
    expect(db.deletes).toEqual([])
    const record = recordOf(outcome, 'approvalDeadlineHours')
    expect(record).toMatchObject({ value: 36, defaultValue: 48, changed: true, unreadable: false, previousValue: 48 })
    // 응답의 수정 시각은 DB가 돌려준 값이다(다음 저장의 expectedUpdatedAt이 되므로)
    expect(record.updatedAt).toBe(rowOf('approvalDeadlineHours')?.updated_at)
    expect(record.updatedAt).toMatch(/\+00:00$/)
    expect(JSON.stringify(outcome)).not.toContain(ACTOR)
  })

  it('응답은 카드의 모든 칸(읽기 전용 포함, 보이는 순서)이다', async () => {
    const outcome = await save('routine_failed', { weeklyRoutineDeadlineHour: 9 }, { weeklyRoutineDeadlineHour: null })
    if (!outcome.ok) throw new Error('저장 실패')
    expect(outcome.thresholds.map((record) => record.ruleKey)).toEqual([
      'weeklyRoutineWeekday',
      'weeklyRoutineDeadlineHour',
      'monthlyRoutineDay',
      'monthlyRoutineDeadlineHour',
      'routineCheckStartsAt',
    ])
    expect(outcome.thresholds.filter((record) => record.changed).map((record) => record.ruleKey)).toEqual(['weeklyRoutineDeadlineHour'])
  })

  it('기본값과 같은 값은 행을 만들지 않는다(바꾼 것이 없으니 changed: false)', async () => {
    const outcome = await save('approval_deadline', { approvalDeadlineHours: 48 }, { approvalDeadlineHours: null })
    expect(outcome).toMatchObject({ ok: true, changed: false })
    expect(db.calls.filter((call) => /upsert|delete/.test(call))).toEqual([])
    expect(db.rows).toEqual([])
    expect(recordOf(outcome, 'approvalDeadlineHours')).toMatchObject({ value: 48, changed: false, updatedAt: null })
  })

  it('이미 행이 있는 칸을 기본값으로 적어 저장하면 그 행을 지운다(한 번의 delete)', async () => {
    db.rows = [seed('approvalDeadlineHours', 36), seed('missedScheduleMinutes', 10)]
    const outcome = await save('approval_deadline', { approvalDeadlineHours: 48 }, { approvalDeadlineHours: T0 })
    expect(outcome).toMatchObject({ ok: true, changed: true })
    expect(db.deletes).toEqual([['approvalDeadlineHours']])
    expect(db.upserts).toEqual([])
    expect(rowOf('approvalDeadlineHours')).toBeUndefined()
    expect(rowOf('missedScheduleMinutes')).toBeDefined()
    expect(recordOf(outcome, 'approvalDeadlineHours')).toMatchObject({ value: 48, changed: false, updatedAt: null })
  })

  it('한 요청 안의 여러 칸: 바뀐 값은 한 번의 upsert로, 기본값이 된 값은 한 번의 delete로 쓴다', async () => {
    db.rows = [seed('monthlyRoutineDay', 5)]
    const outcome = await save(
      'routine_failed',
      { weeklyRoutineDeadlineHour: 9, weeklyRoutineWeekday: 4, monthlyRoutineDay: 1 },
      { weeklyRoutineDeadlineHour: null, weeklyRoutineWeekday: null, monthlyRoutineDay: T0 }
    )
    expect(outcome).toMatchObject({ ok: true, changed: true })
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].map((row) => row.rule_key).sort()).toEqual(['weeklyRoutineDeadlineHour', 'weeklyRoutineWeekday'])
    expect(db.deletes).toEqual([['monthlyRoutineDay']])
    expect(db.calls.filter((call) => call === 'ops_rules.upsert')).toHaveLength(1)
    expect(db.calls.filter((call) => call === 'ops_rules.delete')).toHaveLength(1)
  })

  it('이미 저장된 값을 바꾸면 직전 값에 이전 저장값을 남긴다', async () => {
    db.rows = [seed('approvalDeadlineHours', 36, { previous_value: { value: 48 } })]
    const outcome = await save('approval_deadline', { approvalDeadlineHours: 24 }, { approvalDeadlineHours: T0 })
    expect(outcome).toMatchObject({ ok: true, changed: true })
    expect(db.upserts[0][0]).toMatchObject({ value: { value: 24 }, previous_value: { value: 36 } })
    expect(recordOf(outcome, 'approvalDeadlineHours')).toMatchObject({ value: 24, previousValue: 36 })
  })

  it('저장된 값과 같으면 쓰지 않는다', async () => {
    db.rows = [seed('approvalDeadlineHours', 36)]
    const outcome = await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: T0 })
    expect(outcome).toMatchObject({ ok: true, changed: false })
    expect(db.calls.filter((call) => /upsert|delete/.test(call))).toEqual([])
  })

  it('읽을 수 없는 행(범위 밖)은 새 값으로 덮어쓰고 직전 값은 기본값이다', async () => {
    db.rows = [seed('minLiveCards', 0)]
    const outcome = await save('empty_content', { minLiveCards: 4 }, { minLiveCards: T0 })
    expect(outcome).toMatchObject({ ok: true, changed: true })
    expect(db.upserts[0][0]).toMatchObject({ value: { value: 4 }, previous_value: { value: 3 } })
    expect(recordOf(outcome, 'minLiveCards')).toMatchObject({ value: 4, unreadable: false })
  })

  it('배수·요일 값도 저장된다(소수 첫째 자리, 일요일 0)', async () => {
    expect(await save('action_spike', { actionSpikeMultiplier: 1.5 }, { actionSpikeMultiplier: null })).toMatchObject({ ok: true, changed: true })
    expect(rowOf('actionSpikeMultiplier')?.value).toEqual({ value: 1.5 })
    expect(await save('routine_failed', { weeklyRoutineWeekday: 0 }, { weeklyRoutineWeekday: null })).toMatchObject({ ok: true, changed: true })
    expect(rowOf('weeklyRoutineWeekday')?.value).toEqual({ value: 0 })
  })

  it('읽기 오류·upsert 오류·delete 오류는 500이고 로그만 남긴다', async () => {
    db.readError = 'down'
    expect(await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: null })).toMatchObject({ ok: false, status: 500 })
    db.readError = null
    db.upsertError = 'write down'
    const failed = await save('approval_deadline', { approvalDeadlineHours: 36 }, { approvalDeadlineHours: null })
    expect(failed).toEqual({ ok: false, status: 500, error: '기준값을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' })
    expect(JSON.stringify(failed)).not.toContain('write down')
    db.upsertError = null
    db.rows = [seed('approvalDeadlineHours', 36)]
    db.deleteError = 'delete down'
    expect(await save('approval_deadline', { approvalDeadlineHours: 48 }, { approvalDeadlineHours: T0 })).toMatchObject({ ok: false, status: 500 })
    expect(console.error).toHaveBeenCalled()
  })
})

describe('revertSignalThreshold', () => {
  const revert = (signalKey: string, thresholdKey: string, expectedUpdatedAt: unknown) =>
    revertSignalThreshold(client, { signalKey, thresholdKey, expectedUpdatedAt })

  it('그 칸의 행만 지우고 기본값 그대로가 된 칸을 돌려준다(다른 칸의 행은 남는다)', async () => {
    db.rows = [seed('approvalDeadlineHours', 36), seed('missedScheduleMinutes', 10)]
    const outcome = await revert('approval_deadline', 'approvalDeadlineHours', T0)
    expect(outcome).toMatchObject({
      ok: true,
      threshold: { ruleKey: 'approvalDeadlineHours', value: 48, changed: false, updatedAt: null, previousValue: null },
    })
    expect(db.deletes).toEqual([['approvalDeadlineHours']])
    expect(rowOf('missedScheduleMinutes')).toBeDefined()
    expect(rowOf('approvalDeadlineHours')).toBeUndefined()
  })

  it('수정 시각이 다르면 409이고 지우지 않는다. 행이 이미 없어도 409다', async () => {
    db.rows = [seed('approvalDeadlineHours', 36, { updated_at: T1 })]
    expect(await revert('approval_deadline', 'approvalDeadlineHours', T0)).toEqual({ ok: false, status: 409, error: THRESHOLD_CONFLICT_MESSAGE })
    expect(rowOf('approvalDeadlineHours')).toBeDefined()
    db.rows = []
    expect(await revert('approval_deadline', 'approvalDeadlineHours', T0)).toMatchObject({ ok: false, status: 409 })
  })

  it('읽을 수 없는 행도 되돌릴 수 있다', async () => {
    db.rows = [seed('minLiveCards', 0)]
    expect(await revert('empty_content', 'minLiveCards', T0)).toMatchObject({ ok: true })
    expect(rowOf('minLiveCards')).toBeUndefined()
  })

  it('읽기 전용 칸은 400, 낯선 신호·칸·다른 신호의 칸은 404, 수정 시각이 없으면 400이다', async () => {
    db.rows = [seed('routineCheckStartsAt', '2026-10-06T00:00:00+09:00')]
    expect(await revert('routine_failed', 'routineCheckStartsAt', T0)).toMatchObject({ ok: false, status: 400 })
    expect(rowOf('routineCheckStartsAt')).toBeDefined()
    expect(await revert('nope', 'approvalDeadlineHours', T0)).toMatchObject({ ok: false, status: 404 })
    expect(await revert('approval_deadline', 'nope', T0)).toMatchObject({ ok: false, status: 404 })
    expect(await revert('missed_schedule', 'approvalDeadlineHours', T0)).toMatchObject({ ok: false, status: 404 })
    expect(await revert('approval_deadline', 'approvalDeadlineHours', null)).toMatchObject({ ok: false, status: 400 })
    expect(await revert('approval_deadline', 'approvalDeadlineHours', '')).toMatchObject({ ok: false, status: 400 })
  })

  it('delete 오류는 500이고 로그만 남긴다', async () => {
    db.rows = [seed('approvalDeadlineHours', 36)]
    db.deleteError = 'delete down'
    const outcome = await revert('approval_deadline', 'approvalDeadlineHours', T0)
    expect(outcome).toEqual({ ok: false, status: 500, error: '기준값을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' })
    expect(console.error).toHaveBeenCalled()
  })
})
