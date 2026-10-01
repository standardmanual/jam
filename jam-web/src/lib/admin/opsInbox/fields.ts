/**
 * 운영 묶음 항목의 칸 읽기 (티켓 20261001_1152, 순수 함수).
 *
 * 1502 신호(겹침·단조로운 흐름·트라이브 거르기·「이미지 제작 필요」·「색 대기」·「에이전트가 뺀 항목」)와 화면이 항목의 카드 칸을
 * 읽는 **유일한 곳**이다. 제출 원본(`original`)은 자기 신고 JSON이라 모양을 믿지 않으므로, 값이 틀리면 `OPS_FIELD_UNKNOWN`
 * (「모름」)으로 돌려준다. 수정본(`edited`)이 있으면 그 값을 먼저 읽는다(`itemView.itemField`).
 *
 * 값이 없을 때와 형식이 틀릴 때 읽는 값은 칸마다 정해져 있다(`docs/specs/prd/ops-tool/PRD.md` §3.1).
 * - `shape`·`exposure_tags`: 없어도 틀려도 「모름」(필수 칸이라 없는 것도 정보가 없는 것이다)
 * - `tribe_id`: 없으면 `null`, 틀리면 「모름」
 * - `color_pending`: 없으면 `false`, 틀리면 「모름」
 * - `excluded_items`(묶음): 없으면 `[]`, 배열이 아니거나 원소 하나라도 틀리면 목록 전체가 「모름」
 * 형식 판정은 `validate.ts`와 같은 원천을 쓴다(오류 없는 값만 읽는다). 트라이브가 실제로 있는지는 여기서 보지 않는다 — 제출·수정 때
 * `tribes` 조회(`tribes.ts`)로 이미 확인했다.
 *
 * `segment`(옛 대상 칸)는 읽지 않는다. 대상은 `exposure_tags`다.
 */
import type { Json } from '@/types/database.generated'
import { OPS_HOME_FEED_CARD_KIND, type OpsExcludedItemStage, type OpsItemKind } from '@/lib/admin/opsInbox/constants'
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { validateExcludedItems, validateExposureTags } from '@/lib/admin/opsInbox/validate'
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
