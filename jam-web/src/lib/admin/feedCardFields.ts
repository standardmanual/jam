/**
 * 어드민 홈피드 카드의 개편 칸 — 폼 값 ↔ 저장 칸 변환, 값 검증, 저장 때 자동 값 고정 (티켓 20261121_1315, 상위 20261120_2026 5회차-1).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격」(칸 표, «값을 정하는 시점»)이다. 칸 15개는 마이그레이션 349가 만들었다.
 * React·서버 모듈을 읽지 않는 순수 함수만 둔다(같은 입력은 같은 결과). 저장하는 두 라우트(`/api/admin/today`·`/api/admin/today/[id]`)와 어드민 폼이 함께 쓴다.
 *
 * **값 의미(폼 → 저장)**
 * - 빈 문자열·선택 안 함은 `NULL`이다(자동 규칙이 정한다).
 * - 칩은 «자동»(`NULL`)·«칩 없음»(`[]`)·«직접»(1~2개)이다. 도장은 «자동»(`NULL`)·«사용 안 함»(`false`)·«사용»(`true`+자리)이다.
 *   설명 노출은 «자동»(`NULL`)·«보임»(`true`)·«숨김»(`false`)이다.
 * - 유형(`feed_type`)이 비어 있으면 옛 7모양 카드다. 이때 다른 새 칸이 있어도 홈은 옛 경로로 그리므로 검증은 경고만 한다.
 */
import type {
  FeedColorKey,
  TodayBoxKind,
  TodayBoxShape,
  TodayBurstPoint,
  TodayChipSpec,
  TodayFeedType,
  TodayListItem,
} from '@/types/database'
import { isSafeListHref } from '@/lib/today/listHref'
import { BOX_SHAPES } from '@/lib/today/boxShape'
import { assignFeedColors, type ExcludedColorPair, type FeedPalette } from '@/lib/today/feedAssign'
import {
  chipLimitOf,
  diagonalOf,
  FEED_SLOT_PATTERN,
  FEED_TYPES,
  isAllowedSlot,
  isFeedType,
  MAX_CARD_CHIPS,
  type FeedType,
} from '@/lib/today/feedChipSlots'
import { chipExclusionRule, type ColorRuleName } from '@/lib/today/feedColorRules'
import {
  boxAllowedFor,
  boxHasTextFor,
  FEED_BURST,
  FEED_COLOR_KEYS,
  FEED_COLOR_USAGE,
  FEED_GALLERY,
  FEED_TILTS,
} from '@/lib/today/feedConstants'
import { FEED_COLOR_LABELS } from '@/lib/admin/feedColorLabels'
import type { FeedImageColorInput } from '@/lib/today/feedImageColors'
import { checkChipTextLength } from '@/lib/today/feedValueChips'
import { MAX_TITLE_CHIPS } from '@/lib/today/titleChips'

// ── 저장 칸 ───────────────────────────────────────────────────

/** 마이그레이션 349의 개편 칸 15개(`today_cards`의 컬럼 이름). */
export const FEED_CARD_COLUMN_KEYS = [
  'feed_type',
  'box_shape',
  'box_kind',
  'bg_color_key',
  'chip_color_key',
  'box_color_key',
  'chips',
  'title_chip_words',
  'show_description',
  'stamp_enabled',
  'stamp_slot',
  'list_items',
  'list_more_href',
  'collection_burst',
  'feed_seed',
] as const

export type FeedCardColumnKey = (typeof FEED_CARD_COLUMN_KEYS)[number]

/** 저장 칸 묶음. 폼이 만든 값이며 15개 키가 모두 있고, 비어 있는 칸은 `null`이다. */
export interface FeedCardColumns {
  feed_type: TodayFeedType | null
  box_shape: TodayBoxShape | null
  box_kind: TodayBoxKind | null
  bg_color_key: FeedColorKey | null
  chip_color_key: FeedColorKey | null
  box_color_key: FeedColorKey | null
  chips: TodayChipSpec[] | null
  title_chip_words: string[] | null
  show_description: boolean | null
  stamp_enabled: boolean | null
  stamp_slot: string | null
  list_items: TodayListItem[] | null
  list_more_href: string | null
  collection_burst: TodayBurstPoint[] | null
  feed_seed: number | null
}

/** 검증 함수가 받는 모양. 요청 본문처럼 타입을 믿을 수 없는 값도 받으므로 칸마다 `unknown`이고, 없는 칸은 빠져 있어도 된다. */
export type FeedCardColumnsInput = Partial<Record<FeedCardColumnKey, unknown>>

/** 본문에 개편 칸이 하나라도 들어 있는가(옛 호출은 이 칸들 없이 온다). */
export function hasFeedCardColumns(body: Readonly<Record<string, unknown>>): boolean {
  return FEED_CARD_COLUMN_KEYS.some((key) => key in body)
}

/** 본문에서 개편 칸만 뽑는다. 본문에 없는 칸은 결과에도 없다. */
export function pickFeedCardColumns(body: Readonly<Record<string, unknown>>): FeedCardColumnsInput {
  const picked: FeedCardColumnsInput = {}
  for (const key of FEED_CARD_COLUMN_KEYS) {
    if (key in body) picked[key] = body[key]
  }
  return picked
}

// ── 폼 값 ─────────────────────────────────────────────────────

export type FeedChipsMode = 'auto' | 'none' | 'custom'
export type FeedStampMode = 'auto' | 'off' | 'on'
export type FeedDescriptionMode = 'auto' | 'show' | 'hide'

export interface FeedChipFormValue {
  kind: TodayChipSpec['kind']
  /** `kind=value`일 때 값의 출처 키 */
  source: string
  /** `kind=phrase`일 때 문구 */
  text: string
  /** 비우면 자리는 시드로 정해진다 */
  slot: string
  /** 비우면 기울기는 시드로 정해진다. 숫자 문자열(`'-8'`) */
  tilt: string
}

export interface FeedListItemFormValue {
  name: string
  href: string
  imageUrl: string
}

export interface FeedBurstFormValue {
  x: string
  y: string
  tilt: string
  size: string
  delayMs: string
}

