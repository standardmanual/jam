/**
 * `readRealSteps`·`isRealStepsDone` — 퀘스트 실제 2단계 읽기 (티켓 20261021_1248 1회, 2단계로 축소 20261028_1738 1회, 운영 로직 2.2절)
 *
 * 고정하는 것:
 * - ① `strava_activities`에 `filter_reason IS NULL`인 그 유저의 행, ② `inventory_item_events`에 `event_type = 'unlocked'`이고
 *   그 유저의 행이 1건 이상이면 각각 마친 것이다. 두 단계는 서로 독립이다(순서 무관).
 * - `capsule_opens`는 더 이상 읽지 않는다(캡슐 열기는 단계가 아니다).
 * - 하나라도 읽지 못하면 «아직 안 했다»로 돌려주지 않고 던진다(틀린 챕터 시작·틀린 체크를 막는다).
 * - 순수 판정 `isRealStepsDone`은 둘이 모두 참일 때만 참이다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/real-steps.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isRealStepsDone, readRealSteps, type RealStepsProgress } from '../real-steps'

const USER_ID = 'user-real-steps-test'

type TableName = 'strava_activities' | 'capsule_opens' | 'inventory_item_events'

interface FakeTable {
  rows?: unknown[]
  error?: { message: string }
}

/** 표마다 결과를 정하는 가짜 클라이언트. 걸린 조건(eq·is)과 `limit`을 표별로 기록한다. */
interface CallRecord {
  eq: Array<[string, unknown]>
  is: Array<[string, unknown]>
  limit: number | null
}

function makeFake(tables: Partial<Record<TableName, FakeTable>>) {
  const calls: Record<string, CallRecord> = {}
  const from = (table: string) => {
    const spec = tables[table as TableName] ?? {}
    const record: CallRecord = { eq: [], is: [], limit: null }
    calls[table] = record
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = (column: string, value: unknown) => {
      record.eq.push([column, value])
      return chain
    }
    chain.is = (column: string, value: unknown) => {
      record.is.push([column, value])
      return chain
    }
    chain.limit = (n: number) => {
      record.limit = n
      return chain
    }
    chain.then = (resolve: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
      resolve(spec.error ? { data: null, error: spec.error } : { data: spec.rows ?? [], error: null })
    return chain
  }
  return { supabase: { from } as unknown as SupabaseClient, calls }
}

const ROW = [{ id: 'row-1' }]

describe('isRealStepsDone', () => {
  const cases: Array<[RealStepsProgress, boolean]> = [
    [{ sync: true, lockedOpened: true }, true],
    [{ sync: false, lockedOpened: true }, false],
    [{ sync: true, lockedOpened: false }, false],
    [{ sync: false, lockedOpened: false }, false],
  ]
  for (const [steps, expected] of cases) {
    it(`sync=${steps.sync} locked=${steps.lockedOpened} → ${expected}`, () => {
      expect(isRealStepsDone(steps)).toBe(expected)
    })
  }
})

describe('readRealSteps — 단계별로 읽는다', () => {
  it('두 표에 행이 모두 있으면 두 단계가 모두 참이다', async () => {
    const { supabase } = makeFake({ strava_activities: { rows: ROW }, inventory_item_events: { rows: ROW } })

    const steps = await readRealSteps(supabase, USER_ID)

    expect(steps).toEqual({ sync: true, lockedOpened: true })
    expect(isRealStepsDone(steps)).toBe(true)
  })

  it('행이 하나도 없으면 두 단계가 모두 거짓이다', async () => {
    const { supabase } = makeFake({})

    expect(await readRealSteps(supabase, USER_ID)).toEqual({ sync: false, lockedOpened: false })
  })

  it('두 단계는 서로 독립이다 — ②만 마쳐도(동기화로 받은 잠긴 개체를 연 경우) ②만 참이다', async () => {
    const { supabase } = makeFake({ inventory_item_events: { rows: ROW } })

    expect(await readRealSteps(supabase, USER_ID)).toEqual({ sync: false, lockedOpened: true })
  })

  it('①만 마쳤으면 ②가 거짓이라 완료가 아니다', async () => {
    const { supabase } = makeFake({ strava_activities: { rows: ROW } })

    const steps = await readRealSteps(supabase, USER_ID)

    expect(steps).toEqual({ sync: true, lockedOpened: false })
    expect(isRealStepsDone(steps)).toBe(false)
  })

  it('캡슐 열기 기록은 판정에 쓰이지 않는다 — capsule_opens에 행이 있어도 ①②가 비면 둘 다 거짓이다', async () => {
    const { supabase, calls } = makeFake({ capsule_opens: { rows: ROW } })

    const steps = await readRealSteps(supabase, USER_ID)

    expect(steps).toEqual({ sync: false, lockedOpened: false })
    expect(calls.capsule_opens).toBeUndefined()
  })
})

describe('readRealSteps — 조건', () => {
  it('① 걸러진 활동은 세지 않는다 — user_id와 filter_reason IS NULL 조건을 건다', async () => {
    const { supabase, calls } = makeFake({})

    await readRealSteps(supabase, USER_ID)

    expect(calls.strava_activities.eq).toEqual([['user_id', USER_ID]])
    expect(calls.strava_activities.is).toEqual([['filter_reason', null]])
  })

  it('② 그 유저가 연(unlocked) 기록만 본다 — 채우기(filled)·받음(received) 이벤트는 세지 않는다', async () => {
    const { supabase, calls } = makeFake({})

    await readRealSteps(supabase, USER_ID)

    expect(calls.inventory_item_events.eq).toEqual([
      ['user_id', USER_ID],
      ['event_type', 'unlocked'],
    ])
  })

  it('두 표 모두 한 건만 읽는다(있는지만 본다)', async () => {
    const { supabase, calls } = makeFake({})

    await readRealSteps(supabase, USER_ID)

    expect(calls.strava_activities.limit).toBe(1)
    expect(calls.inventory_item_events.limit).toBe(1)
  })
})

describe('readRealSteps — 읽지 못하면 던진다', () => {
  const cases: Array<[TableName, string]> = [
    ['strava_activities', '첫 동기화'],
    ['inventory_item_events', '잠긴 개체 열기'],
  ]
  for (const [table, label] of cases) {
    it(`${table} 읽기 오류는 «아직 안 했다»가 아니라 예외다 (${label})`, async () => {
      const others = Object.fromEntries(
        (['strava_activities', 'inventory_item_events'] as TableName[])
          .filter((name) => name !== table)
          .map((name) => [name, { rows: ROW }])
      )
      const { supabase } = makeFake({ ...others, [table]: { error: { message: 'connection reset' } } })

      await expect(readRealSteps(supabase, USER_ID)).rejects.toThrow(`실제 단계 읽기 실패 (${label}): connection reset`)
    })
  }
})
