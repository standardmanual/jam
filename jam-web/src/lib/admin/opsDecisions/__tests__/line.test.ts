/**
 * 결정 기록 한 줄의 문장 (티켓 20261006_1339 ②-a)
 *
 * 지키는 것: 행동 10종의 동사구, 시스템·에이전트·관리자 접두, 시스템 실패 문장, 사람의 실패 기록(결과형), 40자 자르기,
 * 빈 에이전트 이름(가정 7), `actor` 원문 변환.
 */
import { describe, expect, it } from 'vitest'
import { OPS_DECISION_ACTIONS } from '@/lib/admin/opsDecisions/read'
import {
  DECISION_ACTION_LABELS,
  DECISION_AGENT_NAME_MAX,
  classifyActor,
  decisionLineText,
} from '@/lib/admin/opsDecisions/line'

describe('decisionLineText', () => {
  it('관리자 행동은 「관리자가 …」다', () => {
    expect(decisionLineText({ action: 'approve', actorType: 'admin', agentName: null })).toBe('관리자가 승인했어요')
    expect(decisionLineText({ action: 'execute', actorType: 'admin', agentName: null })).toBe('관리자가 예약 등록했어요')
    expect(decisionLineText({ action: 'cancel', actorType: 'admin', agentName: null })).toBe('관리자가 공개 전에 취소했어요')
  })

  it('에이전트는 「에이전트(이름)가 …」다', () => {
    expect(decisionLineText({ action: 'submit', actorType: 'agent', agentName: '윤진' })).toBe('에이전트(윤진)가 제출했어요')
  })

  it('에이전트 이름이 비었거나 공백뿐이면 「에이전트가 …」다(가정 7)', () => {
    expect(decisionLineText({ action: 'submit', actorType: 'agent', agentName: null })).toBe('에이전트가 제출했어요')
    expect(decisionLineText({ action: 'submit', actorType: 'agent', agentName: '' })).toBe('에이전트가 제출했어요')
    expect(decisionLineText({ action: 'submit', actorType: 'agent', agentName: '   ' })).toBe('에이전트가 제출했어요')
  })

  it('에이전트 이름은 40자에서 자르고 「…」를 붙인다', () => {
    const name = '가'.repeat(DECISION_AGENT_NAME_MAX + 10)
    const line = decisionLineText({ action: 'submit', actorType: 'agent', agentName: name })
    expect(line).toBe(`에이전트(${'가'.repeat(DECISION_AGENT_NAME_MAX)}…)가 제출했어요`)
    const exact = '나'.repeat(DECISION_AGENT_NAME_MAX)
    expect(decisionLineText({ action: 'submit', actorType: 'agent', agentName: exact })).toBe(`에이전트(${exact})가 제출했어요`)
  })

  it('시스템은 「시스템이 …」다', () => {
    expect(decisionLineText({ action: 'cancel', actorType: 'system', agentName: null })).toBe('시스템이 공개 전에 취소했어요')
    expect(decisionLineText({ action: 'external_change', actorType: 'system', agentName: null })).toBe(
      '시스템이 밖에서 바뀐 것을 찾았어요'
    )
    expect(decisionLineText({ action: 'end', actorType: 'system', agentName: null })).toBe('시스템이 종료했어요')
  })

  it('시스템이 실패로 닫은 기록은 「시스템이 실패로 닫았어요」다', () => {
    expect(decisionLineText({ action: 'fail', actorType: 'system', agentName: null })).toBe('시스템이 실패로 닫았어요')
  })

  it('사람의 실패 기록은 결과형이라 「관리자가」를 붙이지 않는다', () => {
    expect(decisionLineText({ action: 'fail', actorType: 'admin', agentName: null })).toBe('예약 등록에 실패했어요')
    expect(decisionLineText({ action: 'fail', actorType: 'agent', agentName: '윤진' })).toBe('예약 등록에 실패했어요')
  })

  it('모르는 행동은 「기록을 남겼어요」다', () => {
    expect(decisionLineText({ action: 'something_else', actorType: 'admin', agentName: null })).toBe('관리자가 기록을 남겼어요')
    expect(decisionLineText({ action: 'toString', actorType: 'admin', agentName: null })).toBe('관리자가 기록을 남겼어요')
  })

  it('결정 기록의 행동 10종마다 동사구가 있다', () => {
    for (const action of OPS_DECISION_ACTIONS) {
      expect(DECISION_ACTION_LABELS[action], action).toBeTruthy()
    }
  })
})

describe('classifyActor — line.ts 정본', () => {
  it('토큰은 에이전트, system:은 시스템, 그 밖은 관리자다', () => {
    expect(classifyActor('token:윤진')).toEqual({ actorType: 'agent', agentName: '윤진' })
    expect(classifyActor('token:')).toEqual({ actorType: 'agent', agentName: null })
    expect(classifyActor('system:reconcile')).toEqual({ actorType: 'system', agentName: null })
    expect(classifyActor('3f1b2c9e-0d6a-4b7e-9a51-2c8d7e6f5a40')).toEqual({ actorType: 'admin', agentName: null })
  })

  it('actor 원문을 행으로 바로 문장으로 만들 수 있다', () => {
    expect(decisionLineText({ action: 'submit', ...classifyActor('token:') })).toBe('에이전트가 제출했어요')
    expect(decisionLineText({ action: 'fail', ...classifyActor('system:reconcile') })).toBe('시스템이 실패로 닫았어요')
  })
})
