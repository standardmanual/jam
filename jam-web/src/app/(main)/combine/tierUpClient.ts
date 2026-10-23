/**
 * 등급 올리기 화면의 클라이언트 쪽 계약과 순수 도우미 (티켓 20261022_2119 3회, 운영 로직 8.4절)
 *
 * 서버 규칙은 `lib/combine/tierUp.ts`(2회)가 갖고 있고 그 파일은 Supabase를 읽는 서버 전용 모듈이다. 이 파일은 그 모듈을 값으로도 타입으로도
 * 가져오지 않는다. 요청·응답 모양은 티켓 「2회 규칙 명세」를 보고 여기서 직접 선언한다(서버 파일과 이름이 겹치지 않게 파일명도 다르다).
 *
 * 굴림과 확률은 서버에서만 정한다. 이 파일에는 확률 숫자가 없다(UX 라이팅 §3.3) — 화면은 «확률 안내» 링크만 둔다.
 */
import { getRarityLabel } from '@ds/components/cards/RarityBadge'
import { d, t } from '@/lib/i18n'
import { isLockedItemBody } from '@/lib/inventory/locked-item-block'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

/** 등급 올리기 한 번에 넣는 재료 개수 — 서버 규칙과 같다 */
export const TIER_UP_MATERIAL_COUNT = 5

/** 재료가 될 수 있는 등급(낮은 순). Mystic과 등급 없는 배지는 재료가 아니다 */
export const TIER_UP_MATERIAL_RARITIES = ['common', 'rare', 'epic'] as const
export type TierUpMaterialRarity = (typeof TIER_UP_MATERIAL_RARITIES)[number]

type Rarity = TierUpMaterialRarity | 'mystic'
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, mystic: 3 }

export const TIER_UP_ENDPOINT = '/api/combine/tier-up'

/** 받지 않은 결과가 남아 있어 거절될 때 응답이 싣는 `code`·`reason` 값(믹스와 같다) */
export const TIER_UP_PENDING_RESULTS_EXIST = 'pending_results_exist'

/** `POST /api/combine/tier-up` 본문 */
export interface TierUpRequest {
  itemIds: string[]
}

/** 응답의 결과 배지 한 줄 — 잠긴 것은 `locked`가 참이고 id·이름이 빈 문자열이다. `imageUrl`은 2회 응답이 싣는다(없어도 깨지지 않는다) */
export interface TierUpResultBadge {
  id: string
  name: string
  rarity?: Rarity | null
  imageUrl?: string | null
  locked?: boolean
  unlockRequired?: number
}

export interface TierUpSuccessResponse {
  success: true
  path: 'tier_up'
  materialRarity: TierUpMaterialRarity
  resultBadges: TierUpResultBadge[]
  /** `pending`이면 인벤토리 빈칸이 모자라 결과를 받지 않은 상태로 남겼다 */
  resultStatus: 'granted' | 'pending'
  pendingCount?: number
  freeSlots?: number
  message?: string
}

export interface TierUpFailureResponse {
  success: false
  reason: string
  message?: string
  code?: string
}

export type TierUpResponse = TierUpSuccessResponse | TierUpFailureResponse

/** 재료 후보로 쓰는 인벤토리 개체의 최소 모양 — `InventoryItemWithBadge`가 그대로 들어맞는다 */
export interface TierUpMaterial {
  id: string
  badge: { name: string; image_url: string | null; rarity: string | null }
}

export interface TierUpGroup<T extends TierUpMaterial = TierUpMaterial> {
  rarity: TierUpMaterialRarity
  items: T[]
}

function isMaterialRarity(rarity: string | null | undefined): rarity is TierUpMaterialRarity {
  return (TIER_UP_MATERIAL_RARITIES as readonly string[]).includes(rarity ?? '')
}

/** 순수 — 내 개체를 Common·Rare·Epic 순으로 묶는다. Mystic과 등급 없는 개체는 빼고, 개체가 없는 등급은 묶음을 만들지 않는다. */
export function groupTierUpMaterials<T extends TierUpMaterial>(items: readonly T[]): TierUpGroup<T>[] {
  return TIER_UP_MATERIAL_RARITIES.map((rarity) => ({
    rarity,
    items: items.filter((item) => item.badge.rarity === rarity),
  })).filter((group) => group.items.length > 0)
}

/** 순수 — 5개 이상 가진 등급이 있는가. 없으면 지금은 등급 올리기를 할 수 없다 */
export function hasEnoughTierUpGroup(groups: readonly TierUpGroup[]): boolean {
  return groups.some((group) => group.items.length >= TIER_UP_MATERIAL_COUNT)
}

/** 담은 칸 — 칸마다 인벤토리 개체 id 하나, 비었으면 null */
export type TierUpSlots = (string | null)[]

