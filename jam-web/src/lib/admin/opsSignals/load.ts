/**
 * 운영 신호 조회 (티켓 20261001_1155) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * **읽기만 한다.** `select`만 부르고 `insert`·`update`·`upsert`·`delete`는 부르지 않는다(`__tests__/load.test.ts`가 지킨다).
 * 신호 계산은 `compute.ts`가 하고, 이 파일은 재료를 읽어 그 입력 모양으로 바꾸기만 한다.
 *
 * 읽는 것:
 * - `today_cards`: 검사 범위(오늘부터 다음 주 일요일까지)와 앞 6일에 걸치는 활성 카드. 실제 카드의 모양은 카드 행을 그대로
 *   `resolveShape`(`lib/today/shape.ts`)에 넘겨 채운다 — 옛 카드의 옛→새 모양 대응은 거기가 원본이다. 신호 계산에는 지금 화면에
 *   그려질 모양(`drawnShape`)이 아니라 이 판정값을 쓴다.
 * - `missions`: 같은 범위에 걸치는 미션(일정표용 구성에만 쓰이고 어떤 신호도 기대지 않는다).
 * - `ops_bundles`·`ops_bundle_items`: 묶음과 항목. 제출 원본(`raw`, 최대 1MB)은 뺀 항목을 읽는 데만 쓰이므로 끝나지 않은 묶음의
 *   것만, 묶음 몇 개씩 따로 받는다(받은 기획함 목록이 원본을 가져오지 않는 것과 같은 이유).
 * - `badges`: 「예약됨」·「게재중」 컬렉션 항목이 만든 컬렉션의 아이템 배지 수(`item_book_id`만 읽는다, 티켓 20261004_2242). 「비어 있는 컨텐츠」의 「아이템이 없는 컬렉션」 검사에 쓴다.
 *   대상 컬렉션 ID가 없으면 조회하지 않는다. 아이템 배지는 `type = 'item'`이고 삭제되지 않은 것이다(드랍 대상과 같은 기준).
 * - 행동 5종 건수: 최근 7일과 직전 기간의 건수만 센다(`head: true`, 행을 가져오지 않는다). 믹스 시도·유저 드랍·픽업·미션 완료·
 *   컬렉션 완성의 전체 유저 원시 건수다.
 * - `ops_rules`의 신호 행(`overrides.ts`): S7(운영 설정)에서 바꾼 기준값만 있다(티켓 20260930_1459 조각 C). 신호 계산에 얹고, 카드·미션을 읽는 범위
 *   (`monotonyWindowDays`)와 직전 기간 주 수(`actionSpikeBaselineWeeks`)도 이 값을 따른다. 읽지 못하면 기본값으로 계산한다.
 *
 * ⚠️ **PostgREST 기본 페이지 상한(1000행)** — 에러 없이 잘린 목록이 돌아오므로 `range`로 끝까지 넘겨 전량을 받는다.
 *
 * 원천 하나가 실패하면 그 원천은 `null`로 넘어가 그 원천에 기대는 신호만 「확인하지 못했어요」가 된다(A11). 실패한 원천의 사유는
 * `sourceErrors`에 담는다.
 *
 * `loadDayCompositions`(티켓 20261006_1339)는 신호 없이 **기간을 받아** 날짜별 구성만 읽는다(일정표의 월간·지난 주). 위의 카드·미션·묶음
 * 읽기 함수를 그대로 쓰고, 실제 카드·미션과 운영 항목을 합치는 일은 구성 함수(`buildDayCompositions`)가 한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { IN_CHUNK_SIZE } from '@/lib/db/fetchAllRows'
import type { Json } from '@/types/database.generated'
import { computeBundleStatus, tabOfBundleStage } from '@/lib/admin/opsInbox/bundleStatus'
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { kstDayBoundsIso, shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import { isCardShape, resolveShape, type ShapeCardInput } from '@/lib/today/shape'
import { ACTION_METRIC_KEYS, ACTION_RECENT_DAYS, type ActionCounts, type ActionMetricKey } from '@/lib/admin/opsSignals/actionSpike'
import {
  computeOpsSignals,
  type ComputeOpsSignalsInput,
  type OpsSignalsComputation,
} from '@/lib/admin/opsSignals/compute'
import {
  buildDayCompositions,
  type DayComposition,
  type SignalBundleInput,
  type SignalBundleItemInput,
  type SignalCardInput,
  type SignalMissionInput,
} from '@/lib/admin/opsSignals/composition'
import { loadSignalOverrides } from '@/lib/admin/opsSignals/overrides'
import { collectionBookIdsToCheck } from '@/lib/admin/opsSignals/statusRules'
import { resolveThresholdValues } from '@/lib/admin/opsSignals/thresholds'

const FETCH_PAGE_SIZE = 1000
/** 제출 원본을 한 번에 받는 묶음 수. 원본은 묶음마다 최대 1MB라 한꺼번에 받지 않는다. */
const RAW_CHUNK_SIZE = 10
const DAY_MS = 24 * 3600_000

