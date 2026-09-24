/**
 * 어드민 메인 「컨텐츠 공백 경고」(티켓 20260924_0912) — 미션 공백과 카드 편성 공백을 판정한다.
 *
 * 판정 함수(`isPublicMission`·`checkMissionGaps`·`checkCardGaps`)와 문구 함수는 DB 접근이 없는
 * 순수 함수다. 조회는 `fetchContentGaps` 하나만 한다(조회만 하며 DB를 바꾸지 않는다).
 *
 * 규칙의 원천:
 * - 공개 미션의 정의·공백 금지·상시 입문 미션·시즌 공개 미션은 `docs/specs/SERVICE_OPERATIONS.md`
 *   §9-5가 원천이다. 여기서는 그 규칙을 검사하는 방법(상수·근사)만 적는다.
 * - 카드 "미편성"의 정의는 캘린더와 같다(`weeklyCards`의 `unprogrammed`).
 * - 검사 시점·기간(60일·14일·금요일)은 2026-09-24 사용자 결정이다(티켓 0912).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { mondayOfWeek } from './cronSchedule'
import { kstDayBoundsIso, shiftDateStr, todayKstDateString } from './today-calendar'
import { weeklyCards, type WeeklyCardInput } from './weeklyCards'
import type { MissionRow } from '@/types/database'

/** 미션 공백 검사 범위(일). 오늘부터 앞으로 이 일수 동안 공개 미션이 없는 날이 있으면 경고한다. */
export const MISSION_GAP_HORIZON_DAYS = 60

/**
 * 종료 임박 기준(일). 종료일이 오늘부터 이 일수 이내(오늘+N일까지)인 기간 공개 미션에
 * 이어지는 기간 공개 미션이 없으면 경고한다. 종료일이 오늘+N일인 미션은 검사하고 오늘+N+1일은 제외한다.
 */
export const MISSION_ENDING_NOTICE_DAYS = 14

/** 다음 주 카드 편성 검사를 시작하는 요일(0=일 … 5=금 … 6=토). 금요일부터(금·토·일) 검사한다. */
export const NEXT_WEEK_CHECK_FROM_WEEKDAY = 5

/** 경고 문구에 날짜를 나열하는 최대 개수 */
export const CARD_GAP_LIST_MAX = 7

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** 미션 판정에 필요한 컬럼만 추린 입력 타입 */
export type ContentGapMissionInput = Pick<
  MissionRow,
  'id' | 'title' | 'starts_at' | 'ends_at' | 'gate_axis' | 'visibility_rule_json'
>

/** 공개 미션: 게이트 축(`gate_axis`)도 노출 조건(`visibility_rule_json`)도 없는 미션(§9-5) */
export function isPublicMission(
  m: Pick<ContentGapMissionInput, 'gate_axis' | 'visibility_rule_json'>
): boolean {
  const hasGateAxis = m.gate_axis != null && m.gate_axis !== ''
  return !hasGateAxis && m.visibility_rule_json == null
}

export interface EndingMissionWithoutSuccessor {
  id: string
  title: string
  /** 'YYYY-MM-DD'(KST) 종료일 */
  endDate: string
}

export interface MissionGapResult {
  /** 이미 시작한 상시(종료일 없는) 공개 미션이 0건이면 true */
  noIntroMission: boolean
  /** 오늘부터 MISSION_GAP_HORIZON_DAYS일 중 공개 미션이 없는 날짜('YYYY-MM-DD', 오름차순) */
  gapDates: string[]
  /** 종료가 임박했는데 이어지는 기간 공개 미션이 없는 미션(종료일 오름차순) */
  endingWithoutSuccessor: EndingMissionWithoutSuccessor[]
  /** 위 세 가지 중 하나라도 있으면 true */
  hasGap: boolean
}

/** ISO 시각 → KST 달력 날짜 'YYYY-MM-DD' */
function kstDateOf(iso: string): string {
  return todayKstDateString(new Date(iso))
}

