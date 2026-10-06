/**
 * 일정표 주간 보기의 계산 (티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 주간·카리나 가정 3·4·6·11, 순수 함수 — DB 접근 없음).
 *
 * 운영 홈의 주간 캘린더 조립(`app/admin/_home/CalendarSection.tsx`)을 순수 함수로 옮기고, 운영 항목(받은 기획함)·상태·시험·신호를 더했다.
 * 반환값은 일반 객체(`Map`·`Date`·함수 없음)라 서버 컴포넌트에서 클라이언트 컴포넌트로 그대로 넘길 수 있다.
 *
 * ## 대표 카드
 * 날짜 서랍이 「대표 카드」를 보이도록 하루마다 날짜 구성의 대표 카드(`representative`)의 제목과 서랍 키를 싣는다.
 *
 * ## 칸 항목
 * - **운영 카드**(받은 기획함의 홈피드 카드 항목, 실제 카드와 합친 칸 포함): 걸치는 날마다 둔다(가정 3). 상태·시험 표식이 붙고, 실제 카드와 합친 칸에는 그 카드의 노출·열람 줄(`cardNote`)도 붙는다.
 * - **실제 단기 카드**: 걸치는 날마다, 비활성은 흐리게(`dim`). 노출·열람 수는 `cardNote`가 준다. 장기 카드는 줄 하나(`longActiveCount`·`longInactiveCount`)로만 보인다.
 * - **그 밖의 운영 항목**(미션·드랍 일정·믹스 레시피·JAM! 배지·컬렉션 런칭): **시작일 칸에만** 둔다(가정 3). 시작일이 이 주 앞이면 이 주의 **첫 칸**에 둔다 —
 *   그렇지 않으면 이미 진행 중인 항목이 이 주 어디에도 보이지 않는다.
 * - **상시 미션 시작**: 그 주에 새로 시작하는 상시 미션이 시작 요일 칸에 「시작」 항목으로 보인다(옛 캘린더와 같다).
 * - 반려·취소·실패 항목은 날짜 구성에 올라가지 않으므로 칸에 없다(가정 4). 신호 줄과 항목 서랍(`?item=`)으로만 만난다.
 * - 크론·예약 루틴은 칸 항목이 아니라 `automation`으로 따로 둔다(승인 #14 「자동 실행 N개」 접힘 줄).
 *
 * ## 합치기(실제 자원 ↔ 운영 항목)
 * 날짜 구성(`composition.ts`)이 활성 실제 카드·미션을 `created_resource`로 운영 항목과 한 칸으로 합쳐 둔다. 이 함수는 그 밖에 직접 읽은 **모든 실제 카드**(비활성 포함, 가정 11)와
 * **모든 실제 미션**에서도 세는 운영 항목이 가리키는 것을 뺀다 — 그러지 않으면 비활성 카드가 실제 카드(흐림)와 운영 항목으로 두 번 나온다. 반려·취소·실패 항목은 세지 않으므로
 * 그 항목이 가리킨 실제 카드는 그대로 남는다(`composition.ts`와 같은 규칙).
 *
 * ## 미션 막대(가정 3)
 * 운영 미션(합친 미션 포함)은 기간이 있으면 상태와 함께 막대에도 둔다. 옛 막대(`weeklyMissions`)에서는 합친 미션을 뺀다. 「상시 미션 N개」는 합친 미션까지 센 전체 수다.
 *
 * ## 못 읽은 재료
 * `cards`·`missions`·`bundles`가 `null`이면 읽지 못한 것이다 — 그 재료의 항목이 빠질 뿐 「없다」고 단정하지 않는다(호출부가 「읽지 못해 빠져 있어요」를 알린다).
 * 옛 캘린더의 「미편성」은 새 신호로 대체되어(승인 #15) 이 보기에서는 만들지 않는다.
 */