type Supabase = ReturnType<typeof createServiceClient>

/**
 * 읽지 못한 원천 이름. `bundle_raw`는 묶음은 읽었지만 제출 원본을 읽지 못한 경우다(뺀 항목 목록만 못 읽는다).
 * `collection_items`는 컬렉션별 아이템 배지 수를 읽지 못한 경우다(「비어 있는 컨텐츠」 전체가 확인하지 못한 상태가 된다).
 */
export type OpsSignalSource = 'cards' | 'missions' | 'bundles' | 'bundle_raw' | 'collection_items' | 'actions'

export interface LoadOpsSignalsOptions {
  /** 계산 기준 시각. 기본은 지금이다. */
  now?: Date
  /** 시험 묶음을 포함할지. 기본은 `false`다. */
  includeSample?: boolean
}

export interface LoadedOpsSignals extends OpsSignalsComputation {
  /** 읽지 못한 원천과 사유. 모두 읽었으면 빈 객체다. */
  sourceErrors: Partial<Record<OpsSignalSource, string>>
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/** `range`로 1000행씩 끝까지 읽는다. 오류가 나면 던진다. */
async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
  }
  return rows
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stringList(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

// ── 카드 ─────────────────────────────────────────────────────────────────────────────────────────

interface CardRow {
  id: string
  title: string
  starts_at: string
  ends_at: string
  is_active: boolean
  sort_order: number
  shape: string | null
  template_type: string
  layout_type: string
  cover_image_url: string | null
  badge_ids: string[]
  exposure_tags: string[]
}

const CARD_COLUMNS =
  'id, title, starts_at, ends_at, is_active, sort_order, shape, template_type, layout_type, cover_image_url, badge_ids, exposure_tags'

function toCardInput(row: CardRow): SignalCardInput {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    // 카드 행을 그대로 넘긴다: 저장된 모양 → 기사 → 옛 레이아웃 순으로 정하고, 커버가 없고 배지가 걸린 옛 카드는 `square`다.
    shape: resolveShape(row as unknown as ShapeCardInput),
    shapeStored: isCardShape(row.shape),
    exposureTags: row.exposure_tags ?? [],
    hasCover: (row.cover_image_url ?? '').trim() !== '',
  }
}

async function loadCards(supabase: Supabase, rangeStartIso: string, rangeEndIso: string): Promise<SignalCardInput[]> {
  const rows = await fetchAllPages<CardRow>((from, to) =>
    supabase
      .from('today_cards')
      .select(CARD_COLUMNS)
      .eq('is_active', true)
      .lte('starts_at', rangeEndIso)
      .gte('ends_at', rangeStartIso)
      .order('id')
      .range(from, to)
  )
  return rows.map(toCardInput)
}

// ── 미션 ─────────────────────────────────────────────────────────────────────────────────────────

