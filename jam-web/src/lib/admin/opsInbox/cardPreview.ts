/**
 * 운영 항목 → 카드 미리보기 표시 데이터 (티켓 20261006_1802, 순수 함수).
 *
 * 저장 전 초안(`draft.values`)까지 덮은 항목에서 카드 칸을 관대하게 읽어 `toCardView`에 넘긴다. 없는 칸은 비우고, 제목이 비면
 * 「(제목 미입력)」이다. 연결된 미션·배지·컬렉션은 읽지 않는다(미리보기는 항목 한 개의 값만 그린다). 계측 정보(`tracking`)를
 * 싣지 않아 그리는 쪽이 트래커와 링크를 그리지 않는다. 카드(홈피드 카드)가 아닌 종류는 null이다.
 */
import { applyDraftToItem } from '@/lib/admin/opsInbox/editDraft'
import { OPS_FIELD_UNKNOWN, isOpsHomeFeedCard, readOpsItemExposureTags, readOpsItemShape } from '@/lib/admin/opsInbox/fields'
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { toCardView, type CardView } from '@/lib/today/cardView'
import type { TodayCardWithHref } from '@/lib/today/cards'
import { resolveTargetHref } from '@/lib/today/targetHref'
import type { TodayCardLayoutType, TodayCardRow, TodayCardTemplateType } from '@/types/database'

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
