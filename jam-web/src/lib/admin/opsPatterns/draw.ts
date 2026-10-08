/**
 * 조합 뽑기 (티켓 20261007_2221, 상위 20260930_1503 ④, 운영툴 PRD §11.14). `GET /api/admin/ops-patterns/draw`가 쓴다.
 *
 * 에이전트(윤진)가 다음 주 운영 묶음을 짤 때 최근 4주에 덜 쓴 **패턴·트라이브·지점 카테고리**를 각각 「덜 쓴 순」으로 받는다. 새로움을
 * 모델의 창의력에 맡기지 않으려는 것이다. 무작위가 없다 — 같은 행과 같은 기준 시각(`now`)이면 결과가 같다.
 *
 * - 계산은 순수 함수 `rankOpsDraw` 하나에 모았다(세기 → 정렬 → 자르기). 읽기는 `drawOpsCombination`이 맡는다.
 * - 패턴의 세기는 `countOpsPatternUsage`로 떼어 두었다(티켓 20261008_1400). 패턴 사전 화면(S5)의 「최근 4주」·「마지막 사용」이 조합 뽑기와 같은 기준이도록 둘이 같은 함수를 쓴다.
 * - 세는 단위는 항목 1건 = 1회다. 승인 이후 상태(승인됨·준비중·예약됨·게재중·종료)의 실제 항목만 세고 시험 묶음·`pattern_proposal`·
 *   형식이 틀린 값은 세지 않는다. 칸은 `opsInbox/fields.ts` 읽기 함수로 읽어 수정본이 원본보다 우선한다.
 * - 사용 시각은 항목의 공개 시각(`starts_at`), 없으면 묶음의 받은 시각이다. 앞날로 예약된 항목도 센다(이미 예약된 패턴을 또 추천하지 않도록).
 * - **읽지도 돌려주지도 않는 것:** `author`·`raw`·`actor`(관리자 ID·제출 원본). select 목록에서부터 뺀다.
 * - 조회 오류는 던진다(라우트가 로그를 남기고 고정 문장 500으로 받는다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { fetchAllRows, type PagedQuery } from '@/lib/db/fetchAllRows'
import { OPS_POST_APPROVAL_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { OPS_FIELD_UNKNOWN, readOpsItemPatternNo, readOpsItemPlaceCategories, readOpsItemTribeId } from '@/lib/admin/opsInbox/fields'
import { loadPoiCategorySlugs } from '@/lib/admin/opsInbox/validationContext'
import { comparePatternNo, listOpsPatterns, type OpsPatternRecord } from '@/lib/admin/opsPatterns/read'

type ServiceClient = ReturnType<typeof createServiceClient>

export const OPS_DRAW_LOAD_FAILED_MESSAGE = '조합 뽑기 결과를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const OPS_DRAW_LIMIT_INVALID_MESSAGE = '개수(limit)는 1부터 50 사이의 정수로 보내 주세요.'

/** 최근 며칠을 세는지. 기준 시각에서 이만큼 거슬러 올라간 시각부터 센다. */
export const OPS_DRAW_WINDOW_DAYS = 28
/** `limit`을 안 주면 목록마다 싣는 개수. */
export const OPS_DRAW_DEFAULT_LIMIT = 5
/** `limit` 상한. */
export const OPS_DRAW_MAX_LIMIT = 50
/** 조합 뽑기 대상에서 빼는 지점 카테고리: 삭제대상·미분류(거부됨). 쓸 일이 없어 늘 0회라 영구히 상위에 뜨기 때문이다. */
export const OPS_DRAW_EXCLUDED_PLACE_CATEGORIES: readonly string[] = ['delete', 'unassigned']
/** 세지 않는 항목 종류. 패턴 제안은 운영 항목이 아니라 사전에 넣을 제안이다. */
export const OPS_DRAW_UNCOUNTED_KINDS: readonly string[] = ['pattern_proposal']

const DAY_MS = 24 * 60 * 60 * 1000
const POST_APPROVAL_STATUSES: readonly string[] = OPS_POST_APPROVAL_ITEM_STATUSES

// ── 쿼리 ────────────────────────────────────────────────────────────────────────────────────────

export type ParsedDrawLimit = { ok: true; limit: number } | { ok: false; error: string }

/**
 * `limit` 쿼리를 읽는다. 안 주면(빈 값 포함) 5, 1~50 정수만 받는다. `0`·`51`·`abc`·`2.5`는 오류다(라우트가 400으로 받고 아무것도 읽지 않는다).
 */
