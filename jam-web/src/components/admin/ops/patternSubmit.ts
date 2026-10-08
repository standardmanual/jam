/**
 * 패턴 폼·상태 메뉴의 저장 흐름 (티켓 20261008_1617, 상위 20260930_1503 ⑩a-2). 화면은 결과의 종류(`kind`)만 보고 그린다.
 *
 * 저장소에 jsdom이 없어 화면 안의 클릭 흐름을 테스트할 수 없으므로, 요청 보내기와 응답 가르기를 이 파일의 순수 async 함수로 뺐다
 * (`__tests__/patternSubmit.test.ts`가 `fetch`를 막고 본문·결과를 고정한다). 던지지 않는다.
 *
 * - 폼 저장: 클라이언트에서 서버와 같은 `validateOpsPatternInput`으로 먼저 막고(`invalid`), 통과한 값을 보낸다. 만들기는 `POST`, 고치기는 `PATCH`에
 *   내용 칸 전체와 `expectedUpdatedAt`(받은 문자열 그대로)을 싣는다.
 * - 409는 `conflict`다. 만들기의 409는 「다시 저장」, 고치기의 409는 「최신 내용 불러오기」로 화면이 갈라 보인다.
 */
import type { OpsPatternStatus } from '@/lib/admin/opsPatterns/constants'
import { inputFromDraft, type PatternDraft } from '@/lib/admin/opsPatterns/formDraft'
import { validateOpsPatternInput, type OpsPatternFieldErrors } from '@/lib/admin/opsPatterns/input'
import { changeOpsPatternStatusRequest, createOpsPatternRequest, updateOpsPatternRequest, type PatternWriteResponse } from './patternClient'

export type PatternFormTarget = { mode: 'create' } | { mode: 'edit'; patternNo: string; expectedUpdatedAt: string }

export type PatternFormResult =
  /** 보내기 전 검사에서 막혔다. 요청은 나가지 않았다. */
  | { kind: 'invalid'; fieldErrors: OpsPatternFieldErrors }
  | { kind: 'created'; patternNo: string }
  | { kind: 'saved'; changed: boolean }
  | { kind: 'conflict'; message: string }
  /** 서버가 칸별로 거절했다(400). */
  | { kind: 'fieldErrors'; message: string; fieldErrors: OpsPatternFieldErrors }
  | { kind: 'failed'; message: string }

function failedResult(res: Extract<PatternWriteResponse, { ok: false }>): PatternFormResult {
  if (res.status === 409) return { kind: 'conflict', message: res.error }
  if (res.status === 400 && Object.keys(res.fieldErrors).length > 0) return { kind: 'fieldErrors', message: res.error, fieldErrors: res.fieldErrors }
  return { kind: 'failed', message: res.error }
}

/** 폼 값을 검사하고 저장한다. */
export async function submitPatternForm(target: PatternFormTarget, draft: PatternDraft): Promise<PatternFormResult> {
  const checked = validateOpsPatternInput(inputFromDraft(draft))
  if (!checked.ok) return { kind: 'invalid', fieldErrors: checked.fieldErrors }

  const res =
    target.mode === 'create'
      ? await createOpsPatternRequest(checked.value)
      : await updateOpsPatternRequest(target.patternNo, checked.value, target.expectedUpdatedAt)
  if (!res.ok) return failedResult(res)
  return target.mode === 'create' ? { kind: 'created', patternNo: res.pattern.patternNo } : { kind: 'saved', changed: res.changed }
}

export type PatternStatusResult =
  | { kind: 'changed' }
  /** 이미 그 상태라 바뀐 것이 없다. */
  | { kind: 'unchanged' }
  | { kind: 'conflict' }
  | { kind: 'fieldErrors'; fieldErrors: OpsPatternFieldErrors }
  | { kind: 'failed'; message: string }

/** 상태를 바꾼다. 쉬는 이유는 쉬는 중으로 바꿀 때만 싣는다. */
export async function submitPatternStatus(
  patternNo: string,
  change: { status: OpsPatternStatus; pauseReason?: string },
  expectedUpdatedAt: string
): Promise<PatternStatusResult> {
  const res = await changeOpsPatternStatusRequest(patternNo, change, expectedUpdatedAt)
  if (res.ok) return res.changed ? { kind: 'changed' } : { kind: 'unchanged' }
  if (res.status === 409) return { kind: 'conflict' }
  if (res.status === 400 && Object.keys(res.fieldErrors).length > 0) return { kind: 'fieldErrors', fieldErrors: res.fieldErrors }
  return { kind: 'failed', message: res.error }
}

/** 「P19를 만들었어요」 토스트 문장. 번호 끝 숫자의 받침(0·1·3·6·7·8)에 따라 을/를을 고른다. */
export function createdToastText(patternNo: string): string {
  const last = patternNo.slice(-1)
  return `${patternNo}${'013678'.includes(last) ? '을' : '를'} 만들었어요`
}