export function emptyTierUpSlots(): TierUpSlots {
  return Array.from({ length: TIER_UP_MATERIAL_COUNT }, () => null)
}

/**
 * 순수 — 담은 칸 중 지금 목록(`items`)에서 찾을 수 있는 개체만 칸 순서대로 돌려준다. 새로고침으로 사라진 개체는 빈 칸으로 본다
 * (유령 칸을 만들지 않는다).
 */
export function resolveTierUpSlots<T extends { id: string }>(slots: TierUpSlots, items: readonly T[]): (T | null)[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  return Array.from({ length: TIER_UP_MATERIAL_COUNT }, (_, index) => {
    const id = slots[index]
    return id ? (byId.get(id) ?? null) : null
  })
}

/** 순수 — `index` 칸에 개체를 담는다. 같은 개체가 다른 칸에 있으면 그쪽에서 뺀다 */
export function fillTierUpSlot(slots: TierUpSlots, index: number, itemId: string): TierUpSlots {
  const next = slots.map((id) => (id === itemId ? null : id))
  next[index] = itemId
  return next
}

export function removeTierUpSlot(slots: TierUpSlots, index: number): TierUpSlots {
  const next = [...slots]
  next[index] = null
  return next
}

/** 순수 — `from` 칸부터 한 바퀴 돌며 처음 만나는 빈 칸. 빈 칸이 없으면 null(5칸이 모두 찼다) */
export function nextEmptyTierUpSlot(slots: TierUpSlots, from: number): number | null {
  for (let step = 0; step < TIER_UP_MATERIAL_COUNT; step += 1) {
    const index = (from + step) % TIER_UP_MATERIAL_COUNT
    if (!slots[index]) return index
  }
  return null
}

/** 순수 — 담은 재료의 등급. 첫 재료를 담으면 이 등급으로 고정된다. 하나도 없으면 null */
export function lockedTierUpRarity(filled: readonly (TierUpMaterial | null)[]): TierUpMaterialRarity | null {
  const first = filled.find((item): item is TierUpMaterial => item !== null)
  return first && isMaterialRarity(first.badge.rarity) ? first.badge.rarity : null
}

/** 순수 — 제출할 수 있으면 개체 id 5개(칸 순서), 아니면 null. 5개가 모두 다르고 같은 재료 등급이어야 한다 */
export function tierUpSubmitIds(filled: readonly (TierUpMaterial | null)[]): string[] | null {
  const present = filled.filter((item): item is TierUpMaterial => item !== null)
  if (present.length !== TIER_UP_MATERIAL_COUNT) return null
  if (new Set(present.map((item) => item.id)).size !== TIER_UP_MATERIAL_COUNT) return null
  const rarity = present[0].badge.rarity
  if (!isMaterialRarity(rarity)) return null
  return present.every((item) => item.badge.rarity === rarity) ? present.map((item) => item.id) : null
}

/** 재료 시트 셀 — `inactive`는 이유 줄이 대신 말하는 비활성(라벨 없음), `used`는 이미 담은 개체(«사용 중») */
export interface TierUpSheetCell<T extends TierUpMaterial = TierUpMaterial> {
  item: T
  state: 'active' | 'used' | 'inactive'
}

export type TierUpSheetView<T extends TierUpMaterial = TierUpMaterial> =
  /** 넣을 수 있는 아이템 배지가 하나도 없다 */
  | { kind: 'empty' }
  /** 첫 재료를 담은 뒤 — 그 등급의 셀만 한 묶음으로 보인다 */
  | { kind: 'locked'; rarity: TierUpMaterialRarity; cells: TierUpSheetCell<T>[] }
  /** 아직 아무것도 담지 않음 — 등급 묶음 */
  | { kind: 'groups'; groups: { rarity: TierUpMaterialRarity; count: number; enough: boolean; cells: TierUpSheetCell<T>[] }[] }

/** 순수 — 재료 시트에 그릴 모양. 5개 미만인 묶음은 셀이 모두 비활성이다 */
export function buildTierUpSheet<T extends TierUpMaterial>(
  groups: readonly TierUpGroup<T>[],
  filled: readonly (T | null)[],
): TierUpSheetView<T> {
  if (groups.length === 0) return { kind: 'empty' }
  const usedIds = new Set(filled.filter((item): item is T => item !== null).map((item) => item.id))
  const locked = lockedTierUpRarity(filled)
  const lockedGroup = locked ? groups.find((group) => group.rarity === locked) : undefined
  if (locked && lockedGroup) {
    return {
      kind: 'locked',
      rarity: locked,
      cells: lockedGroup.items.map((item) => ({ item, state: usedIds.has(item.id) ? 'used' : 'active' })),
    }
  }
  return {
    kind: 'groups',
    groups: groups.map((group) => {
      const enough = group.items.length >= TIER_UP_MATERIAL_COUNT
      return {
        rarity: group.rarity,
        count: group.items.length,
        enough,
        cells: group.items.map((item) => ({ item, state: enough ? 'active' : 'inactive' })),
      }
    }),
  }
}

