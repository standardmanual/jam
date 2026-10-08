/**
 * 취향 신호 확정·공통 규칙 고치기 화면의 상태 계산 (티켓 20261008_1754, 상위 20260930_1503 ⑩b-2). 순수 함수만 둔다 — 줄 안 편집 부품이 쓰고, jsdom 없이 테스트로 고정한다.
 *
 * - 근거 선택: 라디오 값은 근거 결정 ID이고 빈 문자열이 「근거 없이 확정」이다. 확정 신호에 이미 붙은 근거가 불러온 목록(최신 10건 + 더 보기)에 없으면
 *   「지금 붙은 근거 유지」 선택지를 맨 위에 두어 목록 밖 근거를 잃지 않게 한다(값은 같은 결정 ID라 따로 표식이 필요 없다).
 * - 요청 본문은 서버와 같은 입력 검사(`input.ts`, 서버 의존 없음)를 거친 값으로 만든다. `expectedUpdatedAt`은 받은 문자열을 **가공하지 않고 그대로** 싣는다.
 * - 날짜는 KST다.
 */
import { decisionLineText } from '@/lib/admin/opsDecisions/line'
import { OPS_DECISION_ACTION_REJECT } from '@/lib/admin/opsInbox/constants'
import { kstDateKey } from '@/lib/admin/opsInbox/labels'
import { opsTargetHref } from '@/lib/admin/opsHome/links'
import type { OpsTasteBasis } from './constants'
import { validateCommonRuleInput, validateTasteSignalInput, type OpsPatternFieldErrors } from './input'
import type { OpsPatternRejectionRecord, OpsPatternRejectionsResult } from './tasteWrite'

/** 「근거 없이 확정」 라디오의 값. */
export const EVIDENCE_NONE_VALUE = ''

export const EVIDENCE_NONE_LABEL = '근거 없이 확정'
export const EVIDENCE_KEEP_LABEL = '지금 붙은 근거 유지'
export const EVIDENCE_EMPTY_TEXT = '붙일 반려 기록이 없어요. 근거 없이 확정할 수 있어요'
export const EVIDENCE_LOAD_FAILED_TEXT = '반려 기록을 불러오지 못했어요'
export const EVIDENCE_LOADING_TEXT = '반려 기록을 불러오는 중이에요'
export const EVIDENCE_MORE_LABEL = '더 보기'
export const EVIDENCE_RETRY_LABEL = '다시 시도'
export const EVIDENCE_LINK_LABEL = '기획 보기'

export const TASTE_CANCEL_LABEL = '취소'
export const TASTE_NOT_CHANGED_TEXT = '바뀐 내용이 없어요'
export const RULE_SAVED_TEXT = '저장했어요'
export const COMMON_RULE_CONFIRM_TITLE = '이 공통 규칙을 저장할까요?'
export const COMMON_RULE_CONFIRM_TEXT = '모든 패턴에 적용되는 규칙이에요. 저장하면 에이전트가 바로 새 내용을 읽고, 이전 내용은 남지 않아요'
export const COMMON_RULE_EDIT_LABEL = '고치기'
export const COMMON_RULE_SAVE_LABEL = '저장하기'
export const COMMON_RULE_SAVING_LABEL = '저장하는 중'

/** 근거 묶음 머리글. `total`은 이 패턴의 반려 기록 전체 개수다(아직 못 읽었으면 `null`). */
export function evidenceLegendText(total: number | null): string {
  return `같은 패턴 항목의 반려 기록${total === null ? '' : ` ${total}건`} — 근거로 붙일 수 있어요(선택)`
}

/** 줄의 편집 버튼 글자: 추정이면 확정까지, 확정이면 이유·근거만 고친다. */
export function tasteEditLabel(basis: OpsTasteBasis): string {
  return basis === 'confirmed' ? '이유·근거 고치기' : '이유 고치고 확정하기'
}

/** 공통 취향 신호는 근거가 없어 확정 뒤에는 「이유」만 고친다. */
export function commonTasteEditLabel(basis: OpsTasteBasis): string {
  return basis === 'confirmed' ? '이유 고치기' : '이유 고치고 확정하기'
}

/** 펼침 안 주 버튼: 추정이면 「확정하기」, 확정이면 「저장하기」. */
export function tasteSubmitLabel(basis: OpsTasteBasis): string {
  return basis === 'confirmed' ? '저장하기' : '확정하기'
}

export function tasteSubmitPendingLabel(basis: OpsTasteBasis): string {
  return basis === 'confirmed' ? '저장하는 중' : '확정하는 중'
}

