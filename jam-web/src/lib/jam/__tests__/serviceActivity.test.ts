/**
 * lib/jam/serviceActivity — 서비스 활동 잼 지급과 지급 즉시 승급 모드 적립 (티켓 20261028_1735 2회, C2b 티켓 20261127_1730)
 *
 * 고정하는 것:
 * - 서비스 활동 종류 7종은 마이그레이션 300의 `service_jam_rules` CHECK와 같다.
 * - 이벤트 키는 `<서비스 kind>:<기존 원천 id>`다. 원천 id가 비면 던진다.
 * - 지급 RPC 인자는 `{ p_user_id, p_kind, p_event_key }`뿐이다.
 * - 지급량(granted) > 0이면 같은 이벤트 키로 `chapter_jam_apply`를 `p_promote: true`로 부른다(지급량만큼만, 재전송이어도). 지급 0(`rule_zero`·`capped` 0·`blocked`)이면 부르지 않는다.
 * - 새로 오른 챕터(`reachedChapters`)가 있으면 오름 처리(`processChapterRise`)를 `skipBadgeEvaluation: true`로 한 번 부르고, 판정 목록에 `chapter_reached`를 더한다. 오르지 않았으면 부르지 않는다.
 * - JAM! 행동 지표는 응답 뒤(`after`)에 판정한다. 잼 조건 주 키 4개는 새 지급이거나 오른 챕터가 있을 때 항상 들어가고, 캡슐 열기 지표는 더하지 않는다(캡슐 폐지).
 *   재전송은 새로 오른 챕터가 있을 때만 판정한다. 요청 범위 밖에서 `after`를 쓸 수 없으면 바로 기다려 판정한다.
 * - 챕터 보상 대기가 있으면 RPC를 부르지 않고 `{ granted: 0, blocked: true }`를 돌려준다. 대기를 읽지 못하면 막지 않고 진행한다.
 * - 이용 정지는 지급 RPC가 먼저 거절하므로({ ok: false }) 적립을 부르지 않는다.
 * - 던지지 않는다. RPC 오류·계약 밖 응답·예외는 `console.error`와 `engine_decision_log`(`service_jam_failed`)에 남기고 `{ ok: false }`다.
 *   이용 정지(`user_suspended`)는 실패 기록이 없다. 적립·오름 처리·판정이 던져도 지급 결과는 그대로다.
 * - 반환은 `{ ok, granted, duplicate, capped, blocked }`다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트와 목만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/jam/__tests__/serviceActivity.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { logMock, riseMock, evaluationMock, afterMock, pendingMock } = vi.hoisted(() => ({
  logMock: vi.fn(),
  riseMock: vi.fn(),
  evaluationMock: vi.fn(),
  afterMock: vi.fn(),
  pendingMock: vi.fn(),
}))

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/chapter/rise', () => ({ processChapterRise: (...args: unknown[]) => riseMock(...args) }))
vi.mock('@/lib/capsule/receive-block', () => ({ readPendingChapterRewardCount: (...args: unknown[]) => pendingMock(...args) }))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({ runJamActionEvaluation: (...args: unknown[]) => evaluationMock(...args) }))
vi.mock('next/server', () => ({ after: (...args: unknown[]) => afterMock(...args) }))

import {
  SERVICE_JAM_KINDS,
  awardServiceJam,
  serviceActivityEventKey,
  type ServiceJamKind,
} from '../serviceActivity'

const USER = '11111111-1111-4111-8111-111111111111'
const SOURCE = '33333333-3333-4333-8333-333333333333'

const GRANTED = { ok: true, granted: 5, ruleAmount: 5, capped: false, duplicate: false, dailyUsed: 5, weeklyUsed: 5, balance: 5 }

/**
 * 가짜 클라이언트. `rpc`는 지급 RPC(`jam_apply_service_activity`) 호출만, `chapterRpc`는 새 진행값 적립(`chapter_jam_apply`) 호출만 센다.
 * 적립 응답을 따로 정하지 않으면 보낸 양을 그대로 쌓았고 챕터는 오르지 않았다고 답한다.
 */
