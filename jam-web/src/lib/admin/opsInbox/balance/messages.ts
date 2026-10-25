/**
 * 밸런스 경고 문장 (티켓 20260930_1459 조각 A, 순수 함수).
 *
 * 문구는 채원의 확정 설계(티켓 「확정 설계」)를 따른다. 해요체이고 **무엇이 · 얼마나 · 기준이 무엇인지** 순서다.
 * 임시값 규칙의 경고에는 괄호 대신 화면의 「임시값·실측 전」 칩이 붙으므로 문장에는 임시값 표시를 넣지 않는다.
 * 문장은 화면이 React 텍스트 노드로만 그린다(제출 문자열이 섞여도 HTML로 해석되지 않는다).
 */
import { formatKstDayTime } from '@/lib/admin/opsInbox/labels'
import { BALANCE_RULE_OBJECTS, POINT_KIND_LABELS, type BalanceRuleKey, type PointKind } from './rules'

/** 「점검 못 함」이 된 까닭. 시각·숫자·서비스 상태가 큰 세 갈래이고, 나머지는 그 변형이다. */
export type UnreadableCause =
  | 'start_missing'
  | 'start_invalid'
  | 'end_missing'
  | 'end_invalid'
  | 'points_missing'
  | 'points_invalid'
  | 'condition'
  | 'reward_badge'
  | 'state'
  | 'rule_value'

const START_LABEL = '공개 시각'
const END_LABEL = '종료 시각'

/** 「점검 못 함」 문장: 무엇을 못 쟀는지 · 왜 · 어떻게 하면 다시 재는지. */
export function unreadableMessage(rule: BalanceRuleKey, cause: UnreadableCause): string {
  const target = `${BALANCE_RULE_OBJECTS[rule]} 확인하지 못했어요.`
  switch (cause) {
    case 'start_missing':
      return `${START_LABEL}이 없어서 ${target} 시각을 적으면 다시 확인해요.`
    case 'end_missing':
      return `${END_LABEL}이 없어서 ${target} 시각을 적으면 다시 확인해요.`
    case 'start_invalid':
      return `${START_LABEL} 형식이 맞지 않아서 ${target} 시각을 고치면 다시 확인해요.`
    case 'end_invalid':
      return `${END_LABEL} 형식이 맞지 않아서 ${target} 시각을 고치면 다시 확인해요.`
    case 'points_missing':
      return `포인트가 없어서 ${target} 숫자로 적으면 다시 확인해요.`
    case 'points_invalid':
      return `포인트가 숫자가 아니어서 ${target} 숫자로 고치면 다시 확인해요.`
    case 'condition':
      return `배지 조건을 읽을 수 없어서 ${target} 조건을 고치면 다시 확인해요.`
    case 'reward_badge':
      return `보상 배지의 포인트를 읽을 수 없어서 ${target} 배지를 고치면 다시 확인해요.`
    case 'state':
      return `서비스 상태를 읽지 못해서 ${target} 새로 고치면 다시 확인해요.`
    case 'rule_value':
      return `규칙 값을 읽을 수 없어서 ${target} 값을 고치면 다시 확인해요.`
  }
}

// ── 숫자 표기와 조사 ────────────────────────────────────────────────────────────────────────────

/** 정수는 그대로, 소수는 둘째 자리까지 쓴다(`2.50` → `2.5`). */
export function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

/**
 * 숫자를 읽었을 때 마지막 소리에 받침이 있는지. 10의 배수는 영·십·백·천·만처럼 받침으로 끝나고, 그 밖에는 마지막 자리가
 * 1(일)·3(삼)·6(육)·7(칠)·8(팔)이면 받침이 있다. 소수는 마지막 자리 숫자를 한 자씩 읽는다고 보고 같은 기준을 쓴다.
 */
export function numberHasBatchim(text: string): boolean {
  const last = text[text.length - 1]
  if (text.includes('.')) return '013678'.includes(last)
  return Number(text) % 10 === 0 || '13678'.includes(last)
}

function withAndParticle(text: string): string {
  return `${text}${numberHasBatchim(text) ? '과' : '와'}`
}

function withObjectParticle(text: string): string {
  return `${text}${numberHasBatchim(text) ? '을' : '를'}`
}

// ── 규칙별 경고 문장 ────────────────────────────────────────────────────────────────────────────

/** R1: 「이 컬렉션이 열리는 10/12(월) 09:00에 열려 있을 컬렉션이 31개예요. 동시에 6개까지가 기준이에요.」 */
export function openCollectionsMessage(startsAtIso: string, count: number, max: number): string {
  const when = formatKstDayTime(startsAtIso) ?? startsAtIso
  return `이 컬렉션이 열리는 ${when}에 열려 있을 컬렉션이 ${formatCount(count)}개예요. 동시에 ${formatCount(max)}개까지가 기준이에요.`
}

