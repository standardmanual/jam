/**
 * 운영 항목 → 카드·미션·JAM! 배지·컬렉션·레시피·드랍 예약 등록 형식 변환 (티켓 20261002_1028, 상위 20260930_1500 ②-2b. 레시피는 티켓 20261002_2221 ⑧-a, 드랍 예약은 티켓 20261002_2306 ⑧-b,
 * JAM! 배지는 티켓 20261004_1756 ⑨-a, 컬렉션은 티켓 20261004_2039 ⑩-a).
 *
 * 승인된 운영 항목(`ops_bundle_items`, 수정본 우선)의 `home_feed_card`·`mission`을 `today_cards`·`missions` insert 값으로 바꾼다.
 * 읽는 규칙은 `docs/specs/prd/ops-tool/PRD.md` §8.4이고, 검사는 등록 스크립트가 쓰는 `registerChecks/homeFeedFields.ts`의
 * `validateCard`와 `registerChecks/missionFields.ts`의 `validateMission`을 그대로 부른다. DB에 접근하지 않는다(쓰기는 ③·④·⑥).
 * `recipe`는 행이 아니라 레시피 서버 함수(`lib/admin/recipe-write.ts`)의 입력(`RecipePayloadInput`)으로 바꾼다. 형식 검사는 그 입력을 받는
 * `normalizeRecipePayload`가 현재 시각과 함께 하므로 변환은 칸 읽기까지만 한다(핸들러의 `prepare`가 이어서 부른다).
 * `drop_schedule`은 드랍 예약 서버 함수의 입력(평평한 키, 티켓 20261002_2306 ⑧-b)으로 바꾼다. 검사는 그 입력을 받는 `parseAmbientDropScheduleInput`이
 * 현재 시각과 함께 하므로 변환은 칸 읽기와 `ends_at` 거절까지만 한다(핸들러의 `prepare`가 이어서 부른다).
 * `jam_badge`는 어드민 배지 생성 API와 같은 변환(`buildBadgeInsertPayload`)으로 `badges` insert 값을 만든다. 칸 형식·희귀도와 레벨·계열 키는 이 변환이 보고,
 * 조건 저장 규칙·발급 조건 유무는 핸들러의 `prepare`가 이어서 본다(티켓 20261004_1756 가정 5·6).
 * `collection_launch`는 `item_books` insert 값(틀만: 이름·설명·이야기·대표 이미지·보상 포인트·보상 배지·트라이브·공개/종료 시각, 티켓 20261004_2039 가정 5)으로 바꾼다.
 * 칸 형식은 이 변환이 보고, 이름 중복·트라이브·보상 배지의 존재는 핸들러의 `check`가 DB로 본다.
 *
 * 결과는 `{ payload, errors, warnings, linkFields }`다. 오류가 하나라도 있으면 `payload`는 null이다.
 * - 오류·경고 한 건은 `{ path, message }`다. `message`는 검사 문장 그대로(`card.title: …`)이고 `path`는 운영 항목 경로
 *   (`copy.title`·`resource.template_type`·`starts_at`·`shape` 등)다. 화면 표기는 ⑤가 정한다(결정 7).
 * - `linkFields`: 연결 그룹(§8.3)이 채운 칸 이름(`mission_id`·`badge_ids`·`item_book_id`·`recipe_id`·`reward_badge_ids`·`reward_badge_id`)이다.
 *   등록 전 DB 검사에는 `withoutLinkedFields`로 그 칸을 뺀 사본을 넘긴다. 같은 실행에서 만들어질 ID라 존재 확인을 건너뛴다
 *   (생성 순서가 존재를 보장한다, 결정 8).
 *
 * 이미지는 보지 않는다. `image_source`는 null이고(결정 1) 대표 이미지 주소(`resource.cover_image_url`·`resource.image_url`)가
 * 없으면 null로 둔다. 서버·화면이 함께 읽는 순수 모듈이라 서버 전용 모듈과 Supabase를 가져오지 않는다.
 */
import { DROP_SCHEDULE_RESOURCE_KEYS } from '@/lib/ambient-drop/scheduleSpec'
import { buildBadgeInsertPayload } from '@/lib/admin/badge-insert-payload'
import { findRarityLevelError } from '@/lib/admin/badge-condition-guards'
import { isValidFamilyKey } from '@/lib/admin/familyKey'
import { OPS_FIELD_UNKNOWN, readOpsItemTribeId } from '@/lib/admin/opsInbox/fields'
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { kstDateKey } from '@/lib/admin/opsInbox/labels'
import { OPS_HOME_FEED_CARD_KIND } from '@/lib/admin/opsInbox/constants'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { kstDayBoundsIso } from '@/lib/admin/today-calendar'
import { isUuid } from '@/lib/admin/uuid'
import { describeValue, isIsoDateTime, isPresent, visibleLength } from '@/lib/admin/registerChecks/bundleRules'
import { buildTodayCardInsertPayload, validateCard } from '@/lib/admin/registerChecks/homeFeedFields'
import type { HomeFeedCardInput } from '@/lib/admin/registerChecks/homeFeedFields'
import { buildMissionInsertPayload, validateMission } from '@/lib/admin/registerChecks/missionFields'
import type { MissionInput } from '@/lib/admin/registerChecks/missionFields'
import type { RecipePayloadInput } from '@/lib/combine/recipe-payload'
import { CARD_SHAPES, CARD_TITLE_MAX_LENGTH, isCardShape } from '@/lib/today/shape'

/** 변환이 읽는 운영 항목. `ViewableItem`(제출 원본·수정본)에 행 칸을 더했다. */
export interface OpsRegisterItem extends ViewableItem {
  kind: string | null
  starts_at: string | null
  ends_at: string | null
  pattern_no: string | null
}

export interface RegisterInputIssue {
  /** 운영 항목 경로. `copy.title`·`resource.template_type`·`starts_at`·`shape` 등. */
  path: string
  /** 검사 문장 그대로(`card.title: …`). */
  message: string
}

export interface RegisterInputResult<P> {
  /** insert 값. 오류가 하나라도 있으면 null. */
  payload: P | null
  errors: RegisterInputIssue[]
  warnings: RegisterInputIssue[]
  /** 연결로 채운 칸 이름(§8.3). */
  linkFields: string[]
}

/** 카드의 연결 칸에 넣을 ID(③이 §8.3 쌍 표대로 정해 넘긴다). 검증용으로는 미리 정한 UUID를 넣는다(G3). */
export type CardLinkedIds = {
  mission_id?: string | null
  badge_ids?: readonly string[] | null
  item_book_id?: string | null
  /** 레시피 공개 카드의 레시피(`home_feed_card` → `recipe` 쌍, 티켓 20261006_1218). */
  recipe_id?: string | null
}

/** 미션의 연결 칸에 넣을 ID. */
export type MissionLinkedIds = {
  reward_badge_ids?: readonly string[] | null
}

export type TodayCardRegisterPayload = ReturnType<typeof buildTodayCardInsertPayload> & {
  pattern_no: string | null
  created_by: string
}