function fakeClient(
  result: { data: unknown; error: unknown } | (() => Promise<never>) = { data: GRANTED, error: null },
  chapterResult?: { data: unknown; error: unknown } | (() => Promise<never>)
) {
  type RpcFn = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  const rpc = vi.fn<RpcFn>(async () => (typeof result === 'function' ? result() : result))
  const chapterRpc = vi.fn<RpcFn>(async (_name, args) => {
    if (typeof chapterResult === 'function') return chapterResult()
    return chapterResult ?? { data: { ok: true, duplicate: false, applied: args.p_amount, reachedChapters: [] }, error: null }
  })
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => (name === 'chapter_jam_apply' ? chapterRpc(name, args) : rpc(name, args)),
  } as unknown as SupabaseClient
  return { client, rpc, chapterRpc }
}

/** 적립 응답: 새로 쌓았고 이 챕터들이 올랐다 */
const risen = (reachedChapters: number[], applied = 5) => ({ data: { ok: true, duplicate: false, applied, chapterNo: 2, chapterJam: 3, reachedChapters }, error: null })

const JAM_KEYS = ['jam_total_earned', 'jam_weekly_earned', 'jam_week_count', 'jam_week_streak']

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  riseMock.mockReset()
  riseMock.mockResolvedValue(undefined)
  pendingMock.mockReset()
  pendingMock.mockResolvedValue(0)
  evaluationMock.mockReset()
  evaluationMock.mockResolvedValue(undefined)
  // 기본은 요청 범위 안: 콜백을 받아 두기만 하고(응답 뒤에 돈다) 시험이 직접 돌린다
  afterMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('종류와 이벤트 키', () => {
  it('서비스 활동 종류 7종은 마이그레이션 300의 service_jam_rules CHECK와 같다', () => {
    const migration = readFileSync(path.resolve(__dirname, '../../../../supabase/migrations/300_capsule_auto_fill_expand.sql'), 'utf8')
    const start = migration.indexOf('CREATE TABLE IF NOT EXISTS public.service_jam_rules')
    expect(start).toBeGreaterThanOrEqual(0)
    const block = migration.slice(start, migration.indexOf('amount INTEGER', start))
    const kinds = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...kinds].sort()).toEqual([...SERVICE_JAM_KINDS].sort())
  })

  it('이벤트 키는 <서비스 kind>:<원천 id>다', () => {
    expect(serviceActivityEventKey('badge_earned', SOURCE)).toBe(`badge_earned:${SOURCE}`)
    expect(serviceActivityEventKey('collection_complete', 'x')).toBe('collection_complete:x')
  })

  it('다른 종류는 같은 원천 id여도 키가 다르다 (드랍과 픽업)', () => {
    expect(serviceActivityEventKey('drop', SOURCE)).not.toBe(serviceActivityEventKey('pickup', SOURCE))
  })

  it('원천 id가 비면 던진다', () => {
    expect(() => serviceActivityEventKey('drop', '')).toThrow()
    expect(() => serviceActivityEventKey('drop', '   ')).toThrow()
  })
})