/** 순수 — 시트에서 지금 담을 수 있는(활성) 개체 id. 담기 핸들러가 한 번 더 걸러 다른 등급이 섞인 제출을 만들지 않는다 */
export function pickableTierUpIds(view: TierUpSheetView): Set<string> {
  const cells =
    view.kind === 'locked' ? view.cells : view.kind === 'groups' ? view.groups.flatMap((group) => group.cells) : []
  return new Set(cells.filter((cell) => cell.state === 'active').map((cell) => cell.item.id))
}

/** 순수 — 「지금은 Rare 아이템 배지만 넣을 수 있어요」. 등급 글자는 색이 아니라 글자로 전한다 */
export function tierUpRarityNote(rarity: TierUpMaterialRarity): string {
  return t(d.combine.tierUp.rarityOnly, { rarity: getRarityLabel(rarity) ?? '' })
}

/**
 * 순수 — 바로 지급된 결과의 오버레이 한 줄. 재료 등급과 받은 등급을 비교해 윗등급일 때만 «윗등급이 나왔어요!»를 쓰고, 같은 등급이면
 * «윗등급은 운이 좋을 때 나와요»를 덧붙인다. 응답에 등급이 없어 비교할 수 없으면 등급을 지어내지 않는다.
 */
export function tierUpResultMessage(
  materialRarity: string | null | undefined,
  resultBadges: readonly { rarity?: string | null }[],
): string {
  const resultRarity = resultBadges[0]?.rarity
  const isRarity = (value: string | null | undefined): value is Rarity => !!value && value in RARITY_RANK
  if (isRarity(materialRarity) && isRarity(resultRarity)) {
    const label = getRarityLabel(resultRarity) ?? ''
    if (RARITY_RANK[resultRarity] > RARITY_RANK[materialRarity]) return t(d.combine.tierUp.resultUpgraded, { rarity: label })
    if (resultRarity === materialRarity) return t(d.combine.tierUp.resultSame, { rarity: label })
  }
  return d.combine.tierUp.resultUnknown
}

/** 소각 전 거절을 화면이 처리하는 방법 — 담은 칸은 기본으로 그대로 둔다 */
export interface TierUpRejection {
  message: string
  /** 안내(info)는 사용자 잘못이 아닌 «지금은 안 되는 까닭», 오류(error)는 알려진 거절이 아닌 경우 */
  tone: 'info' | 'error'
  /** 담은 칸을 비운다 */
  clearSlots: boolean
  /** 받지 않은 결과 개수를 서버에서 다시 읽는다 */
  refreshPending: boolean
  /** `router.refresh()`로 개체 목록을 다시 받는다 */
  refresh: boolean
}

function textOf(body: unknown, key: 'message' | 'error'): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : undefined
}

/**
 * 순수 — 성공이 아닌 응답을 토스트 문구와 후속 동작으로 바꾼다. 서버가 `message`를 주면 그것을 먼저 쓰고(ADR 0001) 없으면 `reason`으로 고른다.
 * 소각 앞의 거절은 모두 «넣은 재료는 그대로 있어요»를 말한다. 알려진 거절이 아닌 응답(모르는 reason, 5xx, JSON이 아님)만 오류로 알린다.
 */
export function tierUpRejection(status: number, body: unknown): TierUpRejection {
  const base = { tone: 'info', clearSlots: false, refreshPending: false, refresh: false } as const
  const message = textOf(body, 'message')
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown; code?: unknown }).reason : undefined
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined

  if (status === 403 && code === USER_SUSPENDED_CODE) {
    return { ...base, message: textOf(body, 'error') ?? d.suspension.combineBlocked }
  }
  if (status === 409 && (code === TIER_UP_PENDING_RESULTS_EXIST || reason === TIER_UP_PENDING_RESULTS_EXIST)) {
    return { ...base, refreshPending: true, message: message ?? d.combine.pendingResultsExist }
  }
  if (isLockedItemBody(status, body)) {
    return { ...base, message: message ?? d.lockedItem.combine }
  }
  switch (reason) {
    case 'items_not_found':
      return { ...base, clearSlots: true, refresh: true, message: message ?? d.combine.itemsNotFound }
    case 'no_candidate':
      return { ...base, message: message ?? d.combine.tierUp.noCandidate }
    case 'invalid_materials':
      return { ...base, message: message ?? d.combine.tierUp.invalidMaterials }
    case 'invalid_count':
      return { ...base, message: message ?? d.combine.tierUp.invalidCount }
    default:
      return { ...base, tone: 'error', refresh: true, message: message ?? textOf(body, 'error') ?? d.combine.genericFail }
  }
}
