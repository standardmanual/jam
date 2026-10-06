/**
 * 일정표 주간 보기 조회 (티켓 20261006_1536 ③-a) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * **읽기만 한다.** `select`만 부르고 `insert`·`update`·`upsert`·`delete`는 부르지 않는다(`__tests__/load.test.ts`가 지킨다).
 * 계산은 순수 함수(`weekView.ts`·`signalDays.ts`)가 하고, 이 파일은 재료를 읽어 그 입력 모양으로 바꾸기만 한다.
 *
 * 읽는 것(출처마다 격리 — 하나가 실패해도 나머지는 그대로 그리고, 실패는 `sourceErrors`에 담아 호출부가 「읽지 못해 빠져 있어요」를 알린다):
 * - 날짜 구성 7일(`loadDayCompositions`): 운영 항목과 합친 실제 카드·미션. 묶음·항목도 함께 받는다.
 * - `today_cards` **전체**: 비활성 카드까지(가정 11). `loadDayCompositions`는 활성 카드만 읽어서 비활성 카드를 따로 읽는다.
 *   쿼리는 옛 운영 홈 캘린더(③-d에서 제거)와 같다. 운영 항목과 합쳐진 카드는 `buildScheduleWeek`가 뺀다.
 * - `missions` + `gate_axis`: 옛 막대·상시 미션 수. 게이트 미션 표식이 필요해서 `gate_axis`를 함께 읽는다.
 * - 카드 노출·열람 수: 오늘 이전(포함)에 시작하는 주에서만 단기 카드 한 번에 읽는다(옛 캘린더와 같다).
 * - 신호 13종(`loadOpsSignals`): 칸 머리 신호 칩.
 *
 * 재료를 못 읽으면 그 재료는 `null`로 넘어가 「없다」가 아니라 「읽지 못했다」로 그려진다(「미편성」으로 단정하지 않는다).
 *
 * 월간 보기(`loadScheduleMonth`, 티켓 20261006_1538 ③-c)는 같은 재료를 달력 기간 전체로 읽는다(`readPeriodMaterials`). 타임라인(`timelineLoad.ts`)도 같은 읽기를 쓰고 자기 재료를 더한다.
 * 월간·타임라인은 카드 노출·열람 수를 읽지 않는다(한 줄 칸·막대라 보이지 않는다).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import { kstDayBoundsIso, shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import {
  loadDayCompositions,
  loadOpsSignals,
  type LoadedDayCompositions,
  type LoadedOpsSignals,
} from '@/lib/admin/opsSignals/load'
import { buildScheduleMonth, type ScheduleMonth } from '@/lib/admin/opsSchedule/monthView'
import { periodOf } from '@/lib/admin/opsSchedule/params'
import { signalsByDate, type DaySignals } from '@/lib/admin/opsSchedule/signalDays'
import { buildScheduleWeek, type ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'
import {
  cardMetricKey,
  fetchFirstEventKstDate,
  fetchWeeklyCardMetrics,
  formatCardMetricsNote,
} from '@/lib/admin/weeklyCardMetrics'
import { weeklyCards, type WeeklyCardInput } from '@/lib/admin/weeklyCards'
import type { WeeklyMissionInput } from '@/lib/admin/weeklyMissions'

/** 읽지 못한 재료 이름. `metrics`는 카드 노출·열람 수(못 읽으면 그 줄만 비고 화면은 그대로다). */
export type ScheduleWeekSource = 'cards' | 'missions' | 'bundles' | 'signals' | 'metrics'

/** 타임라인만 읽는 재료(티켓 20261006_1538 ③-c): 드랍 일정·컬렉션과 컬렉션 준비 기간 규칙(R4). 규칙을 못 읽으면 28일로 그리고 그 사실을 알린다. */
export type ScheduleTimelineSource = 'dropSchedules' | 'itemBooks' | 'rules'

export type ScheduleSource = ScheduleWeekSource | ScheduleTimelineSource

/** 보기와 상관없이 못 읽은 재료와 사유를 담는 모양(서랍·안내가 받는다). 주간·월간·타임라인의 `sourceErrors`가 모두 이 모양에 들어간다. */
export type ScheduleSourceErrors = Partial<Record<ScheduleSource, string>>

export interface LoadScheduleWeekOptions {
  /** 월요일(KST `YYYY-MM-DD`). 호출부가 `periodOf('week', date).start`로 맞춘다. */
  weekStart: string
  includeSample: boolean
  /** 기준 시각. 기본은 지금이다. */
  now?: Date
}

export interface LoadedScheduleWeek {
  week: ScheduleWeek
  /** 읽지 못한 재료와 사유. 모두 읽었으면 빈 객체다. */
  sourceErrors: Partial<Record<ScheduleWeekSource, string>>
}

