/**
 * 미션 보상 배지의 숨김·잠김 가림 (티켓 20261019_1317 2회, 운영 로직 7.3절·10.3절)
 *
 * 미션 보상은 받기 전에 화면에 보이므로 두 가지 배지는 이름·그림·id를 내리지 않는다.
 *  - 숨김 배지(`badges.is_hidden`): 이름·그림·id·등급·개수 어디에도 내리지 않는다.
 *  - 잠김으로 만든 아이템 배지(`badges.always_locked`): 열기 전에는 이름·그림·id를 내리지 않고 **등급만** 보인다.
 * 미션 상세와 미션 목록 서버 페이지가 같은 함수를 쓴다 — 잠김 판정의 단일 출처다.
 *
 * 순수 함수다. 서버 의존이 없어 클라이언트가 가져와도 안전하다.
 */
import type { BadgeRarity } from '@/types/database'

/** 보상 배지를 읽은 행. 숨김·잠김 칸이 없으면(옛 모양) 열린 배지로 본다 */
export interface RewardBadgeSourceRow {
  id: string
  name: string
  /** 목록 화면은 그림을 쓰지 않아 읽지 않는다 */
  image_url?: string | null
  rarity: BadgeRarity | null
  is_hidden?: boolean | null
  always_locked?: boolean | null
}

/** 화면에 이름·그림을 보여도 되는 열린 보상 배지 */
export type OpenRewardBadge<R extends RewardBadgeSourceRow = RewardBadgeSourceRow> = Pick<R, 'id' | 'name' | 'image_url' | 'rarity'>

export interface SplitRewardBadgesResult<R extends RewardBadgeSourceRow = RewardBadgeSourceRow> {
  /** 열린 보상 행 — 이름·그림·id·등급만 싣는다(숨김·잠김 칸은 싣지 않는다) */
  open: OpenRewardBadge<R>[]
  /** 잠긴 보상의 등급 목록(`ids` 순서). 등급이 없는 배지(무한레벨형)는 null이다. 숨김 배지는 들어가지 않는다 */
  lockedRarities: (BadgeRarity | null)[]
  /** 잠긴 보상 배지 id → 등급. 목록 화면이 미션마다 `lockedRaritiesOf`로 고를 때 쓴다 */
  lockedRarityById: ReadonlyMap<string, BadgeRarity | null>
  /** 미션 행의 `reward_badge_ids`에서 빼야 할 id(숨김 + 잠김). 읽기에 실패했으면 `ids` 전부 */
  concealedIds: ReadonlySet<string>
}

/**
 * 보상 배지 행을 «열린 보상», «잠긴 보상 등급», «가릴 id»로 나눈다.
 *
 * `ids`는 미션이 가리키는 보상 배지 id 전부(읽지 못한 행도 포함). `readFailed`는 배지 조회가 실패했음을 뜻한다 —
 * 어느 배지가 숨김·잠김인지 모르므로 모든 id를 가리고 아무것도 내리지 않는다(기존 숨김 처리와 같은 방향).
 * 삭제되어 조회에서 빠진 id는 가릴 필요가 없다(내릴 이름이 없다). 숨김이면서 잠김인 배지는 숨김이 이긴다 — 등급도 내리지 않는다.
 */
export function splitRewardBadges<R extends RewardBadgeSourceRow>(
  rows: readonly R[],
  ids: readonly string[],
  readFailed: boolean
): SplitRewardBadgesResult<R> {
  if (readFailed) {
    return { open: [], lockedRarities: [], lockedRarityById: new Map(), concealedIds: new Set(ids) }
  }

  const open: OpenRewardBadge<R>[] = []
  const lockedRarityById = new Map<string, BadgeRarity | null>()
  const concealedIds = new Set<string>()
  for (const row of rows) {
    if (row.is_hidden === true) {
      concealedIds.add(row.id)
    } else if (row.always_locked === true) {
      concealedIds.add(row.id)
      lockedRarityById.set(row.id, row.rarity ?? null)
    } else {
      open.push({ id: row.id, name: row.name, image_url: row.image_url, rarity: row.rarity } as OpenRewardBadge<R>)
    }
  }
  return { open, lockedRarities: lockedRaritiesOf(ids, lockedRarityById), lockedRarityById, concealedIds }
}

/** 미션의 보상 배지 id 중 잠긴 것의 등급만 `ids` 순서로 모은다(중복 id는 한 번만) */
export function lockedRaritiesOf(
  ids: readonly (string | null | undefined)[] | null | undefined,
  lockedRarityById: ReadonlyMap<string, BadgeRarity | null>
): (BadgeRarity | null)[] {
  const seen = new Set<string>()
  const rarities: (BadgeRarity | null)[] = []
  for (const id of ids ?? []) {
    if (!id || seen.has(id) || !lockedRarityById.has(id)) continue
    seen.add(id)
    rarities.push(lockedRarityById.get(id) ?? null)
  }
  return rarities
}