import {
  cronOccurrenceId,
  formatOccurrenceTime,
  getWeeklyCronOccurrences,
  type CronOccurrence,
} from '@/lib/admin/cronSchedule'
import { OPS_HOME_FEED_CARD_KIND } from '@/lib/admin/opsInbox/constants'
import { formatKstClock, kstDateKey } from '@/lib/admin/opsInbox/labels'
import { opsTargetHref } from '@/lib/admin/opsHome/links'
import {
  isCountedItemStatus,
  readMergeResourceId,
  type CompositionBundleItem,
  type CompositionCard,
  type DayComposition,
  type SignalBundleInput,
} from '@/lib/admin/opsSignals/composition'
import type { DaySignals } from '@/lib/admin/opsSchedule/signalDays'
import { routineOccurrenceId, weeklyRoutineOccurrences, type RoutineOccurrence } from '@/lib/admin/scheduledRoutines'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { weeklyCards, type WeeklyCardInput } from '@/lib/admin/weeklyCards'
import { weeklyMissions, type WeeklyMissionBar, type WeeklyMissionInput } from '@/lib/admin/weeklyMissions'
import { isGateMission } from '@/lib/missions/gateMissions'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DAY_MS = 24 * 3600_000
const PATTERN_PROPOSAL_KIND = 'pattern_proposal'

/** 칸 항목의 출처: 운영 항목(받은 기획함)·옛 카드(실제 카드만)·옛 미션(실제 미션만). */
export type ScheduleItemOrigin = 'ops' | 'card' | 'mission'

export interface ScheduleItem {
  /** 같은 칸 안에서 겹치지 않는 키(React key). */
  id: string
  origin: ScheduleItemOrigin
  /**
   * 서랍을 여는 키(③-b가 `?item=`에 쓴다): 운영 항목은 항목 ID, 옛 카드는 `card:<ID>`, 옛 미션은 `mission:<ID>`(가정 12).
   * 칸 항목을 눌렀을 때 서랍이 닫히면 포커스가 돌아올 자리를 찾는 키이기도 하다.
   */
  drawerKey: string
  /** 항목 종류(`OPS_ITEM_KINDS`의 값). 종류 아이콘을 고른다. */
  kind: string
  title: string
  /** 칸에 찍을 시각·자리. 운영 항목은 이 날 새로 시작할 때만 「09:00」이고 이어지는 날은 빈 글자다. 옛 카드는 유형 ID(없으면 「유형 없음」), 상시 미션 시작은 「상시」다. */
  time: string
  /** 운영 항목의 상태(10개 중 하나). 옛 카드·미션은 null이다. */
  status: string | null
  /** 시험 묶음의 항목인가. */
  isSample: boolean
  /** 흐리게 보일 항목(비활성 카드). */
  dim: boolean
  /** 항목을 누르면 가는 곳. ③-a에서는 운영 항목은 받은 기획함의 그 항목, 옛 카드·미션은 각자의 상세다. */
  href: string | null
  /** 제목 아래 작은 글씨(카드의 노출·열람 수). */
  note: string | null
}

/** 자동 실행 한 줄(크론·예약 루틴). */
export interface ScheduleAutomationItem {
  id: string
  time: string
  label: string
  /** 예약 루틴이면 true(크론과 구분하는 표식을 보인다). */
  routine: boolean
  /** 꺼진 루틴이면 true(흐리게). */
  dim: boolean
}

export interface ScheduleDay {
  /** KST `YYYY-MM-DD`. */
  date: string
  weekdayLabel: string
  /** 「10월 5일」. */
  dateLabel: string
  isToday: boolean
  items: ScheduleItem[]
  /** 그날 걸치는 활성 장기 카드 수와 비활성 장기 카드 수(합치지 않은 실제 카드만). 카드를 읽지 못했으면 0이다. */
  longActiveCount: number
  longInactiveCount: number
  automation: ScheduleAutomationItem[]
  /** 그날 신호. 신호를 읽지 못했으면 null이다(없다고 단정하지 않는다). */
  signals: DaySignals | null
  /** 그날의 대표 카드(전원 대상 카드 가운데 정렬이 가장 앞인 카드, 날짜 서랍이 보인다). 없으면 null이다. 반려·취소·실패 항목은 구성에 없어 대표가 될 수 없다. */
  representative: ScheduleRepresentative | null
}

/** 날짜 서랍이 보이는 대표 카드. 카드 자체는 칸 항목이 아닐 수도 있다(장기 카드는 칸 항목이 아니다). */
export interface ScheduleRepresentative {
  title: string
  /** 칸 항목과 같은 서랍 키: 운영 항목(합친 카드 포함)은 항목 ID, 실제 카드는 `card:<ID>`. 날짜 서랍에서 이 키가 그날 항목 안에 있으면 눌러 항목 서랍을 연다. */
  drawerKey: string
}

