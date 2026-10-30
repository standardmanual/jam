/**
 * 합친 연출의 흐름 상태 (티켓 20261028_1740 3회)
 *
 * 고정하는 것
 *  - 결과 받기: 없음·진행 중·이미 다룬 결과·이벤트 없음은 상태를 그대로 두고(참조 동일), 새 결과만 «기다림»으로 시작한다. ids 순서는 상관없다.
 *  - 전이: 기다림 → 오버레이 → 닫는 중 → (획득한 배지 보기면 보상) → 끝. 순서가 아닌 단계에서 부른 전이는 아무 일도 하지 않는다.
 *  - 게이지 붙들기는 기다림·오버레이 동안, 챕터 오름 카드 대기는 끝날 때까지다.
 *  - 자리: 게이지 채움이 화면에 보이면 그 자리, 아니면 화면 가운데 원.
 *  - 보여 준 챕터 저장: 낮추지 않고, 저장이 막혀 있으면 false.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/result-flow.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  beginClosing,
  createFlowState,
  finishClosing,
  finishSession,
  isGaugeHeld,
  isOverlayMounted,
  isResultPending,
  markViaRewards,
  pickResultOrigin,
  receiveResult,
  rememberShownChapter,
  resultKey,
  startOverlay,
  type ResultFlowState,
} from '../result-flow'
import { chapterCelebratedKey } from '@/lib/chapter/celebrate'
import type { CapsuleUnseenResult } from '../capsule-contract'

const result = (ids: string[], eventCount = 1): CapsuleUnseenResult => ({
  ids,
  events: Array.from({ length: eventCount }, (_, i) => ({ openId: `o${i}`, items: [], reachedChapters: [] })),
  chapterBadges: [],
})
const ORIGIN = { top: 1, left: 2, width: 60, height: 60, circle: 60 }

function at(stage: 'waiting' | 'overlay' | 'closing' | 'rewards', viaRewards = false): ResultFlowState {
  let state = receiveResult(createFlowState(), result(['a']))
  if (stage === 'waiting') return state
  state = startOverlay(state, ORIGIN)
  if (viaRewards) state = markViaRewards(state)
  if (stage === 'overlay') return state
  state = beginClosing(state)
  if (stage === 'closing') return state
  return finishClosing(state)
}

describe('receiveResult', () => {
  it('결과가 없으면 상태를 그대로 둔다', () => {
    const state = createFlowState()
    expect(receiveResult(state, null)).toBe(state)
  })

  it('새 결과는 기다림으로 시작하고 처리한 결과에 올린다', () => {
    const next = receiveResult(createFlowState(), result(['a', 'b']))
    expect(next.session).toMatchObject({ key: 'a,b', stage: 'waiting', viaRewards: false, origin: null })
    expect(next.handled).toEqual(['a,b'])
  })

  it('이벤트가 없는 결과는 띄우지 않고 처리한 것으로만 센다', () => {
    const next = receiveResult(createFlowState(), result(['a'], 0))
    expect(next.session).toBeNull()
    expect(next.handled).toEqual(['a'])
    expect(receiveResult(next, result(['a'], 0))).toBe(next)
  })

  it('이미 다룬 결과는(ids 순서가 달라도) 다시 시작하지 않는다', () => {
    const finished = finishSession(receiveResult(createFlowState(), result(['a', 'b'])))
    expect(finished.session).toBeNull()
    expect(receiveResult(finished, result(['b', 'a']))).toBe(finished)
  })

  it('연출이 진행 중이면 새 결과가 와도 끊지 않는다', () => {
    const running = at('overlay')
    expect(receiveResult(running, result(['z']))).toBe(running)
  })

  it('끝난 뒤 새 ids는 새 결과로 한 번 시작한다', () => {
    const finished = finishSession(at('waiting'))
    const next = receiveResult(finished, result(['a', 'c']))
    expect(next.session?.key).toBe('a,c')
    expect(next.handled).toEqual(['a', 'a,c'])
  })

  it('같은 결과의 key는 ids 순서와 무관하다', () => {
    expect(resultKey(result(['b', 'a']))).toBe(resultKey(result(['a', 'b'])))
  })
})

describe('전이', () => {
  it('«닫기»: 기다림 → 오버레이 → 닫는 중 → 끝', () => {
    const closed = finishClosing(at('closing'))
    expect(closed.session).toBeNull()
  })

  it('«획득한 배지 보기»: 닫는 중 다음에 보상 단계가 오고, 보상을 닫으면 끝난다', () => {
    const rewards = at('rewards', true)
    expect(rewards.session?.stage).toBe('rewards')
    expect(finishSession(rewards).session).toBeNull()
  })

  it('오버레이에서만 보상 선택·닫기 시작이 먹는다', () => {
    const waiting = at('waiting')
    expect(markViaRewards(waiting)).toBe(waiting)
    expect(beginClosing(waiting)).toBe(waiting)
    expect(finishClosing(waiting)).toBe(waiting)
    const overlay = at('overlay')
    expect(startOverlay(overlay, ORIGIN)).toBe(overlay)
  })

  it('자리는 오버레이를 띄우는 순간 정해진다', () => {
    expect(at('overlay').session?.origin).toEqual(ORIGIN)
  })

  it('세션이 없으면 어떤 전이도 아무 일도 하지 않는다', () => {
    const idle = createFlowState()
    expect(startOverlay(idle, ORIGIN)).toBe(idle)
    expect(markViaRewards(idle)).toBe(idle)
    expect(beginClosing(idle)).toBe(idle)
    expect(finishClosing(idle)).toBe(idle)
    expect(finishSession(idle)).toBe(idle)
  })
})

describe('단계별 판정', () => {
  const table = [
    ['waiting', true, true, false],
    ['overlay', true, true, true],
    ['closing', true, false, true],
    ['rewards', true, false, false],
  ] as const

  it.each(table)('%s: 진행 중=%s, 게이지 붙들기=%s, 오버레이 그리기=%s', (stage, pending, held, mounted) => {
    const state = at(stage, stage === 'rewards')
    expect(isResultPending(state)).toBe(pending)
    expect(isGaugeHeld(state)).toBe(held)
    expect(isOverlayMounted(state)).toBe(mounted)
  })

  it('세션이 없으면 모두 거짓이다', () => {
    const idle = createFlowState()
    expect([isResultPending(idle), isGaugeHeld(idle), isOverlayMounted(idle)]).toEqual([false, false, false])
  })
})

describe('pickResultOrigin', () => {
  const viewport = { width: 430, height: 800 }
  const circle = 60

  it('게이지 채움이 화면에 보이면 그 자리다', () => {
    expect(pickResultOrigin({ top: 200, left: 20, width: 60, height: 60 }, viewport, circle)).toEqual({
      top: 200,
      left: 20,
      width: 60,
      height: 60,
      circle,
    })
  })

  it('게이지가 없거나 화면 밖이면 화면 가운데 원이다', () => {
    const center = { top: 370, left: 185, width: 60, height: 60, circle }
    expect(pickResultOrigin(null, viewport, circle)).toEqual(center)
    expect(pickResultOrigin({ top: 900, left: 20, width: 60, height: 60 }, viewport, circle)).toEqual(center)
    expect(pickResultOrigin({ top: -80, left: 20, width: 60, height: 60 }, viewport, circle)).toEqual(center)
    expect(pickResultOrigin({ top: 200, left: 20, width: 0, height: 0 }, viewport, circle)).toEqual(center)
  })
})

describe('rememberShownChapter', () => {
  class Memory {
    map = new Map<string, string>()
    getItem(key: string) {
      return this.map.get(key) ?? null
    }
    setItem(key: string, value: string) {
      this.map.set(key, value)
    }
  }
  const key = chapterCelebratedKey('u1')

  it('저장값이 없거나 낮으면 보여 줄 챕터로 올린다', () => {
    const empty = new Memory()
    expect(rememberShownChapter(empty, 'u1', 3)).toBe(true)
    expect(empty.map.get(key)).toBe('3')
    const lower = new Memory()
    lower.map.set(key, '2')
    expect(rememberShownChapter(lower, 'u1', 3)).toBe(true)
    expect(lower.map.get(key)).toBe('3')
  })

  it('저장값이 같거나 높으면 낮추지 않는다', () => {
    const memory = new Memory()
    memory.map.set(key, '5')
    expect(rememberShownChapter(memory, 'u1', 3)).toBe(false)
    expect(rememberShownChapter(memory, 'u1', 5)).toBe(false)
    expect(memory.map.get(key)).toBe('5')
  })

  it('저장소가 없거나 막혀 있으면 false다', () => {
    expect(rememberShownChapter(null, 'u1', 3)).toBe(false)
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(rememberShownChapter(blocked, 'u1', 3)).toBe(false)
  })
})
