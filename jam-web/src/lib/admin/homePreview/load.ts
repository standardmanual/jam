/**
 * 어드민 홈피드 미리보기 조회 — 날짜·기간·가상 유저 조건별로 그날 홈에 보일 카드 목록을 만든다 (티켓 20261026_2025 1회차, 서버 전용).
 *
 * 노출 판정은 실제 홈 조회(`getTodayCards`)와 같은 규칙 함수(`lib/today/cardSelection.ts`)를 쓴다. 기간 전체와 겹치는 켜진 카드를 한 번에 읽고,
 * 날마다 메모리에서 기간·노출 태그·정렬을 적용한다. 미션 소개 카드와 미션을 가리키는 랭킹 보드 카드는 가상 유저의 트라이브가 허용 트라이브가
 * 아니면 내린다(`filterMissionSpotlightCards`·`filterRankingBoardCardsByTribe`와 같은 `isMissionOpenToTribe` 규칙).
 *
 * 하지 않는 것: 유저별 참가·완료 판정(가상 유저에게는 참가·완료 이력이 없다), 유저 개인 상태 태그. 실제 유저가 보는 목록은 이 목록의 부분집합일 수 있다.
 *
 * 승인 전 카드: 묶음(`bundleId`)의 `home_feed_card` 항목 중 도착·검토중인 것을 같은 노출 태그 규칙으로 걸러 실제 카드 뒤에 붙인다.
 *
 * 읽기가 하나라도 실패하면 던진다 — 호출부가 오류 응답으로 바꾼다. 실패를 빈 목록으로 보이지 않는다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import type { Json } from '@/types/database.generated'
import type { TodayCardWithHref } from '@/lib/today/cards'
import { cardIsLiveDuring, cardMatchesTags, sortHomeCards } from '@/lib/today/cardSelection'
import { isClosedToViewerTribe, virtualExposureTags, type VirtualViewer } from '@/lib/today/virtualViewer'
import { resolveShape } from '@/lib/today/shape'
import { specialDayTags, type SpecialDayTag } from '@/lib/inputs/special-days-config'
import type { WeatherKind } from '@/lib/inputs/weather'
import { kstDayBoundsIso, previewBaseTime, shiftDateStr } from '@/lib/admin/today-calendar'
import { resolvePreviewCards } from '@/lib/admin/todayPreview'
import { readDayInputs, type DayInputs } from '@/lib/admin/homePreview/dayInputs'
import { itemToPreviewCard } from '@/lib/admin/opsInbox/cardPreview'
import { asRecord, itemField } from '@/lib/admin/opsInbox/itemView'
import { readOpsItemRationales } from '@/lib/admin/opsInbox/rationaleRead'
import { kstDateKey } from '@/lib/admin/opsInbox/labels'
import { OPS_HOME_FEED_CARD_KIND } from '@/lib/admin/opsInbox/constants'
import type { OpsRationaleKind } from '@/lib/admin/opsInbox/constants'

/** 승인 전으로 보는 항목 상태: 도착·검토중 */
const PENDING_STATUSES = ['arrived', 'reviewing'] as const
/** `.in()`에 한 번에 넘기는 id 수 상한(주소 길이 제한을 피한다) */
const ID_CHUNK = 50

/**
 * 조회에 쓰는 가상 유저. `weather`·`specialDays`를 비우면(undefined) 날마다 그날 저장된 값을 쓴다.
 * 저장된 값도 없으면 그 태그를 넣지 않는다(미래 날짜는 화면이 고르게 한다).
 */
export type HomePreviewViewer = Omit<VirtualViewer, 'weather' | 'specialDays'> & {
  weather?: WeatherKind
  specialDays?: SpecialDayTag[]
}

export interface LoadHomePreviewParams {
  /** 첫날. 'YYYY-MM-DD'(KST) */
  fromDate: string
  /** 보여줄 날 수(호출부가 1~7로 맞춘다) */
  days: number
  viewer: HomePreviewViewer
  /** 승인 전 카드를 읽을 묶음 id. 없으면 승인 전 카드는 없다 */
  bundleId?: string | null
  now?: Date
}

export interface PreviewEntry {
  source: 'live' | 'pending'
  id: string
  card: TodayCardWithHref
  /** 기획 이유. 승인 전 카드만 있다 */
  rationale: { kind: OpsRationaleKind; label: string }[]
}