export function parseDrawLimit(params: URLSearchParams): ParsedDrawLimit {
  const raw = params.get('limit')
  if (raw === null || raw === '') return { ok: true, limit: OPS_DRAW_DEFAULT_LIMIT }
  if (!/^[0-9]+$/.test(raw)) return { ok: false, error: OPS_DRAW_LIMIT_INVALID_MESSAGE }
  const limit = Number(raw)
  if (limit < 1 || limit > OPS_DRAW_MAX_LIMIT) return { ok: false, error: OPS_DRAW_LIMIT_INVALID_MESSAGE }
  return { ok: true, limit }
}

// ── 입력·출력 ───────────────────────────────────────────────────────────────────────────────────

/** 세는 재료가 되는 항목 행. 묶음은 `ops_bundles!inner`로 붙는다(객체로 오지만 배열로 와도 첫 칸을 쓴다). */
export interface OpsDrawUsageRow {
  id: string
  kind: string | null
  status: string
  starts_at: string | null
  original: Json
  edited: Json | null
  ops_bundles: OpsDrawBundle | OpsDrawBundle[] | null
}

export interface OpsDrawBundle {
  is_sample: boolean
  received_at: string
}

/** 뽑기 대상 트라이브(활성만 읽어 온다). */
export interface OpsDrawTribe {
  id: string
  name: string
  sort_order: number
}

export interface OpsDrawPatternLine {
  patternNo: string
  name: string
  uses: number
  lastUsedAt: string | null
}

export interface OpsDrawTribeLine {
  tribeId: string
  name: string
  uses: number
  lastUsedAt: string | null
}

export interface OpsDrawPlaceCategoryLine {
  slug: string
  uses: number
  lastUsedAt: string | null
}

export interface OpsDrawResult {
  /** 기준 시각(ISO). */
  now: string
  /** 센 기간의 시작(기준 시각 − 28일, ISO). 이 시각과 같거나 늦은 사용만 `uses`에 들어간다. */
  since: string
  windowDays: number
  limit: number
  /** 기간 안에서 센 항목 수(승인 이후·시험 아님·`pattern_proposal` 아님·사용 시각이 기간 안). 칸이 비었거나 틀린 항목도 한 건으로 센다. */
  countedItems: number
  patterns: OpsDrawPatternLine[]
  tribes: OpsDrawTribeLine[]
  placeCategories: OpsDrawPlaceCategoryLine[]
}

export interface RankOpsDrawInput {
  rows: readonly OpsDrawUsageRow[]
  /** 사전의 패턴. 사용 중(`active`)만 대상이 되고 쉬는 중·보관은 걸러진다. */
  patterns: readonly Pick<OpsPatternRecord, 'patternNo' | 'name' | 'status'>[]
  /** 활성 트라이브(읽는 쪽이 `is_active = true`로 가져온다). */
  tribes: readonly OpsDrawTribe[]
  /** `poi_categories`의 slug 전체. 제외 카테고리는 여기서 걸러진다. */
  placeCategories: Iterable<string>
  now: Date
  limit: number
}

// ── 순수 계산 ───────────────────────────────────────────────────────────────────────────────────

function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** 항목의 사용 시각(ms). 공개 시각이 있으면 그것, 없으면 묶음의 받은 시각이다. 둘 다 읽을 수 없으면 `null`(세지 않는다). */
export function usageTimeOf(row: Pick<OpsDrawUsageRow, 'starts_at' | 'ops_bundles'>): number | null {
  const startsAt = row.starts_at === null ? Number.NaN : Date.parse(row.starts_at)
  if (!Number.isNaN(startsAt)) return startsAt
  const bundle = embedded(row.ops_bundles)
  const receivedAt = bundle === null ? Number.NaN : Date.parse(bundle.received_at)
  return Number.isNaN(receivedAt) ? null : receivedAt
}

interface Usage {
  uses: number
  /** 기간과 무관하게 승인 이후 상태 전체 기록의 최댓값(ms). 한 번도 안 썼으면 `null`. */
  lastMs: number | null
}

function newUsage(): Usage {
  return { uses: 0, lastMs: null }
}

function record(usage: Usage, ms: number, inWindow: boolean): void {
  if (inWindow) usage.uses += 1
  if (usage.lastMs === null || ms > usage.lastMs) usage.lastMs = ms
}