/** 미션 막대(기간 미션). 열 위치 0(월)~6(일)이고 주 밖으로 넘치는 쪽은 0·6으로 자른다. */
export interface ScheduleMissionBar {
  id: string
  title: string
  startCol: number
  endCol: number
  startsThisWeek: boolean
  endsThisWeek: boolean
  isGate: boolean
  /** 운영 미션의 상태. 옛 미션(운영 항목이 없는)은 null이다. */
  status: string | null
  isSample: boolean
  /** 운영 미션은 항목 ID, 옛 미션은 `mission:<ID>`. */
  drawerKey: string
  href: string | null
}

export interface ScheduleWeek {
  /** 월요일(KST `YYYY-MM-DD`)과 일요일. */
  weekStart: string
  weekEnd: string
  days: ScheduleDay[]
  missionBars: ScheduleMissionBar[]
  /** 상시 미션 수(합친 것까지 센 전체). 미션을 읽지 못했으면 null이다. */
  openEndedMissionCount: number | null
  /** 칸 항목·장기 카드·미션 막대의 합. 0이고 읽지 못한 재료가 없을 때만 「이 기간에는 올라온 항목이 없어요」를 보인다. 자동 실행은 세지 않는다. */
  contentCount: number
}

export interface BuildScheduleWeekInput {
  /** 월요일(KST `YYYY-MM-DD`). */
  weekStart: string
  /** 오늘(KST `YYYY-MM-DD`). */
  today: string
  includeSample: boolean
  /** 그 주 7일을 담은 날짜 구성(`loadDayCompositions`). 다른 날짜가 섞여 있어도 그 주만 쓴다. */
  compositions: readonly DayComposition[]
  /** 읽은 묶음과 항목. 못 읽었으면 null이다(합친 자원을 알 수 없다). */
  bundles: readonly SignalBundleInput[] | null
  /** 그 주에 걸치는 **모든** 실제 카드(비활성 포함, 가정 11). 못 읽었으면 null이다. */
  cards: readonly WeeklyCardInput[] | null
  /** 그 주에 걸치는 실제 미션(`gate_axis` 포함). 못 읽었으면 null이다. */
  missions: readonly WeeklyMissionInput[] | null
  /** 카드·날짜의 노출·열람 줄. 없으면 줄이 없다. */
  cardNote?: (cardId: string, date: string) => string | null
  /** 날짜별 신호(`signalsByDate`). 못 읽었으면 null이다. */
  signals: Readonly<Record<string, DaySignals>> | null
  /** 시험용: 크론·루틴을 직접 넘긴다. 없으면 이 저장소의 설정을 읽는다. */
  automation?: { cron: readonly CronOccurrence[]; routines: readonly RoutineOccurrence[] }
}