async function loadMissions(supabase: Supabase, rangeStartIso: string, rangeEndIso: string): Promise<SignalMissionInput[]> {
  const rows = await fetchAllPages<{ id: string; title: string; starts_at: string; ends_at: string | null }>((from, to) =>
    supabase.from('missions').select('id, title, starts_at, ends_at').lte('starts_at', rangeEndIso).order('id').range(from, to)
  )
  const rangeStartMs = Date.parse(rangeStartIso)
  return rows
    .filter((row) => row.ends_at === null || Date.parse(row.ends_at) >= rangeStartMs)
    .map((row) => ({ id: row.id, title: row.title, startsAt: row.starts_at, endsAt: row.ends_at }))
}

// ── 운영 묶음 ────────────────────────────────────────────────────────────────────────────────────

interface BundleRow {
  id: string
  week: string | null
  is_sample: boolean
  received_at: string
  format_errors: Json
}

interface ItemRow {
  id: string
  bundle_id: string
  position: number
  item_key: string | null
  kind: string | null
  pattern_no: string | null
  starts_at: string | null
  ends_at: string | null
  status: string
  original: Json
  edited: Json | null
  format_errors: Json
  updated_at: string
  created_resource: Json | null
}

const BUNDLE_COLUMNS = 'id, week, is_sample, received_at, format_errors'
const ITEM_COLUMNS =
  'id, bundle_id, position, item_key, kind, pattern_no, starts_at, ends_at, status, original, edited, format_errors, updated_at, created_resource'

function toItemInput(row: ItemRow): SignalBundleItemInput {
  return {
    id: row.id,
    position: row.position,
    itemKey: row.item_key,
    kind: row.kind,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    patternNo: row.pattern_no,
    original: row.original,
    edited: row.edited,
    formatErrors: stringList(row.format_errors),
    updatedAt: row.updated_at,
    createdResource: row.created_resource ?? null,
  }
}

/** 묶음과 항목을 읽는다. 제출 원본은 아직 받지 않는다(`raw`는 null). */
async function loadBundles(supabase: Supabase, includeSample: boolean): Promise<SignalBundleInput[]> {
  const bundleRows = await fetchAllPages<BundleRow>((from, to) => {
    const query = supabase.from('ops_bundles').select(BUNDLE_COLUMNS)
    return (includeSample ? query : query.eq('is_sample', false))
      .order('received_at', { ascending: false })
      .order('id')
      .range(from, to)
  })
  const itemRows = await fetchAllPages<ItemRow>((from, to) =>
    supabase.from('ops_bundle_items').select(ITEM_COLUMNS).order('id').range(from, to)
  )

  const itemsByBundle = new Map<string, SignalBundleItemInput[]>()
  for (const row of itemRows) {
    const list = itemsByBundle.get(row.bundle_id)
    if (list) list.push(toItemInput(row))
    else itemsByBundle.set(row.bundle_id, [toItemInput(row)])
  }

  return bundleRows.map((row) => ({
    id: row.id,
    week: row.week,
    isSample: row.is_sample,
    receivedAt: row.received_at,
    formatErrors: stringList(row.format_errors),
    raw: null,
    items: (itemsByBundle.get(row.id) ?? []).sort((a, b) => a.position - b.position),
  }))
}

/** 끝나지 않은 묶음(결정할 것·진행 중)의 제출 원본을 몇 개씩 받아 채운다. 실패하면 던진다. */
async function attachOpenBundleRaw(supabase: Supabase, bundles: SignalBundleInput[]): Promise<void> {
  const open = bundles.filter(
    (bundle) => tabOfBundleStage(computeBundleStatus(bundle.items.map((item) => item.status)).stage) !== 'closed'
  )
  const byId = new Map(open.map((bundle) => [bundle.id, bundle]))
  for (let start = 0; start < open.length; start += RAW_CHUNK_SIZE) {
    const ids = open.slice(start, start + RAW_CHUNK_SIZE).map((bundle) => bundle.id)
    const { data, error } = await supabase.from('ops_bundles').select('id, raw').in('id', ids)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const bundle = byId.get(row.id)
      if (bundle) bundle.raw = row.raw
    }
  }
}

// ── 컬렉션 아이템 수 ─────────────────────────────────────────────────────────────────────────────