export type MissionRegisterPayload = ReturnType<typeof buildMissionInsertPayload>

/**
 * JAM! 배지의 연결 칸에 넣을 ID. `jam_badge` → `recipe` 쌍(§8.3)이 정한 레시피 ID로 `condition_json.recipe_first_success.recipe_id`를 덮는다.
 * 검증용으로는 미리 정한 UUID를 넣는다(G3).
 */
export type JamBadgeLinkedIds = {
  recipe_id?: string | null
}

/** `badges` insert 값. 어드민 배지 생성 API의 변환(`buildBadgeInsertPayload`) 결과에 정한 ID를 더했다(변환 함수에는 `id` 칸이 없다). */
export type JamBadgeRegisterPayload = ReturnType<typeof buildBadgeInsertPayload> & { id: string }

/** 연결로 채운 칸 이름(`linkFields`)에 들어가는 JAM! 배지의 칸. 최상위 칸이 아니라 `withoutLinkedFields`가 다루지 않는다. */
export const JAM_BADGE_RECIPE_LINK_FIELD = 'condition_json.recipe_first_success.recipe_id'

/** 컬렉션의 연결 칸에 넣을 ID. `collection_launch` → `jam_badge` 쌍(§8.3)이 정한 보상 배지 ID가 `reward_badge_id`가 된다. 검증용으로는 미리 정한 UUID를 넣는다(G3). */
export type CollectionLaunchLinkedIds = {
  reward_badge_id?: string | null
}

/**
 * `item_books` insert 값에서 `id`를 뺀 틀 칸(티켓 20261004_2039 가정 5). `id`는 핸들러의 `create`가 정한 ID로 더한다.
 * `required_activity_badge_id`·`image_source`·배경 칸·`drop_condition_json`·`drop_excluded`는 쓰지 않는다(어드민 표시 전용이거나 DB 기본값이 맞다).
 */
export interface CollectionLaunchRegisterPayload {
  name: string
  description: string
  story_text: string | null
  image_url: string | null
  reward_points: number
  reward_badge_id: string | null
  tribe_id: string | null
  valid_from: string
  valid_until: string | null
  is_active: boolean
}

/** 레시피 서버 함수(`buildRecipeRow`·`createRecipeWithSlots`)가 받는 입력. 공개 시각은 `valid_from`, 종료 시각은 `valid_until`이다. */
export type RecipeRegisterPayload = RecipePayloadInput

/** 드랍 예약의 연결 칸에 넣을 ID. 같은 묶음의 컬렉션이 만들 컬렉션 ID를 `resource.collection_ids` 뒤에 더한다(§8.3). */
export type DropLinkedIds = {
  collection_ids?: readonly string[] | null
}

/**
 * 드랍 예약 서버 함수(`parseAmbientDropScheduleInput`·`createAmbientDropSchedule`)가 받는 입력. 평평한 키다.
 * 공개 시각은 `scheduled_at`이고 종료 시각 칸은 없다. 값은 읽은 그대로라 형식은 파서가 본다.
 */
export type DropScheduleRegisterPayload = Partial<Record<'scheduled_at' | 'title' | (typeof DROP_SCHEDULE_RESOURCE_KEYS)[number], unknown>>

// ── 읽을 칸 목록(PRD §8.4 표) ────────────────────────────────────────────────────────────────

const CARD_COMMON_KEYS = ['starts_at', 'ends_at', 'shape', 'exposure_tags', 'pattern_no']
const CARD_COPY_KEYS = ['title', 'subtitle', 'description', 'body_markdown', 'region_label']
const CARD_RESOURCE_KEYS = [
  'template_type',
  'layout_type',
  'title_in_image',
  'cover_image_url',
  'badge_ids',
  'mission_id',
  'item_book_id',
  'ranking_mode_id',
  'recipe_id',
  'content_type_id',
  'target_href',
  'sort_order',
]
const CARD_TOOL_KEYS = ['id', 'created_at', 'created_by', 'image_source', 'is_active']

const MISSION_COMMON_KEYS = ['starts_at', 'ends_at']
const MISSION_COPY_KEYS = ['title', 'description', 'condition_text']
const MISSION_RESOURCE_KEYS = [
  'mission_type',
  'condition_json',
  'reward_points',
  'reward_badge_ids',
  'status_display_type',
  'visible_rank_count',
  'max_completions',
  'gate_axis',
  'gate_stage',
  'visibility_rule_json',
  'image_url',
]
const MISSION_TOOL_KEYS = ['id', 'created_at', 'image_source', 'exposure_mode', 'exposure_at', 'reward_type', 'reward_id', 'gated_badge_id']

const MISSION_KIND = 'mission'

const BADGE_COMMON_KEYS = ['starts_at', 'ends_at']
const BADGE_COPY_KEYS = ['name', 'description']
const BADGE_RESOURCE_KEYS = ['condition_json', 'point_reward', 'rarity', 'level', 'family_key', 'sort_order', 'image_url']
// `activity_types`는 JAM! 배지가 종목과 함께 쓰지 않는다는 어드민 폼 규칙이라 툴이 빈 배열로 정한다(티켓 20261004_1756 가정 5).
const BADGE_TOOL_KEYS = ['id', 'created_at', 'type', 'admin_category', 'activity_types']

const BADGE_KIND = 'jam_badge'

// `tribe_id`는 항목 공통 칸(§3.1)이라 `resource`에 있으면 공통 칸이 먼저라는 경고가 붙는다. 어드민 표시 전용 칸(`required_activity_badge_id` 등)은 읽지 않는다(표에 없는 칸 경고).
const COLLECTION_COMMON_KEYS = ['starts_at', 'ends_at', 'tribe_id']
const COLLECTION_COPY_KEYS = ['name', 'description', 'story_text']
const COLLECTION_RESOURCE_KEYS = ['image_url', 'reward_points', 'reward_badge_id']
const COLLECTION_TOOL_KEYS = ['id', 'created_at', 'is_active']

const COLLECTION_KIND = 'collection_launch'

const RECIPE_COMMON_KEYS = ['starts_at', 'ends_at']
const RECIPE_COPY_KEYS = ['name']
const RECIPE_RESOURCE_KEYS = ['slots', 'reward_points', 'reward_badge_ids']
const RECIPE_TOOL_KEYS = ['id', 'created_at']

const RECIPE_KIND = 'recipe'

const DROP_COMMON_KEYS = ['starts_at', 'ends_at']
const DROP_COPY_KEYS = ['title']
const DROP_RESOURCE_KEYS: readonly string[] = DROP_SCHEDULE_RESOURCE_KEYS
const DROP_TOOL_KEYS = ['id', 'created_at']

const DROP_KIND = 'drop_schedule'

// ── 읽기 도우미 ─────────────────────────────────────────────────────────────────────────────

