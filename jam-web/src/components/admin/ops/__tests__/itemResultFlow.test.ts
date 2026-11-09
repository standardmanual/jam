/**
 * 결정 결과 처리 순서 (티켓 20261007_0953) — `itemResultFlow.ts`의 순수 판정을 고정한다.
 *
 * 저장소에 jsdom이 없어 `useOpsItemResultHandlers`를 렌더하지 못한다. 그래서 판정(단계 목록)을 시험하고,
 * 단계를 순서대로 실행하는 부분은 훅과 같은 모양의 실행기에 `vi.fn`을 꽂아 호출 순서를 본다.
 */
import { describe, it, expect, vi } from 'vitest'
import { cancelToast, endToast } from '@/lib/admin/opsInbox/executeView'
import type { OpsJsonResponse } from '../decisionClient'
import {
  planDecidedSteps,
  planRevertResult,
  planToastResultSteps,
  shouldDiscardScheduleResponse,
  type ResultStep,
} from '../itemResultFlow'

/** `useOpsItemResultHandlers.run`과 같은 실행 규칙. */
function execute(steps: ResultStep[], afterToast?: () => void) {
  const calls: string[] = []
  const toast = {
    success: vi.fn((message: string) => void calls.push(`success:${message}`)),
    error: vi.fn((message: string) => void calls.push(`error:${message}`)),
    warning: vi.fn((message: string) => void calls.push(`warning:${message}`)),
  }
  const refresh = vi.fn(() => void calls.push('refresh'))
  const after = vi.fn(() => {
    calls.push('afterToast')
    afterToast?.()
  })
  for (const step of steps) {
    if (step.type === 'refresh') refresh()
    else if (step.type === 'afterToast') after()
    else toast[step.level](step.message)
  }
  return { calls, toast, refresh, after }
}

const failure = (status: number): OpsJsonResponse => ({ ok: false, status, error: '실패 문장', data: {} })

describe('되돌리기 결과', () => {
  it('성공이면 성공 토스트 뒤에 화면을 새로 읽는다', () => {
    const run = execute(planRevertResult({ ok: true, data: {} }))
    expect(run.calls).toEqual(['success:수정을 되돌렸어요', 'refresh'])
  })

  it('409면 오류 토스트를 띄우고 화면도 새로 읽는다', () => {
    const run = execute(planRevertResult(failure(409)))
    expect(run.calls).toEqual(['error:실패 문장', 'refresh'])
  })

  it.each([0, 400, 404, 500])('%i 실패는 오류 토스트만 띄우고 새로 읽지 않는다', (status) => {
    const run = execute(planRevertResult(failure(status)))
    expect(run.calls).toEqual(['error:실패 문장'])
    expect(run.refresh).not.toHaveBeenCalled()
  })
})

describe('승인·반려 완료', () => {
  it('토스트 → afterToast → 새로 읽기 순서다', () => {
    const run = execute(planDecidedSteps('reject'))
    expect(run.calls).toEqual(['success:반려했어요', 'afterToast', 'refresh'])
  })

  it('afterToast 콜백을 호출한다', () => {
    const callback = vi.fn()
    execute(planDecidedSteps('approve'), callback)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('승인 토스트 문장은 응답 본문에 따라 갈린다', () => {
    const message = (data?: Record<string, unknown>) => {
      const step = planDecidedSteps('approve', data)[0]
      return step.type === 'toast' ? step.message : ''
    }
    expect(message()).toBe('승인했어요')
    expect(message({ pattern: { patternNo: 'P-12' } })).toBe('승인했어요. 패턴에 P-12로 넣었어요')
    expect(message({ patternSkipped: 'sample' })).toBe('승인했어요. 시험 묶음이라 패턴에는 넣지 않았어요')
  })
})

describe('공개 전 취소·지금 종료 완료', () => {
  it('결정 기록을 남겼으면 성공 토스트와 새로 읽기뿐이다', () => {
    const cancel = execute(planToastResultSteps(cancelToast({ cancelled: ['a'] })))
    expect(cancel.calls).toEqual(['success:공개 전에 취소했어요', 'refresh'])
    expect(cancel.toast.warning).not.toHaveBeenCalled()

    const end = execute(planToastResultSteps(endToast({})))
    expect(end.calls).toEqual(['success:지금 종료했어요', 'refresh'])
    expect(end.toast.warning).not.toHaveBeenCalled()
  })

  it('결정 기록을 남기지 못했으면 성공 토스트 뒤에 경고 토스트를 하나 더 띄우고 마지막에 새로 읽는다', () => {
    const cancel = execute(planToastResultSteps(cancelToast({ cancelled: ['a', 'b'], decisionLogFailed: true })))
    expect(cancel.calls).toHaveLength(3)
    expect(cancel.calls[0]).toBe('success:2개를 공개 전에 취소했어요')
    expect(cancel.calls[1]).toMatch(/^warning:/)
    expect(cancel.calls[2]).toBe('refresh')

    const end = execute(planToastResultSteps(endToast({ decisionLogFailed: true })))
    expect(end.toast.warning).toHaveBeenCalledTimes(1)
    expect(end.calls.at(-1)).toBe('refresh')
  })
})

describe('서랍의 오래된 응답 버리기', () => {
  const ok = { kind: 'ok', detail: {} } as never

  it('정리(abort)된 effect의 응답은 결과 종류와 상관없이 버린다', () => {
    expect(shouldDiscardScheduleResponse(true, ok)).toBe(true)
    expect(shouldDiscardScheduleResponse(true, { kind: 'error' })).toBe(true)
  })

  it('중단됐다는 결과(aborted)는 버린다', () => {
    expect(shouldDiscardScheduleResponse(false, { kind: 'aborted' })).toBe(true)
  })

  it('살아 있는 effect의 정상·없음·오류 응답은 반영한다', () => {
    expect(shouldDiscardScheduleResponse(false, ok)).toBe(false)
    expect(shouldDiscardScheduleResponse(false, { kind: 'notFound' })).toBe(false)
    expect(shouldDiscardScheduleResponse(false, { kind: 'error' })).toBe(false)
  })
})