/** 생성 타입의 카드 행. 손으로 쓴 `WeeklyCardInput`은 `template_type`이 좁은 유니온이라 읽은 값을 거기에 맞춰 넘긴다(옛 캘린더가 쓰던 방식). */
type CardRow = Omit<WeeklyCardInput, 'template_type'> & { template_type: string }

const CARD_COLUMNS = 'id, title, content_type_id, template_type, starts_at, ends_at, is_active, sort_order'
const MISSION_COLUMNS = 'id, title, starts_at, ends_at, gate_axis'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 출처마다 격리해 읽는 도우미. 읽다가 던지면 `null`을 돌려주고 사유를 `sourceErrors`에 남긴다(같은 출처가 두 번 실패해도 첫 사유를 지킨다).
 * 주간·월간·타임라인 읽기가 함께 쓴다.
 */
export function createSettler<Source extends string>(sourceErrors: Partial<Record<Source, string>>) {
  return async function settle<T>(source: Source, task: () => Promise<T>): Promise<T | null> {
    try {
      return await task()
    } catch (error) {
      const errors = sourceErrors as Partial<Record<string, string>>
      errors[source] ??= messageOf(error)
      console.error(`[admin/ops-schedule] ${source} 조회 오류:`, error)
      return null
    }
  }
}

/** 한 기간의 재료. 못 읽은 재료는 `null`이다(호출부가 `sourceErrors`와 함께 「읽지 못했다」로 그린다). */
export interface PeriodMaterials {
  loaded: LoadedDayCompositions | null
  /** 그 기간에 걸치는 **모든** 실제 카드(비활성 포함). */
  cards: WeeklyCardInput[] | null
  /** 그 기간에 걸치는 실제 미션(`gate_axis` 포함). */
  missions: WeeklyMissionInput[] | null
  signalsResult: LoadedOpsSignals | null
}

export interface ReadPeriodOptions {
  /** 첫 날·마지막 날(KST `YYYY-MM-DD`, 포함). */
  start: string
  end: string
  includeSample: boolean
  now: Date
}

/** 날짜 구성이 카드·미션·묶음을 읽다 실패한 것도 같은 재료의 실패다(구성 안에서 격리된다). */
export function mergeCompositionErrors(loaded: LoadedDayCompositions | null, sourceErrors: Partial<Record<string, string>>): void {
  for (const [source, reason] of Object.entries(loaded?.sourceErrors ?? {})) sourceErrors[source] ??= reason
}

/**
 * 한 기간(주·달력·타임라인 창)의 재료를 출처마다 격리해 읽는다. 쿼리는 주간 보기와 같다: 카드는 비활성까지 그 기간에 걸치는 것을, 미션은 `gate_axis`와 함께 읽는다.
 * 날짜 구성의 실패는 호출부가 `mergeCompositionErrors`로 합친다.
 */
export async function readPeriodMaterials(
  options: ReadPeriodOptions,
  settle: <T>(source: 'cards' | 'missions' | 'bundles' | 'signals', task: () => Promise<T>) => Promise<T | null>
): Promise<PeriodMaterials> {
  const { start, end, includeSample, now } = options
  const { startIso } = kstDayBoundsIso(start)
  const { endIso } = kstDayBoundsIso(end)
  const supabase = createServiceClient()
  const [loaded, cards, missions, signalsResult] = await Promise.all([
    settle('bundles', () => loadDayCompositions({ from: start, to: end, includeSample })),
    settle('cards', async () => {
      const rows = await fetchAllRows<CardRow>('일정표 카드', 'id', () =>
        supabase.from('today_cards').select(CARD_COLUMNS).lte('starts_at', endIso).gte('ends_at', startIso)
      )
      return rows as WeeklyCardInput[]
    }),
    settle('missions', () =>
      fetchAllRows<WeeklyMissionInput>('일정표 미션', 'id', () =>
        supabase.from('missions').select(MISSION_COLUMNS).lte('starts_at', endIso).or(`ends_at.is.null,ends_at.gte.${startIso}`)
      )
    ),
    settle('signals', () => loadOpsSignals({ includeSample, now })),
  ])
  return { loaded, cards, missions, signalsResult }
}

/** 기간의 날짜 목록(양 끝 포함). */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = start; date <= end; date = shiftDateStr(date, 1)) dates.push(date)
  return dates
}