/** `copy`·`resource` 객체. 없으면 빈 객체, 객체가 아니면 오류를 쌓고 빈 객체다. */
function readGroup(item: ViewableItem, key: 'copy' | 'resource', errors: RegisterInputIssue[]): Record<string, unknown> {
  const value = itemField(item, key)
  if (value === undefined || value === null) return {}
  const record = asRecord(value)
  if (record) return record
  errors.push({ path: key, message: `${key}: 객체여야 해요.` })
  return {}
}

/** 시각 하나를 문자열로 읽는다(선례: `balance/evaluate.ts`의 `readTimeValue`). 항목 값이 ISO면 그 값, 비었으면 행 칸, 값이 있는데 ISO가 아니면 검사가 잡도록 그대로 돌려준다. */
function readTimeString(raw: unknown, column: string | null): unknown {
  if (isIsoDateTime(raw)) return raw
  if (raw === undefined || raw === null || raw === '') {
    const ms = column ? Date.parse(column) : NaN
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
  }
  return raw
}

/** 글자 칸 하나. `copy`를 먼저, 없으면 `resource`에서 읽는다. 값이 없어도 경로는 `copy.<칸>`이다. */
function readText(copy: Record<string, unknown>, resource: Record<string, unknown>, key: string): { value: unknown; path: string } {
  if (isPresent(copy[key])) return { value: copy[key], path: `copy.${key}` }
  if (isPresent(resource[key])) return { value: resource[key], path: `resource.${key}` }
  return { value: undefined, path: `copy.${key}` }
}

/**
 * 표에 없는 키·툴이 정하는 키·공통 칸과 겹치는 `resource` 키를 경고로 쌓는다. 모두 읽지 않는다.
 * `resource`는 글자 칸(`copyKeys`)도 읽는다(`copy`에 없을 때).
 */
function warnUnreadKeys(
  warnings: RegisterInputIssue[],
  groupName: 'copy' | 'resource',
  group: Record<string, unknown>,
  readable: readonly string[],
  commonKeys: readonly string[],
  toolKeys: readonly string[]
): void {
  for (const key of Object.keys(group)) {
    if (readable.includes(key)) continue
    const path = `${groupName}.${key}`
    if (toolKeys.includes(key)) {
      warnings.push({ path, message: `${path}: 툴이 정하는 값이라 읽지 않아요.` })
    } else if (groupName === 'resource' && commonKeys.includes(key)) {
      warnings.push({ path, message: `${path}: 항목 공통 칸(${key})이 먼저라 이 값은 읽지 않아요.` })
    } else {
      warnings.push({ path, message: `${path}: 표에 없는 칸이라 읽지 않아요.` })
    }
  }
}

/** 검사 문장(`card.title: …`)을 운영 항목 경로와 함께 돌려준다. 문장은 그대로다. 칸 이름을 못 읽으면 경로는 `prefix`다. */
function toIssue(sentence: string, prefix: 'card' | 'mission', pathOf: (field: string) => string): RegisterInputIssue {
  const match = new RegExp(`^${prefix}\\.([a-z_]+)`).exec(sentence)
  return { path: match ? pathOf(match[1]) : prefix, message: sentence }
}

/** 문자열 칸 하나. 값이 없거나 공백뿐이면 null이고, 문자열이 아니면 오류를 쌓는다. */
function readOptionalString(
  errors: RegisterInputIssue[],
  prefix: 'card' | 'mission' | 'badge' | 'collection',
  key: string,
  path: string,
  value: unknown
): string | null {
  if (!isPresent(value)) return null
  if (typeof value !== 'string') {
    errors.push({ path, message: `${prefix}.${key}: 문자열이어야 해요(받은 값: ${describeValue(value)}).` })
    return null
  }
  return value.trim() === '' ? null : value.trim()
}

/** 연결 칸에 넣을 ID 목록을 `own`(resource가 가진 배열) 뒤에 더한다. 채웠으면 true. `own`이 배열이 아니면 검사가 잡도록 손대지 않는다. */
function appendLinkedIds(target: Record<string, unknown>, key: string, own: unknown, linked: readonly string[] | null | undefined): boolean {
  const linkedIds = linked ?? []
  if (linkedIds.length === 0) {
    if (isPresent(own)) target[key] = own
    return false
  }
  if (!isPresent(own)) {
    target[key] = [...linkedIds]
    return true
  }
  if (Array.isArray(own)) {
    target[key] = [...own, ...linkedIds]
    return true
  }
  target[key] = own
  return false
}

/** 단일 ID 칸. 연결 ID가 있으면 그 값이고, `resource`에도 값이 있으면 오류(연결로 채우는 칸이다, §8.3). 채웠으면 true. */
function fillLinkedId(
  target: Record<string, unknown>,
  errors: RegisterInputIssue[],
  prefix: 'card' | 'mission' | 'collection',
  key: string,
  own: unknown,
  linked: string | null | undefined
): boolean {
  if (isPresent(linked) && linked !== '') {
    if (isPresent(own)) {
      target[key] = own
      errors.push({ path: `resource.${key}`, message: `${prefix}.${key}: 연결된 항목으로 채우는 칸이라 resource에 같이 적을 수 없어요.` })
      return false
    }
    target[key] = linked
    return true
  }
  if (isPresent(own)) target[key] = own
  return false
}

// ── 카드 ────────────────────────────────────────────────────────────────────────────────────

/**
 * `home_feed_card` 항목을 `today_cards` insert 값으로 바꾼다(PRD §8.4 카드 행).
 * - 공통 칸: `starts_at`(필수)·`ends_at`(없으면 공개한 날의 끝, 결정 6)·`shape`(필수)·`exposure_tags`(필수)·`pattern_no`(결정 5).
 * - 글자 칸 `title`·`subtitle`·`description`·`body_markdown`·`region_label`은 `copy` 먼저, 없으면 `resource`.
 * - 나머지는 `resource`. `image_source`는 null(결정 1), `created_by`는 `actorId`(결정 2), `is_active`는 true.
 */
