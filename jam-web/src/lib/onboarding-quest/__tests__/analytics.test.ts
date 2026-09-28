/**
 * 온보딩 퀘스트 GA4 퍼널 이벤트 계측 헬퍼(`analytics.ts`) 단위 테스트 (티켓 20260927_2132,
 * 상위 20260927_2123 T9). `trackEvent`(gtag.ts)는 목으로 대체해 호출 여부·인자만 검증한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const trackEvent = vi.fn()
vi.mock('@/lib/analytics/gtag', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

import {
  shouldTrackStepComplete,
  trackQuestStepComplete,
  trackQuestSkip,
  trackQuestStartOnce,
  ONBOARDING_QUEST_START_EVENT,
  ONBOARDING_QUEST_STEP_COMPLETE_EVENT,
  ONBOARDING_QUEST_SKIP_EVENT,
} from '../analytics'

describe('shouldTrackStepComplete', () => {
  it('alreadyDone·preview 둘 다 없으면(정상 완료) 집계 대상이다', () => {
    expect(shouldTrackStepComplete({})).toBe(true)
    expect(shouldTrackStepComplete({ alreadyDone: false })).toBe(true)
  })

  it('alreadyDone이면(멱등 재요청) 집계에서 뺀다', () => {
    expect(shouldTrackStepComplete({ alreadyDone: true })).toBe(false)
  })

  it('preview면(관리자 미리보기) 집계에서 뺀다', () => {
    expect(shouldTrackStepComplete({ preview: true })).toBe(false)
    expect(shouldTrackStepComplete({ alreadyDone: false, preview: true })).toBe(false)
  })
})

describe('trackQuestStepComplete', () => {
  beforeEach(() => trackEvent.mockClear())

  it('정상 완료면 step·step_index(1-based)를 실어 보낸다', () => {
    trackQuestStepComplete('sync', {})
    expect(trackEvent).toHaveBeenCalledWith(ONBOARDING_QUEST_STEP_COMPLETE_EVENT, { step: 'sync', step_index: 1 })

    trackQuestStepComplete('browse', {})
    expect(trackEvent).toHaveBeenCalledWith(ONBOARDING_QUEST_STEP_COMPLETE_EVENT, { step: 'browse', step_index: 7 })
  })

  it('alreadyDone이면 보내지 않는다', () => {
    trackQuestStepComplete('bag', { alreadyDone: true })
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('preview면 보내지 않는다', () => {
    trackQuestStepComplete('bag', { preview: true })
    expect(trackEvent).not.toHaveBeenCalled()
  })
})

describe('trackQuestSkip', () => {
  beforeEach(() => trackEvent.mockClear())

  it('preview가 아니면 step·step_index를 실어 보낸다', () => {
    trackQuestSkip('mix_success', {})
    expect(trackEvent).toHaveBeenCalledWith(ONBOARDING_QUEST_SKIP_EVENT, { step: 'mix_success', step_index: 5 })
  })

  it('preview면 보내지 않는다', () => {
    trackQuestSkip('mix_success', { preview: true })
    expect(trackEvent).not.toHaveBeenCalled()
  })
})

describe('trackQuestStartOnce — localStorage 중복 방지', () => {
  beforeEach(() => {
    trackEvent.mockClear()
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('처음 호출하면 이벤트를 보낸다', () => {
    trackQuestStartOnce()
    expect(trackEvent).toHaveBeenCalledWith(ONBOARDING_QUEST_START_EVENT)
  })

  it('같은 세션에서 두 번째 호출은 보내지 않는다(localStorage 표시)', () => {
    trackQuestStartOnce()
    trackQuestStartOnce()
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('localStorage 접근이 막혀도(예외) 이벤트는 그대로 보낸다', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    trackQuestStartOnce()
    expect(trackEvent).toHaveBeenCalledWith(ONBOARDING_QUEST_START_EVENT)
  })
})