export async function loadScheduleWeek(options: LoadScheduleWeekOptions): Promise<LoadedScheduleWeek> {
  const { weekStart, includeSample } = options
  const now = options.now ?? new Date()
  const today = todayKstDateString(now)
  const weekEnd = shiftDateStr(weekStart, 6)
  const dates = datesBetween(weekStart, weekEnd)
  const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
  const { endIso: weekEndIso } = kstDayBoundsIso(weekEnd)
  const sourceErrors: LoadedScheduleWeek['sourceErrors'] = {}
  const settle = createSettler<ScheduleWeekSource>(sourceErrors)

  const { loaded, cards, missions, signalsResult } = await readPeriodMaterials({ start: weekStart, end: weekEnd, includeSample, now }, settle)
  mergeCompositionErrors(loaded, sourceErrors)
  // 신호는 재료 하나를 못 읽어도 그 신호만 「확인하지 못했어요」가 되어 돌아온다. 신호 계산 자체가 던졌을 때만 칸 신호를 비운다.
  const signals: Record<string, DaySignals> | null = signalsResult
    ? signalsByDate(signalsResult.signals, signalsResult.scanDates, dates)
    : null

  // 카드 노출·열람 수: 오늘 이전(포함)에 시작하는 주의 단기 카드만. 실패하면 그 줄만 비운다.
  const metrics =
    cards && weekStart <= today
      ? await settle('metrics', async () => {
          const shortCardIds = [...new Set(weeklyCards([...cards], weekStart).flatMap((day) => day.shortCards.map((card) => card.id)))]
          const [counts, firstEventDate] = await Promise.all([
            fetchWeeklyCardMetrics(shortCardIds, weekStartIso, weekEndIso),
            fetchFirstEventKstDate(),
          ])
          return { counts, firstEventDate, shortCardIds: new Set(shortCardIds) }
        })
      : null
  // 노출·열람 수는 단기 카드만 읽는다. 운영 카드가 합친 실제 카드가 장기 카드면 수를 읽지 않았으므로 「노출 0」으로 보이지 않게 줄을 비운다.
  const cardNote = metrics
    ? (cardId: string, date: string) =>
        metrics.shortCardIds.has(cardId)
          ? formatCardMetricsNote({
              date,
              today,
              firstEventDate: metrics.firstEventDate,
              counts: metrics.counts.get(cardMetricKey(cardId, date)),
            })
          : null
    : undefined

  const week = buildScheduleWeek({
    weekStart,
    today,
    includeSample,
    compositions: loaded?.compositions ?? [],
    bundles: loaded?.bundles ?? null,
    cards,
    missions,
    cardNote,
    signals,
  })
  return { week, sourceErrors }
}

// ── 월간 ─────────────────────────────────────────────────────────────────────────────────────────

export interface LoadScheduleMonthOptions {
  /** 기준일(KST `YYYY-MM-DD`). 이 날짜가 속한 달의 달력 칸 전체를 읽는다(`periodOf('month', date)`). */
  date: string
  includeSample: boolean
  /** 기준 시각. 기본은 지금이다. */
  now?: Date
}

export interface LoadedScheduleMonth {
  month: ScheduleMonth
  /** 읽지 못한 재료와 사유. 월간은 카드 노출·열람 수를 읽지 않으므로 `metrics`는 없다. */
  sourceErrors: Partial<Record<Exclude<ScheduleWeekSource, 'metrics'>, string>>
}

/**
 * 월간 달력(그 달이 걸치는 주 전부)의 재료를 읽어 칸으로 만든다. 출처마다 격리하는 방식은 주간과 같다 — 못 읽은 재료는 `sourceErrors`에 남고 나머지는 그대로 그린다.
 * 기간은 4~6주(최대 42일)라 `loadDayCompositions`의 상한(92일) 안이다.
 */
export async function loadScheduleMonth(options: LoadScheduleMonthOptions): Promise<LoadedScheduleMonth> {
  const { date, includeSample } = options
  const now = options.now ?? new Date()
  const today = todayKstDateString(now)
  const { start, end } = periodOf('month', date)
  const sourceErrors: LoadedScheduleMonth['sourceErrors'] = {}
  const settle = createSettler<Exclude<ScheduleWeekSource, 'metrics'>>(sourceErrors)

  const { loaded, cards, missions, signalsResult } = await readPeriodMaterials({ start, end, includeSample, now }, settle)
  mergeCompositionErrors(loaded, sourceErrors)
  const signals: Record<string, DaySignals> | null = signalsResult
    ? signalsByDate(signalsResult.signals, signalsResult.scanDates, datesBetween(start, end))
    : null

  const month = buildScheduleMonth({
    date,
    today,
    includeSample,
    compositions: loaded?.compositions ?? [],
    bundles: loaded?.bundles ?? null,
    cards,
    missions,
    signals,
  })
  return { month, sourceErrors }
}