export function toTodayCardRegisterInput(
  item: OpsRegisterItem,
  { id, actorId, linkedIds = {} }: { id: string; actorId: string; linkedIds?: CardLinkedIds }
): RegisterInputResult<TodayCardRegisterPayload> {
  const errors: RegisterInputIssue[] = []
  const warnings: RegisterInputIssue[] = []
  const linkFields: string[] = []

  if (item.kind !== OPS_HOME_FEED_CARD_KIND) {
    errors.push({ path: 'kind', message: `kind: ${OPS_HOME_FEED_CARD_KIND} 항목만 카드로 바꿀 수 있어요(받은 값: ${describeValue(item.kind ?? undefined)}).` })
    return { payload: null, errors, warnings, linkFields }
  }

  const copy = readGroup(item, 'copy', errors)
  const resource = readGroup(item, 'resource', errors)
  warnUnreadKeys(warnings, 'copy', copy, CARD_COPY_KEYS, CARD_COMMON_KEYS, CARD_TOOL_KEYS)
  warnUnreadKeys(warnings, 'resource', resource, [...CARD_RESOURCE_KEYS, ...CARD_COPY_KEYS], CARD_COMMON_KEYS, CARD_TOOL_KEYS)

  // CLI 모양 card 객체. 검사(`validateCard`)가 읽는 칸만 담는다(`cover_image_url`·`title_in_image`는 CLI 검사 칸이 아니다).
  const card: Record<string, unknown> = {}
  const paths: Record<string, string> = {}

  for (const key of CARD_COPY_KEYS) {
    const read = readText(copy, resource, key)
    paths[key] = read.path
    if (read.value !== undefined) card[key] = read.value
  }
  for (const key of ['template_type', 'layout_type', 'ranking_mode_id', 'content_type_id', 'target_href', 'sort_order']) {
    if (isPresent(resource[key])) card[key] = resource[key]
  }

  // 공통 칸: 시각은 항목 값을 먼저, 없으면 행 칸.
  const startsAt = readTimeString(itemField(item, 'starts_at'), item.starts_at)
  if (startsAt !== undefined) card.starts_at = startsAt
  const endsAt = readTimeString(itemField(item, 'ends_at'), item.ends_at)
  if (endsAt !== undefined) card.ends_at = endsAt
  else if (isIsoDateTime(startsAt)) {
    // 결정 6: 종료 시각이 없으면 공개한 날의 끝(23:59:59.999 KST). 신호 계산(`bundleItemPeriod`)과 같은 값이다.
    const day = kstDateKey(startsAt)
    if (day) card.ends_at = kstDayBoundsIso(day).endIso
  }
  const exposureTags = itemField(item, 'exposure_tags')
  if (isPresent(exposureTags)) card.exposure_tags = exposureTags

  const shape = itemField(item, 'shape')
  if (!isPresent(shape)) {
    errors.push({ path: 'shape', message: `card.shape: 필수 항목이 없어요(카드 모양을 ${CARD_SHAPES.join(', ')} 중 하나로 적어 주세요).` })
  } else if (!isCardShape(shape)) {
    errors.push({ path: 'shape', message: `card.shape: 허용되지 않는 카드 모양이에요(받은 값: ${describeValue(shape)}). 허용값: ${CARD_SHAPES.join(', ')}` })
  }

  // 연결 칸(§8.3).
  if (fillLinkedId(card, errors, 'card', 'mission_id', resource.mission_id, linkedIds.mission_id)) linkFields.push('mission_id')
  if (appendLinkedIds(card, 'badge_ids', resource.badge_ids, linkedIds.badge_ids)) linkFields.push('badge_ids')
  if (fillLinkedId(card, errors, 'card', 'item_book_id', resource.item_book_id, linkedIds.item_book_id)) linkFields.push('item_book_id')
  if (fillLinkedId(card, errors, 'card', 'recipe_id', resource.recipe_id, linkedIds.recipe_id)) linkFields.push('recipe_id')

  // 이미지 칸(결정 1): 주소가 없으면 null, `image_source`는 항상 null이다.
  const coverImageUrl = readOptionalString(errors, 'card', 'cover_image_url', 'resource.cover_image_url', resource.cover_image_url)
  let titleInImage: boolean | null = null
  if (isPresent(resource.title_in_image)) {
    if (typeof resource.title_in_image === 'boolean') titleInImage = resource.title_in_image
    else {
      errors.push({
        path: 'resource.title_in_image',
        message: `card.title_in_image: true 또는 false여야 해요(받은 값: ${describeValue(resource.title_in_image)}).`,
      })
    }
  }

  // 결정 5: `pattern_no`는 사전 번호 형식이면 쓰고, 아니면 비우고 경고한다(G11). 없으면 그냥 비운다.
  const patternRaw = itemField(item, 'pattern_no') ?? item.pattern_no
  const patternText =
    typeof patternRaw === 'string' ? patternRaw.trim() : typeof patternRaw === 'number' && Number.isFinite(patternRaw) ? String(patternRaw) : null
  let patternNo: string | null = null
  if (patternText !== null && OPS_PATTERN_NO_PATTERN.test(patternText)) {
    patternNo = patternText
  } else if (isPresent(patternRaw) && patternText !== '') {
    warnings.push({
      path: 'pattern_no',
      message: `pattern_no: 패턴 번호 형식(P01처럼 P와 숫자 2자리 이상)이 아니라 비우고 등록해요(받은 값: ${describeValue(patternRaw)}).`,
    })
  }

  // 지금 등록 스크립트와 같은 검사. `card.<칸>:` 문장을 운영 항목 경로로 옮긴다.
  const pathOf = (field: string): string => paths[field] ?? (CARD_COMMON_KEYS.includes(field) ? field : `resource.${field}`)
  const checkErrors: string[] = []
  validateCard(checkErrors, card)
  for (const sentence of checkErrors) {
    // 시작 시각을 읽지 못해 종료 시각을 채울 수 없을 때, 종료 시각의 「필수」 문장은 시작 시각 오류와 겹친다.
    if (card.ends_at === undefined && sentence === 'card.ends_at: 필수 항목이 없어요.') continue
    errors.push(toIssue(sentence, 'card', pathOf))
  }

  // G15: 제목 글자 수가 모양별 상한을 넘으면 경고만 한다.
  if (isCardShape(shape) && typeof card.title === 'string') {
    const length = visibleLength(card.title.trim())
    const max = CARD_TITLE_MAX_LENGTH[shape]
    if (length > max) {
      warnings.push({ path: pathOf('title'), message: `card.title: ${shape} 모양의 제목은 ${max}자 이하가 좋아요(받은 값: ${length}자).` })
    }
  }

  if (errors.length > 0 || !isCardShape(shape)) return { payload: null, errors, warnings, linkFields }

  // `validateCard`를 통과했으므로 필수 칸이 있고 형식이 맞다.
  const payload: TodayCardRegisterPayload = {
    ...buildTodayCardInsertPayload(card as unknown as HomeFeedCardInput, { id, coverImageUrl, imageSource: null, shape, titleInImage }),
    pattern_no: patternNo,
    created_by: actorId,
  }
  return { payload, errors, warnings, linkFields }
}

// ── 미션 ────────────────────────────────────────────────────────────────────────────────────

/**
 * `mission` 항목을 `missions` insert 값으로 바꾼다(PRD §8.4 미션 행).
 * - 공통 칸: `starts_at`(필수)·`ends_at`(없으면 상시).
 * - 글자 칸 `title`·`description`(필수, 결정 3)·`condition_text`는 `copy` 먼저, 없으면 `resource`. 나머지는 `resource`.
 * - 툴이 정하는 값: `exposure_mode = 'start_date'`, `exposure_at` null, `image_source` null.
 * - `condition_text`·`image_url`은 CLI 검사 칸이 아니라 검사(`validateMission`)에 넘기지 않는다.
 */
