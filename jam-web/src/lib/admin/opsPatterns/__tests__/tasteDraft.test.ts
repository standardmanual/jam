/**
 * 취향 신호 확정·공통 규칙 고치기 화면의 상태 계산 (티켓 20261008_1754)
 * - 근거 기본 선택, 「지금 붙은 근거 유지」가 필요한 때, 더 보기 병합(같은 id는 한 번)
 * - 요청 본문: 서버와 같은 검사, expectedUpdatedAt 원문 그대로, 공통 신호는 근거 null
 * - 반려 줄 모양(KST 날짜·결정 문장·이유 생략·링크), 버튼 글자·토스트 문장, 공통 규칙 고침 판정
 */
import { describe, it, expect } from 'vitest'
import {
  COMMON_RULE_CONFIRM_TEXT,
  EVIDENCE_NONE_VALUE,
  commonRuleSaveBody,
  commonTasteEditLabel,
  evidenceChoiceToId,
  evidenceLegendText,
  initialEvidenceChoice,
  isCommonRuleDirty,
  mergeRejectionPages,
  needsKeepEvidenceOption,
  rejectionLineView,
  tasteEditLabel,
  tasteSaveBody,
  tasteSubmitLabel,
  tasteToastText,
} from '../tasteDraft'
import type { OpsPatternRejectionRecord, OpsPatternRejectionsResult } from '../tasteWrite'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const UPDATED_AT = '2026-10-08T07:05:00.123456+00:00'

function rejection(n: number, overrides: Partial<OpsPatternRejectionRecord> = {}): OpsPatternRejectionRecord {
  return {
    id: uuid(n),
    createdAt: '2026-10-07T16:30:00.000Z',
    actorType: 'admin',
    agentName: null,
    bundleId: uuid(100 + n),
    itemId: uuid(200 + n),
    itemName: `문안 ${n}`,
    reason: `이유 ${n}`,
    ...overrides,
  }
}

function page(ids: number[], hasMore: boolean, total: number): OpsPatternRejectionsResult {
  return { rejections: ids.map((n) => rejection(n)), hasMore, total }
}

describe('근거 기본 선택', () => {
  it('근거가 없으면 「근거 없이 확정」(빈 값), 있으면 그 결정이다', () => {
    expect(initialEvidenceChoice(null)).toBe(EVIDENCE_NONE_VALUE)
    expect(initialEvidenceChoice(uuid(9))).toBe(uuid(9))
  })

  it('라디오 값을 요청 값으로 바꾼다(빈 값은 null)', () => {
    expect(evidenceChoiceToId('')).toBeNull()
    expect(evidenceChoiceToId(uuid(9))).toBe(uuid(9))
  })

  it('붙은 근거가 불러온 목록에 없을 때만 「지금 붙은 근거 유지」가 필요하다', () => {
    expect(needsKeepEvidenceOption(null, [])).toBe(false)
    expect(needsKeepEvidenceOption(uuid(9), [])).toBe(true)
    expect(needsKeepEvidenceOption(uuid(9), [{ id: uuid(1) }])).toBe(true)
    expect(needsKeepEvidenceOption(uuid(1), [{ id: uuid(1) }])).toBe(false)
  })

  it('머리글에 반려 기록 건수가 들어간다(못 읽었으면 건수 없이)', () => {
    expect(evidenceLegendText(12)).toBe('같은 패턴 항목의 반려 기록 12건 — 근거로 붙일 수 있어요(선택)')
    expect(evidenceLegendText(0)).toContain('0건')
    expect(evidenceLegendText(null)).toBe('같은 패턴 항목의 반려 기록 — 근거로 붙일 수 있어요(선택)')
  })
})

describe('더 보기 병합', () => {
  it('처음에는 받은 쪽 그대로다', () => {
    const first = page([1, 2], true, 5)
    expect(mergeRejectionPages(null, first)).toBe(first)
  })

  it('이어 붙이고 같은 id는 한 번만 둔다. hasMore·total은 새로 받은 쪽을 따른다', () => {
    const merged = mergeRejectionPages(page([1, 2, 3], true, 5), page([3, 4, 5], false, 6))
    expect(merged.rejections.map((record) => record.id)).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)])
    expect(merged.hasMore).toBe(false)
    expect(merged.total).toBe(6)
  })
})

describe('반려 줄', () => {
  it('날짜는 KST, 문장은 결정 문장, 링크는 기획 상세다', () => {
    const line = rejectionLineView(rejection(1))
    expect(line.dateText).toBe('2026-10-08')
    expect(line.sentence).toBe('관리자가 반려했어요')
    expect(line.name).toBe('문안 1')
    expect(line.reason).toBe('이유 1')
    expect(line.href).toContain(uuid(101))
    expect(line.href).toContain(uuid(201))
  })

  it('에이전트가 반려했으면 이름을 붙인다', () => {
    expect(rejectionLineView(rejection(1, { actorType: 'agent', agentName: '기획 에이전트' })).sentence).toBe('에이전트(기획 에이전트)가 반려했어요')
  })

  it('반려 이유가 없거나 공백이면 생략(null)이다', () => {
    expect(rejectionLineView(rejection(1, { reason: null })).reason).toBeNull()
    expect(rejectionLineView(rejection(1, { reason: '  \n ' })).reason).toBeNull()
  })

  it('날짜를 읽을 수 없으면 「–」다', () => {
    expect(rejectionLineView(rejection(1, { createdAt: 'not-a-date' })).dateText).toBe('–')
  })
})

