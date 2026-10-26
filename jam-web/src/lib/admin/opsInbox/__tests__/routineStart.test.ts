/**
 * 루틴 「시작」 기록 (티켓 20261026_2032)
 *
 * 지키는 것:
 * 1. 본문 검증: run_key·author·agents 필수, week 형식, 길이·개수 상한
 * 2. 멈춤 판정: 시작 후 3시간이 지나도 묶음이 이어지지 않으면 멈춤, 3시간 안이거나 이어졌으면 아니다
 * 3. 저장: 같은 run_key 재전송은 덮어쓰지 않는다
 * 4. 짝짓기: 같은 run_key의 시작 기록에 묶음이 이어지고, 시작 기록이 없거나 키가 이상하면 아무것도 하지 않으며 절대 던지지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsInbox/__tests__/routineStart.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isRoutineStalled,
  linkRoutineStartToBundle,
  recordRoutineStart,
  validateRoutineStart,
} from '../routineStart'
import { MAX_ROUTINE_AGENTS, MAX_RUN_KEY_CHARS, OPS_ROUTINE_STALL_HOURS } from '../constants'

type Row = Record<string, unknown>

/** ops_routine_starts 한 테이블만 흉내 내는 가짜 서비스 클라이언트. */
function fakeService(rows: Row[], options: { insertError?: { code?: string; message: string }; throwOnUpdate?: boolean } = {}) {
  return {
    from(table: string) {
      expect(table).toBe('ops_routine_starts')
      return {
        insert(payload: Row) {
          return {
            select: () => ({
              single: async () => {
                if (options.insertError) return { data: null, error: options.insertError }
                if (rows.some((r) => r.run_key === payload.run_key)) {
                  return { data: null, error: { code: '23505', message: 'duplicate key value' } }
                }
                const row = { id: `id-${rows.length + 1}`, bundle_id: null, ...payload }
                rows.push(row)
                return { data: { id: row.id }, error: null }
              },
            }),
          }
        },
        update(payload: Row) {
          const filters: Array<(r: Row) => boolean> = []
          const query = {
            eq(col: string, val: unknown) {
              filters.push((r) => r[col] === val)
              return query
            },
            is(col: string, val: unknown) {
              filters.push((r) => r[col] === val)
              return query
            },
            then(resolve: (v: { error: null }) => unknown) {
              if (options.throwOnUpdate) throw new Error('네트워크 끊김')
              for (const row of rows.filter((r) => filters.every((f) => f(r)))) Object.assign(row, payload)
              return Promise.resolve({ error: null }).then(resolve)
            },
          }
          return query
        },
      }
    },
  } as never
}

const VALID = { run_key: 'weekly-2026-W44-a', week: '2026-W44', author: '윤진', agents: ['윤진', '윈터', '이든'] }