export function toMissionRegisterInput(
  item: OpsRegisterItem,
  { id, linkedIds = {} }: { id: string; linkedIds?: MissionLinkedIds }
): RegisterInputResult<MissionRegisterPayload> {
  const errors: RegisterInputIssue[] = []
  const warnings: RegisterInputIssue[] = []
  const linkFields: string[] = []

  if (item.kind !== MISSION_KIND) {
    errors.push({ path: 'kind', message: `kind: ${MISSION_KIND} 항목만 미션으로 바꿀 수 있어요(받은 값: ${describeValue(item.kind ?? undefined)}).` })
    return { payload: null, errors, warnings, linkFields }
  }

  const copy = readGroup(item, 'copy', errors)
  const resource = readGroup(item, 'resource', errors)
  warnUnreadKeys(warnings, 'copy', copy, MISSION_COPY_KEYS, MISSION_COMMON_KEYS, MISSION_TOOL_KEYS)
  warnUnreadKeys(warnings, 'resource', resource, [...MISSION_RESOURCE_KEYS, ...MISSION_COPY_KEYS], MISSION_COMMON_KEYS, MISSION_TOOL_KEYS)

  // CLI 모양 mission 객체. `condition_text`·`image_url`은 CLI 검사 칸이 아니라 담지 않는다.
  const mission: Record<string, unknown> = {}
  const paths: Record<string, string> = {}

  let conditionTextRaw: unknown
  for (const key of MISSION_COPY_KEYS) {
    const read = readText(copy, resource, key)
    paths[key] = read.path
    if (key === 'condition_text') conditionTextRaw = read.value
    else if (read.value !== undefined) mission[key] = read.value
  }
  const conditionText = readOptionalString(errors, 'mission', 'condition_text', paths.condition_text, conditionTextRaw)
  for (const key of MISSION_RESOURCE_KEYS) {
    if (key === 'image_url' || key === 'reward_badge_ids') continue
    if (isPresent(resource[key])) mission[key] = resource[key]
  }

  const startsAt = readTimeString(itemField(item, 'starts_at'), item.starts_at)
  if (startsAt !== undefined) mission.starts_at = startsAt
  const endsAt = readTimeString(itemField(item, 'ends_at'), item.ends_at)
  if (endsAt !== undefined) mission.ends_at = endsAt

  // 툴이 정하는 값. `exposure_at`은 넣지 않는다(null).
  mission.exposure_mode = 'start_date'

  if (appendLinkedIds(mission, 'reward_badge_ids', resource.reward_badge_ids, linkedIds.reward_badge_ids)) linkFields.push('reward_badge_ids')

  const imageUrl = readOptionalString(errors, 'mission', 'image_url', 'resource.image_url', resource.image_url)

  const pathOf = (field: string): string => {
    if (field === 'gate') return 'resource'
    return paths[field] ?? (MISSION_COMMON_KEYS.includes(field) ? field : `resource.${field}`)
  }
  const checkErrors: string[] = []
  const checkWarnings: string[] = []
  validateMission(checkErrors, checkWarnings, mission)
  for (const sentence of checkErrors) errors.push(toIssue(sentence, 'mission', pathOf))
  for (const sentence of checkWarnings) warnings.push(toIssue(sentence, 'mission', pathOf))

  if (errors.length > 0) return { payload: null, errors, warnings, linkFields }

  // `validateMission`을 통과했으므로 필수 칸이 있고 형식이 맞다.
  const payload = buildMissionInsertPayload(mission as unknown as MissionInput, { id, imageUrl, imageSource: null, conditionText })
  return { payload, errors, warnings, linkFields }
}

// ── JAM! 배지 ───────────────────────────────────────────────────────────────────────────────

/** 어드민 배지 저장 검사 문장이 앞에 붙이는 「저장할 수 없습니다.」를 뗀다(예약 등록의 사유는 저장 화면 문장이 아니다). */
export function withoutSavePrefix(sentence: string): string {
  return sentence.replace(/^저장할 수 없습니다\.\s*/, '')
}

/** 필수 글자 칸 하나(`name`·`description`). 비어 있거나 공백뿐이면 없는 것이고, 문자열이 아니면 오류다. 앞뒤 공백을 뗀 값을 돌려준다. */
function readRequiredText(
  errors: RegisterInputIssue[],
  prefix: 'badge' | 'collection',
  key: 'name' | 'description',
  read: { value: unknown; path: string }
): string | null {
  if (read.value === undefined || (typeof read.value === 'string' && read.value.trim() === '')) {
    errors.push({ path: read.path, message: `${prefix}.${key}: 필수 항목이 없어요.` })
    return null
  }
  if (typeof read.value !== 'string') {
    errors.push({ path: read.path, message: `${prefix}.${key}: 문자열이어야 해요(받은 값: ${describeValue(read.value)}).` })
    return null
  }
  return read.value.trim()
}

/** 0 이상의 정수 칸 하나(배지의 `point_reward`·`sort_order`, 컬렉션의 `reward_points`). 값이 없으면 `undefined`이고, 정수가 아니거나 음수면 오류를 쌓는다. */
function readCount(errors: RegisterInputIssue[], prefix: 'badge' | 'collection', key: string, value: unknown): number | undefined {
  if (!isPresent(value)) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push({ path: `resource.${key}`, message: `${prefix}.${key}: 0 이상의 정수여야 해요(받은 값: ${describeValue(value)}).` })
    return undefined
  }
  return value
}

/**
 * `jam_badge` 항목을 `badges` insert 값으로 바꾼다(PRD §8.4 JAM! 배지 행).
 * - 공통 칸: `starts_at`(필수)은 `valid_from`으로, `ends_at`은 `valid_until`로 읽는다. `ends_at`이 없으면 상시다. 둘 다 시간대가 붙은 ISO여야 하고 종료는 공개보다 늦어야 한다.
 * - 글자 칸 `name`·`description`(필수)은 `copy` 먼저, 없으면 `resource`. `resource`의 `condition_json`(필수, 객체)·`point_reward`·`sort_order`(0 이상의 정수)·
 *   `rarity`·`level`(정확히 하나, `findRarityLevelError`)·`family_key`("종목:이름" 형태, `isValidFamilyKey`)·`image_url`(없으면 null)을 읽는다.
 * - 툴이 정하는 값: `type = 'activity'`, `admin_category = 'jam'`, `activity_types = []`(JAM! 배지는 종목과 함께 쓰지 않는다), `id`. `resource`에 있어도 읽지 않고 경고한다.
 * - 연결로 채우는 칸 `condition_json.recipe_first_success.recipe_id`는 `linkedIds.recipe_id`가 있으면 그 값으로 **덮고** `linkFields`에 알린다(§8.3 「덮는 칸」.
 *   `resource`에 같은 값이 있어도 충돌이 아니다). 항목에 `recipe_first_success`가 없으면 칸을 만든다.
 * - 조건 저장 규칙(`findBadgeConditionSaveError`)과 발급 조건 유무는 보지 않는다. 핸들러의 `prepare`가 이어서 본다.
 * - 값은 `buildBadgeInsertPayload`(어드민 배지 생성 API·등록 스크립트와 같은 변환)로 만든다.
 */