export interface DayPreview {
  date: string
  /** 그날 홈 순서. `entries.length`가 그날 카드 수다 */
  entries: PreviewEntry[]
  /** 카드 모양(`resolveShape`)별 개수. `entries`에서 센다 */
  shapeCounts: Record<string, number>
  /** 승인 전 카드 수 */
  pendingCount: number
  inputs: DayInputs & {
    /** 이 날 실제로 계산에 쓴 값(고른 값, 없으면 저장된 값) */
    used: { weather: WeatherKind | null; specialDays: SpecialDayTag[] }
  }
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`홈피드 미리보기 ${what} 조회 실패: ${error.message}`)
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

interface TribeGates {
  /** 미션 id → 허용 트라이브(행이 없으면 키가 없다) */
  allowedByMission: Map<string, string[]>
  /** 랭킹모드 id → 가리키는 미션 id(미션 참가자 순위만) */
  missionByMode: Map<string, string>
}

/** 트라이브 거름에 필요한 값을 한 번에 읽는다. */
async function loadTribeGates(supabase: ReturnType<typeof createServiceClient>, cards: readonly TodayCardRow[]): Promise<TribeGates> {
  const modeIds = [
    ...new Set(cards.filter((c) => c.template_type === 'ranking_board' && c.ranking_mode_id).map((c) => c.ranking_mode_id as string)),
  ]
  const missionByMode = new Map<string, string>()
  for (const ids of chunk(modeIds, ID_CHUNK)) {
    const { data, error } = await supabase.from('ranking_modes').select('id, target_type, target_mission_id').in('id', ids)
    if (error) fail('랭킹모드', error)
    for (const mode of data ?? []) {
      if (mode.target_type === 'mission_participants' && mode.target_mission_id) missionByMode.set(mode.id, mode.target_mission_id)
    }
  }

  const missionIds = [
    ...new Set([
      ...cards.filter((c) => c.template_type === 'mission_spotlight' && c.mission_id).map((c) => c.mission_id as string),
      ...missionByMode.values(),
    ]),
  ]
  const allowedByMission = new Map<string, string[]>()
  for (const ids of chunk(missionIds, ID_CHUNK)) {
    const { data, error } = await supabase.from('mission_allowed_tribes').select('mission_id, tribe_id').in('mission_id', ids)
    if (error) fail('미션 허용 트라이브', error)
    for (const row of data ?? []) {
      const list = allowedByMission.get(row.mission_id)
      if (list) list.push(row.tribe_id)
      else allowedByMission.set(row.mission_id, [row.tribe_id])
    }
  }
  return { allowedByMission, missionByMode }
}

/** 가상 유저의 트라이브에 닫힌 미션을 가리키는 카드인가 */
function isTribeClosed(card: TodayCardRow, gates: TribeGates, viewer: HomePreviewViewer): boolean {
  let missionId: string | undefined
  if (card.template_type === 'mission_spotlight' && card.mission_id) missionId = card.mission_id
  else if (card.template_type === 'ranking_board' && card.ranking_mode_id) missionId = gates.missionByMode.get(card.ranking_mode_id)
  if (!missionId) return false
  return isClosedToViewerTribe(gates.allowedByMission.get(missionId), { ...viewer, weather: null, specialDays: [] })
}

interface PendingItem {
  entry: PreviewEntry
  /** 승인 전 카드끼리의 순서: 항목 `resource.sort_order` 오름차순, 같으면 묶음 안 순서 */
  sortOrder: number
  startsAt: string
  endsAt: string
  tags: readonly string[]
}

interface ItemRow {
  id: string
  status: string
  kind: string | null
  original: Json
  edited: Json | null
  starts_at: string | null
  ends_at: string | null
}

/**
 * 묶음의 승인 전 카드 항목을 카드 값으로 바꾼다. 시각은 항목 값을 먼저, 없으면 행 칸이며 종료가 없으면 시작한 날의 끝이다(등록 변환
 * `registerInput.ts`와 같은 규칙). 시작 시각을 읽을 수 없으면 어느 날에도 놓을 수 없어 뺀다.
 */