function dayOffset(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

function clock(iso: string): string {
  return formatKstClock(iso) ?? ''
}

function opsHref(bundleId: string | null, itemId: string, includeSample: boolean): string | null {
  return opsTargetHref({ bundleId, itemId }, { includeSample })
}

/**
 * 운영 카드 칸 항목. 실제 카드와 합친 카드(`resourceId`가 있다)는 그 실제 카드의 노출·열람 줄을 붙인다 — 합쳐도 줄이 사라지지 않게 한다(③-a에서 넘긴 조건).
 * 합치지 않은 운영 카드는 아직 카드가 없어 줄이 없다.
 */
function opsCardItem(
  card: CompositionCard,
  date: string,
  includeSample: boolean,
  cardNote: BuildScheduleWeekInput['cardNote']
): ScheduleItem {
  return {
    id: `ops-${card.id}-${date}`,
    origin: 'ops',
    drawerKey: card.id,
    kind: OPS_HOME_FEED_CARD_KIND,
    title: card.title,
    time: card.startsOnDay ? clock(card.startsAt) : '',
    status: card.status,
    isSample: card.isSample,
    dim: false,
    href: opsHref(card.bundleId, card.id, includeSample),
    note: card.resourceId === null ? null : (cardNote?.(card.resourceId, date) ?? null),
  }
}

function opsBundleItem(entry: CompositionBundleItem, date: string, includeSample: boolean): ScheduleItem {
  return {
    id: `ops-${entry.itemId}-${date}`,
    origin: 'ops',
    drawerKey: entry.itemId,
    kind: entry.kind ?? '',
    title: entry.title,
    time: entry.startsOnDay ? clock(entry.startsAt) : '',
    status: entry.status,
    isSample: entry.isSample,
    dim: false,
    href: opsHref(entry.bundleId, entry.itemId, includeSample),
    note: null,
  }
}

/** 세는 운영 항목이 가리키는 실제 카드·미션 ID(소문자). 반려·취소·실패·패턴 제안은 세지 않는다(`composition.ts`와 같다). */
function mergedResourceIds(
  bundles: readonly SignalBundleInput[] | null,
  includeSample: boolean
): { cards: Set<string>; missions: Set<string> } {
  const cards = new Set<string>()
  const missions = new Set<string>()
  for (const bundle of bundles ?? []) {
    if (bundle.isSample && !includeSample) continue
    for (const item of bundle.items) {
      if (!isCountedItemStatus(item.status) || item.kind === PATTERN_PROPOSAL_KIND) continue
      const resourceId = readMergeResourceId(item)
      if (resourceId === null) continue
      if (item.kind === OPS_HOME_FEED_CARD_KIND) cards.add(resourceId)
      else missions.add(resourceId)
    }
  }
  return { cards, missions }
}

export function buildScheduleWeek(input: BuildScheduleWeekInput): ScheduleWeek {
  const { weekStart, today, includeSample } = input
  const dates = Array.from({ length: 7 }, (_, index) => shiftDateStr(weekStart, index))
  const weekEnd = dates[6]
  const compositionByDate = new Map(input.compositions.filter((day) => dates.includes(day.date)).map((day) => [day.date, day]))
  const merged = mergedResourceIds(input.bundles, includeSample)

  // 실제 카드: 세는 운영 항목이 가리키는 카드는 뺀다(활성이어서 합쳐졌거나 비활성이어서 운영 항목만 보이는 경우 모두).
  const cardDays = input.cards === null ? null : weeklyCards(input.cards.filter((card) => !merged.cards.has(card.id.toLowerCase())), weekStart)

  // 실제 미션: 「상시 미션 N개」는 전체로 세고, 막대와 상시 시작 항목에서는 합친 미션을 뺀다(가정 3).
  const missionsWeek = input.missions === null ? null : weeklyMissions(input.missions, weekStart)
  const plainMissions =
    input.missions === null ? null : weeklyMissions(input.missions.filter((mission) => !merged.missions.has(mission.id.toLowerCase())), weekStart)
  const missionById = new Map((input.missions ?? []).map((mission) => [mission.id.toLowerCase(), mission]))

  const cronOccurrences = input.automation?.cron ?? getWeeklyCronOccurrences()
  const routineOccurrences = input.automation?.routines ?? weeklyRoutineOccurrences(weekStart)

  const seenOtherItems = new Set<string>()
  const opsMissionBars: ScheduleMissionBar[] = []

  const days: ScheduleDay[] = dates.map((date, index) => {
    const composition = compositionByDate.get(date)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const cardDay = cardDays?.[index]

    const opsCards = (composition?.cards ?? [])
      .filter((card) => card.source === 'bundle' && (includeSample || !card.isSample))
      .map((card) => opsCardItem(card, date, includeSample, input.cardNote))

    // 날짜 구성은 걸치는 날마다 같은 항목을 돌려준다. 카드가 아닌 운영 항목은 이 주에서 처음 만나는 칸(시작일, 또는 시작일이 주 앞이면 첫 칸)에만 둔다.
    const otherOps: ScheduleItem[] = []
    for (const entry of composition?.bundleItems ?? []) {
      if (!includeSample && entry.isSample) continue
      if (seenOtherItems.has(entry.itemId)) continue
      seenOtherItems.add(entry.itemId)
      otherOps.push(opsBundleItem(entry, date, includeSample))
      if (entry.kind === 'mission' && entry.endsAt !== null) opsMissionBars.push(opsMissionBar(entry, weekStart, weekEnd, missionById, includeSample))
    }

    const realCards: ScheduleItem[] = (cardDay?.shortCards ?? []).map((card) => ({
      id: `card-${card.id}-${date}`,
      origin: 'card',
      drawerKey: `card:${card.id}`,
      kind: OPS_HOME_FEED_CARD_KIND,
      title: card.title,
      time: card.content_type_id ?? '유형 없음',
      status: null,
      isSample: false,
      dim: !card.is_active,
      href: `/admin/today/${card.id}?date=${date}`,
      note: input.cardNote?.(card.id, date) ?? null,
    }))

    const openEndedStarts: ScheduleItem[] = (plainMissions?.openEndedStarting ?? [])
      .filter((mission) => mission.date === date)
      .map((mission) => ({
        id: `mission-${mission.id}`,
        origin: 'mission',
        drawerKey: `mission:${mission.id}`,
        kind: 'mission',
        title: mission.title,
        time: '상시',
        status: null,
        isSample: false,
        dim: false,
        href: `/admin/missions/${mission.id}`,
        note: null,
      }))

    // 크론·루틴: 옛 캘린더와 같은 시각순. 크론의 「매시간」은 맨 앞이다.
    const cron = cronOccurrences
      .filter((occurrence) => occurrence.weekday === weekday)
      .map((occurrence) => ({
        item: { id: cronOccurrenceId(occurrence, date), time: formatOccurrenceTime(occurrence), label: occurrence.label, routine: false, dim: false },
        sortMinutes: occurrence.hourly ? -1 : occurrence.hour * 60 + occurrence.minute,
      }))
    const routines = routineOccurrences
      .filter((occurrence) => occurrence.date === date)
      .map((occurrence) => {
        const [hour, minute] = occurrence.time.split(':').map(Number)
        return {
          item: { id: routineOccurrenceId(occurrence), time: occurrence.time, label: occurrence.label, routine: true, dim: !occurrence.enabled },
          sortMinutes: hour * 60 + minute,
        }
      })
    const automation: ScheduleAutomationItem[] = [...cron, ...routines].sort((a, b) => a.sortMinutes - b.sortMinutes).map(({ item }) => item)

    return {
      date,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      dateLabel: `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`,
      isToday: date === today,
      items: [...opsCards, ...realCards, ...otherOps, ...openEndedStarts],
      longActiveCount: cardDay?.longActiveCount ?? 0,
      longInactiveCount: cardDay?.longInactiveCount ?? 0,
      automation,
      signals: input.signals?.[date] ?? null,
      representative: representativeOf(composition?.representative ?? null, includeSample),
    }
  })

  const realBars: ScheduleMissionBar[] = (plainMissions?.bars ?? []).map(realMissionBar)
  const missionBars = [...realBars, ...opsMissionBars]
  const contentCount =
    days.reduce((sum, day) => sum + day.items.length + day.longActiveCount + day.longInactiveCount, 0) + missionBars.length

  return {
    weekStart,
    weekEnd,
    days,
    missionBars,
    openEndedMissionCount: missionsWeek?.openEndedCount ?? null,
    contentCount,
  }
}

/** 대표 카드 → 서랍 표시. 시험 묶음을 숨기는 중이면 시험 카드는 대표로 보이지 않는다(칸 항목과 같은 규칙). */
function representativeOf(card: CompositionCard | null, includeSample: boolean): ScheduleRepresentative | null {
  if (card === null || (!includeSample && card.isSample)) return null
  return { title: card.title, drawerKey: card.source === 'bundle' ? card.id : `card:${card.id}` }
}

function realMissionBar(bar: WeeklyMissionBar): ScheduleMissionBar {
  return {
    id: `mission-${bar.id}`,
    title: bar.title,
    startCol: bar.startCol,
    endCol: bar.endCol,
    startsThisWeek: bar.startsThisWeek,
    endsThisWeek: bar.endsThisWeek,
    isGate: bar.isGate,
    status: null,
    isSample: false,
    drawerKey: `mission:${bar.id}`,
    href: `/admin/missions/${bar.id}`,
  }
}

/** 운영 미션(합친 미션 포함) 막대. 열 위치는 시작·종료 날짜(KST)로 정하고 주 밖으로 넘치는 쪽은 0·6으로 자른다. */
function opsMissionBar(
  entry: CompositionBundleItem,
  weekStart: string,
  weekEnd: string,
  missionById: ReadonlyMap<string, WeeklyMissionInput>,
  includeSample: boolean
): ScheduleMissionBar {
  const startDate = kstDateKey(entry.startsAt) ?? weekStart
  const endDate = kstDateKey(entry.endsAt) ?? startDate
  const startsThisWeek = startDate >= weekStart
  const endsThisWeek = endDate <= weekEnd
  const mission = entry.resourceId === null ? undefined : missionById.get(entry.resourceId.toLowerCase())
  return {
    id: `ops-${entry.itemId}`,
    title: entry.title,
    startCol: startsThisWeek ? Math.min(6, dayOffset(weekStart, startDate)) : 0,
    endCol: endsThisWeek ? Math.max(0, dayOffset(weekStart, endDate)) : 6,
    startsThisWeek,
    endsThisWeek,
    isGate: mission ? isGateMission(mission) : false,
    status: entry.status,
    isSample: entry.isSample,
    drawerKey: entry.itemId,
    href: opsHref(entry.bundleId, entry.itemId, includeSample),
  }
}