/** 마지막 사용 시각이 오래된 쪽이 앞이고, 한 번도 안 쓴 것(`null`)이 맨 앞이다. */
function compareLastUsed(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a - b
}

function compareUsage(a: Usage, b: Usage): number {
  return a.uses - b.uses || compareLastUsed(a.lastMs, b.lastMs)
}

/** 문자 코드 순(지역 설정의 영향을 받지 않는다). slug는 ASCII라 코드 포인트 순과 같다. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString()
}

/**
 * 세는 항목이면 그 사용 시각(ms), 세지 않는 항목이면 `null`. 시험 묶음·승인 전 상태·`pattern_proposal`·사용 시각을 읽을 수 없는 항목은 세지 않는다.
 * 패턴·트라이브·카테고리 세기와 패턴 상세의 사용 이력(티켓 20261008_1435)이 모두 이 판정 하나를 쓴다.
 */
export function countableUsedAt(row: Pick<OpsDrawUsageRow, 'status' | 'kind' | 'starts_at' | 'ops_bundles'>): number | null {
  const bundle = embedded(row.ops_bundles)
  if (bundle === null || bundle.is_sample !== false) return null
  if (!POST_APPROVAL_STATUSES.includes(row.status)) return null
  if (row.kind !== null && OPS_DRAW_UNCOUNTED_KINDS.includes(row.kind)) return null
  return usageTimeOf(row)
}

/** 주어진 패턴 번호마다 최근 28일 사용 횟수와 마지막 사용 시각(ms)을 센다. 번호 목록에 없는 패턴은 세지 않는다. */
function countPatternUsageMs(rows: readonly OpsDrawUsageRow[], patternNos: Iterable<string>, nowMs: number): Map<string, Usage> {
  const sinceMs = nowMs - OPS_DRAW_WINDOW_DAYS * DAY_MS
  const usages = new Map<string, Usage>()
  for (const patternNo of patternNos) usages.set(patternNo, newUsage())
  for (const row of rows) {
    const usedAt = countableUsedAt(row)
    if (usedAt === null) continue
    const patternNo = readOpsItemPatternNo(row)
    if (patternNo === null || patternNo === OPS_FIELD_UNKNOWN) continue
    const usage = usages.get(patternNo)
    if (usage) record(usage, usedAt, usedAt >= sinceMs)
  }
  return usages
}

export interface OpsPatternUsageCount {
  /** 기준 시각에서 28일 거슬러 올라간 시각과 같거나 늦은 사용 횟수. */
  uses: number
  /** 기간과 무관한 마지막 사용 시각(ISO). 한 번도 안 썼으면 `null`. */
  lastUsedAt: string | null
}

/**
 * 패턴 번호마다의 「최근 4주」 사용 횟수와 「마지막 사용」(순수 함수, 티켓 20261008_1400). 조합 뽑기(`rankOpsDraw`)와 패턴 사전 화면(S5)이 같이 쓴다.
 *
 * 세는 규칙은 조합 뽑기와 같다: 시험 묶음·승인 전 상태·`pattern_proposal`은 세지 않고, 사용 시각은 `usageTimeOf`, 마지막 사용은 기간과 무관하다.
 * 상태(사용 중·쉬는 중·보관)는 보지 않는다 — 어떤 번호를 넘기느냐가 대상이다. 넘긴 번호는 한 번도 안 썼어도 `{ uses: 0, lastUsedAt: null }`로 돌려준다.
 */
export function countOpsPatternUsage(
  rows: readonly OpsDrawUsageRow[],
  patternNos: Iterable<string>,
  now: Date
): Map<string, OpsPatternUsageCount> {
  const counted = countPatternUsageMs(rows, patternNos, now.getTime())
  return new Map([...counted].map(([patternNo, usage]) => [patternNo, { uses: usage.uses, lastUsedAt: iso(usage.lastMs) }]))
}

/**
 * 최근에 덜 쓴 패턴·트라이브·지점 카테고리를 세어 「덜 쓴 순」으로 돌려준다(순수 함수).
 *
 * 정렬은 `uses` 오름차순 → 마지막 사용이 오래된 순(한 번도 안 쓴 것이 맨 앞) → 마지막 키(패턴은 번호의 숫자 순서, 트라이브는 `sort_order`
 * 다음 `id`, 카테고리는 slug 문자 코드 순)이고, 각 목록을 `limit`개로 자른다. 대상 목록(사용 중 패턴·활성 트라이브·제외하지 않은 카테고리)에
 * 없는 값은 세지 않는다.
 */