/**
 * 「예약됨」·「게재중」 컬렉션 항목이 만든 컬렉션마다 아이템 배지 수를 센다. 아이템 배지는 `type = 'item'`이고 삭제되지 않은 것이다.
 * 대상 컬렉션이 없으면 조회하지 않고 빈 지도를 돌려준다. 배지가 없는 컬렉션은 지도에 없다(호출부가 0개로 읽는다). 하나라도 읽지 못하면 던진다.
 */
async function loadCollectionItemCounts(supabase: Supabase, bundles: readonly SignalBundleInput[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const bookIds = collectionBookIdsToCheck(bundles)
  for (let start = 0; start < bookIds.length; start += IN_CHUNK_SIZE) {
    const chunk = bookIds.slice(start, start + IN_CHUNK_SIZE)
    const rows = await fetchAllPages<{ id: string; item_book_id: string | null }>((from, to) =>
      supabase
        .from('badges')
        .select('id, item_book_id')
        .eq('type', 'item')
        .is('deleted_at', null)
        .in('item_book_id', chunk)
        .order('id')
        .range(from, to)
    )
    for (const row of rows) {
      if (row.item_book_id) counts.set(row.item_book_id, (counts.get(row.item_book_id) ?? 0) + 1)
    }
  }
  return counts
}

// ── 행동 건수 ────────────────────────────────────────────────────────────────────────────────────

type CountResult = { count: number | null; error: { message: string } | null }
type Counter = (fromIso: string, toIso: string) => PromiseLike<CountResult>

/** 지표마다 센 표. 한 지표가 표 두 개를 더한다(믹스 시도 = 성공 로그 + 실패 로그). 전체 유저 원시 건수라 유저 조건이 없다. */
function buildCounters(supabase: Supabase): Record<ActionMetricKey, Counter[]> {
  const head = { count: 'exact', head: true } as const
  return {
    mix_attempt: [
      (a, b) => supabase.from('user_combine_success_logs').select('*', head).gte('attempted_at', a).lt('attempted_at', b),
      (a, b) => supabase.from('user_combine_fail_logs').select('*', head).gte('attempted_at', a).lt('attempted_at', b),
    ],
    user_drop: [
      (a, b) => supabase.from('poi_drops').select('*', head).eq('source', 'user').gte('dropped_at', a).lt('dropped_at', b),
    ],
    pickup: [(a, b) => supabase.from('poi_drops').select('*', head).gte('picked_up_at', a).lt('picked_up_at', b)],
    mission_complete: [
      (a, b) => supabase.from('user_mission_completions').select('*', head).gte('completed_at', a).lt('completed_at', b),
    ],
    collection_complete: [
      (a, b) => supabase.from('user_item_book_completions').select('*', head).gte('completed_at', a).lt('completed_at', b),
    ],
  }
}

async function sumCounters(counters: readonly Counter[], fromIso: string, toIso: string): Promise<number> {
  const results = await Promise.all(counters.map((counter) => counter(fromIso, toIso)))
  let total = 0
  for (const { count, error } of results) {
    if (error) throw new Error(error.message)
    total += count ?? 0
  }
  return total
}

/** 지표마다 최근 7일 합계와 직전 기간(`weeks`주)의 주평균을 센다. 하나라도 읽지 못하면 던진다. */
async function loadActionCounts(supabase: Supabase, now: Date, weeks: number): Promise<ActionCounts> {
  const nowIso = now.toISOString()
  const recentStartIso = new Date(now.getTime() - ACTION_RECENT_DAYS * DAY_MS).toISOString()
  const baselineStartIso = new Date(now.getTime() - (ACTION_RECENT_DAYS + weeks * 7) * DAY_MS).toISOString()
  const counters = buildCounters(supabase)

  const entries = await Promise.all(
    ACTION_METRIC_KEYS.map(async (metric) => {
      const [recent, baselineTotal] = await Promise.all([
        sumCounters(counters[metric], recentStartIso, nowIso),
        sumCounters(counters[metric], baselineStartIso, recentStartIso),
      ])
      return [metric, { recent, baselineWeeklyAverage: baselineTotal / weeks }] as const
    })
  )
  return Object.fromEntries(entries) as ActionCounts
}

// ── 기간을 받는 날짜 구성 ────────────────────────────────────────────────────────────────────────

/** `loadDayCompositions`가 한 번에 읽는 기간의 상한(일, 양 끝 포함). 결정 기록 읽기(`OPS_DECISION_MAX_DAYS`)와 같다. */
export const DAY_COMPOSITIONS_MAX_DAYS = 92

export const DAY_COMPOSITIONS_PERIOD_INVALID_MESSAGE = '기간(from·to)은 2026-10-01처럼 날짜로 보내 주세요.'
export const DAY_COMPOSITIONS_PERIOD_ORDER_MESSAGE = '기간의 시작(from)이 끝(to)보다 늦어요.'
export const DAY_COMPOSITIONS_PERIOD_TOO_LONG_MESSAGE = `한 번에 읽을 수 있는 기간은 ${DAY_COMPOSITIONS_MAX_DAYS}일까지예요. 기간을 나눠서 읽어 주세요.`

/** 기간이 올바르지 않을 때 던진다. 읽기 실패(원천 오류)는 던지지 않고 `sourceErrors`에 담는다. */
export class DayCompositionPeriodError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DayCompositionPeriodError'
  }
}