export function toJamBadgeRegisterInput(
  item: OpsRegisterItem,
  { id, linkedIds = {} }: { id: string; linkedIds?: JamBadgeLinkedIds }
): RegisterInputResult<JamBadgeRegisterPayload> {
  const errors: RegisterInputIssue[] = []
  const warnings: RegisterInputIssue[] = []
  const linkFields: string[] = []

  if (item.kind !== BADGE_KIND) {
    errors.push({ path: 'kind', message: `kind: ${BADGE_KIND} 항목만 JAM! 배지로 바꿀 수 있어요(받은 값: ${describeValue(item.kind ?? undefined)}).` })
    return { payload: null, errors, warnings, linkFields }
  }

  const copy = readGroup(item, 'copy', errors)
  const resource = readGroup(item, 'resource', errors)
  warnUnreadKeys(warnings, 'copy', copy, BADGE_COPY_KEYS, BADGE_COMMON_KEYS, BADGE_TOOL_KEYS)
  warnUnreadKeys(warnings, 'resource', resource, [...BADGE_RESOURCE_KEYS, ...BADGE_COPY_KEYS], BADGE_COMMON_KEYS, BADGE_TOOL_KEYS)

  const name = readRequiredText(errors, 'badge', 'name', readText(copy, resource, 'name'))
  const description = readRequiredText(errors, 'badge', 'description', readText(copy, resource, 'description'))

  // 공개 시각은 필수다. 종료 시각이 없으면 상시다.
  const startsAt = readTimeString(itemField(item, 'starts_at'), item.starts_at)
  if (startsAt === undefined) {
    errors.push({ path: 'starts_at', message: 'badge.valid_from: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).' })
  } else if (!isIsoDateTime(startsAt)) {
    errors.push({ path: 'starts_at', message: `badge.valid_from: 시간대가 붙은 ISO 형식이어야 해요(받은 값: ${describeValue(startsAt)}).` })
  }
  const endsAt = readTimeString(itemField(item, 'ends_at'), item.ends_at)
  if (endsAt !== undefined && !isIsoDateTime(endsAt)) {
    errors.push({ path: 'ends_at', message: `badge.valid_until: 시간대가 붙은 ISO 형식이어야 해요(받은 값: ${describeValue(endsAt)}).` })
  } else if (isIsoDateTime(startsAt) && isIsoDateTime(endsAt) && Date.parse(endsAt) <= Date.parse(startsAt)) {
    errors.push({ path: 'ends_at', message: 'badge.valid_until: 종료 시각은 공개 시각보다 늦어야 해요.' })
  }

  // 발급 조건. 연결로 채우는 레시피 ID는 항목 값 위에 덮는다.
  let condition: Record<string, unknown> | null = null
  if (!isPresent(resource.condition_json)) {
    errors.push({ path: 'resource.condition_json', message: 'badge.condition_json: 필수 항목이 없어요.' })
  } else {
    const record = asRecord(resource.condition_json)
    if (record) condition = { ...record }
    else errors.push({ path: 'resource.condition_json', message: `badge.condition_json: 객체여야 해요(받은 값: ${describeValue(resource.condition_json)}).` })
  }
  if (condition !== null && isPresent(linkedIds.recipe_id) && linkedIds.recipe_id !== '') {
    condition.recipe_first_success = { ...(asRecord(condition.recipe_first_success) ?? {}), recipe_id: linkedIds.recipe_id }
    linkFields.push(JAM_BADGE_RECIPE_LINK_FIELD)
  }

  const pointReward = readCount(errors, 'badge', 'point_reward', resource.point_reward)
  const sortOrder = readCount(errors, 'badge', 'sort_order', resource.sort_order)

  // 등급형(rarity)과 레벨형(level) 가운데 정확히 하나. DB CHECK에 걸리기 전에 쉬운 문장으로 막는다.
  const rarityLevelError = findRarityLevelError(resource.rarity ?? null, resource.level ?? null)
  if (rarityLevelError) {
    const levelOnly = isPresent(resource.level) && resource.level !== '' && !isPresent(resource.rarity)
    const field = levelOnly ? 'level' : 'rarity'
    errors.push({ path: `resource.${field}`, message: `badge.${field}: ${withoutSavePrefix(rarityLevelError)}` })
  }

  let familyKey: string | null = null
  if (isPresent(resource.family_key)) {
    if (typeof resource.family_key !== 'string') {
      errors.push({ path: 'resource.family_key', message: `badge.family_key: 문자열이어야 해요(받은 값: ${describeValue(resource.family_key)}).` })
    } else if (resource.family_key.trim() !== '') {
      familyKey = resource.family_key.trim()
      if (!isValidFamilyKey(familyKey)) {
        errors.push({ path: 'resource.family_key', message: `badge.family_key: 계열 키 형태(${familyKey})가 올바르지 않아요. "종목:이름" 형태로, 쉼표 없이 적어 주세요.` })
      }
    }
  }

  const imageUrl = readOptionalString(errors, 'badge', 'image_url', 'resource.image_url', resource.image_url)

  if (errors.length > 0 || name === null || description === null || !isIsoDateTime(startsAt)) return { payload: null, errors, warnings, linkFields }

  const built = buildBadgeInsertPayload({
    name,
    description,
    type: 'activity',
    rarity: resource.rarity,
    level: resource.level,
    family_key: familyKey,
    sort_order: sortOrder,
    image_url: imageUrl,
    activity_types: [],
    condition_json: condition,
    admin_category: 'jam',
    valid_from: startsAt,
    valid_until: isIsoDateTime(endsAt) ? endsAt : null,
    point_reward: pointReward,
  })
  return { payload: { id, ...built }, errors, warnings, linkFields }
}

// ── 컬렉션 ──────────────────────────────────────────────────────────────────────────────────

/**
 * `collection_launch` 항목을 `item_books` insert 값(틀만)으로 바꾼다(PRD §8.4 컬렉션 행).
 * - 공통 칸: `starts_at`(필수)은 `valid_from`으로, `ends_at`은 `valid_until`로 읽는다. `ends_at`이 없으면 상시다. 둘 다 시간대가 붙은 ISO여야 하고 종료는 공개보다 늦어야 한다.
 *   `tribe_id`는 항목 공통 칸(`readOpsItemTribeId`)에서 읽는다(없으면 null, UUID 형식이 아니면 오류).
 * - 글자 칸 `name`·`description`(필수, 빈 문자열은 없는 것)·`story_text`는 `copy` 먼저, 없으면 `resource`. `resource`의 `image_url`(없으면 null, G1)·`reward_points`(0 이상의 정수, 없으면 0)·`reward_badge_id`를 읽는다.
 * - 툴이 정하는 값: `is_active = true`, `id`(핸들러의 `create`가 정한 ID로 더한다). `required_activity_badge_id`·`image_source`·배경 칸·`drop_condition_json`·`drop_excluded`는 쓰지 않는다
 *   (값이 들어오면 「표에 없는 칸이라 읽지 않아요」 경고. 어드민 표시 전용이거나 DB 기본값이 맞다).
 * - 연결로 채우는 칸 `reward_badge_id`는 `linkedIds.reward_badge_id`가 있으면 그 값이고 `linkFields`에 알린다(`resource`에 같은 칸이 있으면 오류, 카드·미션과 같다).
 *   `resource`에 직접 적은 보상 배지는 UUID 형식이어야 하고, 존재·종류는 핸들러의 `check`가 DB로 본다.
 */