describe('버튼 글자·토스트', () => {
  it('추정이면 확정까지, 확정이면 이유·근거만 고친다', () => {
    expect(tasteEditLabel('estimate')).toBe('이유 고치고 확정하기')
    expect(tasteEditLabel('confirmed')).toBe('이유·근거 고치기')
    expect(tasteSubmitLabel('estimate')).toBe('확정하기')
    expect(tasteSubmitLabel('confirmed')).toBe('저장하기')
  })

  it('공통 신호는 근거가 없어 확정 뒤에는 「이유 고치기」다', () => {
    expect(commonTasteEditLabel('estimate')).toBe('이유 고치고 확정하기')
    expect(commonTasteEditLabel('confirmed')).toBe('이유 고치기')
  })

  it('처음 확정은 「확정했어요」, 그 밖은 「저장했어요」, 같은 내용은 「바뀐 내용이 없어요」', () => {
    expect(tasteToastText('estimate', true)).toBe('확정했어요')
    expect(tasteToastText('confirmed', true)).toBe('저장했어요')
    expect(tasteToastText('estimate', false)).toBe('바뀐 내용이 없어요')
    expect(tasteToastText('confirmed', false)).toBe('바뀐 내용이 없어요')
  })
})

describe('취향 신호 저장 본문', () => {
  it('이유는 앞뒤 공백을 떼고 expectedUpdatedAt은 받은 문자열 그대로 싣는다', () => {
    const prepared = tasteSaveBody({ reason: '  이유  ', evidenceDecisionId: uuid(9) }, UPDATED_AT)
    expect(prepared).toEqual({ ok: true, body: { reason: '이유', evidenceDecisionId: uuid(9), expectedUpdatedAt: UPDATED_AT } })
  })

  it('근거 없이 확정이면 evidenceDecisionId는 null이다', () => {
    const prepared = tasteSaveBody({ reason: '이유', evidenceDecisionId: null }, UPDATED_AT)
    expect(prepared.ok && prepared.body.evidenceDecisionId).toBeNull()
  })

  it('이유가 비었거나 500자를 넘으면 reason 칸 오류다', () => {
    const empty = tasteSaveBody({ reason: '   ', evidenceDecisionId: null }, UPDATED_AT)
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(Object.keys(empty.fieldErrors)).toEqual(['reason'])
    expect(tasteSaveBody({ reason: 'a'.repeat(501), evidenceDecisionId: null }, UPDATED_AT).ok).toBe(false)
    expect(tasteSaveBody({ reason: 'a'.repeat(500), evidenceDecisionId: null }, UPDATED_AT).ok).toBe(true)
  })

  it('UUID가 아닌 근거는 evidenceDecisionId 칸 오류다', () => {
    const prepared = tasteSaveBody({ reason: '이유', evidenceDecisionId: 'nope' }, UPDATED_AT)
    expect(prepared.ok).toBe(false)
    if (!prepared.ok) expect(Object.keys(prepared.fieldErrors)).toEqual(['evidenceDecisionId'])
  })
})

describe('공통 규칙 저장 본문·고침 판정', () => {
  it('제목·본문을 앞뒤 공백 없이, expectedUpdatedAt 그대로 싣는다', () => {
    expect(commonRuleSaveBody({ title: ' 제목 ', body: ' 본문 ' }, UPDATED_AT)).toEqual({ ok: true, body: { title: '제목', body: '본문', expectedUpdatedAt: UPDATED_AT } })
  })

  it('제목 60자·본문 2,000자를 넘으면 칸 오류다', () => {
    const long = commonRuleSaveBody({ title: 'a'.repeat(61), body: 'b'.repeat(2001) }, UPDATED_AT)
    expect(long.ok).toBe(false)
    if (!long.ok) expect(Object.keys(long.fieldErrors).sort()).toEqual(['body', 'title'])
    expect(commonRuleSaveBody({ title: 'a'.repeat(60), body: 'b'.repeat(2000) }, UPDATED_AT).ok).toBe(true)
  })

  it('고친 칸이 있을 때만 dirty이고 앞뒤 공백만 다른 것은 고친 것이 아니다', () => {
    const rule = { title: '제목', body: '본문' }
    expect(isCommonRuleDirty(rule, { title: '제목', body: '본문' })).toBe(false)
    expect(isCommonRuleDirty(rule, { title: ' 제목 ', body: '본문\n' })).toBe(false)
    expect(isCommonRuleDirty(rule, { title: '제목2', body: '본문' })).toBe(true)
    expect(isCommonRuleDirty(rule, { title: '제목', body: '본문 수정' })).toBe(true)
  })

  it('저장 확인 문장은 모든 패턴에 적용되고 이전 내용이 남지 않는다고 알린다', () => {
    expect(COMMON_RULE_CONFIRM_TEXT).toBe('모든 패턴에 적용되는 규칙이에요. 저장하면 에이전트가 바로 새 내용을 읽고, 이전 내용은 남지 않아요')
  })
})