/**
 * 공개 미션의 공백을 판정한다. 날짜 비교는 KST 달력 날짜 기준이다.
 *
 * - (a) 이미 시작한(`starts_at`이 지금 이전) 상시 공개 미션이 0건이면 경고
 * - (b) 오늘부터 60일 중 걸치는 공개 미션이 없는 날짜가 있으면 경고
 * - (c) 종료일이 오늘 이후 14일 이내(종료일이 오늘+14일까지)인 기간 공개 미션에 이어지는 기간 공개
 *   미션이 없으면 경고. 이어지는 미션은 종료가 더 늦고 시작이 그 미션 종료 다음 날 시작 시각
 *   이전(그 시각 정각 포함)인 다른 기간 공개 미션이다(이미 겹쳐 있어도 인정). 상시 미션은 후속으로 인정하지 않는다.
 *   시즌 캘린더가 데이터로 없어 §9-5의 시즌 규칙은 이렇게 근사한다.
 */
export function checkMissionGaps(missions: ContentGapMissionInput[], now: Date): MissionGapResult {
  const today = todayKstDateString(now)
  const nowMs = now.getTime()
  const publics = missions.filter(isPublicMission)

  // (a) 상시 입문 미션
  const noIntroMission = !publics.some(
    (m) => m.ends_at == null && new Date(m.starts_at).getTime() <= nowMs
  )

  // (b) 60일 안의 공개 미션 공백 날짜
  const gapDates: string[] = []
  for (let i = 0; i < MISSION_GAP_HORIZON_DAYS; i++) {
    const date = shiftDateStr(today, i)
    const { startIso, endIso } = kstDayBoundsIso(date)
    const dayStart = new Date(startIso).getTime()
    const dayEnd = new Date(endIso).getTime()
    const covered = publics.some(
      (m) =>
        new Date(m.starts_at).getTime() <= dayEnd &&
        (m.ends_at == null || new Date(m.ends_at).getTime() >= dayStart)
    )
    if (!covered) gapDates.push(date)
  }

  // (c) 종료 임박 기간 미션의 후속 유무
  const lastNoticeDate = shiftDateStr(today, MISSION_ENDING_NOTICE_DAYS)
  const periodMissions = publics.filter((m) => m.ends_at != null)
  const endingWithoutSuccessor: EndingMissionWithoutSuccessor[] = []
  for (const m of periodMissions) {
    const endDate = kstDateOf(m.ends_at as string)
    if (endDate < today || endDate > lastNoticeDate) continue
    const endMs = new Date(m.ends_at as string).getTime()
    const nextDayStartMs = new Date(kstDayBoundsIso(shiftDateStr(endDate, 1)).startIso).getTime()
    const hasSuccessor = periodMissions.some(
      (o) =>
        o.id !== m.id &&
        new Date(o.ends_at as string).getTime() > endMs &&
        new Date(o.starts_at).getTime() <= nextDayStartMs
    )
    if (!hasSuccessor) endingWithoutSuccessor.push({ id: m.id, title: m.title, endDate })
  }
  endingWithoutSuccessor.sort((a, b) => a.endDate.localeCompare(b.endDate))

  return {
    noIntroMission,
    gapDates,
    endingWithoutSuccessor,
    hasGap: noIntroMission || gapDates.length > 0 || endingWithoutSuccessor.length > 0,
  }
}

export interface CardGapResult {
  /** 미편성 날짜('YYYY-MM-DD', 오름차순). 이번 주는 오늘부터, 다음 주는 금요일부터 검사한다 */
  unprogrammedDates: string[]
  /** 다음 주까지 검사했으면 true(금·토·일) */
  checkedNextWeek: boolean
  hasGap: boolean
}

/** 'YYYY-MM-DD'의 요일 번호(0=일 … 6=토) */
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 다음 주를 검사하는 날인가: 금·토·일 */
function checksNextWeek(today: string): boolean {
  const weekday = weekdayOf(today)
  return weekday === 0 || weekday >= NEXT_WEEK_CHECK_FROM_WEEKDAY
}

/**
 * 카드 편성 공백을 판정한다. 이번 주는 오늘(포함)부터 일요일까지 항상 검사하고, 다음 주(월~일)는
 * 금요일부터 검사한다(목요일 배포 실행이 23:59 KST라 그 전에는 다음 주가 비어 있는 것이 정상이다).
 * "미편성"은 `weeklyCards`의 `unprogrammed`(활성 단기 카드가 하나도 없는 날)와 같다.
 */