describe('validateRoutineStart', () => {
  it('올바른 본문은 정리된 값으로 통과한다', () => {
    const result = validateRoutineStart({ ...VALID, run_key: '  weekly-2026-W44-a  ' })
    expect(result).toEqual({ ok: true, value: VALID })
  })

  it('week는 선택이고 없으면 null이다', () => {
    const rest = { run_key: VALID.run_key, author: VALID.author, agents: VALID.agents }
    expect(validateRoutineStart(rest)).toEqual({ ok: true, value: { ...rest, week: null } })
  })

  it('agents는 빈 배열도 받는다', () => {
    expect(validateRoutineStart({ ...VALID, agents: [] })).toEqual({ ok: true, value: { ...VALID, agents: [] } })
  })

  it.each([null, 'text', 12, ['a']])('객체가 아닌 본문 %j는 거부한다', (raw) => {
    expect(validateRoutineStart(raw)).toMatchObject({ ok: false })
  })

  it.each([
    ['run_key 없음', { ...VALID, run_key: undefined }, 'run_key: 필수'],
    ['run_key 숫자', { ...VALID, run_key: 7 }, 'run_key: 비어 있지'],
    ['run_key 공백', { ...VALID, run_key: '   ' }, 'run_key: 비어 있지'],
    ['run_key 줄바꿈', { ...VALID, run_key: 'a\nb' }, 'run_key: 줄바꿈'],
    ['run_key 너무 김', { ...VALID, run_key: 'k'.repeat(MAX_RUN_KEY_CHARS + 1) }, `run_key: ${MAX_RUN_KEY_CHARS}자`],
    ['author 없음', { ...VALID, author: undefined }, 'author: 필수'],
    ['author 숫자', { ...VALID, author: 3 }, 'author: 비어 있지'],
    ['week 형식 틀림', { ...VALID, week: '2026-44' }, 'week: YYYY-Www'],
    ['week 54주', { ...VALID, week: '2026-W54' }, 'week: YYYY-Www'],
    ['agents 없음', { ...VALID, agents: undefined }, 'agents: 필수'],
    ['agents 배열 아님', { ...VALID, agents: '윤진' }, 'agents: 배열'],
    ['agents 너무 많음', { ...VALID, agents: Array.from({ length: MAX_ROUTINE_AGENTS + 1 }, (_, i) => `a${i}`) }, `agents: ${MAX_ROUTINE_AGENTS}개`],
    ['agents 항목이 문자열 아님', { ...VALID, agents: ['윤진', 3] }, 'agents[1]'],
    ['agents 항목이 빈 문자열', { ...VALID, agents: [''] }, 'agents[0]'],
  ])('%s → 거부', (_name, raw, expected) => {
    const result = validateRoutineStart(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.includes(expected))).toBe(true)
  })

  it('경계값은 통과한다(run_key 64자, agents 8개)', () => {
    const agents = Array.from({ length: MAX_ROUTINE_AGENTS }, (_, i) => `a${i}`)
    const result = validateRoutineStart({ ...VALID, run_key: 'k'.repeat(MAX_RUN_KEY_CHARS), agents })
    expect(result.ok).toBe(true)
  })

  it('틀린 곳을 한꺼번에 알려 준다', () => {
    const result = validateRoutineStart({ run_key: 1, author: 2, agents: 3 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(3)
  })
})

describe('isRoutineStalled', () => {
  const started = new Date('2026-10-26T00:00:00Z')
  const hoursLater = (h: number, extraMs = 0) => new Date(started.getTime() + h * 3_600_000 + extraMs)

  it('기준 시간 상수는 3시간이다', () => {
    expect(OPS_ROUTINE_STALL_HOURS).toBe(3)
  })

  it('3시간 안이고 묶음이 없으면 진행 중이다(멈춤 아님)', () => {
    expect(isRoutineStalled(started, null, hoursLater(0))).toBe(false)
    expect(isRoutineStalled(started, null, hoursLater(2.99))).toBe(false)
  })

  it('정확히 3시간이 된 순간은 아직 멈춤이 아니다', () => {
    expect(isRoutineStalled(started, null, hoursLater(3))).toBe(false)
  })

  it('3시간이 지났는데 묶음이 없으면 멈춤이다', () => {
    expect(isRoutineStalled(started, null, hoursLater(3, 1))).toBe(true)
    expect(isRoutineStalled(started, undefined, hoursLater(10))).toBe(true)
    expect(isRoutineStalled(started, '', hoursLater(10))).toBe(true)
  })

  it('3시간이 지나도 묶음이 이어져 있으면 멈춤이 아니다', () => {
    expect(isRoutineStalled(started, 'bundle-uuid', hoursLater(10))).toBe(false)
  })

  it('시작 시각을 문자열(ISO)로 받아도 같게 판정한다', () => {
    expect(isRoutineStalled(started.toISOString(), null, hoursLater(4))).toBe(true)
    expect(isRoutineStalled(started.toISOString(), null, hoursLater(1))).toBe(false)
  })

  it('시각을 읽을 수 없으면 멈춤으로 판정하지 않는다', () => {
    expect(isRoutineStalled('not-a-date', null, hoursLater(10))).toBe(false)
    expect(isRoutineStalled(started, null, new Date('invalid'))).toBe(false)
  })

  it('기준 시간을 인자로 바꿔 읽을 수 있다', () => {
    expect(isRoutineStalled(started, null, hoursLater(2), 1)).toBe(true)
  })
})

describe('recordRoutineStart', () => {
  afterEach(() => vi.restoreAllMocks())

  it('새 키는 저장한다', async () => {
    const rows: Row[] = []
    const result = await recordRoutineStart(fakeService(rows), VALID)
    expect(result).toEqual({ ok: true, created: true, id: 'id-1' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ run_key: VALID.run_key, author: '윤진', week: '2026-W44', agents: VALID.agents })
  })

  it('같은 키를 다시 보내면 덮어쓰지 않고 받은 것으로 친다', async () => {
    const rows: Row[] = []
    await recordRoutineStart(fakeService(rows), VALID)
    const again = await recordRoutineStart(fakeService(rows), { ...VALID, author: '다른이', agents: [] })
    expect(again).toEqual({ ok: true, created: false, id: null })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ author: '윤진', agents: VALID.agents })
  })

  it('저장 오류는 ok:false이고 오류 원문은 로그에만 남는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordRoutineStart(fakeService([], { insertError: { message: 'secret detail' } }), VALID)
    expect(result).toEqual({ ok: false })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(spy).toHaveBeenCalled()
  })
})

describe('linkRoutineStartToBundle — 시작 기록과 묶음이 이어진다', () => {
  afterEach(() => vi.restoreAllMocks())

  it('같은 run_key의 시작 기록에 묶음 ID를 채운다', async () => {
    const rows: Row[] = []
    const service = fakeService(rows)
    await recordRoutineStart(service, VALID)
    expect(rows[0].bundle_id).toBeNull()

    await linkRoutineStartToBundle(service, VALID.run_key, 'bundle-uuid-1')
    expect(rows[0].bundle_id).toBe('bundle-uuid-1')
  })

  it('이미 이어진 기록은 바꾸지 않는다', async () => {
    const rows: Row[] = [{ id: 'a', run_key: 'k1', bundle_id: 'first' }]
    await linkRoutineStartToBundle(fakeService(rows), 'k1', 'second')
    expect(rows[0].bundle_id).toBe('first')
  })

  it('다른 run_key의 기록은 건드리지 않는다(주차·작성자로 짐작해 잇지 않는다)', async () => {
    const rows: Row[] = [{ id: 'a', run_key: 'k1', week: '2026-W44', author: '윤진', bundle_id: null }]
    await linkRoutineStartToBundle(fakeService(rows), 'k2', 'bundle-uuid-1')
    expect(rows[0].bundle_id).toBeNull()
  })

  it('시작 기록이 없는 제출은 아무 일도 없다', async () => {
    const rows: Row[] = []
    await expect(linkRoutineStartToBundle(fakeService(rows), 'k1', 'bundle-uuid-1')).resolves.toBeUndefined()
    expect(rows).toEqual([])
  })

  it.each([undefined, null, 7, '', '   ', 'k'.repeat(MAX_RUN_KEY_CHARS + 1)])('run_key %j는 DB를 부르지 않는다', async (runKey) => {
    const service = { from: vi.fn() } as never
    await linkRoutineStartToBundle(service, runKey, 'bundle-uuid-1')
    expect((service as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('DB가 예외를 던져도 던지지 않고 로그만 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(linkRoutineStartToBundle(fakeService([{ run_key: 'k1', bundle_id: null }], { throwOnUpdate: true }), 'k1', 'b')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })
})