export interface LoadDayCompositionsOptions {
  /** 시작 날짜(KST `YYYY-MM-DD`, 포함). */
  from: string
  /** 끝 날짜(KST `YYYY-MM-DD`, 포함). */
  to: string
  /** 시험 묶음을 포함할지. 기본은 `false`다. */
  includeSample?: boolean
}

export type DayCompositionSource = 'cards' | 'missions' | 'bundles'

export interface LoadedDayCompositions {
  /** 읽은 묶음과 항목(제출 원본 `raw`는 받지 않아 null이다). 묶음을 읽지 못했으면 null이다. */
  bundles: SignalBundleInput[] | null
  /** `from`~`to`의 날짜마다 한 건(날짜 오름차순). 읽지 못한 원천은 비어 있는 것으로 계산하므로 `sourceErrors`를 함께 봐야 한다. */
  compositions: DayComposition[]
  /** 읽지 못한 원천과 사유. 모두 읽었으면 빈 객체다. 호출부가 「읽지 못해 빠져 있어요」를 알린다(없다고 단정하지 않는다). */
  sourceErrors: Partial<Record<DayCompositionSource, string>>
}

/** `YYYY-MM-DD` 형식이고 달력에 있는 날짜인가(2026-02-30은 아니다). */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * 기간을 받아 날짜별 구성(실제 카드·미션·운영 항목, 실제와 운영 항목은 `created_resource`로 합친 것)을 읽는다(서버 전용, 읽기만 한다).
 * 기간이 틀리면 `DayCompositionPeriodError`를 던진다. 원천 하나가 실패해도 던지지 않고 `sourceErrors`에 담는다.
 */