/** 폼 상태 모양. 문자열·열거 값이고, 빈 값은 `''`다. */
export interface FeedCardFormValues {
  feedType: '' | TodayFeedType
  boxShape: '' | TodayBoxShape
  boxKind: '' | TodayBoxKind
  bgColorKey: '' | FeedColorKey
  chipColorKey: '' | FeedColorKey
  boxColorKey: '' | FeedColorKey
  chipsMode: FeedChipsMode
  /** `chipsMode`가 `custom`일 때만 쓴다 */
  chips: FeedChipFormValue[]
  /** 제목 속 칩으로 만들 낱말(빈 칸은 저장 때 떨어진다) */
  titleChipWords: string[]
  descriptionMode: FeedDescriptionMode
  stampMode: FeedStampMode
  /** `stampMode`가 `on`일 때만 쓴다. 비우면 자리는 시드로 정해진다 */
  stampSlot: string
  listItems: FeedListItemFormValue[]
  listMoreHref: string
  collectionBurst: FeedBurstFormValue[]
  /** 숫자 문자열. 새 카드에서는 비워 두고 저장할 때 서버가 정한다 */
  feedSeed: string
}

export const EMPTY_FEED_CARD_FORM_VALUES: FeedCardFormValues = {
  feedType: '',
  boxShape: '',
  boxKind: '',
  bgColorKey: '',
  chipColorKey: '',
  boxColorKey: '',
  chipsMode: 'auto',
  chips: [],
  titleChipWords: [],
  descriptionMode: 'auto',
  stampMode: 'auto',
  stampSlot: '',
  listItems: [],
  listMoreHref: '',
  collectionBurst: [],
  feedSeed: '',
}

/** 새 카드의 기본 카드 유형이고, 유형이 비어 있던 옛 카드의 수정 화면이 보여 주는 유형이다(홈이 비어 있는 유형을 그리는 유형과 같다, 티켓 20261122_1153). */
export const DEFAULT_FEED_TYPE: TodayFeedType = 'text_box'

/** 폼 값의 카드 유형이 비어 있으면 기본 유형을 채운다. 유형 선택에는 «지정 안 함»이 없어서 폼 상태는 늘 유형을 갖는다. */
export function withDefaultFeedType(values: FeedCardFormValues): FeedCardFormValues {
  return values.feedType ? values : { ...values, feedType: DEFAULT_FEED_TYPE }
}

/** `feedCardFormValuesFromRow`가 읽는 칸. 저장된 행에서 개편 칸만 쓴다(없는 칸은 `undefined`여도 된다). */
export type FeedCardRowFields = Partial<{
  [K in FeedCardColumnKey]: FeedCardColumns[K] | undefined
}>

const orEmpty = (value: string | null | undefined): string => value ?? ''
const numberText = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : ''

/** 저장된 행에서 폼 값을 되살린다. `buildFeedCardColumns(feedCardFormValuesFromRow(row))`는 행의 개편 칸과 같다. */
export function feedCardFormValuesFromRow(row: FeedCardRowFields): FeedCardFormValues {
  const chips = row.chips
  return {
    feedType: row.feed_type ?? '',
    boxShape: row.box_shape ?? '',
    boxKind: row.box_kind ?? '',
    bgColorKey: row.bg_color_key ?? '',
    chipColorKey: row.chip_color_key ?? '',
    boxColorKey: row.box_color_key ?? '',
    chipsMode: chips === null || chips === undefined ? 'auto' : chips.length === 0 ? 'none' : 'custom',
    chips: (chips ?? []).map((chip) => ({
      kind: chip.kind,
      source: orEmpty(chip.source),
      text: orEmpty(chip.text),
      slot: orEmpty(chip.slot),
      tilt: numberText(chip.tilt),
    })),
    titleChipWords: [...(row.title_chip_words ?? [])],
    descriptionMode: row.show_description === true ? 'show' : row.show_description === false ? 'hide' : 'auto',
    stampMode: row.stamp_enabled === true ? 'on' : row.stamp_enabled === false ? 'off' : 'auto',
    stampSlot: orEmpty(row.stamp_slot),
    listItems: (row.list_items ?? []).map((item) => ({
      name: item.name,
      href: item.href,
      imageUrl: orEmpty(item.image_url),
    })),
    listMoreHref: orEmpty(row.list_more_href),
    collectionBurst: (row.collection_burst ?? []).map((point) => ({
      x: numberText(point.x),
      y: numberText(point.y),
      tilt: numberText(point.tilt),
      size: numberText(point.size),
      delayMs: numberText(point.delay_ms),
    })),
    feedSeed: numberText(row.feed_seed),
  }
}

const isBlank = (value: string): boolean => value.trim().length === 0

/** 폼 숫자 칸 → 숫자. 빈 칸은 `undefined`(칸 자체를 저장하지 않는다), 숫자가 아니면 `NaN`(검증이 막는다). */
function optionalNumber(text: string): number | undefined {
  return isBlank(text) ? undefined : Number(text)
}

/** 폼 값에서 저장 칸 묶음을 만든다. 15개 키가 모두 있고 비어 있는 칸은 `null`이다. */
export function buildFeedCardColumns(values: FeedCardFormValues): FeedCardColumns {
  let chips: TodayChipSpec[] | null = null
  if (values.chipsMode === 'none') {
    chips = []
  } else if (values.chipsMode === 'custom') {
    chips = values.chips.map((chip) => {
      const spec: TodayChipSpec = { kind: chip.kind }
      if (chip.kind === 'value' && !isBlank(chip.source)) spec.source = chip.source.trim()
      if (chip.kind === 'phrase' && !isBlank(chip.text)) spec.text = chip.text.trim()
      if (!isBlank(chip.slot)) spec.slot = chip.slot.trim()
      const tilt = optionalNumber(chip.tilt)
      if (tilt !== undefined) spec.tilt = tilt as TodayChipSpec['tilt']
      return spec
    })
  }

  const words = values.titleChipWords.map((word) => word.trim()).filter((word) => word.length > 0)

  const listItems = values.listItems
    .filter((item) => !(isBlank(item.name) && isBlank(item.href) && isBlank(item.imageUrl)))
    .map((item): TodayListItem => {
      const built: TodayListItem = { name: item.name.trim(), href: item.href.trim() }
      if (!isBlank(item.imageUrl)) built.image_url = item.imageUrl.trim()
      return built
    })

  const burst = values.collectionBurst
    .filter((row) => !(isBlank(row.x) && isBlank(row.y) && isBlank(row.tilt) && isBlank(row.size) && isBlank(row.delayMs)))
    .map((row): TodayBurstPoint => {
      // 위치 칸이 빈 행은 0이 아니라 숫자가 아닌 값(NaN)으로 만들어 검증이 막는다(`Number('')`는 0이라 조용히 가운데로 저장되기 때문, 티켓 20261121_1317).
      const point: TodayBurstPoint = { x: optionalNumber(row.x) ?? Number.NaN, y: optionalNumber(row.y) ?? Number.NaN }
      const tilt = optionalNumber(row.tilt)
      const size = optionalNumber(row.size)
      const delay = optionalNumber(row.delayMs)
      if (tilt !== undefined) point.tilt = tilt
      if (size !== undefined) point.size = size
      if (delay !== undefined) point.delay_ms = delay
      return point
    })

  return {
    feed_type: values.feedType || null,
    box_shape: values.boxShape || null,
    box_kind: values.boxKind || null,
    bg_color_key: values.bgColorKey || null,
    chip_color_key: values.chipColorKey || null,
    box_color_key: values.boxColorKey || null,
    chips,
    title_chip_words: words.length > 0 ? words : null,
    show_description: values.descriptionMode === 'show' ? true : values.descriptionMode === 'hide' ? false : null,
    stamp_enabled: values.stampMode === 'on' ? true : values.stampMode === 'off' ? false : null,
    stamp_slot: values.stampMode === 'on' && !isBlank(values.stampSlot) ? values.stampSlot.trim() : null,
    list_items: listItems.length > 0 ? listItems : null,
    list_more_href: isBlank(values.listMoreHref) ? null : values.listMoreHref.trim(),
    collection_burst: burst.length > 0 ? burst : null,
    feed_seed: isBlank(values.feedSeed) ? null : Number(values.feedSeed),
  }
}

