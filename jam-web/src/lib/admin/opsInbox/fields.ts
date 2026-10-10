/**
 * 운영 묶음 항목의 칸 읽기 (티켓 20261001_1152, 순수 함수).
 *
 * 1502 신호(겹침·단조로운 흐름·트라이브 거르기·「이미지 제작 필요」·「색 대기」·「에이전트가 뺀 항목」)와 화면이 항목의 카드 칸을
 * 읽는 **유일한 곳**이다. 제출 원본(`original`)은 자기 신고 JSON이라 모양을 믿지 않으므로, 값이 틀리면 `OPS_FIELD_UNKNOWN`
 * (「모름」)으로 돌려준다. 수정본(`edited`)이 있으면 그 값을 먼저 읽는다(`itemView.itemField`).
 *
 * 값이 없을 때와 형식이 틀릴 때 읽는 값은 칸마다 정해져 있다(`docs/service/prd/ops-tool/PRD.md` §3.1).
 * - `shape`·`exposure_tags`: 없어도 틀려도 「모름」(필수 칸이라 없는 것도 정보가 없는 것이다)
 * - `tribe_id`: 없으면 `null`, 틀리면 「모름」
 * - `color_pending`: 없으면 `false`, 틀리면 「모름」
 * - `pattern_no`: 없으면 `null`, 형식(`P01`)이 틀리면 「모름」(티켓 20261007_1745. 사전에 있는 번호인지는 여기서 보지 않는다)
 * - `knobs.place_category`: `knobs`나 그 키가 없으면 `null`, 문자열 배열이 아니면 「모름」(카테고리가 실제로 있는지는 여기서 보지 않는다)
 * - `excluded_items`(묶음): 없으면 `[]`, 배열이 아니거나 원소 하나라도 틀리면 목록 전체가 「모름」
 * - `resource.pattern`(`kind`가 `pattern_proposal`인 항목): 다른 종류는 `null`, 검사 오류가 하나라도 있으면 「모름」, 아니면 패턴 제안 객체
 *   (티켓 20261007_1746. 정의되지 않은 키는 버리고, 없는 선택 칸은 사전 기본값으로 읽는다)
 * 형식 판정은 `validate.ts`와 같은 원천을 쓴다(오류 없는 값만 읽는다). 트라이브가 실제로 있는지는 여기서 보지 않는다 — 제출·수정 때
 * `tribes` 조회(`tribes.ts`)로 이미 확인했다.
 *
 * `segment`(옛 대상 칸)는 읽지 않는다. 대상은 `exposure_tags`다.
 */
import type { Json } from '@/types/database.generated'
import { OPS_HOME_FEED_CARD_KIND, type OpsExcludedItemStage, type OpsItemKind } from '@/lib/admin/opsInbox/constants'
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import {
  normalizeOpsPatternNo,
  OPS_PATTERN_KNOB_VALUE_KEYS,
  validateExcludedItems,
  validateExposureTags,
  validateOpsPatternProposal,
  validateOpsPlaceCategory,
} from '@/lib/admin/opsInbox/validate'
import {
  OPS_PATTERN_KNOB_KEYS,
  type OpsPatternKnobKey,
  type OpsPatternSampleRole,
} from '@/lib/admin/opsPatterns/constants'
import { isUuid } from '@/lib/admin/uuid'
import { isCardShape, type CardShape } from '@/lib/today/shape'

/** 「모름」 — 칸이 없거나 형식이 틀려 읽을 수 없는 값. */
export const OPS_FIELD_UNKNOWN = 'unknown' as const

export type OpsFieldUnknown = typeof OPS_FIELD_UNKNOWN

/** 에이전트가 뺀 항목 하나. `reason`은 앞뒤 공백을 뗀 한 줄이다. */
export interface OpsExcludedItem {
  reason: string
  itemKey: string | null
  kind: OpsItemKind | null
  stage: OpsExcludedItemStage | null
}

