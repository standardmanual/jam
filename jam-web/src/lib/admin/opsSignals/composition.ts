/**
 * 날짜별 구성 (티켓 20261001_1155, 순수 함수 — DB·네트워크 접근 없음).
 *
 * 하루에 무엇이 올라가는지를 모은다: 실제 카드(`today_cards`)·실제 미션(`missions`)·운영 묶음 항목(`ops_bundle_items`).
 * 신호 규칙(`dayRules.ts`)이 이 구성을 읽고, 일정표(②·③)도 같은 구성을 쓴다. 입력의 카드 모양은 조회 함수(`load.ts`)가
 * `resolveShape`로 채워서 넘긴다 — 옛 카드의 모양 대응은 여기서 새로 만들지 않는다.
 *
 * 규칙(상위 티켓 20260930_1502 가정과 티켓 20261001_1155 착수 가정 A5~A9):
 * - 하루 겹침은 `/admin/today`·`weeklyCards.ts`의 `overlapsDay`와 같다: 시작 ≤ 그날 끝, 끝 ≥ 그날 시작(KST 하루).
 * - 운영 묶음 항목은 반려·취소·실패를 뺀 나머지가 센다(가정 15). 승인 전 항목도 센다. 10개 밖 상태 값은 센 수 없어 뺀다.
 * - 공개 시각이 없는 항목은 날짜에 올릴 수 없어 뺀다. 종료 시각이 없으면(또는 읽을 수 없으면) 공개한 날 하루만 걸친다.
 * - 「패턴 제안」 항목은 유저에게 나가는 것이 아니라 날짜 구성에 넣지 않는다.
 * - 대표 카드는 그날 전원 대상(`all`) 카드 가운데 정렬이 가장 앞인 카드다(가정 16, A9).
 * - 카드 칸은 `opsInbox/fields.ts`의 읽기 함수로만 읽는다. 「모름」은 `OPS_FIELD_UNKNOWN`이다.
 * - 운영툴이 만든 실제 카드·미션은 그 운영 항목과 **한 칸으로 합친다**(티켓 20261006_1339, 운영툴 PRD §5·§8.5). 세는 항목의
 *   `created_resource`(`RESOURCE_KEY_BY_KIND`: 홈피드 카드는 `today_card_id`, 미션은 `mission_id`)가 가리키는 활성 실제 카드·미션을
 *   따로 세지 않고 그 항목의 칸이 대신한다. 합친 칸의 값은 키·상태·시험·묶음 연결·트라이브·패턴·색 대기는 운영 항목, 날짜 겹침·제목·모양·
 *   노출 대상·커버·정렬은 실제 카드(미션은 제목·기간)다. 멈춘 항목(반려·취소·실패)은 세지 않으므로 합치지 않고 실제 카드는 그대로 센다.
 *   ID는 소문자로 비교한다. 같은 자원을 가리키는 항목이 둘이면 먼저 나온 항목만 합친다.
 */
