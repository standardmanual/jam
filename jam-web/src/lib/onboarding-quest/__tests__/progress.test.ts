/**
 * `validateStepAdvance` / `nextStepOf` / `validateSkip` 단위 테스트 (티켓 20260927_2330,
 * 20260927_2131 T8). DB에 닿지 않는 순수 함수만 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { nextStepOf, validateSkip, validateStepAdvance } from '../progress'

describe('nextStepOf', () => {
  it('빈 진행 상태면 첫 단계(sync)', () => {
    expect(nextStepOf({})).toBe('sync')
  })

  it('7단계를 다 마쳤으면 null', () => {
    expect(
      nextStepOf({
        sync: '1',
        bag: '1',
        pickup: '1',
        mix_fail: '1',
        mix_success: '1',
        drop: '1',
        browse: '1',
      })
    ).toBeNull()
  })
})

describe('validateStepAdvance', () => {
  it('첫 단계(sync) 기록 — 아직 안 끝난 첫 단계와 같으면 ok', () => {
    expect(validateStepAdvance({}, 'sync')).toEqual({ ok: true, alreadyDone: false })
  })

  it('이미 끝낸 단계를 재요청하면 멱등 성공(alreadyDone: true)', () => {
    const progress = { sync: '2026-09-27T00:00:00Z' }
    expect(validateStepAdvance(progress, 'sync')).toEqual({ ok: true, alreadyDone: true })
  })

  it('건너뛴 단계(아직 안 끝난 첫 단계보다 뒤)를 요청하면 거부', () => {
    // 진행 상태가 비어 있어 다음 단계는 'sync'인데 'drop'을 요청 — 순서 위반
    expect(validateStepAdvance({}, 'drop')).toEqual({ ok: false, reason: 'OUT_OF_ORDER' })
  })

  it('7단계를 모두 마친 뒤 요청하면 거부(ALL_DONE)', () => {
    const progress = {
      sync: '1',
      bag: '1',
      pickup: '1',
      mix_fail: '1',
      mix_success: '1',
      drop: '1',
      browse: '1',
    }
    expect(validateStepAdvance(progress, 'sync')).toEqual({ ok: false, reason: 'ALL_DONE' })
  })
})

describe('validateSkip', () => {
  it('행이 없으면 거부(NOT_FOUND)', () => {
    expect(validateSkip(null)).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it('이미 건너뛴 행은 멱등 성공(alreadySkipped: true)', () => {
    const row = { step_progress: { sync: '1' }, skipped_at: '2026-09-28T00:00:00Z' }
    expect(validateSkip(row)).toEqual({ ok: true, alreadySkipped: true })
  })

  it('7단계를 모두 마쳤으면 거부(ALL_STEPS_DONE)', () => {
    const row = {
      step_progress: {
        sync: '1',
        bag: '1',
        pickup: '1',
        mix_fail: '1',
        mix_success: '1',
        drop: '1',
        browse: '1',
      },
      skipped_at: null,
    }
    expect(validateSkip(row)).toEqual({ ok: false, reason: 'ALL_STEPS_DONE' })
  })

  it('진행 중이고 건너뛰지 않았으면 기록 대상(alreadySkipped: false)', () => {
    const row = { step_progress: { sync: '1' }, skipped_at: null }
    expect(validateSkip(row)).toEqual({ ok: true, alreadySkipped: false })
  })
})