export function toCollectionLaunchRegisterInput(
  item: OpsRegisterItem,
  { linkedIds = {} }: { linkedIds?: CollectionLaunchLinkedIds } = {}
): RegisterInputResult<CollectionLaunchRegisterPayload> {
  const errors: RegisterInputIssue[] = []
  const warnings: RegisterInputIssue[] = []
  const linkFields: string[] = []

  if (item.kind !== COLLECTION_KIND) {
    errors.push({ path: 'kind', message: `kind: ${COLLECTION_KIND} 항목만 컬렉션으로 바꿀 수 있어요(받은 값: ${describeValue(item.kind ?? undefined)}).` })
    return { payload: null, errors, warnings, linkFields }
  }

  const copy = readGroup(item, 'copy', errors)
  const resource = readGroup(item, 'resource', errors)
  warnUnreadKeys(warnings, 'copy', copy, COLLECTION_COPY_KEYS, COLLECTION_COMMON_KEYS, COLLECTION_TOOL_KEYS)
  warnUnreadKeys(warnings, 'resource', resource, [...COLLECTION_RESOURCE_KEYS, ...COLLECTION_COPY_KEYS], COLLECTION_COMMON_KEYS, COLLECTION_TOOL_KEYS)

  const name = readRequiredText(errors, 'collection', 'name', readText(copy, resource, 'name'))
  const description = readRequiredText(errors, 'collection', 'description', readText(copy, resource, 'description'))
  const storyText = readText(copy, resource, 'story_text')
  const story = readOptionalString(errors, 'collection', 'story_text', storyText.path, storyText.value)

  // 공개 시각은 필수다. 종료 시각이 없으면 상시다.
  const startsAt = readTimeString(itemField(item, 'starts_at'), item.starts_at)
  if (startsAt === undefined) {
    errors.push({ path: 'starts_at', message: 'collection.valid_from: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).' })
  } else if (!isIsoDateTime(startsAt)) {
    errors.push({ path: 'starts_at', message: `collection.valid_from: 시간대가 붙은 ISO 형식이어야 해요(받은 값: ${describeValue(startsAt)}).` })
  }
  const endsAt = readTimeString(itemField(item, 'ends_at'), item.ends_at)
  if (endsAt !== undefined && !isIsoDateTime(endsAt)) {
    errors.push({ path: 'ends_at', message: `collection.valid_until: 시간대가 붙은 ISO 형식이어야 해요(받은 값: ${describeValue(endsAt)}).` })
  } else if (isIsoDateTime(startsAt) && isIsoDateTime(endsAt) && Date.parse(endsAt) <= Date.parse(startsAt)) {
    errors.push({ path: 'ends_at', message: 'collection.valid_until: 종료 시각은 공개 시각보다 늦어야 해요.' })
  }

  const tribe = readOpsItemTribeId(item)
  let tribeId: string | null = null
  if (tribe === OPS_FIELD_UNKNOWN) {
    errors.push({ path: 'tribe_id', message: `collection.tribe_id: 트라이브 ID(UUID) 형식이 아니에요(받은 값: ${describeValue(itemField(item, 'tribe_id'))}).` })
  } else {
    tribeId = tribe
  }

  const rewardPoints = readCount(errors, 'collection', 'reward_points', resource.reward_points)
  const imageUrl = readOptionalString(errors, 'collection', 'image_url', 'resource.image_url', resource.image_url)

  // 연결 칸(§8.3): 연결로 채우면 그 ID이고, 아니면 `resource`에 직접 적은 값(UUID 형식)이다.
  let rewardBadgeId: string | null = null
  const linkedReward = linkedIds.reward_badge_id
  const scratch: Record<string, unknown> = {}
  if (fillLinkedId(scratch, errors, 'collection', 'reward_badge_id', resource.reward_badge_id, linkedReward)) {
    linkFields.push('reward_badge_id')
    rewardBadgeId = linkedReward as string
  } else if (!(isPresent(linkedReward) && linkedReward !== '') && isPresent(resource.reward_badge_id)) {
    const own = resource.reward_badge_id
    if (typeof own !== 'string' || !isUuid(own.trim())) {
      errors.push({ path: 'resource.reward_badge_id', message: `collection.reward_badge_id: 배지 ID(UUID) 형식이어야 해요(받은 값: ${describeValue(own)}).` })
    } else {
      rewardBadgeId = own.trim()
    }
  }

  if (errors.length > 0 || name === null || description === null || !isIsoDateTime(startsAt)) return { payload: null, errors, warnings, linkFields }

  const payload: CollectionLaunchRegisterPayload = {
    name,
    description,
    story_text: story,
    image_url: imageUrl,
    reward_points: rewardPoints ?? 0,
    reward_badge_id: rewardBadgeId,
    tribe_id: tribeId,
    valid_from: startsAt,
    valid_until: isIsoDateTime(endsAt) ? endsAt : null,
    is_active: true,
  }
  return { payload, errors, warnings, linkFields }
}

// ── 레시피 ──────────────────────────────────────────────────────────────────────────────────

/**
 * `recipe` 항목을 레시피 서버 함수의 입력으로 바꾼다(PRD §8.4 레시피 행).
 * - 공통 칸: `starts_at`(필수)은 `valid_from`으로, `ends_at`은 `valid_until`로 읽는다. `ends_at`이 없으면 칸을 넣지 않는다(상시).
 * - 글자 칸 `name`(필수)은 `copy` 먼저, 없으면 `resource`. `resource`의 `slots`(필수)·`reward_points`·`reward_badge_ids`는 값 그대로 넘긴다.
 * - 값의 형식(슬롯 개수·보상·시각 형식과 공개 시각이 미래인지)은 보지 않는다. `normalizeRecipePayload`가 현재 시각과 함께 본다.
 * - 연결로 채우는 칸이 없어 `linkFields`는 늘 빈 배열이다(`jam_badge` → `recipe` 쌍은 배지 쪽 칸이다, §8.3).
 */