import type { Json } from '@/types/database.generated'
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { OPS_HOME_FEED_CARD_KIND, OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { RESOURCE_KEY_BY_KIND } from '@/lib/admin/opsInbox/execute/handlers'
import {
  readOpsItemColorPending,
  readOpsItemExposureTags,
  readOpsItemShape,
  readOpsItemTribeId,
  type OpsFieldUnknown,
} from '@/lib/admin/opsInbox/fields'
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { kindLabel, kstDateKey } from '@/lib/admin/opsInbox/labels'
import { kstDayBoundsIso, shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import { isImageShape, type CardShape } from '@/lib/today/shape'

// ── 입력 ─────────────────────────────────────────────────────────────────────────────────────────

/** 실제 카드(`today_cards`) 한 장. 모양은 조회 함수가 `resolveShape`로 채운다. */
export interface SignalCardInput {
  id: string
  title: string
  startsAt: string
  endsAt: string
  isActive: boolean
  sortOrder: number
  /** `resolveShape` 판정값(저장된 모양이 있으면 그 값, 옛 카드는 옛→새 대응값). */
  shape: CardShape
  /** 저장된 `shape` 값이 있었는지. 옛 카드(모양 칸이 빈 카드)는 `false`다. */
  shapeStored: boolean
  exposureTags: string[]
  /** 커버 이미지 주소가 있는지. */
  hasCover: boolean
}

/** 실제 미션 한 건. 종료 시각이 없으면 상시 미션이다. */
export interface SignalMissionInput {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
}

/** 운영 묶음 항목 한 건. 제출 원본과 수정본은 `fields.ts`의 읽기 함수가 읽는다. */
export interface SignalBundleItemInput extends ViewableItem {
  /** 항목 DB 행 ID(`ops_bundle_items.id`). */
  id: string
  position: number
  itemKey: string | null
  kind: string | null
  status: string
  startsAt: string | null
  endsAt: string | null
  patternNo: string | null
  formatErrors: string[]
  updatedAt: string
  /**
   * 예약 등록이 만든 자원의 ID(`ops_bundle_items.created_resource`, 예: `{ item_book_id }`). 「아이템이 없는 컬렉션」 신호만 읽는다
   * (티켓 20261004_2242). 넘기지 않으면(또는 null) 만든 자원이 없는 항목으로 본다.
   */
  createdResource?: Json | null
}

/** 운영 묶음 한 건. `raw`가 null이면 제출 원본을 읽어 오지 않은 것이다(뺀 항목 목록을 읽을 수 없다). */
export interface SignalBundleInput {
  /** 묶음 DB 행 ID(`ops_bundles.id`). */
  id: string
  week: string | null
  isSample: boolean
  receivedAt: string
  formatErrors: string[]
  raw: Json | null
  items: SignalBundleItemInput[]
}

// ── 상태 묶음 ────────────────────────────────────────────────────────────────────────────────────

const KNOWN_STATUSES: ReadonlySet<string> = new Set(OPS_ITEM_STATUSES)

/** 멈춘 상태: 반려·취소·실패. 날짜 구성에 세지 않는다(가정 15). */
export const OPS_STOPPED_ITEM_STATUSES: readonly string[] = ['rejected', 'cancelled', 'failed']

/** 승인 전 상태: 도착·검토중·승인됨·준비중(A8). */
export const OPS_PRE_APPROVAL_STATUSES: readonly string[] = ['arrived', 'reviewing', 'approved', 'preparing']

/** 날짜 구성이 세는 항목 상태인가(10개 안의 값이고 반려·취소·실패가 아니다). */
export function isCountedItemStatus(status: string): boolean {
  return KNOWN_STATUSES.has(status) && !OPS_STOPPED_ITEM_STATUSES.includes(status)
}

// ── 항목 칸 읽기 보조 ────────────────────────────────────────────────────────────────────────────

function containsText(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.trim() !== ''
  if (depth >= 4) return false
  if (Array.isArray(value)) return value.some((entry) => containsText(entry, depth + 1))
  const record = asRecord(value)
  return record ? Object.values(record).some((entry) => containsText(entry, depth + 1)) : false
}

/** 문안이 있는가: `copy`에 비어 있지 않은 문자열이 하나라도 있다(A5). */
export function hasItemCopy(item: ViewableItem): boolean {
  return containsText(itemField(item, 'copy'))
}

/**
 * 이미지가 있는가. 제출 형식에 이미지 칸이 따로 없어(`image_spec`은 만들라는 지시일 뿐이다) `resource`의 키 이름이 자원
 * 테이블의 컬럼 이름과 같다는 규칙(PRD §5.2)에 따라 `resource.cover_image_url`을 읽는다.
 */
export function hasItemImage(item: ViewableItem): boolean {
  const cover = asRecord(itemField(item, 'resource'))?.cover_image_url
  return typeof cover === 'string' && cover.trim() !== ''
}

/**
 * 「이미지 제작 필요」 표시(A8, 신호가 아니라 표시만 한다). 승인 전(도착·검토중·승인됨·준비중) 항목의 모양이 이미지가 있는
 * 모양(`hero`·`poster`·`square`)인데 이미지가 없으면 참이다. 모양을 읽을 수 없으면(「모름」) 거짓이다.
 */
export function needsImageProduction(item: ViewableItem & { status: string }): boolean {
  if (!OPS_PRE_APPROVAL_STATUSES.includes(item.status)) return false
  return isImageShape(readOpsItemShape(item)) && !hasItemImage(item)
}

/** 운영 묶음 카드 정렬 값: `resource.sort_order`(카드 테이블 칸 이름과 같다). 숫자가 아니면 null(A9). */
function readItemSortOrder(item: ViewableItem): number | null {
  const value = asRecord(itemField(item, 'resource'))?.sort_order
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 운영 묶음 항목의 이름: `copy`의 제목, 없으면 항목 키, 그것도 없으면 종류 이름이다. */
export function describeBundleItem(item: Pick<SignalBundleItemInput, 'original' | 'edited' | 'itemKey' | 'kind'>): string {
  const copy = asRecord(itemField(item, 'copy'))
  for (const key of ['title', 'headline', 'name']) {
    const value = copy?.[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return item.itemKey?.trim() || kindLabel(item.kind)
}

/** ISO 시각 → epoch ms. 비었거나 읽을 수 없으면 null이다. */
export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : time
}

// ── 구성 ─────────────────────────────────────────────────────────────────────────────────────────

/** 그날 보이는 홈피드 카드 한 장(실제 카드 또는 운영 묶음의 홈피드 카드 항목). */
export interface CompositionCard {
  /** `card:<카드 ID>` 또는 `bundle:<항목 ID>`. 날짜가 달라도 같은 카드면 같은 값이다. */
  key: string
  source: 'card' | 'bundle'
  /** 실제 카드 ID(`today_cards.id`) 또는 항목 ID(`ops_bundle_items.id`). 실제 카드와 합친 칸은 항목 ID다. */
  id: string
  /**
   * 이 칸이 가리키는 실제 카드 ID(`today_cards.id`). 실제 카드 칸은 자기 ID, 실제 카드와 합친 운영 항목 칸은 그 카드의 ID이고,
   * 합치지 않은 운영 항목 칸은 null이다(일정표가 `created_resource`로 이어진 카드를 운영 항목으로 열 때 쓴다).
   */
  resourceId: string | null
  /** 운영 묶음 카드의 묶음 DB 행 ID. 실제 카드는 null. */
  bundleId: string | null
  isSample: boolean
  title: string
  startsAt: string
  /** 종료 시각. 운영 묶음 카드에 없으면 null(그날 하루만 걸친다). */
  endsAt: string | null
  /** 이 구성의 날짜에 새로 게재를 시작하는 카드인가. */
  startsOnDay: boolean
  shape: CardShape | OpsFieldUnknown
  exposureTags: string[] | OpsFieldUnknown
  /** 운영 묶음 카드만 값이 있다(실제 카드에는 트라이브 칸이 없어 null). */
  tribeId: string | null | OpsFieldUnknown
  /** 운영 묶음 카드만 값이 있다(실제 카드에는 패턴 칸이 없어 null). */
  patternNo: string | null
  colorPending: boolean | OpsFieldUnknown
  hasCopy: boolean
  /** 「이미지가 빈 항목」: 이미지 모양인데 이미지가 없고, 승인 전이 아니다(A8). */
  imageMissing: boolean
  /** 「이미지 제작 필요」 표시(A8). 운영 묶음 카드만 참이 될 수 있다. */
  needsImageProduction: boolean
  /** 실제 카드는 `sort_order`, 운영 묶음 카드는 `resource.sort_order`(없으면 null). */
  sortOrder: number | null
  /** 운영 묶음 항목의 상태. 실제 카드는 null. */
  status: string | null
  /** 정렬에서 제출 순서를 정하는 값(운영 묶음 카드만). */
  submittedAtMs: number
  position: number
}

/** 그날 걸치는 홈피드 카드가 아닌 운영 묶음 항목(미션·드랍 일정·레시피·JAM! 배지·컬렉션 런칭). */
export interface CompositionBundleItem {
  itemId: string
  bundleId: string
  /** 합친 실제 미션 ID(`missions.id`). 실제 미션과 합치지 않았거나 미션이 아닌 항목이면 null이다. */
  resourceId: string | null
  isSample: boolean
  kind: string | null
  status: string
  title: string
  startsAt: string
  endsAt: string | null
  startsOnDay: boolean
  patternNo: string | null
  tribeId: string | null | OpsFieldUnknown
}

export interface CompositionMission {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  startsOnDay: boolean
}

/** 하루의 구성. */
export interface DayComposition {
  /** KST 달력 날짜 `YYYY-MM-DD`. */
  date: string
  /** 그날 보이는 홈피드 카드 전부. 대표 카드 정렬(A9)순이다. */
  cards: CompositionCard[]
  /** 그날 걸치는 실제 미션. */
  missions: CompositionMission[]
  /** 그날 걸치는 홈피드 카드가 아닌 운영 묶음 항목. */
  bundleItems: CompositionBundleItem[]
  /** 대표 카드. 전원 대상 카드가 없으면 null. */
  representative: CompositionCard | null
}

/** 전원 대상(`all`) 카드인가. 노출 대상을 읽을 수 없으면(「모름」) 아니다. */
export function isAllAudienceCard(card: Pick<CompositionCard, 'exposureTags'>): boolean {
  return Array.isArray(card.exposureTags) && card.exposureTags.includes('all')
}

/**
 * 대표 카드 정렬(A9). 실제 카드는 지금 정렬(`sort_order` 오름차순 → `starts_at` 내림차순), 운영 묶음 카드는 `resource.sort_order`를
 * 같은 줄에 놓고 값이 없으면 실제 카드 뒤에 제출 순서로 둔다. 모두 같으면 ID로 순서를 고정한다.
 */
export function compareCompositionCards(a: CompositionCard, b: CompositionCard): number {
  const aMissing = a.sortOrder === null
  const bMissing = b.sortOrder === null
  if (aMissing !== bMissing) return aMissing ? 1 : -1
  if (!aMissing && a.sortOrder !== b.sortOrder) return (a.sortOrder as number) - (b.sortOrder as number)
  if (!aMissing) {
    const startDiff = (parseTime(b.startsAt) ?? 0) - (parseTime(a.startsAt) ?? 0)
    if (startDiff !== 0) return startDiff
    if (a.source !== b.source) return a.source === 'card' ? -1 : 1
  }
  if (a.submittedAtMs !== b.submittedAtMs) return a.submittedAtMs - b.submittedAtMs
  if (a.position !== b.position) return a.position - b.position
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** 대표 카드: 전원 대상 카드 가운데 정렬이 가장 앞인 카드. 없으면 null(가정 16). */
export function pickRepresentative(cards: readonly CompositionCard[]): CompositionCard | null {
  const candidates = cards.filter(isAllAudienceCard)
  return [...candidates].sort(compareCompositionCards)[0] ?? null
}

// ── 날짜 판정 ────────────────────────────────────────────────────────────────────────────────────

interface Period {
  startMs: number
  endMs: number
  /** 종료 시각이 없어 공개한 날 하루로 본 기간인가. */
  singleDay: boolean
}

function kstDayEndMs(ms: number): number {
  const key = kstDateKey(new Date(ms).toISOString()) as string
  return Date.parse(kstDayBoundsIso(key).endIso)
}

/** 운영 묶음 항목의 기간. 공개 시각을 읽을 수 없으면 null이다. 종료 시각이 없거나 읽을 수 없거나 시작보다 이르면 그날 하루다. */
function bundleItemPeriod(item: Pick<SignalBundleItemInput, 'startsAt' | 'endsAt'>): Period | null {
  const startMs = parseTime(item.startsAt)
  if (startMs === null) return null
  const endMs = parseTime(item.endsAt)
  if (endMs === null || endMs < startMs) return { startMs, endMs: kstDayEndMs(startMs), singleDay: true }
  return { startMs, endMs, singleDay: false }
}

/** `/admin/today`·`weeklyCards.ts`의 `overlapsDay`와 같은 하루 겹침 판정. */
function overlapsDay(period: Pick<Period, 'startMs' | 'endMs'>, dayStartMs: number, dayEndMs: number): boolean {
  return period.startMs <= dayEndMs && period.endMs >= dayStartMs
}

export interface DayCompositionInput {
  cards: readonly SignalCardInput[]
  missions: readonly SignalMissionInput[]
  bundles: readonly SignalBundleInput[]
}

function buildBundleCard(
  bundle: SignalBundleInput,
  item: SignalBundleItemInput,
  period: Period,
  date: string
): CompositionCard {
  const status = item.status
  const shape = readOpsItemShape(item)
  const imageEmpty = isImageShape(shape) && !hasItemImage(item)
  return {
    key: `bundle:${item.id}`,
    source: 'bundle',
    id: item.id,
    resourceId: null,
    bundleId: bundle.id,
    isSample: bundle.isSample,
    title: describeBundleItem(item),
    startsAt: item.startsAt as string,
    endsAt: period.singleDay ? null : item.endsAt,
    startsOnDay: kstDateKey(item.startsAt) === date,
    shape,
    exposureTags: readOpsItemExposureTags(item),
    tribeId: readOpsItemTribeId(item),
    patternNo: item.patternNo,
    colorPending: readOpsItemColorPending(item),
    hasCopy: hasItemCopy(item),
    imageMissing: imageEmpty && !OPS_PRE_APPROVAL_STATUSES.includes(status),
    needsImageProduction: needsImageProduction(item),
    sortOrder: readItemSortOrder(item),
    status,
    submittedAtMs: parseTime(bundle.receivedAt) ?? 0,
    position: item.position,
  }
}

function buildRealCard(card: SignalCardInput, date: string): CompositionCard {
  return {
    key: `card:${card.id}`,
    source: 'card',
    id: card.id,
    resourceId: card.id,
    bundleId: null,
    isSample: false,
    title: card.title,
    startsAt: card.startsAt,
    endsAt: card.endsAt,
    startsOnDay: kstDateKey(card.startsAt) === date,
    shape: card.shape,
    exposureTags: card.exposureTags,
    tribeId: null,
    patternNo: null,
    colorPending: false,
    hasCopy: card.title.trim() !== '',
    // 모양이 저장된 카드만 본다. 옛 카드는 `resolveShape`가 커버 유무를 이미 반영해 모양을 정했다(A8).
    imageMissing: card.shapeStored && isImageShape(card.shape) && !card.hasCover,
    needsImageProduction: false,
    sortOrder: card.sortOrder,
    status: null,
    submittedAtMs: 0,
    position: 0,
  }
}

/** 실제 카드의 기간. 시작·종료 시각을 읽을 수 없으면 null이다(그 카드는 날짜에 올리지 않는다). */
function cardPeriod(card: Pick<SignalCardInput, 'startsAt' | 'endsAt'>): Pick<Period, 'startMs' | 'endMs'> | null {
  const startMs = parseTime(card.startsAt)
  const endMs = parseTime(card.endsAt)
  return startMs === null || endMs === null ? null : { startMs, endMs }
}

/** 실제 미션의 기간. 종료 시각이 없으면 끝이 없다(상시). 시작·종료 시각을 읽을 수 없으면 null이다. */
function missionPeriod(mission: Pick<SignalMissionInput, 'startsAt' | 'endsAt'>): Pick<Period, 'startMs' | 'endMs'> | null {
  const startMs = parseTime(mission.startsAt)
  if (startMs === null) return null
  const endMs = mission.endsAt === null ? Infinity : parseTime(mission.endsAt)
  return endMs === null ? null : { startMs, endMs }
}

/** 합치기 키를 읽는 종류. 날짜 구성에 실제 짝이 있는 것은 홈피드 카드와 미션뿐이다(나머지 4종은 구성에 짝이 없다). */
const MERGE_KEY_BY_KIND: Readonly<Record<string, string>> = {
  [OPS_HOME_FEED_CARD_KIND]: RESOURCE_KEY_BY_KIND.home_feed_card,
  mission: RESOURCE_KEY_BY_KIND.mission,
}

/**
 * 항목이 만든 실제 카드·미션의 ID(`created_resource`의 종류별 키)를 소문자로 돌려준다. 키가 없거나(`null`·아직 만들지 않음·`{ sample: true }`)
 * 문자열이 아니거나 비었으면 null이다. 합치기 대상 종류(홈피드 카드·미션) 밖이면 null이다.
 */
export function readMergeResourceId(item: Pick<SignalBundleItemInput, 'kind' | 'createdResource'>): string | null {
  const kind = item.kind
  if (kind === null || !Object.prototype.hasOwnProperty.call(MERGE_KEY_BY_KIND, kind)) return null
  const value = asRecord(item.createdResource)?.[MERGE_KEY_BY_KIND[kind]]
  if (typeof value !== 'string') return null
  const id = value.trim().toLowerCase()
  return id === '' ? null : id
}

/** 실제 카드와 합친 운영 항목 칸. 키·상태·시험·묶음 연결·트라이브·패턴·색 대기는 항목, 제목·기간·모양·노출 대상·커버·정렬은 실제 카드 값이다. */
function buildMergedCard(
  bundle: SignalBundleInput,
  item: SignalBundleItemInput,
  card: SignalCardInput,
  date: string
): CompositionCard {
  return {
    key: `bundle:${item.id}`,
    source: 'bundle',
    id: item.id,
    resourceId: card.id,
    bundleId: bundle.id,
    isSample: bundle.isSample,
    title: card.title,
    startsAt: card.startsAt,
    endsAt: card.endsAt,
    startsOnDay: kstDateKey(card.startsAt) === date,
    shape: card.shape,
    exposureTags: card.exposureTags,
    tribeId: readOpsItemTribeId(item),
    patternNo: item.patternNo,
    colorPending: readOpsItemColorPending(item),
    hasCopy: card.title.trim() !== '',
    imageMissing: card.shapeStored && isImageShape(card.shape) && !card.hasCover,
    needsImageProduction: needsImageProduction(item),
    sortOrder: card.sortOrder,
    status: item.status,
    submittedAtMs: parseTime(bundle.receivedAt) ?? 0,
    position: item.position,
  }
}

/** 날짜 목록(KST `YYYY-MM-DD`)마다 구성을 만든다. 입력 날짜 순서를 지킨다. */
export function buildDayCompositions(input: DayCompositionInput, dates: readonly string[]): DayComposition[] {
  const realCards = input.cards.filter((card) => card.isActive)
  const bundleEntries: Array<{
    bundle: SignalBundleInput
    item: SignalBundleItemInput
    period: Period
    /** 이 항목과 합친 실제 카드·미션(없으면 null). */
    mergedCard: SignalCardInput | null
    mergedMission: SignalMissionInput | null
  }> = []
  for (const bundle of input.bundles) {
    for (const item of bundle.items) {
      if (!isCountedItemStatus(item.status)) continue
      if (item.kind === 'pattern_proposal') continue
      const period = bundleItemPeriod(item)
      if (period) bundleEntries.push({ bundle, item, period, mergedCard: null, mergedMission: null })
    }
  }

  // 합치기: 세는 항목이 만든 활성 실제 카드·미션(기간을 읽을 수 있는 것)을 그 항목 칸으로 합치고 따로 세지 않는다.
  const cardsById = new Map<string, SignalCardInput>()
  for (const card of realCards) {
    if (cardPeriod(card) && !cardsById.has(card.id.toLowerCase())) cardsById.set(card.id.toLowerCase(), card)
  }
  const missionsById = new Map<string, SignalMissionInput>()
  for (const mission of input.missions) {
    if (missionPeriod(mission) && !missionsById.has(mission.id.toLowerCase())) missionsById.set(mission.id.toLowerCase(), mission)
  }
  const mergedCardIds = new Set<string>()
  const mergedMissionIds = new Set<string>()
  for (const entry of bundleEntries) {
    const resourceId = readMergeResourceId(entry.item)
    if (resourceId === null) continue
    if (entry.item.kind === OPS_HOME_FEED_CARD_KIND) {
      const card = cardsById.get(resourceId)
      if (card && !mergedCardIds.has(resourceId)) {
        entry.mergedCard = card
        mergedCardIds.add(resourceId)
      }
    } else {
      const mission = missionsById.get(resourceId)
      if (mission && !mergedMissionIds.has(resourceId)) {
        entry.mergedMission = mission
        mergedMissionIds.add(resourceId)
      }
    }
  }

  return dates.map((date) => {
    const { startIso, endIso } = kstDayBoundsIso(date)
    const dayStartMs = Date.parse(startIso)
    const dayEndMs = Date.parse(endIso)

    const cards: CompositionCard[] = []
    for (const card of realCards) {
      if (mergedCardIds.has(card.id.toLowerCase())) continue
      const period = cardPeriod(card)
      if (period && overlapsDay(period, dayStartMs, dayEndMs)) cards.push(buildRealCard(card, date))
    }

    const bundleItems: CompositionBundleItem[] = []
    for (const { bundle, item, period, mergedCard, mergedMission } of bundleEntries) {
      if (item.kind === OPS_HOME_FEED_CARD_KIND) {
        if (mergedCard) {
          const cardRange = cardPeriod(mergedCard)
          if (cardRange && overlapsDay(cardRange, dayStartMs, dayEndMs)) cards.push(buildMergedCard(bundle, item, mergedCard, date))
        } else if (overlapsDay(period, dayStartMs, dayEndMs)) {
          cards.push(buildBundleCard(bundle, item, period, date))
        }
      } else if (mergedMission) {
        const missionRange = missionPeriod(mergedMission)
        if (missionRange && overlapsDay(missionRange, dayStartMs, dayEndMs)) {
          bundleItems.push({
            itemId: item.id,
            bundleId: bundle.id,
            resourceId: mergedMission.id,
            isSample: bundle.isSample,
            kind: item.kind,
            status: item.status,
            title: mergedMission.title,
            startsAt: mergedMission.startsAt,
            endsAt: mergedMission.endsAt,
            startsOnDay: kstDateKey(mergedMission.startsAt) === date,
            patternNo: item.patternNo,
            tribeId: readOpsItemTribeId(item),
          })
        }
      } else if (overlapsDay(period, dayStartMs, dayEndMs)) {
        bundleItems.push({
          itemId: item.id,
          bundleId: bundle.id,
          resourceId: null,
          isSample: bundle.isSample,
          kind: item.kind,
          status: item.status,
          title: describeBundleItem(item),
          startsAt: item.startsAt as string,
          endsAt: period.singleDay ? null : item.endsAt,
          startsOnDay: kstDateKey(item.startsAt) === date,
          patternNo: item.patternNo,
          tribeId: readOpsItemTribeId(item),
        })
      }
    }

    const missions: CompositionMission[] = []
    for (const mission of input.missions) {
      if (mergedMissionIds.has(mission.id.toLowerCase())) continue
      const period = missionPeriod(mission)
      if (period && overlapsDay(period, dayStartMs, dayEndMs)) {
        missions.push({
          id: mission.id,
          title: mission.title,
          startsAt: mission.startsAt,
          endsAt: mission.endsAt,
          startsOnDay: kstDateKey(mission.startsAt) === date,
        })
      }
    }

    const sorted = [...cards].sort(compareCompositionCards)
    return { date, cards: sorted, missions, bundleItems, representative: pickRepresentative(sorted) }
  })
}

// ── 검사 범위 ────────────────────────────────────────────────────────────────────────────────────

/**
 * 다음 주(월~일)를 보는 날인가(가정 15). `nextWeekCheckFromWeekday`요일(금요일)부터 보고, 그 전이라도 다음 주 기획이 이미 도착했으면(`nextWeekArrived`) 본다.
 * 일요일(0)은 이번 주의 마지막 날이라 곧 다음 주이므로 항상 본다. 신호 검사 범위(`signalScanDates`)와 운영 홈의 다음 주 줄(티켓 20261006_1340)이 같은 판정을 쓴다.
 */
export function checksNextWeek(now: Date, options: { nextWeekArrived?: boolean; nextWeekCheckFromWeekday: number }): boolean {
  const weekday = new Date(`${todayKstDateString(now)}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday >= options.nextWeekCheckFromWeekday || options.nextWeekArrived === true
}

/**
 * 신호를 검사하는 날짜(가정 15). 이번 주는 오늘(포함)부터 일요일까지 항상 보고, 다음 주(월~일)는 `checksNextWeek`가 참일 때 본다.
 */
export function signalScanDates(
  now: Date,
  options: { nextWeekArrived?: boolean; nextWeekCheckFromWeekday: number }
): string[] {
  const today = todayKstDateString(now)
  const thisMonday = mondayOfWeek(today)

  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const date = shiftDateStr(thisMonday, i)
    if (date >= today) dates.push(date)
  }
  if (checksNextWeek(now, options)) {
    for (let i = 7; i < 14; i++) dates.push(shiftDateStr(thisMonday, i))
  }
  return dates
}

/** 'YYYY-MM-DD'가 속한 ISO 주 `YYYY-Www`(묶음의 `week` 칸과 같은 표기). */
export function isoWeekOfDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1, day))
  const dayNumber = (target.getUTCDay() + 6) % 7 // 월=0 … 일=6
  target.setUTCDate(target.getUTCDate() - dayNumber + 3) // 그 주의 목요일
  const isoYear = target.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600_000))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}