// ── 검증 ──────────────────────────────────────────────────────

export interface FeedCardValidation {
  /** 저장을 막는다 */
  errors: string[]
  /** 막지 않고 알린다 */
  warnings: string[]
}

export interface FeedCardValidateOptions {
  /** 카드 제목. 제목 속 칩 낱말이 제목에 그대로 들어 있는지 본다. */
  title: string
  /** 카드에 연결된 컬렉션 id. 넘기면(`null` 포함) «컬렉션 소개인데 컬렉션이 없음» 경고를 판정하고, 안 넘기면 그 경고는 건너뛴다. */
  itemBookId?: string | null
  /** 색 키 → hex 표(컬러셋 교체로 덮어쓴 값을 합친 것, 티켓 20261121_2145). 호출부 호환용으로 남겼다 — 색 조합 경고는 키 기반 규칙(`colorRuleWarnings`)이라 hex를 읽지 않는다(회차 9). */
  palette?: FeedPalette
}

/** 컬렉션 모션 배지의 값 범위. x·y는 PRD 「컬렉션 모션」, 크기는 `FEED_BURST.badgeSize`, 기울기·지연은 PRD 칸 표다. */
export const BURST_RANGE = {
  xy: { min: -1, max: 1 },
  tilt: { min: -45, max: 45 },
  size: FEED_BURST.badgeSize,
  delayMs: { min: 70, max: 210 },
} as const

const BOX_KINDS: readonly TodayBoxKind[] = ['text', 'image_mask']
const CHIP_KINDS: readonly TodayChipSpec['kind'][] = ['value', 'phrase', 'label']
const SEED_MAX = 2 ** 32 - 1

/** 색 규칙 이름 → 경고에 붙는 이유 문구. 작성 화면(`FeedCardSection`)이 같은 문구를 쓴다(티켓 20261121_1316). */
export const COLOR_RULE_REASON: Record<ColorRuleName, string> = {
  same: '두 색이 같아서 구분이 안 돼요',
  contrast: '두 색이 너무 비슷하거나 원색끼리 부딪혀요',
  kids: '원색끼리거나 밝은 색끼리 색 차이가 커서 어수선해요',
  lightness: '밝기 차이가 모자라 칩이 묻혀요',
  image: '이미지의 대표 색과 너무 비슷해서 묻혀요',
  table: '함께 쓰지 않기로 한 색 조합이에요',
}

/** 글자가 들어가는 박스에 짙은 초록 박스를 골랐을 때의 이유 문구(`boxAllowedFor`). 검정 글자 대비가 3.9라서다(티켓 20261122_2224 결정 4). */
export const DEEP_GREEN_TEXT_BOX_REASON = '짙은 그린 박스는 검정 글자의 대비가 모자라서 글자가 들어가는 박스에는 맞지 않아요'

/**
 * 고른 색 조합이 통합 팔레트 규칙에 걸리면 경고 문구를 돌려준다. 막지 않고 알리기만 한다(PRD «수동 지정»).
 * 폼 경고(`FeedCardSection`의 `feedColorWarnings`)와 서버 검증 경고(`validateFeedCardColumns`)가 이 한 함수를 써서 같은 규칙·같은 문구를 낸다.
 *
 * 규칙: ① 칩 색이 배경색·박스 색 위에서 배제 표(`chipExclusionRule`)에 걸리면 경고한다(같은 색이면 «두 색이 같아서» 문구).
 * ② 배경색과 박스 색이 같으면 박스가 안 보이니 경고한다(바탕–박스 짝은 배제 표가 «칩 대 면» 표라 이것만 본다).
 * ③ 글자가 들어가는 박스(`boxHasTextFor`)에 짙은 초록 박스(`boxAllowedFor`가 거짓인 새 팔레트 키)를 고르면 경고한다.
 * 옛 15키 박스(`boxAllowedFor`가 쓰임 표에 없다고 거짓을 주는 키)는 저장된 카드에서 계속 유효하니 ③에서 경고하지 않는다.
 *
 * 비어 있거나 모르는 키가 낀 짝은 건너뛴다(비워 둔 «자동» 칸은 저장할 때 규칙을 지켜서 정한다). `show`가 거짓인 칸(보이지 않는 칸)이 낀 짝도 건너뛴다.
 * `excludedPairs`는 사용자가 제외한 색 조합이다(서버 검증은 생략). 색은 키 대신 `FEED_COLOR_LABELS`의 색 이름으로 적는다.
 */