export function rankOpsDraw({ rows, patterns, tribes, placeCategories, now, limit }: RankOpsDrawInput): OpsDrawResult {
  const nowMs = now.getTime()
  const sinceMs = nowMs - OPS_DRAW_WINDOW_DAYS * DAY_MS

  const patternLines = patterns.filter((pattern) => pattern.status === 'active')
  const patternUsage = countPatternUsageMs(rows, patternLines.map((pattern) => pattern.patternNo), nowMs)

  const tribeUsage = new Map<string, Usage>()
  const tribeByKey = new Map<string, OpsDrawTribe>()
  for (const tribe of tribes) {
    const key = tribe.id.toLowerCase()
    tribeByKey.set(key, tribe)
    tribeUsage.set(key, newUsage())
  }

  const categoryUsage = new Map<string, Usage>()
  for (const slug of placeCategories) {
    if (!OPS_DRAW_EXCLUDED_PLACE_CATEGORIES.includes(slug)) categoryUsage.set(slug, newUsage())
  }

  let countedItems = 0
  for (const row of rows) {
    const usedAt = countableUsedAt(row)
    if (usedAt === null) continue

    const inWindow = usedAt >= sinceMs
    if (inWindow) countedItems += 1

    const tribeId = readOpsItemTribeId(row)
    if (tribeId !== null && tribeId !== OPS_FIELD_UNKNOWN) {
      const usage = tribeUsage.get(tribeId.toLowerCase())
      if (usage) record(usage, usedAt, inWindow)
    }

    const slugs = readOpsItemPlaceCategories(row)
    if (slugs !== null && slugs !== OPS_FIELD_UNKNOWN) {
      // 한 항목 안에서 겹친 slug는 1회다.
      for (const slug of new Set(slugs)) {
        const usage = categoryUsage.get(slug)
        if (usage) record(usage, usedAt, inWindow)
      }
    }
  }

  const rankedPatterns = patternLines
    .map((pattern) => ({ pattern, usage: patternUsage.get(pattern.patternNo)! }))
    .sort((a, b) => compareUsage(a.usage, b.usage) || comparePatternNo(a.pattern.patternNo, b.pattern.patternNo))
    .slice(0, limit)
    .map(({ pattern, usage }) => ({ patternNo: pattern.patternNo, name: pattern.name, uses: usage.uses, lastUsedAt: iso(usage.lastMs) }))

  const rankedTribes = [...tribeByKey.entries()]
    .map(([key, tribe]) => ({ tribe, usage: tribeUsage.get(key)! }))
    .sort((a, b) => compareUsage(a.usage, b.usage) || a.tribe.sort_order - b.tribe.sort_order || compareCodeUnits(a.tribe.id, b.tribe.id))
    .slice(0, limit)
    .map(({ tribe, usage }) => ({ tribeId: tribe.id, name: tribe.name, uses: usage.uses, lastUsedAt: iso(usage.lastMs) }))

  const rankedCategories = [...categoryUsage.entries()]
    .sort(([slugA, a], [slugB, b]) => compareUsage(a, b) || compareCodeUnits(slugA, slugB))
    .slice(0, limit)
    .map(([slug, usage]) => ({ slug, uses: usage.uses, lastUsedAt: iso(usage.lastMs) }))

  return {
    now: new Date(nowMs).toISOString(),
    since: new Date(sinceMs).toISOString(),
    windowDays: OPS_DRAW_WINDOW_DAYS,
    limit,
    countedItems,
    patterns: rankedPatterns,
    tribes: rankedTribes,
    placeCategories: rankedCategories,
  }
}

// ── 읽기 ────────────────────────────────────────────────────────────────────────────────────────

/**
 * 읽는 칸 목록. 세는 데 필요한 칸만이다 — 관리자 ID(`ops_bundles.author`)·제출 원본(`ops_bundles.raw`)·`ops_decisions.actor`는 넣지 않는다.
 * 항목의 `original`·`edited`는 칸(패턴 번호·트라이브·카테고리)을 읽으려고 싣지만 응답에는 칸 값 외에 나가지 않는다.
 */
