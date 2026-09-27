/**
 * 관리자 미리보기 상태 전이 순수 로직 테스트 (티켓 20260928_0058).
 */
import { describe, it, expect } from 'vitest'
import {
  PREVIEW_INITIAL_INDEX,
  nextPreviewIndex,
  isPreviewDone,
  resetPreviewIndex,
} from '../preview'
import { ONBOARDING_QUEST_STEPS } from '../config'

describe('nextPreviewIndex', () => {
  it('다음 단계로 인덱스를 하나 올린다', () => {
    expect(nextPreviewIndex(0)).toBe(1)
    expect(nextPreviewIndex(3)).toBe(4)
  })

  it('마지막 단계에서 다음 단계로 넘어가면 총 단계 수가 된다(완료 상태)', () => {
    const lastIndex = ONBOARDING_QUEST_STEPS.length - 1
    expect(nextPreviewIndex(lastIndex)).toBe(ONBOARDING_QUEST_STEPS.length)
  })

  it('이미 완료 상태(총 단계 수)를 넘겨도 총 단계 수를 넘지 않는다', () => {
    expect(nextPreviewIndex(ONBOARDING_QUEST_STEPS.length)).toBe(ONBOARDING_QUEST_STEPS.length)
  })
})

describe('isPreviewDone', () => {
  it('총 단계 수 미만이면 완료가 아니다', () => {
    expect(isPreviewDone(0)).toBe(false)
    expect(isPreviewDone(ONBOARDING_QUEST_STEPS.length - 1)).toBe(false)
  })

  it('총 단계 수 이상이면 완료다', () => {
    expect(isPreviewDone(ONBOARDING_QUEST_STEPS.length)).toBe(true)
  })
})

describe('resetPreviewIndex', () => {
  it('항상 최초 인덱스로 되돌린다', () => {
    expect(resetPreviewIndex()).toBe(PREVIEW_INITIAL_INDEX)
    expect(resetPreviewIndex()).toBe(0)
  })
})