describe('awardServiceJam — 지급과 응답', () => {
  it('RPC에 p_user_id·p_kind·p_event_key만 보내고 {ok, granted, duplicate, capped, blocked}를 돌려준다', async () => {
    const { client, rpc } = fakeClient()

    const result = await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('jam_apply_service_activity', { p_user_id: USER, p_kind: 'badge_earned', p_event_key: `badge_earned:${SOURCE}` })
    expect(result).toEqual({ ok: true, granted: 5, duplicate: false, capped: false, blocked: false })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('일부 지급(capped true, granted > 0)은 지급 양과 capped를 그대로 돌려준다', async () => {
    const { client } = fakeClient({ data: { ...GRANTED, granted: 20, ruleAmount: 30, capped: true }, error: null })

    await expect(awardServiceJam(client, { userId: USER, kind: 'collection_complete', sourceId: SOURCE })).resolves.toEqual({
      ok: true,
      granted: 20,
      duplicate: false,
      capped: true,
      blocked: false,
    })
  })
})

describe('awardServiceJam — 승급 모드 적립 (C2b)', () => {
  it('지급(granted > 0)이면 이벤트 키 그대로, 승급 모드(p_promote true)로 지급량만큼 적립한다', async () => {
    const { client, chapterRpc } = fakeClient()

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(chapterRpc).toHaveBeenCalledTimes(1)
    expect(chapterRpc).toHaveBeenCalledWith('chapter_jam_apply', {
      p_user_id: USER,
      p_amount: 5,
      p_event_key: `badge_earned:${SOURCE}`,
      p_promote: true,
    })
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each([
    ['rule_zero(규칙값 0)', { ok: true, granted: 0, reason: 'rule_zero', ruleAmount: 0 }],
    ['capped(상한에 걸려 지급 0)', { ok: true, granted: 0, capped: true, dailyUsed: 40 }],
    ['blocked(막혀서 거절)', { ok: true, granted: 0, blocked: true, ruleAmount: 20, duplicate: false }],
  ])('%s는 적립도 오름 처리도 판정도 하지 않는다', async (_label, data) => {
    const { client, chapterRpc } = fakeClient({ data, error: null })

    await awardServiceJam(client, { userId: USER, kind: 'mission_complete', sourceId: SOURCE })

    expect(chapterRpc).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
    expect(evaluationMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each([
    ['이용 정지', { data: { ok: false, error: 'user_suspended' }, error: null }],
    ['지급 RPC 오류', { data: null, error: { message: '지급 장애' } }],
    ['계약 밖 응답', { data: { granted: 5 }, error: null }],
  ])('지급이 안 됐으면(%s) 적립을 부르지 않는다 — 이용 정지 중에는 쌓이지 않는다', async (_label, result) => {
    const { client, chapterRpc } = fakeClient(result)

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(chapterRpc).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
  })

  it('적립이 이용 정지(user_suspended)로 건너뛰어져도 정상이라 기록하지 않고 오름 처리·챕터 지표도 없다', async () => {
    const { client } = fakeClient(undefined, { data: { ok: false, error: 'user_suspended' }, error: null })

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()

    expect(logMock).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
    expect(evaluationMock).toHaveBeenCalledWith(USER, JAM_KEYS)
  })

  it.each([
    ['하루 상한(40) 경계에서 12만 지급', 12],
    ['한 주 상한(100) 경계에서 1만 지급', 1],
  ])('상한에 걸려 일부만 지급되면(%s) 실제 지급량만큼만 쌓는다', async (_label, granted) => {
    const { client, chapterRpc } = fakeClient({ data: { ...GRANTED, granted, ruleAmount: 30, capped: true }, error: null })

    await awardServiceJam(client, { userId: USER, kind: 'collection_complete', sourceId: SOURCE })

    expect(chapterRpc).toHaveBeenCalledTimes(1)
    expect(chapterRpc).toHaveBeenCalledWith('chapter_jam_apply', expect.objectContaining({ p_amount: granted, p_promote: true }))
  })

  it('챕터를 시작하지 않은 유저(no_chapter)는 정상으로 건너뛰고 기록하지 않는다', async () => {
    const { client } = fakeClient(undefined, { data: { ok: false, error: 'no_chapter' }, error: null })

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(logMock).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
  })

  it.each([
    ['RPC 오류', { data: null, error: { message: '적립 장애' } }],
    ['예외', async () => Promise.reject(new Error('네트워크 끊김'))],
  ])('적립이 실패해도(%s) 지급 결과는 그대로이고 chapter_jam_apply_failed를 남기며 지표는 판정한다', async (_label, chapterResult) => {
    const { client } = fakeClient(undefined, chapterResult as never)

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({
      ok: true,
      granted: 5,
      duplicate: false,
      capped: false,
      blocked: false,
    })

    expect(riseMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_jam_apply_failed',
      USER,
      expect.objectContaining({ eventKey: `badge_earned:${SOURCE}`, amount: 5 })
    )
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()
    expect(evaluationMock).toHaveBeenCalledWith(USER, JAM_KEYS)
  })

  it('응답의 applied가 보낸 양과 다르면 chapter_jam_mismatch를 남기고 지급 결과는 그대로다', async () => {
    const { client } = fakeClient(undefined, { data: { ok: true, duplicate: false, applied: 3 }, error: null })

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toMatchObject({ ok: true, granted: 5 })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_jam_mismatch', USER, expect.objectContaining({ amount: 5, applied: 3 }))
  })
})

describe('awardServiceJam — 챕터 오름 처리', () => {
  it('오른 챕터가 있으면 오름 처리를 챕터 배지 판정 없이(skipBadgeEvaluation) 한 번 부른다', async () => {
    const { client } = fakeClient(undefined, risen([2, 3]))

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledWith({ userId: USER, reachedChapters: [2, 3] }, { skipBadgeEvaluation: true })
  })

  it('오르지 않았으면(reachedChapters 비어 있음) 오름 처리를 부르지 않는다', async () => {
    const { client } = fakeClient(undefined, risen([]))

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(riseMock).not.toHaveBeenCalled()
  })

  it('재전송(duplicate)이어도 지급량 > 0이면 같은 키로 적립을 다시 부르지만, 새로 오른 챕터가 없으면 오름 처리·판정은 없다', async () => {
    const { client, chapterRpc } = fakeClient(
      { data: { ok: true, granted: 5, duplicate: true }, error: null },
      { data: { ok: true, duplicate: true, applied: 0, reachedChapters: [] }, error: null }
    )

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(chapterRpc).toHaveBeenCalledWith('chapter_jam_apply', {
      p_user_id: USER,
      p_amount: 5,
      p_event_key: `badge_earned:${SOURCE}`,
      p_promote: true,
    })
    // 중복은 정상이라 기록이 없다
    expect(logMock).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
    expect(evaluationMock).not.toHaveBeenCalled()
  })

  it('재전송이어도 이전 적립이 실패했다가 이번에 메워져 챕터가 올랐으면 오름 처리와 판정을 한다', async () => {
    const { client } = fakeClient({ data: { ok: true, granted: 5, duplicate: true }, error: null }, risen([2]))

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(riseMock).toHaveBeenCalledWith({ userId: USER, reachedChapters: [2] }, { skipBadgeEvaluation: true })
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()
    expect(evaluationMock).toHaveBeenCalledWith(USER, [...JAM_KEYS, 'chapter_reached'])
  })

  it('오름 처리가 던져도 지급 결과는 그대로이고 지표 판정은 한다', async () => {
    riseMock.mockRejectedValue(new Error('오름 장애'))
    const { client } = fakeClient(undefined, risen([2]))

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({
      ok: true,
      granted: 5,
      duplicate: false,
      capped: false,
      blocked: false,
    })
    expect(console.error).toHaveBeenCalled()
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()
    expect(evaluationMock).toHaveBeenCalledWith(USER, [...JAM_KEYS, 'chapter_reached'])
  })
})

describe('awardServiceJam — JAM! 행동 지표 판정', () => {
  it('오른 챕터가 있으면 응답 뒤(after)에 잼 조건 4개 + chapter_reached를 한 번 판정한다 — 캡슐 열기 지표는 없다', async () => {
    const { client } = fakeClient(undefined, risen([2]))

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(afterMock).toHaveBeenCalledTimes(1)
    // after가 콜백을 받기만 했으므로 응답이 나가기 전에는 판정하지 않는다
    expect(evaluationMock).not.toHaveBeenCalled()
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()
    expect(evaluationMock).toHaveBeenCalledTimes(1)
    expect(evaluationMock).toHaveBeenCalledWith(USER, [...JAM_KEYS, 'chapter_reached'])
  })

  it('챕터가 오르지 않아도 새 지급이면 잼 조건 4개는 판정한다 (서비스 활동 잼이 잼 조건에 합산된다)', async () => {
    const { client } = fakeClient()

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(afterMock).toHaveBeenCalledTimes(1)
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()
    expect(evaluationMock).toHaveBeenCalledTimes(1)
    expect(evaluationMock).toHaveBeenCalledWith(USER, JAM_KEYS)
  })

  it('일부 지급(capped인데 granted > 0)도 잼 조건 4개를 판정한다', async () => {
    const { client } = fakeClient({ data: { ...GRANTED, granted: 7, capped: true }, error: null })

    await awardServiceJam(client, { userId: USER, kind: 'collection_complete', sourceId: SOURCE })
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()

    expect(evaluationMock).toHaveBeenCalledWith(USER, JAM_KEYS)
  })

  it('요청 범위 밖이라 after를 쓸 수 없으면(시험·배치) 바로 기다려 판정한다', async () => {
    afterMock.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope')
    })
    const { client } = fakeClient(undefined, risen([2]))

    const result = await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(result).toMatchObject({ ok: true, granted: 5 })
    expect(evaluationMock).toHaveBeenCalledTimes(1)
    expect(evaluationMock).toHaveBeenCalledWith(USER, [...JAM_KEYS, 'chapter_reached'])
  })

  it('판정이 던져도(예외) 지급 결과는 그대로다', async () => {
    afterMock.mockImplementation(() => {
      throw new Error('outside')
    })
    evaluationMock.mockRejectedValue(new Error('판정 장애'))
    const { client } = fakeClient(undefined, risen([2]))

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toMatchObject({ ok: true, granted: 5 })
  })
})

describe('awardServiceJam — 챕터 보상 대기가 있으면 지급을 막는다', () => {
  it('대기가 있으면 RPC·적립·판정 없이 지급 0 blocked 결과를 돌려주고 기록하지 않는다', async () => {
    pendingMock.mockResolvedValue(2)
    const { client, rpc, chapterRpc } = fakeClient()

    const result = await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(pendingMock).toHaveBeenCalledWith(client, USER)
    expect(result).toEqual({ ok: true, granted: 0, duplicate: false, capped: false, blocked: true })
    expect(rpc).not.toHaveBeenCalled()
    expect(chapterRpc).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('대기가 0이면 막지 않고 지급한다', async () => {
    pendingMock.mockResolvedValue(0)
    const { client, rpc } = fakeClient()

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toMatchObject({ ok: true, granted: 5, blocked: false })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('대기를 읽지 못하면(오류) 막지 않고 진행하고 console.error만 남긴다', async () => {
    pendingMock.mockRejectedValue(new Error('chapter_reward_grants 대기 조회 실패'))
    const { client, rpc, chapterRpc } = fakeClient()

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toMatchObject({ ok: true, granted: 5, blocked: false })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(chapterRpc).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })
})

describe('awardServiceJam — 실패는 던지지 않고 기록한다', () => {
  it('RPC 오류면 {ok:false}이고 console.error와 service_jam_failed를 남기며 채우지 않는다', async () => {
    const { client } = fakeClient({ data: null, error: { message: '지급 장애' } })

    const result = await awardServiceJam(client, { userId: USER, kind: 'combine_success', sourceId: SOURCE })

    expect(result).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'service_jam_failed',
      USER,
      expect.objectContaining({ kind: 'combine_success', sourceId: SOURCE, error: expect.stringContaining('지급 장애') })
    )
  })

  it.each([
    ['null', null],
    ['배열', [GRANTED]],
    ['ok 없음', { granted: 5 }],
    ['granted가 문자열', { ok: true, granted: '5' }],
    ['granted가 음수', { ok: true, granted: -1 }],
    ['granted가 소수', { ok: true, granted: 1.5 }],
  ])('계약 밖 응답(%s)이면 {ok:false}이고 기록하며 채우지 않는다', async (_label, data) => {
    const { client } = fakeClient({ data, error: null })

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith('points', 'service_jam_failed', USER, expect.objectContaining({ kind: 'badge_earned', sourceId: SOURCE }))
  })

  it('invalid_input 거절은 {ok:false}이고 기록한다', async () => {
    const { client } = fakeClient({ data: { ok: false, error: 'invalid_input' }, error: null })

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith('points', 'service_jam_failed', USER, expect.objectContaining({ error: expect.stringContaining('invalid_input') }))
  })

  it('이용 정지(user_suspended)는 {ok:false}이지만 실패 기록은 없고 채우지 않는다', async () => {
    const { client } = fakeClient({ data: { ok: false, error: 'user_suspended' }, error: null })

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({ ok: false })

    expect(logMock).not.toHaveBeenCalled()
  })

  it('RPC 호출이 예외로 거부돼도 던지지 않는다', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('네트워크 끊김')
    })

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith('points', 'service_jam_failed', USER, expect.objectContaining({ error: expect.stringContaining('네트워크 끊김') }))
  })

  it('원천 id가 비면 RPC를 부르지 않고 기록한 뒤 {ok:false}다', async () => {
    const { client, rpc } = fakeClient()

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: '' })).resolves.toEqual({ ok: false })

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'service_jam_failed', USER, expect.objectContaining({ kind: 'badge_earned' }))
  })

  it('실패 기록 자체가 거부돼도 던지지 않는다', async () => {
    logMock.mockRejectedValue(new Error('기록 장애'))
    const { client } = fakeClient({ data: null, error: { message: '지급 장애' } })

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({ ok: false })
  })
})

describe('서비스 활동 종류 타입', () => {
  it('7종이 전부 RPC 인자로 그대로 나간다', async () => {
    for (const kind of SERVICE_JAM_KINDS) {
      const { client, rpc } = fakeClient()
      await awardServiceJam(client, { userId: USER, kind: kind as ServiceJamKind, sourceId: SOURCE })
      expect(rpc).toHaveBeenCalledWith('jam_apply_service_activity', { p_user_id: USER, p_kind: kind, p_event_key: `${kind}:${SOURCE}` })
    }
  })
})
