/**
 * 관리자 전용 퀘스트 미리보기 쿠키 장치(`preview.ts`) 단위 테스트 (티켓 20260928_1335, N5a).
 * 순수 함수(parseQuestPreview·resolvePreviewGate·resolvePreviewCard·advancePreviewStep)와
 * 이중 방어(`getAdminQuestPreview` — 쿠키 없으면 관리자 조회 생략, 관리자가 아니면 무시)를
 * 검증한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseQuestPreview,
  resolvePreviewGate,
  resolvePreviewCard,
  advancePreviewStep,
} from '../preview'
import { resolveRealStepsView } from '../real-view'

describe('parseQuestPreview', () => {
  it('단계 키·done은 그대로 통과시킨다', () => {
    expect(parseQuestPreview('bag')).toBe('bag')
    expect(parseQuestPreview('done')).toBe('done')
  })

  it('그 밖의 값·빈 값은 무시한다(null)', () => {
    expect(parseQuestPreview('nope')).toBeNull()
    expect(parseQuestPreview(undefined)).toBeNull()
    expect(parseQuestPreview(null)).toBeNull()
    expect(parseQuestPreview('')).toBeNull()
  })
})

describe('resolvePreviewGate', () => {
  it('미리보기 단계가 이 화면 소속이면 그 단계를 돌려준다', () => {
    expect(resolvePreviewGate('bag', 'inventory')).toBe('bag')
    expect(resolvePreviewGate('pickup', 'drops')).toBe('pickup')
  })

  it('다른 화면 소속이면 null', () => {
    expect(resolvePreviewGate('bag', 'drops')).toBeNull()
  })

  it('done이면 어떤 화면이든 null', () => {
    expect(resolvePreviewGate('done', 'home')).toBeNull()
  })
})

describe('resolvePreviewCard', () => {
  // 미리보기는 DB를 읽지 않으므로 실제 2단계는 «아무것도 안 했다»이고 지금 할 차례는 늘 ① Strava 동기화다(티켓 20261021_1248)
  const realOf = (stravaConnected: boolean) =>
    resolveRealStepsView({
      steps: { sync: false, lockedOpened: false },
      stravaConnected,
      pointBalance: null,
      lockedTarget: null,
    })

  it('단계 키면 in_progress 상태(done은 그 단계 이전에 마친 단계 수)와 아무것도 안 한 실제 2단계를 돌려준다', () => {
    expect(resolvePreviewCard('sync', { stravaConnected: false })).toEqual({
      kind: 'in_progress',
      done: 0,
      total: 7,
      nextStep: 'sync',
      real: realOf(false),
      preview: true,
    })
    expect(resolvePreviewCard('mix_success', { stravaConnected: false })).toEqual({
      kind: 'in_progress',
      done: 4,
      total: 7,
      nextStep: 'mix_success',
      real: realOf(false),
      preview: true,
    })
  })

  it('done이면 실제 구역 카드(kind: real)를 돌려준다(stravaConnected 실제 값 그대로)', () => {
    const state = resolvePreviewCard('done', { stravaConnected: true })
    expect(state).toEqual({ kind: 'real', real: realOf(true), preview: true })
    expect(state).toMatchObject({ real: { doneCount: 0, current: { step: 'sync', stravaConnected: true } } })
  })
})

describe('advancePreviewStep', () => {
  it('요청 단계가 현재 미리보기 단계면 다음 단계로 전이한다', () => {
    expect(advancePreviewStep('sync', 'sync')).toEqual({ ok: true, value: 'bag', alreadyDone: false })
  })

  it('마지막 단계(browse)를 마치면 done으로 전이한다', () => {
    expect(advancePreviewStep('browse', 'browse')).toEqual({ ok: true, value: 'done', alreadyDone: false })
  })

  it('이전 단계 재요청은 전이 없이 멱등 성공한다', () => {
    expect(advancePreviewStep('mix_success', 'mix_fail')).toEqual({
      ok: true,
      value: 'mix_success',
      alreadyDone: true,
    })
  })

  it('이후 단계 요청은 409로 거부한다', () => {
    expect(advancePreviewStep('sync', 'bag')).toEqual({ ok: false, status: 409 })
  })

  it('mix_fail→mix_success를 연달아 호출하는 흐름이 그대로 통과한다', () => {
    const first = advancePreviewStep('mix_fail', 'mix_fail')
    expect(first).toEqual({ ok: true, value: 'mix_success', alreadyDone: false })
    const second = advancePreviewStep('mix_success', 'mix_success')
    expect(second).toEqual({ ok: true, value: 'drop', alreadyDone: false })
  })

  it('done 상태에서는 어떤 요청도 거부한다(더 진행할 단계가 없다)', () => {
    expect(advancePreviewStep('done', 'sync')).toEqual({ ok: false, status: 409 })
  })
})

describe('getAdminQuestPreview — 이중 방어', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@/lib/admin/auth')
    vi.doUnmock('next/headers')
    vi.resetModules()
  })

  it('쿠키가 없으면 관리자 조회를 하지 않는다', async () => {
    const getAdminUser = vi.fn()
    vi.doMock('@/lib/admin/auth', () => ({ getAdminUser }))
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: () => undefined }),
    }))
    const { getAdminQuestPreview } = await import('../preview')
    const result = await getAdminQuestPreview()
    expect(result).toBeNull()
    expect(getAdminUser).not.toHaveBeenCalled()
  })

  it('쿠키가 유효하지 않은 값이어도 관리자 조회를 하지 않는다', async () => {
    const getAdminUser = vi.fn()
    vi.doMock('@/lib/admin/auth', () => ({ getAdminUser }))
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: () => ({ value: 'nope' }) }),
    }))
    const { getAdminQuestPreview } = await import('../preview')
    const result = await getAdminQuestPreview()
    expect(result).toBeNull()
    expect(getAdminUser).not.toHaveBeenCalled()
  })

  it('쿠키가 있어도 관리자가 아니면 무시한다(null)', async () => {
    vi.doMock('@/lib/admin/auth', () => ({ getAdminUser: async () => null }))
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: () => ({ value: 'bag' }) }),
    }))
    const { getAdminQuestPreview } = await import('../preview')
    const result = await getAdminQuestPreview()
    expect(result).toBeNull()
  })

  it('쿠키가 유효하고 관리자면 그 값을 돌려준다', async () => {
    vi.doMock('@/lib/admin/auth', () => ({
      getAdminUser: async () => ({ id: 'admin-1', email: 'admin@jam.app' }),
    }))
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: () => ({ value: 'bag' }) }),
    }))
    const { getAdminQuestPreview } = await import('../preview')
    const result = await getAdminQuestPreview()
    expect(result).toBe('bag')
  })
})