export function toRecipeRegisterInput(item: OpsRegisterItem): RegisterInputResult<RecipeRegisterPayload> {
  const errors: RegisterInputIssue[] = []
  const warnings: RegisterInputIssue[] = []
  const linkFields: string[] = []

  if (item.kind !== RECIPE_KIND) {
    errors.push({ path: 'kind', message: `kind: ${RECIPE_KIND} 항목만 레시피로 바꿀 수 있어요(받은 값: ${describeValue(item.kind ?? undefined)}).` })
    return { payload: null, errors, warnings, linkFields }
  }

  const copy = readGroup(item, 'copy', errors)
  const resource = readGroup(item, 'resource', errors)
  warnUnreadKeys(warnings, 'copy', copy, RECIPE_COPY_KEYS, RECIPE_COMMON_KEYS, RECIPE_TOOL_KEYS)
  warnUnreadKeys(warnings, 'resource', resource, [...RECIPE_RESOURCE_KEYS, ...RECIPE_COPY_KEYS], RECIPE_COMMON_KEYS, RECIPE_TOOL_KEYS)

  const payload: RecipeRegisterPayload = {}

  const name = readText(copy, resource, 'name')
  if (name.value === undefined) errors.push({ path: name.path, message: 'recipe.name: 필수 항목이 없어요.' })
  else payload.name = name.value

  // 공개 시각은 필수다. 비워 두면 서버 함수가 「바로 공개」로 읽어 예약이 아니게 된다.
  const startsAt = readTimeString(itemField(item, 'starts_at'), item.starts_at)
  if (startsAt === undefined) errors.push({ path: 'starts_at', message: 'recipe.valid_from: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).' })
  else payload.valid_from = startsAt
  const endsAt = readTimeString(itemField(item, 'ends_at'), item.ends_at)
  if (endsAt !== undefined) payload.valid_until = endsAt

  if (!isPresent(resource.slots)) errors.push({ path: 'resource.slots', message: 'recipe.slots: 필수 항목이 없어요.' })
  else payload.slots = resource.slots
  if (isPresent(resource.reward_points)) payload.reward_points = resource.reward_points
  if (isPresent(resource.reward_badge_ids)) payload.reward_badge_ids = resource.reward_badge_ids

  if (errors.length > 0) return { payload: null, errors, warnings, linkFields }
  return { payload, errors, warnings, linkFields }
}

// ── 드랍 예약 ───────────────────────────────────────────────────────────────────────────────

/**
 * `drop_schedule` 항목을 드랍 예약 서버 함수의 입력으로 바꾼다(PRD §8.4 드랍 행).
 * - 공통 칸: `starts_at`(필수)은 `scheduled_at`으로 읽는다. 드랍은 놓은 뒤 내리지 않아 `ends_at`이 있으면 변환 오류다.
 * - 글자 칸 `title`(100자)은 `copy` 먼저, 없으면 `resource`. `resource`의 6개 키(`DROP_SCHEDULE_RESOURCE_KEYS`)는 값 그대로 넘긴다.
 * - 연결로 채우는 칸 `collection_ids`는 `resource` 몫 뒤에 `linkedIds.collection_ids`를 더하고 `linkFields`에 알린다(§8.3).
 *   대상이 아이템 직접 선택(`badge_ids`)이면 연결 그룹 사전 점검이 이미 막는다(`directSelectKey`).
 * - 값의 형식(시각 형식·정시·미래, 지점·아이템 방식, 개수 상한, 제목 길이)은 보지 않는다. `parseAmbientDropScheduleInput`이 현재 시각과 함께 본다.
 */
export function toDropScheduleRegisterInput(
  item: OpsRegisterItem,
  { linkedIds = {} }: { linkedIds?: DropLinkedIds } = {}
): RegisterInputResult<DropScheduleRegisterPayload> {
  const errors: RegisterInputIssue[] = []
  const warnings: RegisterInputIssue[] = []
  const linkFields: string[] = []

  if (item.kind !== DROP_KIND) {
    errors.push({ path: 'kind', message: `kind: ${DROP_KIND} 항목만 드랍 예약으로 바꿀 수 있어요(받은 값: ${describeValue(item.kind ?? undefined)}).` })
    return { payload: null, errors, warnings, linkFields }
  }

  const copy = readGroup(item, 'copy', errors)
  const resource = readGroup(item, 'resource', errors)
  warnUnreadKeys(warnings, 'copy', copy, DROP_COPY_KEYS, DROP_COMMON_KEYS, DROP_TOOL_KEYS)
  warnUnreadKeys(warnings, 'resource', resource, [...DROP_RESOURCE_KEYS, ...DROP_COPY_KEYS], DROP_COMMON_KEYS, DROP_TOOL_KEYS)

  const payload: DropScheduleRegisterPayload = {}

  // 놓을 시각은 필수다. 비어 있으면 서버 함수도 거절하지만, 변환이 먼저 어느 칸인지 알린다.
  const startsAt = readTimeString(itemField(item, 'starts_at'), item.starts_at)
  if (startsAt === undefined) errors.push({ path: 'starts_at', message: 'drop_schedule.scheduled_at: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).' })
  else payload.scheduled_at = startsAt
  const endsAt = readTimeString(itemField(item, 'ends_at'), item.ends_at)
  if (endsAt !== undefined) {
    errors.push({ path: 'ends_at', message: 'drop_schedule.ends_at: 드랍 일정은 놓은 뒤 내리지 않아서 종료 시각이 없어요. 종료 시각을 빼 주세요.' })
  }

  const title = readText(copy, resource, 'title')
  if (title.value !== undefined) payload.title = title.value

  for (const key of DROP_SCHEDULE_RESOURCE_KEYS) {
    if (key === 'collection_ids') continue
    if (isPresent(resource[key])) payload[key] = resource[key]
  }
  if (appendLinkedIds(payload, 'collection_ids', resource.collection_ids, linkedIds.collection_ids)) linkFields.push('collection_ids')

  if (errors.length > 0) return { payload: null, errors, warnings, linkFields }
  return { payload, errors, warnings, linkFields }
}

// ── 등록 전 DB 검사용 사본 ──────────────────────────────────────────────────────────────────

/**
 * 등록 전 DB 검사(`runHomeFeedDbChecks`·`runMissionDbChecks`·`runCollectionDbChecks`)에 넘길 사본에서 연결로 채운 ID를 뺀다(결정 8).
 * 같은 실행에서 만들어질 ID라 존재 확인을 건너뛰어야 하기 때문이다. 단일 칸(`mission_id`·`item_book_id`·`reward_badge_id`)은 null로 비우고,
 * 배열 칸(`badge_ids`·`reward_badge_ids`)은 연결 몫(`linkedIds`)만 빼고 `resource` 몫은 남긴다. 원본 `payload`는 바꾸지 않는다.
 */
export function withoutLinkedFields<P extends object>(
  payload: P,
  linkFields: readonly string[],
  linkedIds: CardLinkedIds | MissionLinkedIds | CollectionLaunchLinkedIds
): P {
  const copy = { ...payload } as Record<string, unknown>
  const linked: Record<string, unknown> = { ...linkedIds }
  for (const field of linkFields) {
    const current = copy[field]
    if (Array.isArray(current)) {
      const linkedList = linked[field]
      const drop = new Set((Array.isArray(linkedList) ? linkedList : []).map((value) => String(value).toLowerCase()))
      copy[field] = current.filter((value) => !drop.has(String(value).toLowerCase()))
    } else {
      copy[field] = null
    }
  }
  return copy as P
}