/** R2: 「이번 주(10/12~10/18)에 새 컬렉션을 2개 열어요(10/12, 10/15). 한 주에 1개까지가 기준이에요.」 */
export function weeklyNewMessage(range: string, dates: readonly string[], count: number, max: number): string {
  return `이번 주(${range})에 새 컬렉션을 ${formatCount(count)}개 열어요(${dates.join(', ')}). 한 주에 ${formatCount(max)}개까지가 기준이에요.`
}

/** R3: 「공개 시각(10/26)부터 거슬러 28일 안에 새 컬렉션이 3개예요(다른 기획의 2개 포함). 28일에 2개까지가 기준이에요.」 */
export function rollingNewMessage(anchorDay: string, count: number, othersCount: number, max: number): string {
  const others = othersCount > 0 ? `(다른 기획의 ${formatCount(othersCount)}개 포함)` : ''
  return `공개 시각(${anchorDay})부터 거슬러 28일 안에 새 컬렉션이 ${formatCount(count)}개예요${others}. 28일에 ${formatCount(max)}개까지가 기준이에요.`
}

/**
 * R4: 「공개까지 20일 남았어요. 최소 28일은 필요해요.」 승인 뒤에는 기준 시각이 승인 시각이라 「승인할 때」로 시작한다
 * (PRD §5.2). 공개 시각이 이미 지났으면 남은 일수 대신 그 사실을 쓴다.
 */
export function leadTimeMessage(leadDays: number, minDays: number, afterApproval: boolean): string {
  const need = `최소 ${formatCount(minDays)}일은 필요해요.`
  if (leadDays < 0) return afterApproval ? `승인할 때 이미 공개 시각이 지나 있었어요. ${need}` : `공개 시각이 이미 지났어요. ${need}`
  const days = formatCount(Math.floor(leadDays))
  return afterApproval ? `승인할 때 공개까지 ${days}일이 남아 있었어요. ${need}` : `공개까지 ${days}일 남았어요. ${need}`
}

/** 포인트 종류마다 「이 ~가 주는 포인트」의 주어. */
const POINT_SUBJECTS: Record<PointKind, string> = {
  count_badge: '이 횟수형 JAM! 배지가 주는 포인트가',
  achievement_badge: '이 달성형 JAM! 배지가 주는 포인트가',
  mission: '이 미션이 주는 포인트가',
  collection_completion: '이 컬렉션을 완성하면 받는 포인트가',
  recipe: '이 레시피가 주는 포인트가',
}

/** 「~은/는 N 포인트까지가 기준이에요」의 주제어(조사까지). */
const POINT_TOPICS: Record<PointKind, string> = {
  count_badge: '횟수형 JAM! 배지는',
  achievement_badge: '달성형 JAM! 배지는',
  mission: '미션은',
  collection_completion: '컬렉션 완성은',
  recipe: '레시피는',
}

/** R5: 「이 미션이 주는 포인트가 80 포인트예요. 미션은 50 포인트까지가 기준이에요.」 */
export function pointRewardMessage(kind: PointKind, points: number, max: number): string {
  return `${POINT_SUBJECTS[kind]} ${formatCount(points)} 포인트예요. ${POINT_TOPICS[kind]} ${formatCount(max)} 포인트까지가 기준이에요.`
}

/** R6: 「미션 포인트 40과 보상 배지 포인트 30을 합쳐 70 포인트를 한 번에 받아요. 미션은 50 포인트까지가 기준이에요.」 */
export function singleActionMessage(
  kind: 'mission' | 'collection_completion',
  ownPoints: number,
  badgePoints: number,
  sum: number,
  max: number
): string {
  const own = withAndParticle(formatCount(ownPoints))
  const badge = withObjectParticle(formatCount(badgePoints))
  return `${POINT_KIND_LABELS[kind]} 포인트 ${own} 보상 배지 포인트 ${badge} 합쳐 ${formatCount(sum)} 포인트를 한 번에 받아요. ${POINT_TOPICS[kind]} ${formatCount(max)} 포인트까지가 기준이에요.`
}

/** R7: 「같은 계열(run_count)의 횟수형 배지 단계 포인트를 모두 더하면 130 포인트예요. 100 포인트까지가 기준이에요.」 */
export function countLadderMessage(familyKey: string, sum: number, max: number): string {
  return `같은 계열(${familyKey})의 횟수형 배지 단계 포인트를 모두 더하면 ${formatCount(sum)} 포인트예요. ${formatCount(max)} 포인트까지가 기준이에요.`
}

/**
 * R8 경제 정책 값 이름. 드랍 확률·등급 비율은 「드랍 확률 값」, 믹스 실패 보상은 「믹스 실패 보상 값」, 등급 올리기 윗등급 확률은 「등급 올리기 확률 값」, 나머지는 「경제 정책 값」이다.
 * `tier_up_probability`는 `combine_policy`의 칸이다(마이그레이션 287, 티켓 20261023_1648). 규칙 행(`ops_rules`의 `economy_keys`)에 이 이름이 들어 있을 때 쓰는 이름표이고, 행에 넣는 일은 DB 변경이라 이 파일이 하지 않는다.
 */
