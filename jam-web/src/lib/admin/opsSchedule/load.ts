/**
 * 일정표 주간 보기 조회 (티켓 20261006_1536 ③-a) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * **읽기만 한다.** `select`만 부르고 `insert`·`update`·`upsert`·`delete`는 부르지 않는다(`__tests__/load.test.ts`가 지킨다).
 * 계산은 순수 함수(`weekView.ts`·`signalDays.ts`)가 하고, 이 파일은 재료를 읽어 그 입력 모양으로 바꾸기만 한다.
 *
 * 읽는 것(출처마다 격리 — 하나가 실패해도 나머지는 그대로 그리고, 실패는 `sourceErrors`에 담아 호출부가 「읽지 못해 빠져 있어요」를 알린다):
 * - 날짜 구성 7일(`loadDayCompositions`): 운영 항목과 합친 실제 카드·미션. 묶음·항목도 함께 받는다.
 * - `today_cards` **전체**: 비활성 카드까지(가정 11). `loadDayCompositions`는 활성 카드만 읽어서 비활성 카드를 따로 읽는다.
 *   쿼리는 옛 캘린더(`_home/CalendarSection.tsx`)와 같다. 운영 항목과 합쳐진 카드는 `buildScheduleWeek`가 뺀다.
 * - `missions` + `gate_axis`: 옛 막대·상시 미션 수. 게이트 미션 표식이 필요해서 `gate_axis`를 함께 읽는다.
 * - 카드 노출·열람 수: 오늘 이전(포함)에 시작하는 주에서만 단기 카드 한 번에 읽는다(옛 캘린더와 같다).
 * - 신호 13종(`loadOpsSignals`): 칸 머리 신호 칩.
 *
 * 재료를 못 읽으면 그 재료는 `null`로 넘어가 「없다」가 아니라 「읽지 못했다」로 그려진다(「미편성」으로 단정하지 않는다).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import { kstDayBoundsIso, shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import { loadDayCompositions, loadOpsSignals } from '@/lib/admin/opsSignals/load'
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

export async function loadScheduleWeek(options: LoadScheduleWeekOptions): Promise<LoadedScheduleWeek> {
  const { weekStart, includeSample } = options
  const now = options.now ?? new Date()
  const today = todayKstDateString(now)
  const weekEnd = shiftDateStr(weekStart, 6)
  const dates = Array.from({ length: 7 }, (_, index) => shiftDateStr(weekStart, index))
  const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
  const { endIso: weekEndIso } = kstDayBoundsIso(weekEnd)
  const sourceErrors: LoadedScheduleWeek['sourceErrors'] = {}
  const supabase = createServiceClient()

  async function settle<T>(source: ScheduleWeekSource, task: () => Promise<T>): Promise<T | null> {
    try {
      return await task()
    } catch (error) {
      sourceErrors[source] ??= messageOf(error)
      console.error(`[admin/ops-schedule] ${source} 조회 오류:`, error)
      return null
    }
  }

  const [loaded, cards, missions, signalsResult] = await Promise.all([
    settle('bundles', () => loadDayCompositions({ from: weekStart, to: weekEnd, includeSample })),
    settle('cards', async () => {
      const rows = await fetchAllRows<CardRow>('일정표 카드', 'id', () =>
        supabase.from('today_cards').select(CARD_COLUMNS).lte('starts_at', weekEndIso).gte('ends_at', weekStartIso)
      )
      return rows as WeeklyCardInput[]
    }),
    settle('missions', () =>
      fetchAllRows<WeeklyMissionInput>('일정표 미션', 'id', () =>
        supabase.from('missions').select(MISSION_COLUMNS).lte('starts_at', weekEndIso).or(`ends_at.is.null,ends_at.gte.${weekStartIso}`)
      )
    ),
    settle('signals', () => loadOpsSignals({ includeSample, now })),
  ])

  // 날짜 구성이 카드·미션·묶음을 읽다 실패한 것도 같은 재료의 실패다(구성 안에서 격리된다).
  for (const [source, reason] of Object.entries(loaded?.sourceErrors ?? {})) {
    sourceErrors[source as 'cards' | 'missions' | 'bundles'] ??= reason
  }
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
          return { counts, firstEventDate }
        })
      : null
  const cardNote = metrics
    ? (cardId: string, date: string) =>
        formatCardMetricsNote({
          date,
          today,
          firstEventDate: metrics.firstEventDate,
          counts: metrics.counts.get(cardMetricKey(cardId, date)),
        })
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