export function colorRuleWarnings(input: {
  bg: string | null | undefined
  chip: string | null | undefined
  box: string | null | undefined
  feedType?: unknown
  boxKind?: unknown
  show?: { chip: boolean; box: boolean }
  excludedPairs?: readonly (readonly [string, string])[]
}): string[] {
  const show = input.show ?? { chip: true, box: true }
  const known = (key: string | null | undefined): key is keyof typeof FEED_COLOR_LABELS =>
    typeof key === 'string' && Object.hasOwn(FEED_COLOR_LABELS, key)
  const warnings: string[] = []
  const pairs: ReadonlyArray<readonly [string, string | null | undefined, string, string | null | undefined, boolean]> = [
    ['배경색', input.bg, '칩 색', input.chip, true],
    ['칩 색', input.chip, '박스 색', input.box, true],
    ['배경색', input.bg, '박스 색', input.box, false],
  ]
  for (const [labelA, keyA, labelB, keyB, involvesChip] of pairs) {
    if (!known(keyA) || !known(keyB)) continue
    if ((labelA === '칩 색' || labelB === '칩 색') && !show.chip) continue
    if ((labelA === '박스 색' || labelB === '박스 색') && !show.box) continue
    const head = `${labelA} ${FEED_COLOR_LABELS[keyA]} · ${labelB} ${FEED_COLOR_LABELS[keyB]} 조합이`
    if (input.excludedPairs?.some(([x, y]) => (x === keyA && y === keyB) || (x === keyB && y === keyA))) {
      warnings.push(`${head} 제외하기로 한 조합이에요. 저장은 되지만 다른 색을 골라 보세요.`)
      continue
    }
    // 칩이 낀 짝은 배제 표, 바탕–박스 짝은 같은 색만 본다. 같은 색은 표보다 «두 색이 같아서» 문구가 정확하다.
    let reason: string | null = null
    if (keyA === keyB) reason = COLOR_RULE_REASON.same
    else if (involvesChip) {
      const baseKey = labelA === '칩 색' ? keyB : keyA
      const chipKey = labelA === '칩 색' ? keyA : keyB
      reason = chipExclusionRule(chipKey, baseKey) ? COLOR_RULE_REASON.table : null
    }
    if (reason) warnings.push(`${head} 색 규칙에 걸려요. ${reason}. 저장은 되지만 다른 색을 골라 보세요.`)
  }
  const box = input.box
  if (
    show.box &&
    known(box) &&
    (FEED_COLOR_USAGE.box as readonly string[]).includes(box) &&
    boxHasTextFor(input.feedType, input.boxKind) &&
    !boxAllowedFor(box, true)
  ) {
    warnings.push(`박스 색 ${FEED_COLOR_LABELS[box]}이 색 규칙에 걸려요. ${DEEP_GREEN_TEXT_BOX_REASON}. 저장은 되지만 다른 색을 골라 보세요.`)
  }
  return warnings
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNullish = (value: unknown): value is null | undefined => value === null || value === undefined
const inRange = (value: unknown, range: { min: number; max: number }): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max

/** 색 키 3개: 칸 이름, 한국어 이름 */
const COLOR_FIELDS = [
  ['bg_color_key', '배경색'],
  ['chip_color_key', '칩 색'],
  ['box_color_key', '박스 색'],
] as const

/**
 * 개편 칸 값을 검증한다. 본문처럼 타입을 믿을 수 없는 값도 받는다.
 *
 * errors(저장을 막는다): 허용 값 밖, 구조 위반(칩·목록 항목·컬렉션 모션), 칩 자리·대각선·기울기, 제목 속 칩 낱말, 도장 자리, 주소 안전 규칙, 값 범위.
 * warnings(막지 않는다): 문구 칩 12자 초과, 색 규칙에 걸리는 조합, 목록형 항목 0개, 컬렉션 소개인데 컬렉션 없음, 유형 없이 새 칸이 채워짐, 유형이 둘 수 있는 칩 수 초과.
 * 같은 입력은 같은 결과다.
 */
export function validateFeedCardColumns(
  columns: FeedCardColumnsInput,
  options: FeedCardValidateOptions,
): FeedCardValidation {
  const errors: string[] = []
  const warnings: string[] = []

  // ── 유형·박스·색 허용 값 ──
  const rawType = columns.feed_type
  let feedType: FeedType | null = null
  if (!isNullish(rawType)) {
    if (isFeedType(rawType)) feedType = rawType
    else errors.push(`카드 유형 값이 올바르지 않아요. ${FEED_TYPES.length}가지 유형 중에서 골라 주세요.`)
  }
  if (!isNullish(columns.box_shape) && !(BOX_SHAPES as readonly unknown[]).includes(columns.box_shape)) {
    errors.push('박스 모양 값이 올바르지 않아요. 목록에 있는 모양 중에서 골라 주세요.')
  }
  if (!isNullish(columns.box_kind) && !(BOX_KINDS as readonly unknown[]).includes(columns.box_kind)) {
    errors.push('박스 용도 값이 올바르지 않아요. 글자 박스나 이미지 박스 중에서 골라 주세요.')
  }
  for (const [key, label] of COLOR_FIELDS) {
    const value = columns[key]
    if (!isNullish(value) && !(FEED_COLOR_KEYS as readonly unknown[]).includes(value)) {
      errors.push(`${label} 값이 올바르지 않아요. 색 목록에 있는 색 중에서 골라 주세요.`)
    }
  }

  /** 자리 이름이 이 카드에서 쓸 수 있는가. 유형을 모르면 DB가 보는 이름 형식만 본다. */
  const slotAllowed = (slot: string): boolean =>
    feedType ? isAllowedSlot(feedType, slot) : FEED_SLOT_PATTERN.test(slot)

  // ── 칩 ──
  const chips = columns.chips
  if (!isNullish(chips)) {
    if (!Array.isArray(chips)) {
      errors.push('칩 목록 형식이 올바르지 않아요. 칩을 다시 추가해 주세요.')
    } else if (chips.length > MAX_CARD_CHIPS) {
      errors.push(`칩은 카드에 ${MAX_CARD_CHIPS}개까지 둘 수 있어요. ${chips.length}개를 ${MAX_CARD_CHIPS}개 이하로 줄여 주세요.`)
    } else {
      const slots: Array<string | null> = []
      chips.forEach((chip: unknown, index: number) => {
        const no = `${index + 1}번째 칩`
        if (!isRecord(chip) || !(CHIP_KINDS as readonly unknown[]).includes(chip.kind)) {
          errors.push(`${no}의 종류가 올바르지 않아요. 값·문구·구분 중에서 골라 주세요.`)
          slots.push(null)
          return
        }
        if (chip.kind === 'value' && (typeof chip.source !== 'string' || chip.source.trim().length === 0)) {
          errors.push(`${no}은 값 칩인데 값의 출처가 비어 있어요. 출처를 골라 주세요.`)
        }
        if (chip.kind === 'phrase') {
          if (typeof chip.text !== 'string' || chip.text.trim().length === 0) {
            errors.push(`${no}은 문구 칩인데 문구가 비어 있어요. 문구를 적어 주세요.`)
          } else {
            const check = checkChipTextLength(chip.text)
            if (check.exceeds) {
              warnings.push(
                `${no}의 문구가 ${check.length}자로 길어요. ${check.max}자 이내일 때 칩이 잘리지 않고 보여요. 더 짧게 줄여 주세요.`,
              )
            }
          }
        }
        if (!isNullish(chip.tilt) && !(FEED_TILTS as readonly unknown[]).includes(chip.tilt)) {
          errors.push(`${no}의 기울기가 올바르지 않아요. ${FEED_TILTS.join('·')}도 중에서 골라 주세요.`)
        }
        let slot: string | null = null
        if (!isNullish(chip.slot)) {
          if (typeof chip.slot !== 'string' || !slotAllowed(chip.slot)) {
            errors.push(`${no}의 자리가 이 카드 유형에서 쓸 수 없는 자리예요. 유형에 맞는 자리를 골라 주세요.`)
          } else {
            slot = chip.slot
          }
        }
        slots.push(slot)
      })
      const [first, second] = slots
      if (feedType && chips.length === 2 && first && second && diagonalOf(feedType, first) !== second) {
        errors.push('칩 두 개는 서로 대각선 자리에 둬야 해요. 한 칩의 자리를 맞은편 모서리로 바꿔 주세요.')
      }
      if (feedType && chips.length > chipLimitOf(feedType)) {
        warnings.push(
          `이 유형은 칩을 ${chipLimitOf(feedType)}개까지만 그려요. 넘는 칩은 홈에서 보이지 않으니 칩 수를 줄여 주세요.`,
        )
      }
    }
  }

  // ── 제목 속 칩 낱말 ──
  const words = columns.title_chip_words
  if (!isNullish(words)) {
    if (!Array.isArray(words) || words.some((word) => typeof word !== 'string')) {
      errors.push('제목 속 칩 낱말 형식이 올바르지 않아요. 낱말을 다시 적어 주세요.')
    } else if (words.length > MAX_TITLE_CHIPS) {
      errors.push(`제목 속 칩 낱말은 ${MAX_TITLE_CHIPS}개까지 쓸 수 있어요. ${MAX_TITLE_CHIPS}개 이하로 줄여 주세요.`)
    } else {
      for (const word of words as string[]) {
        if (word.trim().length === 0) {
          errors.push('제목 속 칩 낱말에 빈 칸이 있어요. 낱말을 적거나 그 칸을 지워 주세요.')
        } else if (!options.title.includes(word)) {
          errors.push(`제목에 「${word}」가 그대로 들어 있지 않아요. 제목 속 낱말만 칩으로 만들 수 있으니 제목이나 낱말을 고쳐 주세요.`)
        }
      }
    }
  }

  // ── 도장 ──
  if (!isNullish(columns.stamp_enabled) && typeof columns.stamp_enabled !== 'boolean') {
    errors.push('도장 사용 값이 올바르지 않아요. 자동·사용 안 함·사용 중에서 골라 주세요.')
  }
  if (columns.stamp_enabled === true && !isNullish(columns.stamp_slot)) {
    if (typeof columns.stamp_slot !== 'string' || !slotAllowed(columns.stamp_slot)) {
      errors.push('도장 자리가 이 카드 유형에서 쓸 수 없는 자리예요. 유형에 맞는 자리를 골라 주세요.')
    }
  }

  // ── 설명 노출 ──
  if (!isNullish(columns.show_description) && typeof columns.show_description !== 'boolean') {
    errors.push('설명 노출 값이 올바르지 않아요. 자동·보임·숨김 중에서 골라 주세요.')
  }

  // ── 목록 항목과 대표 페이지 ──
  const items = columns.list_items
  let listItemCount = 0
  if (!isNullish(items)) {
    if (!Array.isArray(items)) {
      errors.push('목록 항목 형식이 올바르지 않아요. 항목을 다시 추가해 주세요.')
    } else if (items.length > FEED_GALLERY.maxItems) {
      errors.push(`목록 항목은 ${FEED_GALLERY.maxItems}개까지 둘 수 있어요. ${FEED_GALLERY.maxItems}개 이하로 줄여 주세요.`)
    } else {
      listItemCount = items.length
      items.forEach((item: unknown, index: number) => {
        const no = `${index + 1}번째 목록 항목`
        if (!isRecord(item) || typeof item.name !== 'string' || item.name.trim().length === 0) {
          errors.push(`${no}에 이름이 없어요. 이름을 적어 주세요.`)
          return
        }
        if (!isSafeListHref(item.href as string | null | undefined)) {
          errors.push(`${no}의 주소를 쓸 수 없어요. 「/」로 시작하는 앱 안 경로나 「https://」로 시작하는 주소를 적어 주세요.`)
        }
        if (!isNullish(item.image_url) && typeof item.image_url !== 'string') {
          errors.push(`${no}의 이미지 주소 형식이 올바르지 않아요. 주소를 다시 적어 주세요.`)
        }
      })
    }
  }
  if (!isNullish(columns.list_more_href) && !isSafeListHref(columns.list_more_href as string)) {
    errors.push('대표 페이지 주소를 쓸 수 없어요. 「/」로 시작하는 앱 안 경로나 「https://」로 시작하는 주소를 적어 주세요.')
  }

  // ── 컬렉션 모션 ──
  const burst = columns.collection_burst
  let burstCount = 0
  if (!isNullish(burst)) {
    if (!Array.isArray(burst)) {
      errors.push('컬렉션 모션 형식이 올바르지 않아요. 배지 위치를 다시 입력해 주세요.')
    } else if (burst.length > FEED_BURST.count) {
      errors.push(`컬렉션 모션 배지는 ${FEED_BURST.count}개까지 둘 수 있어요. ${FEED_BURST.count}개 이하로 줄여 주세요.`)
    } else {
      burstCount = burst.length
      burst.forEach((point: unknown, index: number) => {
        const no = `${index + 1}번째 모션 배지`
        if (!isRecord(point)) {
          errors.push(`${no} 형식이 올바르지 않아요. 위치를 다시 입력해 주세요.`)
          return
        }
        const bad: string[] = []
        if (!inRange(point.x, BURST_RANGE.xy)) bad.push(`가로 위치는 ${BURST_RANGE.xy.min}~${BURST_RANGE.xy.max}`)
        if (!inRange(point.y, BURST_RANGE.xy)) bad.push(`세로 위치는 ${BURST_RANGE.xy.min}~${BURST_RANGE.xy.max}`)
        if (!isNullish(point.tilt) && !inRange(point.tilt, BURST_RANGE.tilt)) {
          bad.push(`기울기는 ${BURST_RANGE.tilt.min}~${BURST_RANGE.tilt.max}도`)
        }
        if (!isNullish(point.size) && !inRange(point.size, BURST_RANGE.size)) {
          bad.push(`크기는 ${BURST_RANGE.size.min}~${BURST_RANGE.size.max}`)
        }
        if (!isNullish(point.delay_ms) && !inRange(point.delay_ms, BURST_RANGE.delayMs)) {
          bad.push(`지연은 ${BURST_RANGE.delayMs.min}~${BURST_RANGE.delayMs.max}ms`)
        }
        if (bad.length > 0) errors.push(`${no}의 값이 범위 밖이에요. ${bad.join(', ')} 안으로 맞춰 주세요.`)
      })
    }
  }

  // ── 시드 ──
  const seed = columns.feed_seed
  if (!isNullish(seed) && !(typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= SEED_MAX)) {
    errors.push('시드 값이 올바르지 않아요. 0 이상 4294967295 이하의 정수로 적거나 비워 주세요.')
  }

  // ── 경고 ──
  warnings.push(
    ...colorRuleWarnings({
      bg: typeof columns.bg_color_key === 'string' ? columns.bg_color_key : null,
      chip: typeof columns.chip_color_key === 'string' ? columns.chip_color_key : null,
      box: typeof columns.box_color_key === 'string' ? columns.box_color_key : null,
      feedType,
      boxKind: columns.box_kind,
    }),
  )

  if (feedType === 'gallery_list' && listItemCount === 0) {
    warnings.push('목록형인데 항목이 없어요. 홈에서 텍스트 박스로 그려지니 항목을 1개 이상 추가해 주세요.')
  }
  if (feedType === 'collection_intro' && options.itemBookId !== undefined && !options.itemBookId) {
    warnings.push('컬렉션 소개인데 컬렉션이 연결돼 있지 않아요. 참조 컨텐츠에서 컬렉션을 골라 주세요.')
  }
  if (isNullish(rawType) && hasFilledFeedColumn(columns, burstCount)) {
    warnings.push('카드 유형이 비어 있어요. 유형이 없으면 홈에서 텍스트 박스로 그려 다른 새 칸 값이 쓰이지 않으니 유형을 골라 주세요.')
  }

  return { errors, warnings }
}

/** 유형을 뺀 새 칸 중 값이 들어 있는 칸이 있는가(빈 목록은 비어 있는 것으로 본다). `chips`의 `[]`(칩 없음)는 정한 값이라 채워진 것이다. */
function hasFilledFeedColumn(columns: FeedCardColumnsInput, burstCount: number): boolean {
  const filled = (value: unknown): boolean => !isNullish(value)
  const filledList = (value: unknown): boolean => Array.isArray(value) && value.length > 0
  return (
    filled(columns.box_shape) ||
    filled(columns.box_kind) ||
    filled(columns.bg_color_key) ||
    filled(columns.chip_color_key) ||
    filled(columns.box_color_key) ||
    filled(columns.chips) ||
    filledList(columns.title_chip_words) ||
    filled(columns.show_description) ||
    filled(columns.stamp_enabled) ||
    filled(columns.stamp_slot) ||
    filledList(columns.list_items) ||
    filled(columns.list_more_href) ||
    burstCount > 0 ||
    filled(columns.feed_seed)
  )
}

// ── 저장 때 자동 값 고정 ──────────────────────────────────────

/** 서버 난수 공급 함수가 돌려주는 값(0 이상 2^32 미만 정수)을 시드로 다듬는다. 난수는 인자로 받아 시험할 수 있다. */
export function createFeedSeed(randomUint32: () => number): number {
  return Math.trunc(randomUint32()) >>> 0
}

export interface DecideFeedCardValuesInput {
  /** 사용자가 지정한 값. 색 키가 `null`·없음이면 자동으로 정하고, `feed_seed`가 있으면 그 값을 시드로 쓴다. */
  columns: Partial<Pick<FeedCardColumns, 'feed_seed' | 'bg_color_key' | 'chip_color_key' | 'box_color_key' | 'feed_type' | 'box_kind'>>
  /** 시드가 비어 있을 때 쓸 값. 저장돼 있는 시드가 있으면 그 값, 새 카드면 `createFeedSeed`로 뽑은 값이다. */
  seed: number
  /**
   * 같은 시기 노출 카드의 바탕 키를 등록 순서(`created_at` 오름차순)로 늘어놓은 목록. 가장 최근 카드가 마지막이다(티켓 20261122_2224 6회차).
   * 바로 앞 카드와 같은 바탕을 피하고 짙은 초록 바탕의 리듬을 세는 데 쓴다. 없으면 빈 목록이다.
   */
  recentBgKeys?: readonly string[]
  /** 제외 색 조합. 지금 운영 코드에는 연결된 목록이 없어 비워서 부른다. */
  excludedPairs?: readonly ExcludedColorPair[]
  /** 이미지 대표 색(규칙 ⑤·⑥, 티켓 20261121_1828). `imageColorsForCard`가 만든 값이다. 없으면 이미지 규칙 없이 정한다. */
  image?: FeedImageColorInput
  /** 색 키 → hex 표(컬러셋 교체로 덮어쓴 값을 합친 것, 티켓 20261121_2145). 자동 배정이 이 hex로 규칙을 판정한다. 생략하면 기본 팔레트다. */
  palette?: FeedPalette
}

export interface DecidedFeedCardValues {
  feed_seed: number
  bg_color_key: FeedColorKey
  chip_color_key: FeedColorKey
  box_color_key: FeedColorKey
  /** 통과하는 색 조합이 없어 기본 조합으로 되돌렸으면 true */
  usedFallback: boolean
  /** 이미지 규칙까지 통과하는 조합이 없어 이미지 규칙을 건너뛰고 정했으면 true(서버 로그용, 사용자 문구는 없다) */
  imageRuleSkipped: boolean
  /** 저장은 하되 사용자에게 알릴 문구 */
  warnings: string[]
}

/**
 * 새 카드의 시드와 색 키를 정한다. 사용자가 지정한 값은 덮어쓰지 않고, 같은 입력은 같은 값이다.
 * 칩 자리·기울기와 컬렉션 모션 위치는 시드로 홈이 같은 값을 그리므로 여기서 정하지 않는다.
 */
export function decideFeedCardValues(input: DecideFeedCardValuesInput): DecidedFeedCardValues {
  const seed = input.columns.feed_seed ?? input.seed
  const assigned = assignFeedColors(
    {
      seed,
      fixed: {
        bg: input.columns.bg_color_key,
        chip: input.columns.chip_color_key,
        box: input.columns.box_color_key,
      },
      recentBgKeys: input.recentBgKeys ?? [],
      // 글자가 들어가는 박스인지는 카드 유형·박스 용도로 정한다(사진만 들어가는 이미지 마스크는 거짓)
      boxHasText: boxHasTextFor(input.columns.feed_type, input.columns.box_kind),
      imageHexes: input.image?.imageHexes,
      chipOnImage: input.image?.chipOnImage,
    },
    { excludedPairs: input.excludedPairs, ...(input.palette ? { palette: input.palette } : {}) },
  )
  const warnings = assigned.usedFallback
    ? ['자동으로 고를 수 있는 색 조합이 없어 기본 조합으로 저장했어요. 마음에 들지 않으면 색을 직접 골라 주세요.']
    : []
  return {
    feed_seed: seed,
    bg_color_key: assigned.bg as FeedColorKey,
    chip_color_key: assigned.chip as FeedColorKey,
    box_color_key: assigned.box as FeedColorKey,
    usedFallback: assigned.usedFallback,
    imageRuleSkipped: assigned.imageRuleSkipped === true,
    warnings,
  }
}

// ── 운영 묶음(에이전트)의 새 칸 읽기 (티켓 20261121_1530, 상위 20261120_2026 6회차-1) ──────────

/**
 * 묶음 항목의 `resource`에 싣는 새 칸 키 14개. 저장 칸 15개에서 `feed_seed`를 뺀 것이다 — 시드는 에이전트가 정하지 않고
 * 등록 때 시스템이 정한다(6회차-2). `resource`에 DB 칸과 같은 이름의 평평한 키로 싣는다.
 */
export const FEED_CARD_BUNDLE_KEYS = FEED_CARD_COLUMN_KEYS.filter(
  (key): key is Exclude<FeedCardColumnKey, 'feed_seed'> => key !== 'feed_seed',
)

export type FeedCardBundleKey = (typeof FEED_CARD_BUNDLE_KEYS)[number]

/** 묶음이 등록 때 싣는 새 칸. 14개 키가 모두 있고, 적지 않은 칸은 `null`(«자동»)이다. */
export type FeedCardBundleColumns = Omit<FeedCardColumns, 'feed_seed'>

/** `resource`에 새 칸 키가 하나라도 있는가(값이 `null`이어도 «적은 것»으로 본다 — 검증은 `null`을 «자동»으로 읽는다). */
export function hasFeedCardBundleKeys(resource: Readonly<Record<string, unknown>>): boolean {
  return FEED_CARD_BUNDLE_KEYS.some((key) => key in resource)
}

/**
 * `resource.feed_type`을 적었는가. `null`·없음·빈 문자열은 «적지 않음»이다(옛 `shape` 필수 조건을 풀어 주는 기준).
 * 허용 값 밖의 값은 적은 것으로 본다 — 그 오류는 새 칸 검증이 따로 알린다.
 */
export function isFeedTypeWritten(resource: Readonly<Record<string, unknown>> | null | undefined): boolean {
  const value = resource?.feed_type
  if (value === null || value === undefined) return false
  return !(typeof value === 'string' && value.trim().length === 0)
}

/** 오류·경고가 가리키는 `resource` 키와 문장. 문장은 `validateFeedCardColumns`의 문장 그대로다. */
export interface FeedCardBundleIssue {
  key: FeedCardBundleKey
  message: string
}

export interface FeedCardBundleCheck {
  errors: FeedCardBundleIssue[]
  warnings: FeedCardBundleIssue[]
}

/**
 * 문장이 어느 칸 때문에 나왔는지 찾는 시험 묶음. 칸 하나씩(유형을 곁들여) 따로 돌려 «문장 → 키»를 찾고,
 * 여러 칸이 얽힌 문장(색 조합 경고)은 색 세 칸을 함께 돌려 찾는다. 도장 자리는 도장 사용 여부와 함께 돌린다.
 * 앞의 묶음이 먼저 문장을 차지한다.
 */
const BUNDLE_PROBES: ReadonlyArray<{ attribute: FeedCardBundleKey; keys: readonly FeedCardBundleKey[] }> = [
  { attribute: 'feed_type', keys: [] },
  { attribute: 'box_shape', keys: ['box_shape'] },
  { attribute: 'box_kind', keys: ['box_kind'] },
  { attribute: 'bg_color_key', keys: ['bg_color_key'] },
  { attribute: 'chip_color_key', keys: ['chip_color_key'] },
  { attribute: 'box_color_key', keys: ['box_color_key'] },
  { attribute: 'chips', keys: ['chips'] },
  { attribute: 'title_chip_words', keys: ['title_chip_words'] },
  { attribute: 'show_description', keys: ['show_description'] },
  { attribute: 'stamp_enabled', keys: ['stamp_enabled'] },
  { attribute: 'stamp_slot', keys: ['stamp_enabled', 'stamp_slot'] },
  { attribute: 'list_items', keys: ['list_items'] },
  { attribute: 'list_more_href', keys: ['list_more_href'] },
  { attribute: 'collection_burst', keys: ['collection_burst'] },
  { attribute: 'bg_color_key', keys: ['bg_color_key', 'chip_color_key', 'box_color_key'] },
]

/**
 * 검증 전에 폼 변환(`buildFeedCardColumns`)과 같은 정규화를 한다: 문자열 칸은 앞뒤 공백을 자르고 빈 문자열은 «자동»(null),
 * 제목 속 칩 낱말은 낱말마다 자르고 빈 칸은 뗀다. 모양이 다른 값(배열이 아님 등)은 그대로 둬 검증이 알린다.
 */
function normalizeBundleValue(key: FeedCardBundleKey, value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length === 0 ? null : trimmed
  }
  if (key === 'title_chip_words' && Array.isArray(value)) {
    return value
      .map((word: unknown) => (typeof word === 'string' ? word.trim() : word))
      .filter((word: unknown) => word !== '')
  }
  return value
}

