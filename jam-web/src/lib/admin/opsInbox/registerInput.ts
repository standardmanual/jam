/**
 * 운영 항목 → 카드·미션 등록 형식 변환 (티켓 20261002_1028, 상위 20260930_1500 ②-2b).
 *
 * 승인된 운영 항목(`ops_bundle_items`, 수정본 우선)의 `home_feed_card`·`mission`을 `today_cards`·`missions` insert 값으로 바꾼다.
 * 읽는 규칙은 `docs/specs/prd/ops-tool/PRD.md` §8.4이고, 검사는 등록 스크립트가 쓰는 `registerChecks/homeFeedFields.ts`의
 * `validateCard`와 `registerChecks/missionFields.ts`의 `validateMission`을 그대로 부른다. DB에 접근하지 않는다(쓰기는 ③·④·⑥).
 *
 * 결과는 `{ payload, errors, warnings, linkFields }`다. 오류가 하나라도 있으면 `payload`는 null이다.
 * - 오류·경고 한 건은 `{ path, message }`다. `message`는 검사 문장 그대로(`card.title: …`)이고 `path`는 운영 항목 경로
 *   (`copy.title`·`resource.template_type`·`starts_at`·`shape` 등)다. 화면 표기는 ⑤가 정한다(결정 7).
 * - `linkFields`: 연결 그룹(§8.3)이 채운 칸 이름(`mission_id`·`badge_ids`·`item_book_id`·`reward_badge_ids`)이다.
 *   등록 전 DB 검사에는 `withoutLinkedFields`로 그 칸을 뺀 사본을 넘긴다. 같은 실행에서 만들어질 ID라 존재 확인을 건너뛴다
 *   (생성 순서가 존재를 보장한다, 결정 8).
 *
 * 이미지는 보지 않는다. `image_source`는 null이고(결정 1) 대표 이미지 주소(`resource.cover_image_url`·`resource.image_url`)가
 * 없으면 null로 둔다. 서버·화면이 함께 읽는 순수 모듈이라 서버 전용 모듈과 Supabase를 가져오지 않는다.
 */
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { kstDateKey } from '@/lib/admin/opsInbox/labels'
import { OPS_HOME_FEED_CARD_KIND } from '@/lib/admin/opsInbox/constants'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { kstDayBoundsIso } from '@/lib/admin/today-calendar'
import { describeValue, isIsoDateTime, isPresent, visibleLength } from '@/lib/admin/registerChecks/bundleRules'
import { buildTodayCardInsertPayload, validateCard } from '@/lib/admin/registerChecks/homeFeedFields'
import type { HomeFeedCardInput } from '@/lib/admin/registerChecks/homeFeedFields'
import { buildMissionInsertPayload, validateMission } from '@/lib/admin/registerChecks/missionFields'
import type { MissionInput } from '@/lib/admin/registerChecks/missionFields'
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
  prefix: 'card' | 'mission',
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
  prefix: 'card' | 'mission',
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

// ── 등록 전 DB 검사용 사본 ──────────────────────────────────────────────────────────────────

/**
 * 등록 전 DB 검사(`runHomeFeedDbChecks`·`runMissionDbChecks`)에 넘길 사본에서 연결로 채운 ID를 뺀다(결정 8).
 * 같은 실행에서 만들어질 ID라 존재 확인을 건너뛰어야 하기 때문이다. 단일 칸(`mission_id`·`item_book_id`)은 null로 비우고,
 * 배열 칸(`badge_ids`·`reward_badge_ids`)은 연결 몫(`linkedIds`)만 빼고 `resource` 몫은 남긴다. 원본 `payload`는 바꾸지 않는다.
 */
export function withoutLinkedFields<P extends object>(
  payload: P,
  linkFields: readonly string[],
  linkedIds: CardLinkedIds | MissionLinkedIds
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
