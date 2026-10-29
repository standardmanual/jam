/**
 * lib/jam/serviceActivity — 서비스 활동 잼 지급과 지급 즉시 채움 (티켓 20261028_1735 2회)
 *
 * 고정하는 것:
 * - 매핑: 챕터 점수 종류 12종 → 서비스 활동 종류. 컬렉션 완성 4등급은 `collection_complete` 하나로 모이고, `jam_earned`·`capsule_open`은 대상이 아니다(null).
 *   서비스 활동 종류 7종은 마이그레이션 300의 `service_jam_rules` CHECK와 같다.
 * - 이벤트 키는 `<서비스 kind>:<기존 원천 id>`다. 원천 id가 비면 던진다.
 * - RPC 인자는 `{ p_user_id, p_kind, p_event_key }`뿐이다.
 * - 지급(granted > 0, duplicate 아님)일 때만 곧바로 자동 채움(`runSyncCapsuleAutoFill`)을 잇는다. 일부 지급(capped)도 채운다.
 *   `duplicate`(재전송)·`rule_zero`(규칙값 0)·`capped`(지급 0)는 채움을 부르지 않는다.
 * - 지급(granted > 0, duplicate 아님)이면 JAM! 행동 지표를 응답 뒤(`after`)에 판정한다. 잼 조건 주 키 4개(`jam_total_earned`·`jam_weekly_earned`·`jam_week_count`·`jam_week_streak`,
 *   서비스 활동 잼이 잼 조건에 합산된다, 티켓 20261028_1736)는 항상 들어가고, 채움 결과에 열린 캡슐이 있으면 `capsule_open_count`·`other_tribe_item_kinds_count` + `chapter_reached`,
 *   오름만 있으면 `chapter_reached`를 더한다. 채움이 던져도 잼 조건 4개는 판정한다. 요청 범위 밖에서 `after`를 쓸 수 없으면 바로 기다려 판정한다.
 * - 던지지 않는다. RPC 오류·계약 밖 응답·예외는 `console.error`와 `engine_decision_log`(`service_jam_failed`)에 남기고 `{ ok: false }`다.
 *   이용 정지(`user_suspended`)는 지급하지 않을 뿐 실패 기록이 없다. 채움·판정이 던져도 지급 결과는 그대로다.
 * - 반환은 `{ ok, granted, duplicate, capped }`다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트와 목만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/jam/__tests__/serviceActivity.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAPTER_SCORE_KINDS } from '@/lib/chapter/kinds'

const { logMock, autoFillMock, evaluationMock, afterMock } = vi.hoisted(() => ({
  logMock: vi.fn(),
  autoFillMock: vi.fn(),
  evaluationMock: vi.fn(),
  afterMock: vi.fn(),
}))

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/capsule/sync-auto-fill', () => ({ runSyncCapsuleAutoFill: (...args: unknown[]) => autoFillMock(...args) }))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({ runJamActionEvaluation: (...args: unknown[]) => evaluationMock(...args) }))
vi.mock('next/server', () => ({ after: (...args: unknown[]) => afterMock(...args) }))

import {
  SERVICE_JAM_KINDS,
  awardServiceJam,
  serviceActivityEventKey,
  serviceJamKindOf,
  type ServiceJamKind,
} from '../serviceActivity'

const USER = '11111111-1111-4111-8111-111111111111'
const SOURCE = '33333333-3333-4333-8333-333333333333'

const GRANTED = { ok: true, granted: 5, ruleAmount: 5, capped: false, duplicate: false, dailyUsed: 5, weeklyUsed: 5, balance: 5 }

function fakeClient(result: { data: unknown; error: unknown } | (() => Promise<never>) = { data: GRANTED, error: null }) {
  const rpc = vi.fn(async () => (typeof result === 'function' ? result() : result))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

const JAM_KEYS = ['jam_total_earned', 'jam_weekly_earned', 'jam_week_count', 'jam_week_streak']

const fillStep = (extra: Partial<{ opened: boolean; chapterRose: boolean }> = {}) => ({
  autoFill: {},
  opened: false,
  chapterRose: false,
  unseenRecorded: true,
  ...extra,
})

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  autoFillMock.mockReset()
  autoFillMock.mockResolvedValue(fillStep())
  evaluationMock.mockReset()
  evaluationMock.mockResolvedValue(undefined)
  // 기본은 요청 범위 안: 콜백을 받아 두기만 하고(응답 뒤에 돈다) 시험이 직접 돌린다
  afterMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('매핑과 이벤트 키', () => {
  it('챕터 점수 종류 → 서비스 활동 종류, 컬렉션 완성 4등급은 하나로 모인다', () => {
    expect(serviceJamKindOf('locked_item_badge_open')).toBe('locked_unlock')
    expect(serviceJamKindOf('badge_receive')).toBe('badge_earned')
    expect(serviceJamKindOf('mix_success')).toBe('combine_success')
    expect(serviceJamKindOf('mission_complete')).toBe('mission_complete')
    for (const kind of ['collection_complete_common', 'collection_complete_rare', 'collection_complete_epic', 'collection_complete_mystic'] as const) {
      expect(serviceJamKindOf(kind)).toBe('collection_complete')
    }
    expect(serviceJamKindOf('drop')).toBe('drop')
    expect(serviceJamKindOf('pickup')).toBe('pickup')
  })

  it('모은 잼(jam_earned)·캡슐 열기(capsule_open)는 대상이 아니다(null)', () => {
    expect(serviceJamKindOf('jam_earned')).toBeNull()
    expect(serviceJamKindOf('capsule_open')).toBeNull()
  })

  it('챕터 점수 종류 12종 모두에 답이 있고, 나온 서비스 활동 종류는 7종 안이다', () => {
    const mapped = CHAPTER_SCORE_KINDS.map((kind) => serviceJamKindOf(kind))
    expect(mapped.filter((k) => k === null)).toHaveLength(2)
    for (const kind of mapped) if (kind !== null) expect(SERVICE_JAM_KINDS).toContain(kind)
    // 서비스 활동 종류 7종이 매핑에서 빠짐없이 나온다
    expect(new Set(mapped.filter((k) => k !== null))).toEqual(new Set(SERVICE_JAM_KINDS))
  })

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
  it('RPC에 p_user_id·p_kind·p_event_key만 보내고 {ok, granted, duplicate, capped}를 돌려준다', async () => {
    const { client, rpc } = fakeClient()

    const result = await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('jam_apply_service_activity', { p_user_id: USER, p_kind: 'badge_earned', p_event_key: `badge_earned:${SOURCE}` })
    expect(result).toEqual({ ok: true, granted: 5, duplicate: false, capped: false })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('일부 지급(capped true, granted > 0)은 지급 양과 capped를 그대로 돌려준다', async () => {
    const { client } = fakeClient({ data: { ...GRANTED, granted: 20, ruleAmount: 30, capped: true }, error: null })

    await expect(awardServiceJam(client, { userId: USER, kind: 'collection_complete', sourceId: SOURCE })).resolves.toEqual({
      ok: true,
      granted: 20,
      duplicate: false,
      capped: true,
    })
  })
})

describe('awardServiceJam — 지급 즉시 채움', () => {
  it('지급(granted > 0, duplicate 아님)이면 곧바로 자동 채움을 잇는다 — 같은 클라이언트·유저로', async () => {
    const { client } = fakeClient()

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(autoFillMock).toHaveBeenCalledTimes(1)
    expect(autoFillMock).toHaveBeenCalledWith(client, USER)
  })

  it('일부 지급(capped인데 granted > 0)도 채운다', async () => {
    const { client } = fakeClient({ data: { ...GRANTED, granted: 7, capped: true }, error: null })

    await awardServiceJam(client, { userId: USER, kind: 'collection_complete', sourceId: SOURCE })

    expect(autoFillMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['duplicate(같은 키 재전송 — 응답에는 granted만 있다)', { ok: true, granted: 5, duplicate: true }, { ok: true, granted: 5, duplicate: true, capped: false }],
    ['rule_zero(규칙값 0)', { ok: true, granted: 0, reason: 'rule_zero', ruleAmount: 0 }, { ok: true, granted: 0, duplicate: false, capped: false }],
    ['capped(상한에 걸려 지급 0)', { ok: true, granted: 0, capped: true, dailyUsed: 40 }, { ok: true, granted: 0, duplicate: false, capped: true }],
  ])('%s는 채움을 부르지 않는다', async (_label, data, expected) => {
    const { client } = fakeClient({ data, error: null })

    const result = await awardServiceJam(client, { userId: USER, kind: 'mission_complete', sourceId: SOURCE })

    expect(result).toEqual(expected)
    expect(autoFillMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
    expect(evaluationMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('채움이 던져도 지급 결과는 그대로이고 던지지 않는다', async () => {
    autoFillMock.mockRejectedValue(new Error('채움 장애'))
    const { client } = fakeClient()

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toEqual({
      ok: true,
      granted: 5,
      duplicate: false,
      capped: false,
    })
    expect(console.error).toHaveBeenCalled()
  })
})

describe('awardServiceJam — JAM! 행동 지표 판정', () => {
  it('캡슐이 열렸으면 응답 뒤(after)에 잼 조건 4개 + chapter_reached + 캡슐 열기 지표를 판정한다', async () => {
    autoFillMock.mockResolvedValue(fillStep({ opened: true }))
    const { client } = fakeClient()

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(afterMock).toHaveBeenCalledTimes(1)
    // after가 콜백을 받기만 했으므로 응답이 나가기 전에는 판정하지 않는다
    expect(evaluationMock).not.toHaveBeenCalled()
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()
    expect(evaluationMock).toHaveBeenCalledTimes(1)
    expect(evaluationMock).toHaveBeenCalledWith(USER, [...JAM_KEYS, 'chapter_reached', 'capsule_open_count', 'other_tribe_item_kinds_count'])
  })

  it('열린 것은 없고 챕터만 올랐으면(보류만 생긴 오름) 잼 조건 4개 + chapter_reached를 판정한다', async () => {
    autoFillMock.mockResolvedValue(fillStep({ chapterRose: true }))
    const { client } = fakeClient()

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()

    expect(evaluationMock).toHaveBeenCalledWith(USER, [...JAM_KEYS, 'chapter_reached'])
  })

  it('열린 캡슐도 챕터 오름도 없어도 잼 조건 4개는 판정한다 (서비스 활동 잼이 잼 조건에 합산된다)', async () => {
    const { client } = fakeClient()

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(afterMock).toHaveBeenCalledTimes(1)
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()
    expect(evaluationMock).toHaveBeenCalledTimes(1)
    expect(evaluationMock).toHaveBeenCalledWith(USER, JAM_KEYS)
  })

  it('채움이 던져도 잼 조건 4개는 판정한다', async () => {
    autoFillMock.mockRejectedValue(new Error('채움 장애'))
    const { client } = fakeClient()

    await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })
    await (afterMock.mock.calls[0][0] as () => Promise<void>)()

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
    autoFillMock.mockResolvedValue(fillStep({ opened: true }))
    const { client } = fakeClient()

    const result = await awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })

    expect(result).toMatchObject({ ok: true, granted: 5 })
    expect(evaluationMock).toHaveBeenCalledTimes(1)
    expect(evaluationMock).toHaveBeenCalledWith(USER, [...JAM_KEYS, 'chapter_reached', 'capsule_open_count', 'other_tribe_item_kinds_count'])
  })

  it('판정이 던져도(예외) 지급 결과는 그대로다', async () => {
    afterMock.mockImplementation(() => {
      throw new Error('outside')
    })
    evaluationMock.mockRejectedValue(new Error('판정 장애'))
    autoFillMock.mockResolvedValue(fillStep({ opened: true }))
    const { client } = fakeClient()

    await expect(awardServiceJam(client, { userId: USER, kind: 'badge_earned', sourceId: SOURCE })).resolves.toMatchObject({ ok: true, granted: 5 })
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
    expect(autoFillMock).not.toHaveBeenCalled()
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
    expect(autoFillMock).not.toHaveBeenCalled()
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
    expect(autoFillMock).not.toHaveBeenCalled()
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