export interface FeedCardBundleOptions {
  /** 카드 제목(`copy.title` 또는 `resource.title`). 모르면 `null` — 제목 속 칩 낱말 검사를 건너뛴다(제목이 없다는 오류가 따로 난다). */
  title: string | null
  /** 연결된 컬렉션 id. 넘기면(`null` 포함) «컬렉션 소개인데 컬렉션이 없음» 경고를 판정하고, 안 넘기면 건너뛴다. */
  itemBookId?: string | null
}

/**
 * 묶음 항목의 `resource`에서 새 칸을 뽑아 검증한다. 새 칸이 하나도 없으면 아무것도 검사하지 않는다.
 * 오류·경고 판정은 `validateFeedCardColumns` 전체 호출이 정본이고, 각 문장이 어느 키 때문인지는 칸 묶음별 호출로 찾는다
 * (찾지 못하면 값이 들어 있는 첫 키). 오류는 «저장은 한다» 규칙의 형식 오류로, 경고는 막지 않는 알림으로 쓴다.
 */
export function checkFeedCardBundleColumns(
  resource: Readonly<Record<string, unknown>>,
  options: FeedCardBundleOptions,
): FeedCardBundleCheck {
  const check: FeedCardBundleCheck = { errors: [], warnings: [] }
  if (!hasFeedCardBundleKeys(resource)) return check

  const picked: FeedCardColumnsInput = {}
  for (const key of FEED_CARD_BUNDLE_KEYS) {
    if (!(key in resource)) continue
    picked[key] = normalizeBundleValue(key, resource[key])
  }
  // 제목을 모르면 낱말 검사가 모든 낱말을 틀린 것으로 보므로 건너뛴다.
  const checked: FeedCardColumnsInput = options.title === null ? { ...picked, title_chip_words: undefined } : picked
  const validateOptions: FeedCardValidateOptions = { title: options.title ?? '', itemBookId: options.itemBookId }
  const whole = validateFeedCardColumns(checked, validateOptions)

  const keyOf = new Map<string, FeedCardBundleKey>()
  for (const probe of BUNDLE_PROBES) {
    if (probe.keys.length > 0 && !probe.keys.some((key) => key in picked)) continue
    const sub: FeedCardColumnsInput = {}
    if ('feed_type' in picked) sub.feed_type = picked.feed_type
    for (const key of probe.keys) {
      if (key in picked) sub[key] = checked[key]
    }
    const result = validateFeedCardColumns(sub, validateOptions)
    for (const message of [...result.errors, ...result.warnings]) {
      if (!keyOf.has(message)) keyOf.set(message, probe.attribute)
    }
  }
  const fallback = FEED_CARD_BUNDLE_KEYS.find((key) => key in picked) ?? 'feed_type'
  const toIssue = (message: string): FeedCardBundleIssue => ({ key: keyOf.get(message) ?? fallback, message })
  check.errors = whole.errors.map(toIssue)
  check.warnings = whole.warnings.map(toIssue)
  return check
}

const trimmedOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * 검증(`checkFeedCardBundleColumns`)을 통과한 `resource`의 새 칸을 등록 insert 값으로 다듬는다. 14개 키가 모두 있다.
 * 폼 변환(`buildFeedCardColumns`)과 같은 값 의미를 따른다: 빈 문자열은 `null`, 문구는 trim, 칩 `[]`은 «칩 없음»,
 * 빈 목록(제목 속 칩 낱말·목록 항목·컬렉션 모션)은 `null`, 도장 자리는 도장을 «사용»(`true`)으로 정했을 때만 둔다.
 * 검증을 거치지 않은 값을 넘기면 안 된다.
 */
export function buildFeedCardBundleColumns(resource: Readonly<Record<string, unknown>>): FeedCardBundleColumns {
  const read = (key: FeedCardBundleKey): unknown => resource[key]

  const rawChips = read('chips')
  const chips: TodayChipSpec[] | null = Array.isArray(rawChips)
    ? rawChips.map((raw: Record<string, unknown>) => {
        const spec: TodayChipSpec = { kind: raw.kind as TodayChipSpec['kind'] }
        const source = trimmedOrNull(raw.source)
        const text = trimmedOrNull(raw.text)
        const slot = trimmedOrNull(raw.slot)
        if (spec.kind === 'value' && source) spec.source = source
        if (spec.kind === 'phrase' && text) spec.text = text
        if (slot) spec.slot = slot
        if (typeof raw.tilt === 'number') spec.tilt = raw.tilt as TodayChipSpec['tilt']
        return spec
      })
    : null

  const rawWords = read('title_chip_words')
  const words = Array.isArray(rawWords)
    ? rawWords.map((word) => trimmedOrNull(word)).filter((word): word is string => word !== null)
    : []

  const rawItems = read('list_items')
  const listItems = Array.isArray(rawItems)
    ? rawItems.map((raw: Record<string, unknown>): TodayListItem => {
        const item: TodayListItem = { name: trimmedOrNull(raw.name) ?? '', href: trimmedOrNull(raw.href) ?? '' }
        const imageUrl = trimmedOrNull(raw.image_url)
        if (imageUrl) item.image_url = imageUrl
        return item
      })
    : []

  const rawBurst = read('collection_burst')
  const burst = Array.isArray(rawBurst)
    ? rawBurst.map((raw: Record<string, unknown>): TodayBurstPoint => {
        const point: TodayBurstPoint = { x: raw.x as number, y: raw.y as number }
        if (typeof raw.tilt === 'number') point.tilt = raw.tilt
        if (typeof raw.size === 'number') point.size = raw.size
        if (typeof raw.delay_ms === 'number') point.delay_ms = raw.delay_ms
        return point
      })
    : []

  const stampEnabled = typeof read('stamp_enabled') === 'boolean' ? (read('stamp_enabled') as boolean) : null
  const showDescription = typeof read('show_description') === 'boolean' ? (read('show_description') as boolean) : null
  return {
    feed_type: trimmedOrNull(read('feed_type')) as TodayFeedType | null,
    box_shape: trimmedOrNull(read('box_shape')) as TodayBoxShape | null,
    box_kind: trimmedOrNull(read('box_kind')) as TodayBoxKind | null,
    bg_color_key: trimmedOrNull(read('bg_color_key')) as FeedColorKey | null,
    chip_color_key: trimmedOrNull(read('chip_color_key')) as FeedColorKey | null,
    box_color_key: trimmedOrNull(read('box_color_key')) as FeedColorKey | null,
    chips,
    title_chip_words: words.length > 0 ? words : null,
    show_description: showDescription,
    stamp_enabled: stampEnabled,
    stamp_slot: stampEnabled === true ? trimmedOrNull(read('stamp_slot')) : null,
    list_items: listItems.length > 0 ? listItems : null,
    list_more_href: trimmedOrNull(read('list_more_href')),
    collection_burst: burst.length > 0 ? burst : null,
  }
}
