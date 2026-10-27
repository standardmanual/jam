/**
 * 생태계 상황판의 글자 만들기 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 값 글자, 표본 부족 사유 글자, 상태 글자·기호. 서버·클라이언트 어디서든 쓰는 순수 모듈이다.
 * 밸런스 단위(`ValueUnit`)의 글자는 밸런스 지표 카드(`formatMeasuredValue`)를 그대로 쓰고, 개수(`count`)와 잼(`jam`)만 새로 만든다.
 */
import { formatMeasuredValue } from '@/components/admin/balanceDashboard/MetricCard'
import type { SampleUnit } from '@/lib/admin/balanceDashboard/types'
import type { HeadlineUnit, NodeStatus, Shortfall } from '@/lib/admin/ecosystem/types'

/** 값이 없을 때(부족·읽지 못함) 값 자리에 쓰는 글자 */
export const NO_VALUE_TEXT = '–'

/** 세 자리마다 쉼표를 찍은 정수 글자. 개수는 정수지만 소수가 들어와도 보이는 자릿수로 맞춘다 */
function grouped(value: number): string {
  return Number(value.toFixed(0)).toLocaleString('en-US')
}

/** 값을 단위와 함께 글자로 만든다. 값이 `null`이면 `NO_VALUE_TEXT` */
export function formatHeadlineValue(unit: HeadlineUnit, value: number | null): string {
  if (value === null) return NO_VALUE_TEXT
  switch (unit) {
    case 'count':
      return `${grouped(value)}건`
    case 'jam':
      return `${grouped(value)}잼`
    default:
      return formatMeasuredValue(unit, value)
  }
}

/** 표본을 세는 단위의 글자. 등급 체감만 유저-주·유저-월로 센다 */
const SAMPLE_UNIT_WORD: Record<SampleUnit, string> = { user: '명', user_week: '주', user_month: '달' }

function trimmed(value: number): string {
  return String(Number(value.toFixed(1)))
}

/** 표본 부족 사유 글자. 표본이 모자라면 «표본 N/M명», 관찰 기간이 모자라면 «관찰 기간이 모자라요» */
export function formatShortfall(shortfall: Shortfall): string {
  if (shortfall.reason === 'period') return '관찰 기간이 모자라요'
  const word = SAMPLE_UNIT_WORD[shortfall.unit]
  return `표본 ${trimmed(shortfall.sample)}/${trimmed(shortfall.minSample)}${word}`
}

export const STATUS_LABEL: Record<NodeStatus, string> = {
  ok: '정상',
  warn: '주의',
  stop: '중단',
  insufficient: '표본 부족',
  error: '읽지 못함',
  no_target: '목표 없음',
}

/** 색만으로 상태를 알리지 않으려고 글자 옆에 붙이는 기호(PRD §3 원칙 2) */
export const STATUS_SYMBOL: Record<NodeStatus, string> = {
  ok: '●',
  warn: '▲',
  stop: '■',
  insufficient: '◌',
  error: '!',
  no_target: '–',
}

/** 목표 대비 행 하나를 읽지 못했을 때 보이는 고정 문장([현상] → [해결]). DB 오류 원문은 싣지 않는다 */
export const GOAL_ROW_ERROR_TEXT = '지표를 불러오지 못했어요. 잠시 뒤 새로 고쳐 주세요.'
