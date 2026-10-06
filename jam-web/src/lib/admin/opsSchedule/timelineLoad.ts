/**
 * 일정표 타임라인 조회 (티켓 20261006_1538 ③-c) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * **읽기만 한다.** `select`만 부르고 `insert`·`update`·`upsert`·`delete`는 부르지 않는다(`__tests__/timelineLoad.test.ts`가 지킨다).
 * 계산은 순수 함수(`monthView.ts`의 `buildSchedulePeriod`·`timeline.ts`의 `buildTimeline`)가 하고, 이 파일은 재료를 읽어 그 입력 모양으로 바꾸기만 한다.
 *
 * 읽는 것(출처마다 격리 — 하나가 실패해도 나머지는 그대로 그리고, 실패는 `sourceErrors`에 담아 호출부가 「읽지 못해 빠져 있어요」를 알린다):
 * - 주간·월간과 같은 기간 재료(`readPeriodMaterials`): 날짜 구성·실제 카드·실제 미션·신호. 날짜 서랍과 신호 줄이 쓴다. 기간은 6주(42일)다.
 * - `ambient_drop_schedules`: 창 안에서 놓는 예약(`scheduled_at`·`status`·`canceled_at`·`title`). 운영 항목과 합치지 않은 것이 드랍 일정 줄에 막대가 된다.
 * - `item_books`: 시작일(`valid_from`)이 있고 창과 겹치는 컬렉션(`valid_from`·`valid_until`·`is_active`·`name`). 운영 항목과 합치지 않은 것이 컬렉션 런칭 줄에 막대가 된다.
 * - `ops_rules`의 밸런스 규칙 R4 `launch_lead_days_min`: 컬렉션 준비 구간 길이. 꺼졌거나 값을 읽을 수 없으면 28일이고, 조회가 실패하면 28일로 그리고 `rules` 실패로 알린다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import { kstDayBoundsIso, todayKstDateString } from '@/lib/admin/today-calendar'
import { OPS_RULE_COLUMNS, parseBalanceRules } from '@/lib/admin/opsInbox/balance/rules'
import {
  createSettler,
  datesBetween,
  mergeCompositionErrors,
  readPeriodMaterials,
  type ScheduleSource,
  type ScheduleSourceErrors,
} from '@/lib/admin/opsSchedule/load'
import { buildSchedulePeriod } from '@/lib/admin/opsSchedule/monthView'
import { periodOf } from '@/lib/admin/opsSchedule/params'
import { signalsByDate, type DaySignals } from '@/lib/admin/opsSchedule/signalDays'
import { buildTimeline, leadDaysOf, TIMELINE_DEFAULT_LEAD_DAYS, type ScheduleTimeline, type TimelineBookRow, type TimelineDropRow } from '@/lib/admin/opsSchedule/timeline'

export interface LoadScheduleTimelineOptions {
  /** 기준일(KST `YYYY-MM-DD`). `periodOf('timeline', date)`의 6주 창을 읽는다. */
  date: string
  includeSample: boolean
  /** 기준 시각. 기본은 지금이다. */
  now?: Date
}

export interface LoadedScheduleTimeline {
  timeline: ScheduleTimeline
  /** 읽지 못한 재료와 사유. 타임라인은 카드 노출·열람 수를 읽지 않으므로 `metrics`는 없다. */
  sourceErrors: ScheduleSourceErrors
}

const DROP_COLUMNS = 'id, scheduled_at, status, claimed_at, canceled_at, title'
const BOOK_COLUMNS = 'id, name, valid_from, valid_until, is_active'

export async function loadScheduleTimeline(options: LoadScheduleTimelineOptions): Promise<LoadedScheduleTimeline> {
  const { date, includeSample } = options
  const now = options.now ?? new Date()
  const today = todayKstDateString(now)
  const { start, end } = periodOf('timeline', date)
  const { startIso } = kstDayBoundsIso(start)
  const { endIso } = kstDayBoundsIso(end)
  const sourceErrors: ScheduleSourceErrors = {}
  const settle = createSettler<ScheduleSource>(sourceErrors)
  const supabase = createServiceClient()

  const [materials, dropSchedules, itemBooks, leadDays] = await Promise.all([
    readPeriodMaterials({ start, end, includeSample, now }, settle),
    settle('dropSchedules', () =>
      fetchAllRows<TimelineDropRow>('일정표 드랍 일정', 'id', () =>
        supabase.from('ambient_drop_schedules').select(DROP_COLUMNS).gte('scheduled_at', startIso).lte('scheduled_at', endIso)
      )
    ),
    // `valid_from`이 비어 있는 컬렉션(항상 열려 있는 것)은 `lte` 조건에서 빠진다 — 시작일이 없어 막대를 그릴 수 없다.
    settle('itemBooks', () =>
      fetchAllRows<TimelineBookRow>('일정표 컬렉션', 'id', () =>
        supabase.from('item_books').select(BOOK_COLUMNS).lte('valid_from', endIso).or(`valid_until.is.null,valid_until.gte.${startIso}`)
      )
    ),
    settle('rules', async () => {
      const { data, error } = await supabase.from('ops_rules').select(OPS_RULE_COLUMNS).eq('rule_group', 'balance')
      if (error) throw new Error(`규칙 조회 실패: ${error.message}`)
      return leadDaysOf(parseBalanceRules(data ?? []))
    }),
  ])
  mergeCompositionErrors(materials.loaded, sourceErrors)

  const signals: Record<string, DaySignals> | null = materials.signalsResult
    ? signalsByDate(materials.signalsResult.signals, materials.signalsResult.scanDates, datesBetween(start, end))
    : null
  const bundles = materials.loaded?.bundles ?? null
  const { days } = buildSchedulePeriod({
    start,
    end,
    today,
    includeSample,
    compositions: materials.loaded?.compositions ?? [],
    bundles,
    cards: materials.cards,
    missions: materials.missions,
    signals,
  })

  const timeline = buildTimeline({
    start,
    end,
    today,
    now,
    includeSample,
    bundles,
    missions: materials.missions,
    dropSchedules,
    itemBooks,
    leadDays: leadDays ?? TIMELINE_DEFAULT_LEAD_DAYS,
    days,
  })
  return { timeline, sourceErrors }
}