/** 패턴 제안 항목이 제안하는 패턴의 샘플 하나. 이름은 앞뒤 공백을 뗐고 `impl`은 빈 값일 수 있다. */
export interface OpsPatternProposalSample {
  no: number
  name: string
  role: OpsPatternSampleRole
  impl: string
}

/** 패턴 제안이 쓰는 카드 모양 하나. `note`는 빈 값일 수 있다. */
export interface OpsPatternProposalCardShape {
  shape: CardShape
  note: string
}

/** 손잡이 5종. 조건·장소·시간·보상은 `{ open, closed }`, 트라이브는 `{ rule, example }`이고 값은 모두 앞뒤 공백을 뗀 비어 있지 않은 문자열이다. */
export interface OpsPatternProposalKnobs {
  condition: { open: string; closed: string }
  place: { open: string; closed: string }
  time: { open: string; closed: string }
  reward: { open: string; closed: string }
  tribe: { rule: string; example: string }
}

/** 패턴 제안 항목의 내용. 칸 이름은 패턴 사전 레코드(`OpsPatternRecord`)와 같고, 승인 때 사전에 넣을 값이다. */
export interface OpsPatternProposal {
  name: string
  principle: string
  userExperience: string
  menus: string[]
  samples: OpsPatternProposalSample[]
  cardShapes: OpsPatternProposalCardShape[]
  knobs: OpsPatternProposalKnobs
  pitfalls: string
}

/** 홈피드 카드 종류인지(카드 모양·노출 대상이 필수인 종류). */
export function isOpsHomeFeedCard(kind: unknown): boolean {
  return kind === OPS_HOME_FEED_CARD_KIND
}

/** 카드 모양. 허용값이면 그 값, 없거나 틀리면 「모름」. */
export function readOpsItemShape(item: ViewableItem): CardShape | OpsFieldUnknown {
  const value = itemField(item, 'shape')
  return isCardShape(value) ? value : OPS_FIELD_UNKNOWN
}

/** 노출 대상 태그. 형식이 맞으면 태그 배열, 없거나 틀리면 「모름」. */
export function readOpsItemExposureTags(item: ViewableItem): string[] | OpsFieldUnknown {
  const value = itemField(item, 'exposure_tags')
  return validateExposureTags(value, 'exposure_tags').length === 0 ? [...(value as string[])] : OPS_FIELD_UNKNOWN
}

/** 트라이브 ID. 없으면 `null`, UUID 형식이 아니면 「모름」. */
export function readOpsItemTribeId(item: ViewableItem): string | null | OpsFieldUnknown {
  const value = itemField(item, 'tribe_id')
  if (value === undefined || value === null) return null
  return typeof value === 'string' && isUuid(value) ? value : OPS_FIELD_UNKNOWN
}

/** 「색 대기」 여부. 없으면 `false`, 불리언이 아니면 「모름」. */
export function readOpsItemColorPending(item: ViewableItem): boolean | OpsFieldUnknown {
  const value = itemField(item, 'color_pending')
  if (value === undefined || value === null) return false
  return typeof value === 'boolean' ? value : OPS_FIELD_UNKNOWN
}

/** 패턴 번호. 없으면 `null`, `P01` 형식이 아니면(숫자·`P-07` 포함) 「모름」. 앞뒤 공백은 뗀다. */
export function readOpsItemPatternNo(item: ViewableItem): string | null | OpsFieldUnknown {
  const value = itemField(item, 'pattern_no')
  if (value === undefined || value === null) return null
  return normalizeOpsPatternNo(value) ?? OPS_FIELD_UNKNOWN
}

/**
 * 지점 카테고리(`knobs.place_category`). `knobs`가 객체가 아니거나 키가 없으면 `null`, 문자열 배열이 아니면 「모름」이다. 카테고리가
 * 실제로 있는지는 DB를 불러야 알 수 있어 여기서 보지 않는다(순수 함수).
 */