export async function loadDayCompositions(options: LoadDayCompositionsOptions): Promise<LoadedDayCompositions> {
  const { from, to } = options
  if (!isCalendarDate(from) || !isCalendarDate(to)) throw new DayCompositionPeriodError(DAY_COMPOSITIONS_PERIOD_INVALID_MESSAGE)
  if (from > to) throw new DayCompositionPeriodError(DAY_COMPOSITIONS_PERIOD_ORDER_MESSAGE)
  const dayCount = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
  if (dayCount > DAY_COMPOSITIONS_MAX_DAYS) throw new DayCompositionPeriodError(DAY_COMPOSITIONS_PERIOD_TOO_LONG_MESSAGE)

  const includeSample = options.includeSample === true
  const supabase = createServiceClient()
  const sourceErrors: LoadedDayCompositions['sourceErrors'] = {}

  async function settle<T>(source: DayCompositionSource, task: () => Promise<T>): Promise<T | null> {
    try {
      return await task()
    } catch (error) {
      sourceErrors[source] = errorMessage(error)
      console.error(`[admin/ops-signals] ${source} 조회 오류:`, error)
      return null
    }
  }

  const rangeStartIso = kstDayBoundsIso(from).startIso
  const rangeEndIso = kstDayBoundsIso(to).endIso
  const [cards, missions, bundles] = await Promise.all([
    settle('cards', () => loadCards(supabase, rangeStartIso, rangeEndIso)),
    settle('missions', () => loadMissions(supabase, rangeStartIso, rangeEndIso)),
    settle('bundles', () => loadBundles(supabase, includeSample)),
  ])

  const dates: string[] = []
  for (let date = from; date <= to; date = shiftDateStr(date, 1)) dates.push(date)
  const compositions = buildDayCompositions({ cards: cards ?? [], missions: missions ?? [], bundles: bundles ?? [] }, dates)
  return { bundles, compositions, sourceErrors }
}

// ── 진입점 ───────────────────────────────────────────────────────────────────────────────────────

/**
 * 신호 13종과 날짜별 구성을 읽어 계산한다(서버 전용, 읽기만 한다). 원천 하나가 실패해도 던지지 않는다 — 실패한 원천은
 * `sourceErrors`에 담고 그 원천에 기대는 신호만 「확인하지 못했어요」로 돌려준다.
 */
export async function loadOpsSignals(options: LoadOpsSignalsOptions = {}): Promise<LoadedOpsSignals> {
  const now = options.now ?? new Date()
  const includeSample = options.includeSample === true
  const supabase = createServiceClient()
  const sourceErrors: LoadedOpsSignals['sourceErrors'] = {}

  async function settle<T>(source: OpsSignalSource, task: () => Promise<T>): Promise<T | null> {
    try {
      return await task()
    } catch (error) {
      sourceErrors[source] = errorMessage(error)
      console.error(`[admin/ops-signals] ${source} 조회 오류:`, error)
      return null
    }
  }

  // S7에서 바꾼 기준값(없으면 기본값). 데이터를 읽는 범위(되돌아보는 기간·직전 주 수)도 이 값을 따른다.
  const overrides = await loadSignalOverrides(supabase)
  const thresholds = resolveThresholdValues(overrides)

  // 카드·미션은 오늘 앞 (기간-1)일부터 다음 주 일요일까지(검사 범위의 최대치와 단조로운 흐름이 되돌아보는 기간)
  const today = todayKstDateString(now)
  const rangeStartIso = kstDayBoundsIso(shiftDateStr(today, -(thresholds.monotonyWindowDays - 1))).startIso
  const rangeEndIso = kstDayBoundsIso(shiftDateStr(mondayOfWeek(today), 13)).endIso

  const [cards, missions, bundles, actions] = await Promise.all([
    settle('cards', () => loadCards(supabase, rangeStartIso, rangeEndIso)),
    settle('missions', () => loadMissions(supabase, rangeStartIso, rangeEndIso)),
    settle('bundles', () => loadBundles(supabase, includeSample)),
    settle('actions', () => loadActionCounts(supabase, now, thresholds.actionSpikeBaselineWeeks)),
  ])

  if (bundles) {
    // 제출 원본을 못 읽으면 `raw`가 null로 남아 그 묶음의 뺀 항목 목록은 「읽지 못했어요」로 보인다.
    await settle('bundle_raw', () => attachOpenBundleRaw(supabase, bundles))
  }

  // 묶음을 읽어야 대상 컬렉션을 알 수 있다. 묶음을 못 읽었으면 이 데이터도 못 읽은 것이다(그 사유는 `bundles`에 있다).
  const collectionItemCounts = bundles ? await settle('collection_items', () => loadCollectionItemCounts(supabase, bundles)) : null

  const input: ComputeOpsSignalsInput = { cards, missions, bundles, actions, collectionItemCounts }
  return { ...computeOpsSignals(input, { now, includeSample, thresholds: overrides }), sourceErrors }
}