export const OPS_DRAW_USAGE_COLUMNS = 'id, kind, status, starts_at, original, edited, ops_bundles!inner(is_sample, received_at)'
export const OPS_DRAW_TRIBE_COLUMNS = 'id, name, sort_order'
/** 패턴 상세의 사용 이력이 읽는 칸: 세는 칸 + 줄이 가리킬 항목(`bundle_id`·`item_key`). 이 칸들도 관리자 ID·제출 원본이 아니다. */
export const OPS_PATTERN_USAGE_COLUMNS = 'id, bundle_id, item_key, kind, status, starts_at, original, edited, ops_bundles!inner(is_sample, received_at)'

/** 패턴 상세의 사용 이력 재료. 세는 칸에 항목이 속한 묶음 ID와 항목 키(이름을 못 정할 때의 대체)가 붙는다. */
export interface OpsPatternUsageRow extends OpsDrawUsageRow {
  bundle_id: string
  item_key: string | null
}

/** 서비스 클라이언트의 select 빌더 중 이 파일이 쓰는 메서드만 좁힌 모양(임베드·점 경로 필터는 생성 타입이 따라오지 못한다). */
interface LooseQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(columns: string): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  in(column: string, values: readonly string[]): LooseQuery
  order(column: string, options?: { ascending?: boolean }): LooseQuery
  range(from: number, to: number): LooseQuery
}

function itemsTable(service: ServiceClient): LooseQuery {
  return (service as unknown as { from(table: string): LooseQuery }).from('ops_bundle_items')
}

/**
 * 승인 이후 상태의 항목 전부(시험 묶음 제외). 기간 조건은 걸지 않는다 — `lastUsedAt`이 기간과 무관한 전체 기록의 최댓값이기 때문이다.
 * 시험 묶음은 `ops_bundles!inner` 조인과 `is_sample = false` 조건으로 빼고, `rankOpsDraw`가 한 번 더 거른다.
 */
export async function loadDrawUsageRows(service: ServiceClient): Promise<OpsDrawUsageRow[]> {
  return fetchAllRows<OpsDrawUsageRow>(
    '조합 뽑기 사용 기록',
    'id',
    () =>
      itemsTable(service)
        .select(OPS_DRAW_USAGE_COLUMNS)
        .eq('ops_bundles.is_sample', false)
        .in('status', OPS_POST_APPROVAL_ITEM_STATUSES) as unknown as PagedQuery<OpsDrawUsageRow>
  )
}

/**
 * 패턴 상세의 사용 이력 재료(티켓 20261008_1435). `loadDrawUsageRows`와 **같은 조건**(시험 묶음 제외·승인 이후 상태·기간 제한 없음)에 `bundle_id`·`item_key` 칸만 더한다.
 * 세는 판정은 읽은 뒤 `countableUsedAt`이 한 번 더 건다.
 */
export async function loadPatternUsageRows(service: ServiceClient): Promise<OpsPatternUsageRow[]> {
  return fetchAllRows<OpsPatternUsageRow>(
    '패턴 사용 이력',
    'id',
    () =>
      itemsTable(service)
        .select(OPS_PATTERN_USAGE_COLUMNS)
        .eq('ops_bundles.is_sample', false)
        .in('status', OPS_POST_APPROVAL_ITEM_STATUSES) as unknown as PagedQuery<OpsPatternUsageRow>
  )
}

/** 활성(`is_active = true`) 트라이브. 비활성은 온보딩과 어드민 만들기에서 고를 수 없어 추천해도 배지를 만들 수 없으므로 싣지 않는다. */
export async function loadDrawTribes(service: ServiceClient): Promise<OpsDrawTribe[]> {
  const { data, error } = await service.from('tribes').select(OPS_DRAW_TRIBE_COLUMNS).eq('is_active', true)
  if (error) throw new Error(`트라이브 조회 실패: ${error.message}`)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, sort_order: row.sort_order }))
}

/** 읽기 넷(항목·패턴 사전·트라이브·지점 카테고리)을 함께 불러 순위를 계산한다. 하나라도 실패하면 던진다. */
export async function drawOpsCombination(service: ServiceClient, { limit, now }: { limit: number; now: Date }): Promise<OpsDrawResult> {
  const [rows, patterns, tribes, placeCategories] = await Promise.all([
    loadDrawUsageRows(service),
    listOpsPatterns(service, { includeArchived: false }),
    loadDrawTribes(service),
    loadPoiCategorySlugs(service),
  ])
  return rankOpsDraw({ rows, patterns, tribes, placeCategories, now, limit })
}