export function readOpsItemPlaceCategories(item: ViewableItem): string[] | null | OpsFieldUnknown {
  const knobs = asRecord(itemField(item, 'knobs'))
  const value = knobs?.place_category
  if (value === undefined || value === null) return null
  return validateOpsPlaceCategory(knobs, 'knobs').length === 0 ? [...(value as string[])] : OPS_FIELD_UNKNOWN
}

/** 뺀 항목 목록 값 하나를 읽는다. 없으면 `[]`, 배열이 아니거나 원소 하나라도 틀리면 「모름」. */
export function readExcludedItems(value: unknown): OpsExcludedItem[] | OpsFieldUnknown {
  if (value === undefined || value === null) return []
  if (validateExcludedItems(value).length > 0) return OPS_FIELD_UNKNOWN
  return (value as Array<Record<string, unknown>>).map((entry) => ({
    reason: (entry.reason as string).trim(),
    itemKey: typeof entry.item_key === 'string' ? entry.item_key : null,
    kind: typeof entry.kind === 'string' ? (entry.kind as OpsItemKind) : null,
    stage: typeof entry.stage === 'string' ? (entry.stage as OpsExcludedItemStage) : null,
  }))
}

/** 묶음 제출 원본(`ops_bundles.raw`)의 뺀 항목. 원본이 객체가 아니면 `[]`다. */
export function readBundleExcludedItems(raw: Json | null | undefined): OpsExcludedItem[] | OpsFieldUnknown {
  const record = asRecord(raw)
  return record ? readExcludedItems(record.excluded_items) : []
}

/**
 * 패턴 제안 항목의 내용(`resource.pattern`). `kind`가 `pattern_proposal`이 아니면 `null`이다. 종류가 맞으면 `validateOpsPatternProposal`을
 * 그대로 돌려 오류가 하나라도 있으면 「모름」, 없으면 객체다 — 그래서 「검사 통과 = 모름이 아님」이 늘 성립한다. 문자열은 앞뒤 공백을 떼고,
 * 없는 선택 칸은 사전 기본값(`menus`·`samples`·`cardShapes`는 `[]`, `pitfalls`는 `''`, 샘플 `impl`·카드 모양 `note`는 `''`)으로 읽는다.
 * 정의되지 않은 키는 버린다.
 */
export function readOpsPatternProposal(item: ViewableItem): OpsPatternProposal | null | OpsFieldUnknown {
  if (itemField(item, 'kind') !== 'pattern_proposal') return null
  const resource = itemField(item, 'resource')
  if (validateOpsPatternProposal(resource, 'item').length > 0) return OPS_FIELD_UNKNOWN
  const pattern = (resource as { pattern: Record<string, unknown> }).pattern
  const text = (value: unknown) => (value as string).trim()
  const list = (value: unknown) => (Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [])
  const knobs = pattern.knobs as Record<OpsPatternKnobKey, Record<string, string>>

  const readKnobs = Object.fromEntries(
    OPS_PATTERN_KNOB_KEYS.map((key) => {
      const [first, second] = OPS_PATTERN_KNOB_VALUE_KEYS[key]
      return [key, { [first]: text(knobs[key][first]), [second]: text(knobs[key][second]) }]
    })
  ) as unknown as OpsPatternProposalKnobs

  return {
    name: text(pattern.name),
    principle: text(pattern.principle),
    userExperience: text(pattern.user_experience),
    menus: Array.isArray(pattern.menus) ? (pattern.menus as string[]).map(text) : [],
    samples: list(pattern.samples).map((sample) => ({
      no: sample.no as number,
      name: text(sample.name),
      role: sample.role as OpsPatternSampleRole,
      impl: typeof sample.impl === 'string' ? sample.impl.trim() : '',
    })),
    cardShapes: list(pattern.card_shapes).map((entry) => ({
      shape: entry.shape as CardShape,
      note: typeof entry.note === 'string' ? entry.note.trim() : '',
    })),
    knobs: readKnobs,
    pitfalls: typeof pattern.pitfalls === 'string' ? pattern.pitfalls.trim() : '',
  }
}