export function economyKeyLabel(key: string): string {
  if (key.startsWith('rarity_') || key.startsWith('bonus_drop_rate')) return '드랍 확률 값'
  if (key === 'fail_reward_points') return '믹스 실패 보상 값'
  if (key === 'tier_up_probability') return '등급 올리기 확률 값'
  return '경제 정책 값'
}

const ECONOMY_KEYS_SHOWN = 3

/** R8: 「드랍 확률 값(rarity_common)이 이 항목에 들어 있어요. 경제 수치는 기획에서 바꾸지 않는 게 기준이에요.」 */
export function economyKeysMessage(keys: readonly string[]): string {
  const rule = '경제 수치는 기획에서 바꾸지 않는 게 기준이에요.'
  if (keys.length === 1) return `${economyKeyLabel(keys[0])}(${keys[0]})이 이 항목에 들어 있어요. ${rule}`
  const shown = keys.slice(0, ECONOMY_KEYS_SHOWN).join(', ')
  const rest = keys.length - ECONOMY_KEYS_SHOWN
  return `경제 정책 값 ${keys.length}개(${shown}${rest > 0 ? ` 외 ${rest}개` : ''})가 이 항목에 들어 있어요. ${rule}`
}

// ── 화면 문구(채원 확정 설계) ───────────────────────────────────────────────────────────────────

export const BALANCE_BLOCK_TITLE = '밸런스 경고'
export const BALANCE_REGION_LABEL = '밸런스 경고'
export const BALANCE_TAB_LABEL = '밸런스 경고'
export const BALANCE_ITEM_FOOTER = '경고가 있어도 승인할 수 있어요.'
export const BALANCE_EDITING_NOTE = '고치는 중이에요. 저장하면 밸런스를 다시 확인해요'
export const BALANCE_RULE_LINK_LABEL = '밸런스 규칙 보기'
export const BALANCE_SAMPLE_NOTE = '시험 묶음이에요. 이 묶음의 항목은 다른 묶음의 경고 계산에 들어가지 않아요.'
export const BALANCE_FAILED_NOTICE = '밸런스를 확인하지 못했어요. 새로 고치면 다시 확인해요. 승인은 할 수 있어요.'
export const BALANCE_SHOW_ITEMS_LABEL = '경고 있는 항목만 보기'
export const PROVISIONAL_CHIP_LABEL = '임시값·실측 전'
export const AGENT_BALANCE_TITLE = '에이전트가 적은 밸런스 판정'
export const TOOL_CHECK_TITLE = '툴 점검'

/** 경고 줄 앞의 수준 칩 글자. 「점검 못 함」은 수치를 읽지 못한 줄이다. */
export const BALANCE_LINE_LABELS = { warn: '주의', info: '참고', unreadable: '점검 못 함' } as const

/** 묶음 알림 제목: 「밸런스 경고 3건이 있어요」. */
export function balanceNoticeTitle(total: number): string {
  return `밸런스 경고 ${total}건이 있어요`
}

/** 묶음 알림 부제: 「주의 2건 · 참고 1건. 경고가 있어도 승인할 수 있어요.」 */
export function balanceNoticeSubtitle(warn: number, info: number): string {
  return `주의 ${warn}건 · 참고 ${info}건. ${BALANCE_ITEM_FOOTER}`
}

/** 목록 행 칩: 주의가 있으면 「밸런스 주의 N」, 없고 참고(점검 못 함 포함)만 있으면 「밸런스 참고 N」. */
export function balanceRowChipLabel(level: 'warn' | 'info', count: number): string {
  return `밸런스 ${level === 'warn' ? '주의' : '참고'} ${count}`
}

/** 반려·취소·실패 항목은 밸런스를 확인하지 않는다. */
const SKIPPED_ITEM_TEXTS: Record<string, string> = {
  rejected: '반려한 항목은 밸런스를 확인하지 않아요',
  cancelled: '취소한 항목은 밸런스를 확인하지 않아요',
  failed: '실패한 항목은 밸런스를 확인하지 않아요',
}

/** 항목 상세 ⑤ 「툴 점검」 줄. */
export function toolCheckText(args: {
  status: string
  evaluationFailed: boolean
  checkedRuleCount: number
  warnCount: number
  infoCount: number
}): string {
  const skipped = SKIPPED_ITEM_TEXTS[args.status]
  if (skipped) return skipped
  if (args.evaluationFailed) return '확인하지 못했어요'
  if (args.checkedRuleCount === 0) return '이 항목에 적용되는 켜 둔 규칙이 없어요'
  const checked = `켜 둔 규칙 ${args.checkedRuleCount}개를 확인했고`
  if (args.warnCount + args.infoCount === 0) return `${checked} 넘는 것이 없어요`
  return `${checked} 주의 ${args.warnCount}건, 참고 ${args.infoCount}건이 있어요`
}

/** 컬렉션 런칭 항목의 ⑤ 보조 줄. */
export function openCollectionsNowText(count: number): string {
  return `지금 열린 컬렉션은 ${count}개예요`
}
