/**
 * 결정 기록 한 줄의 문장 (티켓 20261006_1339 ②-a, 상위 20260930_1502 「②가 먼저 만들어 둘 공용」 (4)).
 *
 * 받은 기획함 상세(S3)의 결정 기록, 운영 홈의 최근 이력(S1), 일정표 서랍(S4)이 **같은 문장**을 내도록 (행동, 행위자 종류, 이름)을
 * 받는 순수 함수 하나로 모았다. 서버 전용 모듈을 끌어오지 않는다(`'use client'` 화면과 서버 읽기 함수가 둘 다 불러온다).
 *
 * 규칙:
 * - 행동 이름은 `DECISION_ACTION_LABELS`, 모르는 행동은 「기록을 남겼어요」다.
 * - 시스템이 실패로 닫은 기록은 「시스템이 실패로 닫았어요」, 사람의 실패 기록은 결과형이라 「관리자가」를 붙이지 않는다.
 * - 에이전트 이름은 자기 신고 값이라 글자로만 보여 주고 40자에서 자른다. 이름이 비어 있으면 「에이전트()가」 대신 「에이전트가」다.
 */
import { OPS_RECONCILE_ACTOR } from '@/lib/admin/opsInbox/constants'
import { truncateText } from '@/lib/admin/opsInbox/itemView'

export type OpsActorType = 'admin' | 'agent' | 'system'

/** 에이전트 토큰 제출의 행위자 접두사(`token:<에이전트 이름>`, `app/api/admin/ops-inbox/route.ts`가 붙인다). */
const AGENT_ACTOR_PREFIX = 'token:'
/** 시스템 행위자 접두사(`system:reconcile` 등). 정본 값은 `OPS_RECONCILE_ACTOR`이고 앞으로 `system:` 아래에 값이 더 생길 수 있다. */
const SYSTEM_ACTOR_PREFIX = OPS_RECONCILE_ACTOR.slice(0, OPS_RECONCILE_ACTOR.indexOf(':') + 1)

/** 에이전트 이름을 자르는 글자 수. */
export const DECISION_AGENT_NAME_MAX = 40

/** `actor` 원문을 행위자 종류로 바꾼다. 관리자 ID는 이름 없이 `admin`이 되어 원문이 남지 않는다. */
export function classifyActor(actor: string): { actorType: OpsActorType; agentName: string | null } {
  if (actor.startsWith(AGENT_ACTOR_PREFIX)) {
    return { actorType: 'agent', agentName: actor.slice(AGENT_ACTOR_PREFIX.length) || null }
  }
  if (actor.startsWith(SYSTEM_ACTOR_PREFIX)) return { actorType: 'system', agentName: null }
  return { actorType: 'admin', agentName: null }
}

/** 결정 기록 `action` 값마다의 동사구. 정본 값은 `opsInbox/constants.ts`의 `OPS_DECISION_ACTION_*`다. */
export const DECISION_ACTION_LABELS: Record<string, string> = {
  submit: '제출했어요',
  approve: '승인했어요',
  reject: '반려했어요',
  edit: '수정했어요',
  revert: '수정을 되돌렸어요',
  execute: '예약 등록했어요',
  fail: '예약 등록에 실패했어요',
  cancel: '공개 전에 취소했어요',
  end: '종료했어요',
  external_change: '밖에서 바뀐 것을 찾았어요',
}

/** 사람이 한 일이 아니라 일이 잘못돼 남는 기록. 행위자가 사람이면 앞에 「관리자가」를 붙이지 않는다(실행한 관리자가 실패한 것이 아니다). */
const DECISION_OUTCOME_ACTIONS: ReadonlySet<string> = new Set(['fail'])

/** 시스템이 실패로 닫은 기록. 사람의 실패 기록(「예약 등록에 실패했어요」)과 달리 닫은 주체가 시스템이다. */
const SYSTEM_FAIL_LABEL = '시스템이 실패로 닫았어요'

export interface DecisionLineInput {
  action: string
  actorType: OpsActorType
  /** 에이전트일 때만 쓴다. 비었거나 공백뿐이면 이름 없이 쓴다. */
  agentName: string | null
}

/** 결정 기록 한 줄의 문장(날짜·사유·차이는 호출부가 따로 붙인다). */
export function decisionLineText({ action, actorType, agentName }: DecisionLineInput): string {
  const label = Object.prototype.hasOwnProperty.call(DECISION_ACTION_LABELS, action)
    ? DECISION_ACTION_LABELS[action]
    : '기록을 남겼어요'
  const bySystem = actorType === 'system'
  if (bySystem && action === 'fail') return SYSTEM_FAIL_LABEL
  if (DECISION_OUTCOME_ACTIONS.has(action)) return label
  if (bySystem) return `시스템이 ${label}`
  if (actorType === 'agent') {
    const name = (agentName ?? '').trim()
    return name === '' ? `에이전트가 ${label}` : `에이전트(${truncateText(name, DECISION_AGENT_NAME_MAX)})가 ${label}`
  }
  return `관리자가 ${label}`
}