function toPendingItem(row: ItemRow, now: Date): PendingItem | null {
  const base = { original: row.original, edited: row.edited }
  const patch: Record<string, string> = {}
  const startsAt = (itemField(base, 'starts_at') as string | undefined) ?? row.starts_at ?? undefined
  if (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt))) return null
  patch.starts_at = startsAt
  const rawEnds = (itemField(base, 'ends_at') as string | undefined) ?? row.ends_at ?? undefined
  if (typeof rawEnds === 'string' && !Number.isNaN(Date.parse(rawEnds))) {
    patch.ends_at = rawEnds
  } else {
    const day = kstDateKey(startsAt)
    if (!day) return null
    patch.ends_at = kstDayBoundsIso(day).endIso
  }

  const item = { id: row.id, kind: row.kind, original: { ...(asRecord(row.original) ?? {}), ...patch } as Json, edited: row.edited }
  const card = itemToPreviewCard(item, undefined, { now })
  if (!card) return null

  const resource = asRecord(itemField(item, 'resource')) ?? {}
  const sortOrder = typeof resource.sort_order === 'number' && Number.isFinite(resource.sort_order) ? resource.sort_order : 0
  const rationale = readOpsItemRationales(row.edited ?? row.original).map(({ kind, label }) => ({ kind, label }))
  return {
    entry: { source: 'pending', id: row.id, card: { ...card, sort_order: sortOrder }, rationale },
    sortOrder,
    startsAt: card.starts_at,
    endsAt: card.ends_at,
    tags: card.exposure_tags,
  }
}

async function loadPendingItems(supabase: ReturnType<typeof createServiceClient>, bundleId: string, now: Date): Promise<PendingItem[]> {
  const { data, error } = await supabase
    .from('ops_bundle_items')
    .select('id, status, kind, original, edited, starts_at, ends_at')
    .eq('bundle_id', bundleId)
    .eq('kind', OPS_HOME_FEED_CARD_KIND)
    .in('status', [...PENDING_STATUSES])
    .order('position', { ascending: true })
  if (error) fail('승인 전 카드', error)
  return ((data ?? []) as ItemRow[]).map((row) => toPendingItem(row, now)).filter((p): p is PendingItem => p !== null)
}

function countShapes(entries: readonly PreviewEntry[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { card } of entries) {
    const shape = resolveShape(card)
    counts[shape] = (counts[shape] ?? 0) + 1
  }
  return counts
}

export async function loadHomePreview(params: LoadHomePreviewParams): Promise<{ days: DayPreview[] }> {
  const { fromDate, days, viewer, bundleId } = params
  const now = params.now ?? new Date()
  const dates = Array.from({ length: Math.max(0, days) }, (_, i) => shiftDateStr(fromDate, i))
  if (dates.length === 0) return { days: [] }

  const supabase = createServiceClient()
  const rangeStart = kstDayBoundsIso(dates[0]).startIso
  const rangeEnd = kstDayBoundsIso(dates[dates.length - 1]).endIso

  const { data, error } = await supabase
    .from('today_cards')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', rangeEnd)
    .gte('ends_at', rangeStart)
  if (error) fail('카드', error)
  const cards = (data ?? []) as TodayCardRow[]

  const [gates, pending, storedInputs] = await Promise.all([
    loadTribeGates(supabase, cards),
    bundleId ? loadPendingItems(supabase, bundleId, now) : Promise.resolve([] as PendingItem[]),
    Promise.all(dates.map((date) => readDayInputs(date))),
  ])

  const result = await Promise.all(
    dates.map(async (date, index): Promise<DayPreview> => {
      const stored = storedInputs[index]
      const usedWeather = viewer.weather ?? stored.weather
      const usedSpecial = viewer.specialDays ?? specialDayTags(stored.specialDays ?? [])
      const tags = virtualExposureTags({ ...viewer, weather: usedWeather, specialDays: usedSpecial })
      const { startIso, endIso } = kstDayBoundsIso(date)

      const live = sortHomeCards(
        cards.filter(
          (card) => cardIsLiveDuring(card, startIso, endIso) && cardMatchesTags(card.exposure_tags, tags) && !isTribeClosed(card, gates, viewer),
        ),
      )
      const resolved = await resolvePreviewCards(supabase, live, previewBaseTime(date, now))

      const pendingToday = pending
        .map((item, order) => ({ item, order }))
        .filter(
          ({ item }) =>
            cardIsLiveDuring({ is_active: true, starts_at: item.startsAt, ends_at: item.endsAt }, startIso, endIso) &&
            cardMatchesTags(item.tags, tags),
        )
        .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.order - b.order)
        .map(({ item }) => item.entry)

      const entries: PreviewEntry[] = [
        ...resolved.map((card): PreviewEntry => ({ source: 'live', id: card.id, card, rationale: [] })),
        ...pendingToday,
      ]
      return {
        date,
        entries,
        shapeCounts: countShapes(entries),
        pendingCount: pendingToday.length,
        inputs: { ...stored, used: { weather: usedWeather, specialDays: usedSpecial } },
      }
    }),
  )
  return { days: result }
}
