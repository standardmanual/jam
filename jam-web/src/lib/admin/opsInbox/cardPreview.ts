/**
 * 운영 항목 → 카드 미리보기 표시 데이터 (티켓 20261006_1802, 순수 함수).
 *
 * 저장 전 초안(`draft.values`)까지 덮은 항목에서 카드 칸을 관대하게 읽어 `toCardView`에 넘긴다. 없는 칸은 비우고, 제목이 비면
 * 「(제목 미입력)」이다. 홈피드 카드의 연결된 미션·배지·컬렉션은 읽지 않는다. 레시피·드랍은 서버가 읽어 내린 이름 맵을 받아 그린다(티켓 20261007_1401). 계측 정보(`tracking`)를
 * 싣지 않아 그리는 쪽이 트래커와 링크를 그리지 않는다. 카드(홈피드 카드)가 아닌 종류는 null이다.
 */
import { applyDraftToItem } from '@/lib/admin/opsInbox/editDraft'
import { OPS_FIELD_UNKNOWN, isOpsHomeFeedCard, readOpsItemExposureTags, readOpsItemShape } from '@/lib/admin/opsInbox/fields'
import { asRecord, itemField, linksOf, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { formatScheduleAt } from '@/lib/ambient-drop/scheduleView'
import { EMPTY_PREVIEW_NAMES, PREVIEW_NAME_UNKNOWN, type OpsPreviewBadge, type OpsPreviewNames } from '@/lib/admin/opsInbox/previewNames'
import { toCardView, type CardView } from '@/lib/today/cardView'
import type { TodayCardWithHref } from '@/lib/today/cards'
import { resolveTargetHref } from '@/lib/today/targetHref'
import type { BadgeRarity, TodayCardLayoutType, TodayCardRow, TodayCardTemplateType } from '@/types/database'

export const PREVIEW_TITLE_PLACEHOLDER = '(제목 미입력)'

const TEMPLATE_TYPES: readonly TodayCardTemplateType[] = [
  'badge_spotlight',
  'progress_nudge',
  'mission_spotlight',
  'itembook_milestone',
  'location_trend',
  'drop_alert',
  'editorial_article',
  'ranking_board',
  'recipe_reveal',
]
const LAYOUT_TYPES: readonly TodayCardLayoutType[] = ['large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other', 'ranking_list']

export interface PreviewItem extends ViewableItem {
  id?: string
  kind?: string | null
}

export interface PreviewOptions {
  now?: Date
  /** 레시피·드랍이 가리키는 배지·지점·컬렉션 이름(서버가 읽어 내린다, 티켓 20261007_1401). 없으면 모두 폴백 문구다. */
  names?: OpsPreviewNames
  /** 같은 묶음에서 새로 만드는 배지의 이름(레시피 항목에서만 쓴다). */
  bundleBadgeNames?: readonly string[]
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** 항목의 시각 칸. 읽을 수 없으면 기준 시각이다. */
function timeOf(item: ViewableItem, key: string, now: Date): string {
  const value = itemField(item, key)
  const ms = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isNaN(ms) ? now.toISOString() : new Date(ms).toISOString()
}

/** 카드 항목과 초안으로 표시용 카드 행 하나를 만든다. 카드가 아니면 null. */
export function itemToPreviewCard(
  item: PreviewItem,
  draftValues?: Readonly<Record<string, unknown>>,
  options: PreviewOptions = {}
): TodayCardWithHref | null {
  if (!isOpsHomeFeedCard(item.kind)) return null
  const now = options.now ?? new Date()
  const merged = draftValues ? applyDraftToItem(item, draftValues) : item

  const copy = asRecord(itemField(merged, 'copy')) ?? {}
  const resource = asRecord(itemField(merged, 'resource')) ?? {}
  const text = (key: string): string => {
    for (const group of [copy, resource]) {
      const value = group[key]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
    return ''
  }

  const shape = readOpsItemShape(merged)
  const tags = readOpsItemExposureTags(merged)
  const titleInImage = resource.title_in_image
  const row: TodayCardRow = {
    id: item.id ?? 'preview',
    template_type: pick(resource.template_type, TEMPLATE_TYPES, 'editorial_article'),
    layout_type: pick(resource.layout_type, LAYOUT_TYPES, 'large_thumbnail'),
    title: text('title') || PREVIEW_TITLE_PLACEHOLDER,
    subtitle: text('subtitle') || null,
    description: text('description') || null,
    cover_image_url: text('cover_image_url') || null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: text('region_label') || null,
    body_markdown: text('body_markdown') || null,
    ranking_mode_id: null,
    recipe_id: null,
    content_type_id: null,
    target_href: null,
    exposure_tags: tags === OPS_FIELD_UNKNOWN ? [] : tags,
    starts_at: timeOf(merged, 'starts_at', now),
    ends_at: timeOf(merged, 'ends_at', now),
    sort_order: 0,
    is_active: true,
    created_at: now.toISOString(),
    created_by: null,
    image_source: null,
    shape: shape === OPS_FIELD_UNKNOWN ? null : shape,
    title_in_image: typeof titleInImage === 'boolean' ? titleInImage : null,
  }
  return { ...row, resolved_href: resolveTargetHref(row), resolved_badges: [], resolved_ranking: null }
}

/** 표시 데이터. 계측 정보가 없다. 카드가 아니면 null. */
export function previewViewOf(
  item: PreviewItem,
  draftValues?: Readonly<Record<string, unknown>>,
  options: PreviewOptions = {}
): CardView | null {
  const card = itemToPreviewCard(item, draftValues, options)
  return card ? toCardView(card, { now: options.now }) : null
}

/** 레시피 슬롯 한 칸. 후보는 이름을 못 읽으면 폴백 문구가 들어간다. */
export interface RecipeSlotPreview {
  typeLabel: string
  candidates: OpsPreviewBadge[]
}

const SLOT_TYPE_LABELS: Record<string, string> = { item: '아이템', activity: '액티비티', checkin: '체크인' }

/**
 * 배지·컬렉션·미션 미리보기 표시 데이터(티켓 20261007_1400). 배지·컬렉션·미션은 항목 안의 값만 읽는다.
 * 레시피·드랍(티켓 20261007_1401)은 연결된 배지·지점·컬렉션의 이름을 `PreviewOptions.names`에서 찾는다.
 */
type BasicKindPreview =
  | {
      type: 'badge'
      name: string
      description: string
      rarity: BadgeRarity | null
      level: number | null
      pointReward: number | null
      imageUrl: string | null
      startsAt: string | null
      endsAt: string | null
    }
  | {
      type: 'collection'
      name: string
      description: string
      storyText: string
      rewardPoints: number | null
      imageUrl: string | null
      startsAt: string | null
      endsAt: string | null
    }
  | {
      type: 'mission'
      title: string
      description: string
      conditionText: string
      rewardPoints: number | null
      imageUrl: string | null
      startsAt: string | null
      endsAt: string | null
    }

export type KindPreview =
  | BasicKindPreview
  | {
      type: 'recipe'
      name: string
      slots: RecipeSlotPreview[]
      rewardPoints: number | null
      rewardBadges: OpsPreviewBadge[]
      /** 같은 묶음에서 만드는 배지 이름. 없으면 빈 배열. */
      bundleBadgeNames: string[]
      startsAt: string | null
      endsAt: string | null
    }
  | {
      type: 'drop'
      title: string
      /** 공개 시각(「2026.10.05 09:00」). 읽을 수 없으면 null. */
      scheduledAtText: string | null
      /** 「강남역 외 2곳 × 지점당 3개」·「전체 종류 × 총 10개」 */
      poiLine: string
      /** 배지 이름 요약 또는 「컬렉션 …」 */
      itemLine: string
    }

export type PreviewOf = { type: 'card'; view: CardView } | KindPreview

const RARITIES: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/** 종류별 미리보기 표시 데이터. 카드는 기존 `previewViewOf`, 알 수 없는 종류는 null이다. */
export function previewOf(
  item: PreviewItem,
  draftValues?: Readonly<Record<string, unknown>>,
  options: PreviewOptions = {}
): PreviewOf | null {
  if (isOpsHomeFeedCard(item.kind)) {
    const view = previewViewOf(item, draftValues, options)
    return view ? { type: 'card', view } : null
  }
  const kinds = ['jam_badge', 'collection_launch', 'mission', 'recipe', 'drop_schedule']
  if (!item.kind || !kinds.includes(item.kind)) return null

  const merged = draftValues ? applyDraftToItem(item, draftValues) : item
  const copy = asRecord(itemField(merged, 'copy')) ?? {}
  const resource = asRecord(itemField(merged, 'resource')) ?? {}
  const text = (key: string): string => {
    for (const group of [copy, resource]) {
      const value = group[key]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
    return ''
  }
  const num = (key: string): number | null => {
    const value = resource[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  const when = (key: string): string | null => {
    const value = itemField(merged, key)
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
  }
  const imageUrl = text('image_url') || null
  const period = { startsAt: when('starts_at'), endsAt: when('ends_at') }

  const names = options.names ?? EMPTY_PREVIEW_NAMES
  if (item.kind === 'recipe') return recipePreviewOf(resource, text('name'), period, names, options.bundleBadgeNames ?? [])
  if (item.kind === 'drop_schedule') return dropPreviewOf(resource, text('title'), when('starts_at'), names)

  if (item.kind === 'jam_badge') {
    const rarity = resource.rarity
    return {
      type: 'badge',
      name: text('name') || PREVIEW_TITLE_PLACEHOLDER,
      description: text('description'),
      rarity: typeof rarity === 'string' && (RARITIES as readonly string[]).includes(rarity) ? (rarity as BadgeRarity) : null,
      level: num('level'),
      pointReward: num('point_reward'),
      imageUrl,
      ...period,
    }
  }
  if (item.kind === 'collection_launch') {
    return {
      type: 'collection',
      name: text('name') || PREVIEW_TITLE_PLACEHOLDER,
      description: text('description'),
      storyText: text('story_text'),
      rewardPoints: num('reward_points'),
      imageUrl,
      ...period,
    }
  }
  return {
    type: 'mission',
    title: text('title') || PREVIEW_TITLE_PLACEHOLDER,
    description: text('description'),
    conditionText: text('condition_text'),
    rewardPoints: num('reward_points'),
    imageUrl,
    ...period,
  }
}

function badgeRefs(ids: unknown, names: OpsPreviewNames): OpsPreviewBadge[] {
  if (!Array.isArray(ids)) return []
  return ids
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    .map((raw) => {
      const id = raw.trim()
      return names.badges[id] ?? { id, name: PREVIEW_NAME_UNKNOWN, imageUrl: null, rarity: null }
    })
}

function recipePreviewOf(
  resource: Record<string, unknown>,
  name: string,
  period: { startsAt: string | null; endsAt: string | null },
  names: OpsPreviewNames,
  bundleBadgeNames: readonly string[]
): KindPreview {
  const slots: RecipeSlotPreview[] = (Array.isArray(resource.slots) ? resource.slots : []).map((raw) => {
    const slot = asRecord(raw)
    const type = typeof slot?.badge_type === 'string' ? slot.badge_type : ''
    return { typeLabel: SLOT_TYPE_LABELS[type] ?? '종류 미정', candidates: badgeRefs(slot?.allowed_badge_ids, names) }
  })
  const points = resource.reward_points
  return {
    type: 'recipe',
    name: name || PREVIEW_TITLE_PLACEHOLDER,
    slots,
    rewardPoints: typeof points === 'number' && Number.isFinite(points) ? points : null,
    rewardBadges: badgeRefs(resource.reward_badge_ids, names),
    bundleBadgeNames: [...bundleBadgeNames],
    ...period,
  }
}

/** 이름 두 개까지 보이고 나머지는 「외 N곳」. 이름을 못 읽은 id는 폴백 문구다. */
function summarizeNames(ids: string[], lookup: (id: string) => string | undefined, unit: string): string {
  if (ids.length === 0) return '-'
  const shown = ids.slice(0, 2).map((id) => lookup(id) ?? PREVIEW_NAME_UNKNOWN)
  const rest = ids.length - shown.length
  return rest > 0 ? `${shown.join(', ')} 외 ${rest}${unit}` : shown.join(', ')
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : []
}

function dropPreviewOf(resource: Record<string, unknown>, title: string, startsAt: string | null, names: OpsPreviewNames): KindPreview {
  const count = (key: string): number => {
    const value = resource[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  const poiIds = idList(resource.poi_ids)
  let poiLine: string
  if (poiIds.length > 0) {
    poiLine = `${summarizeNames(poiIds, (id) => names.pois[id], '곳')} × 지점당 ${count('per_poi_count')}개`
  } else {
    const slug = typeof resource.poi_category === 'string' ? resource.poi_category.trim() : ''
    poiLine = `${slug ? (names.categories[slug] ?? slug) : '전체 종류'} × 총 ${count('total_count')}개`
  }
  const badgeIds = idList(resource.badge_ids)
  const itemLine =
    badgeIds.length > 0
      ? summarizeNames(badgeIds, (id) => names.badges[id]?.name, '개')
      : `컬렉션 ${summarizeNames(idList(resource.collection_ids), (id) => names.collections[id], '개')}`
  return {
    type: 'drop',
    title: title || PREVIEW_TITLE_PLACEHOLDER,
    scheduledAtText: startsAt ? formatScheduleAt(startsAt) : null,
    poiLine,
    itemLine,
  }
}

/** 같은 묶음의 `jam_badge` 가운데 이 레시피를 `links`로 가리키는 것의 이름(「이 묶음의 배지」 표시용). */
export function bundleBadgeNamesOf(
  recipeItemKey: string | null | undefined,
  bundleItems: readonly (PreviewItem & { itemKey?: string | null })[]
): string[] {
  if (!recipeItemKey) return []
  return bundleItems
    .filter((other) => other.kind === 'jam_badge' && linksOf(other).includes(recipeItemKey))
    .map((other) => {
      const copy = asRecord(itemField(other, 'copy')) ?? {}
      const resource = asRecord(itemField(other, 'resource')) ?? {}
      const name = [copy.name, resource.name].find((v): v is string => typeof v === 'string' && v.trim() !== '')
      return name ? name.trim() : PREVIEW_TITLE_PLACEHOLDER
    })
}