/** 성공 토스트: 처음 확정이면 「확정했어요」, 그 밖은 「저장했어요」, 내용이 같으면 「바뀐 내용이 없어요」. */
export function tasteToastText(basisBefore: OpsTasteBasis, changed: boolean): string {
  if (!changed) return TASTE_NOT_CHANGED_TEXT
  return basisBefore === 'estimate' ? '확정했어요' : '저장했어요'
}

/** 「지금 붙은 근거 유지」 선택지가 필요한가: 근거가 있는데 불러온 목록에 없을 때. */
export function needsKeepEvidenceOption(evidenceDecisionId: string | null, loaded: readonly Pick<OpsPatternRejectionRecord, 'id'>[]): boolean {
  return evidenceDecisionId !== null && !loaded.some((record) => record.id === evidenceDecisionId)
}

/** 펼칠 때의 기본 선택: 붙은 근거가 있으면 그 결정, 없으면 「근거 없이 확정」. */
export function initialEvidenceChoice(evidenceDecisionId: string | null): string {
  return evidenceDecisionId ?? EVIDENCE_NONE_VALUE
}

/** 라디오 값 → 요청의 `evidenceDecisionId`(빈 값은 `null`). */
export function evidenceChoiceToId(choice: string): string | null {
  return choice === EVIDENCE_NONE_VALUE ? null : choice
}

/** 더 보기로 받은 쪽을 이어 붙인다. 같은 `id`는 한 번만 두고, `hasMore`·`total`은 새로 받은 쪽을 따른다. */
export function mergeRejectionPages(current: OpsPatternRejectionsResult | null, next: OpsPatternRejectionsResult): OpsPatternRejectionsResult {
  if (current === null) return next
  const seen = new Set(current.rejections.map((record) => record.id))
  return { rejections: [...current.rejections, ...next.rejections.filter((record) => !seen.has(record.id))], hasMore: next.hasMore, total: next.total }
}

export interface RejectionLineView {
  id: string
  /** 반려한 날(KST, `YYYY-MM-DD`). 읽을 수 없으면 「–」. */
  dateText: string
  /** 「관리자가 반려했어요」 같은 결정 문장. */
  sentence: string
  name: string
  /** 반려 이유. 없거나 공백뿐이면 `null`(줄에서 생략한다). */
  reason: string | null
  /** 받은 기획함의 그 항목 링크. */
  href: string | null
}

export function rejectionLineView(record: OpsPatternRejectionRecord): RejectionLineView {
  const reason = record.reason?.trim() ?? ''
  return {
    id: record.id,
    dateText: kstDateKey(record.createdAt) ?? '–',
    sentence: decisionLineText({ action: OPS_DECISION_ACTION_REJECT, actorType: record.actorType, agentName: record.agentName }),
    name: record.itemName,
    reason: reason === '' ? null : reason,
    href: opsTargetHref({ bundleId: record.bundleId, itemId: record.itemId }),
  }
}

export interface TasteSaveBody {
  reason: string
  evidenceDecisionId: string | null
  expectedUpdatedAt: string
}

export type PreparedSave<T> = { ok: true; body: T } | { ok: false; fieldErrors: OpsPatternFieldErrors }

/**
 * 취향 신호 저장 본문. 서버와 같은 검사를 거친 값(이유는 앞뒤 공백을 뗀다)으로 만든다.
 * `evidenceDecisionId`가 `null`이면 근거 없이 확정(공통 신호는 항상 `null`)이다.
 */
export function tasteSaveBody(draft: { reason: string; evidenceDecisionId: string | null }, expectedUpdatedAt: string): PreparedSave<TasteSaveBody> {
  const checked = validateTasteSignalInput({ reason: draft.reason, evidenceDecisionId: draft.evidenceDecisionId })
  if (!checked.ok) return checked
  return { ok: true, body: { reason: checked.value.reason, evidenceDecisionId: checked.value.evidenceDecisionId, expectedUpdatedAt } }
}

export interface CommonRuleSaveBody {
  title: string
  body: string
  expectedUpdatedAt: string
}

export function commonRuleSaveBody(draft: { title: string; body: string }, expectedUpdatedAt: string): PreparedSave<CommonRuleSaveBody> {
  const checked = validateCommonRuleInput(draft)
  if (!checked.ok) return checked
  return { ok: true, body: { title: checked.value.title, body: checked.value.body, expectedUpdatedAt } }
}

/** 공통 규칙에서 고친 칸이 있는가(저장 전 칩과 [저장하기] 켜짐 기준). 앞뒤 공백만 다른 경우는 고친 것으로 치지 않는다. */
export function isCommonRuleDirty(rule: { title: string; body: string }, draft: { title: string; body: string }): boolean {
  return draft.title.trim() !== rule.title.trim() || draft.body.trim() !== rule.body.trim()
}
