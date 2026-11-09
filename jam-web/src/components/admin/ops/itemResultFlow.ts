/**
 * 결정 결과 처리의 순서 판정 (티켓 20261007_0953) — `useOpsItemResultHandlers`(`OpsItemFooter.tsx`)와 일정표 서랍(`OpsScheduleDrawer.tsx`)의 분기 부분.
 *
 * 저장소에 jsdom이 없어 훅을 렌더해 동작을 볼 수 없으므로, 「무엇을 어떤 순서로 하는가」를 순수 함수로 떼어 단위 시험으로 고정한다.
 * 이 파일은 토스트를 띄우거나 화면을 새로 읽지 않는다. 단계 목록만 돌려주고, 훅이 그 순서대로 `toast`·`refresh`를 부른다.
 */
import { approveToastMessage, type OpsJsonResponse } from './decisionClient'
import type { ScheduleItemOutcome } from './scheduleItemClient'

export type ToastLevel = 'success' | 'error' | 'warning'

/** 결과 처리의 한 단계. 훅이 배열 순서대로 실행한다. */
export type ResultStep =
  | { type: 'toast'; level: ToastLevel; message: string }
  /** 호출한 쪽이 넘긴 `afterToast` 콜백(S3는 다음 결정 전 항목을 고른다). */
  | { type: 'afterToast' }
  | { type: 'refresh' }

/**
 * 되돌리기 요청의 결과. 성공이면 성공 토스트와 새로 읽기, 실패면 오류 토스트이고 새로 읽기는 409(그 사이 다른 곳에서 처리됨)일 때만 한다.
 */
export function planRevertResult(result: OpsJsonResponse): ResultStep[] {
  if (result.ok) {
    return [
      { type: 'toast', level: 'success', message: '수정을 되돌렸어요' },
      { type: 'refresh' },
    ]
  }
  const steps: ResultStep[] = [{ type: 'toast', level: 'error', message: result.error }]
  if (result.status === 409) steps.push({ type: 'refresh' })
  return steps
}

/** 승인·반려 완료: 토스트 → `afterToast` → 새로 읽기. 승인 토스트 문장은 응답 본문(`data`)에서 갈린다. */
export function planDecidedSteps(kind: 'approve' | 'reject', data: Record<string, unknown> = {}): ResultStep[] {
  return [
    { type: 'toast', level: 'success', message: kind === 'approve' ? approveToastMessage(data) : '반려했어요' },
    { type: 'afterToast' },
    { type: 'refresh' },
  ]
}

/** 공개 전 취소·지금 종료 완료: 성공 문장, 결정 기록을 남기지 못했으면 경고 하나 더, 새로 읽기. */
export function planToastResultSteps(toastResult: { message: string; logWarning: string | null }): ResultStep[] {
  const steps: ResultStep[] = [{ type: 'toast', level: 'success', message: toastResult.message }]
  if (toastResult.logWarning) steps.push({ type: 'toast', level: 'warning', message: toastResult.logWarning })
  steps.push({ type: 'refresh' })
  return steps
}

/**
 * 서랍의 항목 응답을 버려야 하는가. 요청 뒤에 서랍을 닫거나 다른 항목으로 옮겨 effect가 정리(abort)됐으면, 늦게 온 응답은 화면에 반영하지 않는다.
 */
export function shouldDiscardScheduleResponse(aborted: boolean, outcome: ScheduleItemOutcome): boolean {
  return aborted || outcome.kind === 'aborted'
}