export function checkCardGaps(cards: WeeklyCardInput[], now: Date): CardGapResult {
  const today = todayKstDateString(now)
  const thisMonday = mondayOfWeek(today)
  const checkedNextWeek = checksNextWeek(today)

  const days = weeklyCards(cards, thisMonday).filter((d) => d.date >= today)
  if (checkedNextWeek) days.push(...weeklyCards(cards, shiftDateStr(thisMonday, 7)))

  const unprogrammedDates = days.filter((d) => d.unprogrammed).map((d) => d.date)
  return { unprogrammedDates, checkedNextWeek, hasGap: unprogrammedDates.length > 0 }
}

/** 'YYYY-MM-DD' → 'M/D' */
export function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}/${d}`
}

/** 'YYYY-MM-DD' → 'M/D(요일)' */
export function formatMonthDayWeekday(dateStr: string): string {
  return `${formatMonthDay(dateStr)}(${WEEKDAY_LABELS[weekdayOf(dateStr)]})`
}

/** 미션 공백 경고 문구 목록(문제가 없으면 빈 배열) */
export function missionGapMessages(result: MissionGapResult): string[] {
  const messages: string[] = []
  if (result.noIntroMission) messages.push('상시 입문 미션이 없어요')
  if (result.gapDates.length > 0) {
    const first = formatMonthDay(result.gapDates[0])
    messages.push(
      result.gapDates.length > 1
        ? `${first} 공개 미션이 없어요 (총 ${result.gapDates.length}일)`
        : `${first} 공개 미션이 없어요`
    )
  }
  for (const m of result.endingWithoutSuccessor) {
    messages.push(`'${m.title}'이 ${formatMonthDay(m.endDate)}에 끝나는데 이어지는 기간 미션이 없어요`)
  }
  return messages
}

/** 카드 편성 공백 경고 문구(문제가 없으면 null) */
export function cardGapMessage(result: CardGapResult): string | null {
  const { unprogrammedDates } = result
  if (unprogrammedDates.length === 0) return null
  const listed = unprogrammedDates.slice(0, CARD_GAP_LIST_MAX).map(formatMonthDayWeekday).join(', ')
  const rest = unprogrammedDates.length - CARD_GAP_LIST_MAX
  return `미편성 ${unprogrammedDates.length}일: ${listed}${rest > 0 ? ` 외 ${rest}일` : ''}`
}

/** 한 출처의 조회 결과. 실패하면 result는 null이고 error에 사유가 들어간다 */
export interface ContentGapSource<T> {
  result: T | null
  error: string | null
}

export interface ContentGaps {
  missions: ContentGapSource<MissionGapResult>
  cards: ContentGapSource<CardGapResult>
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

/**
 * 미션·카드를 "지금" 기준으로 조회해 두 공백 판정을 독립적으로 돌려준다(한쪽 실패가 다른 쪽에
 * 영향을 주지 않는다). 캘린더가 보고 있는 주와 무관하다.
 */
export async function fetchContentGaps(now: Date = new Date()): Promise<ContentGaps> {
  const today = todayKstDateString(now)

  const loadMissions = async (): Promise<ContentGapSource<MissionGapResult>> => {
    try {
      const supabase = createServiceClient()
      const { startIso } = kstDayBoundsIso(today)
      const { data, error } = await supabase
        .from('missions')
        .select('id, title, starts_at, ends_at, gate_axis, visibility_rule_json')
        .or(`ends_at.is.null,ends_at.gte.${startIso}`)
      if (error) throw error
      return { result: checkMissionGaps((data ?? []) as ContentGapMissionInput[], now), error: null }
    } catch (e) {
      return { result: null, error: errorMessage(e) }
    }
  }

  const loadCards = async (): Promise<ContentGapSource<CardGapResult>> => {
    try {
      const supabase = createServiceClient()
      const thisMonday = mondayOfWeek(today)
      const { startIso } = kstDayBoundsIso(thisMonday)
      const { endIso } = kstDayBoundsIso(shiftDateStr(thisMonday, 13))
      const { data, error } = await supabase
        .from('today_cards')
        .select('id, title, content_type_id, template_type, starts_at, ends_at, is_active, sort_order')
        .lte('starts_at', endIso)
        .gte('ends_at', startIso)
      if (error) throw error
      return { result: checkCardGaps((data ?? []) as WeeklyCardInput[], now), error: null }
    } catch (e) {
      return { result: null, error: errorMessage(e) }
    }
  }

  const [missions, cards] = await Promise.all([loadMissions(), loadCards()])
  return { missions, cards }
}
