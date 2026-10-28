/**
 * 컬렉션 상세 화면의 칸 만들기 (티켓 20261028_1408)
 *
 * 4등급 방식(`item_books.tier_mode`) 컬렉션은 같은 이름의 배지가 등급마다 하나씩 있다(9종 × 4등급 = 36개).
 * 화면은 36칸이 아니라 «이름 수»만큼의 칸을 그리고, 칸 하나가 어느 등급의 배지인지는 컬렉션 등급이 정한다.
 * 컬렉션 등급은 이 모듈이 새로 계산하지 않고 `computeBookCompletion`이 돌려준 `tier`를 읽는다.
 *
 * 규칙
 * - `tier_mode`가 꺼진 컬렉션은 지금 모양 그대로다. 소속 아이템 배지 전부를 1:1로 칸에 둔다(`cellKey` 없음).
 * - 이름 묶음 키는 `completion-basis.ts`의 `nameOf`와 같다(`name ?? id`). 등급이 비어 있는 배지는 분모 규칙과 같이 칸에서 뺀다.
 * - 칸 순서는 이름 묶음이 «처음 나오는 순서»로 고정한다. 입력 `badges`는 `created_at` 오름차순이어야 한다.
 *   컬렉션 등급이 정해지거나 풀려도 같은 이름은 같은 자리에 있어 칸이 흔들리지 않는다.
 * - 등급이 정해졌을 때는 `completion.tier`의 배지만 칸으로 그리고 후보도 그 배지의 것만 쓴다. 드랍 제외 배지도 칸에는 넣는다.
 * - 등급이 없을 때는 이름 묶음마다 칸 1개다. 묶음 안 모든 등급의 후보를 합쳐 후보마다 `rarity`를 달고 낮은 등급 순으로 늘어놓는다.
 *   칸의 대표 배지는 가진 후보가 있는 배지 중 가장 낮은 등급이고, 하나도 없으면 묶음에서 가장 낮은 등급의 배지다.
 * - 컬렉션 등급을 소프트 삭제 배지에 꽂힌 슬롯이 정했는데 그 등급의 살아 있는 배지가 없으면(`completion.tiers`에 없다),
 *   진행도의 기준 등급(`completion-basis`의 `shown`, 첫 등급)으로 칸을 그리되 후보를 비운다.
 *   서버가 어차피 `tier_mismatch`로 거절할 장착 길을 열지 않기 위해서다.
 *
 * 이름 수가 등급마다 다른 컬렉션이나 드랍 제외 배지가 있는 등급은 칸 수가 진행도 분모와 다를 수 있다. 컨텐츠 입력 규칙
 * (`docs/service/content/ITEMBOOK_TIERS.md` 1절)의 위반이거나 지금 꺼진 컬렉션도 같은 동작이라, 여기서 숨기지 않고 그대로 둔다.
 *
 * 순수 함수다. DB 조회와 후보·슬롯 조립은 호출부(`collections/[id]/page.tsx`)가 한다.
 */
import { COMPLETION_TIER_ORDER, type BookCompletion } from './completion-basis'
import type { BadgeSlot } from '@/app/(main)/collections/[id]/SlotGrid'
import type { BadgeRarity } from '@/types/database'

export interface BadgeSlotsBadge {
  id: string
  name: string
  image_url: string | null
  rarity: string | null
}

export type BadgeSlotCandidate = BadgeSlot['candidates'][number]
export type BadgeSlotRecord = NonNullable<BadgeSlot['slot']>

export interface BuildBadgeSlotsInput {
  /** 이 컬렉션의 소프트 삭제되지 않은 아이템 배지, `created_at` 오름차순 */
  badges: readonly BadgeSlotsBadge[]
  /** 배지 id별 미장착 개체 후보(`obtained_at` 오름차순). 없으면 미보유 */
  candidatesByBadge: ReadonlyMap<string, BadgeSlotCandidate[]>
  /** 배지 id별 장착 슬롯 */
  slotByBadge: ReadonlyMap<string, BadgeSlotRecord>
  /** `item_books.tier_mode` */
  tierMode: boolean
  /** `computeBookCompletion`의 결과. 소프트 삭제 배지를 넘겨 계산한 것이어야 `tier`가 서버 판정과 같다 */
  completion: Pick<BookCompletion, 'tier' | 'tiers'> | undefined
}

const nameOf = (badge: BadgeSlotsBadge) => badge.name ?? badge.id

/** 등급의 낮은 쪽부터 센 순번. 모르는 등급(null 포함)은 undefined */
function rankOf(rarity: string | null): number | undefined {
  const index = (COMPLETION_TIER_ORDER as readonly string[]).indexOf(rarity ?? '')
  return index < 0 ? undefined : index
}

export function buildBadgeSlots({
  badges,
  candidatesByBadge,
  slotByBadge,
  tierMode,
  completion,
}: BuildBadgeSlotsInput): BadgeSlot[] {
  const toBadge = (badge: BadgeSlotsBadge): BadgeSlot['badge'] => ({
    id: badge.id,
    name: badge.name,
    image_url: badge.image_url,
    rarity: badge.rarity,
  })

  if (!tierMode) {
    return badges.map((badge) => ({
      badge: toBadge(badge),
      candidates: candidatesByBadge.get(badge.id) ?? [],
      slot: slotByBadge.get(badge.id) ?? null,
    }))
  }

  // 이름 묶음 — Map은 키를 처음 넣은 순서를 지키므로 그대로 칸 순서가 된다
  const groups = new Map<string, BadgeSlotsBadge[]>()
  for (const badge of badges) {
    if (rankOf(badge.rarity) === undefined) continue
    const key = nameOf(badge)
    const group = groups.get(key)
    if (group) group.push(badge)
    else groups.set(key, [badge])
  }

  const tier = completion?.tier ?? null
  const slots: BadgeSlot[] = []

  if (tier !== null) {
    const tiers = completion?.tiers ?? {}
    // 컬렉션 등급을 삭제 배지가 정해 살아 있는 배지가 없으면 진행도와 같은 기준 등급(첫 등급)으로 그린다
    const hasLiveBadges = tiers[tier] !== undefined
    const shown = hasLiveBadges ? tier : COMPLETION_TIER_ORDER.find((rarity) => tiers[rarity] !== undefined)
    for (const [cellKey, group] of groups) {
      const badge = group.find((b) => b.rarity === shown)
      if (!badge) continue
      slots.push({
        cellKey,
        badge: toBadge(badge),
        candidates: hasLiveBadges ? (candidatesByBadge.get(badge.id) ?? []) : [],
        slot: slotByBadge.get(badge.id) ?? null,
      })
    }
    return slots
  }

  for (const [cellKey, group] of groups) {
    // 같은 등급 안에서는 각 배지의 후보 순서(획득순)를 지키도록 안정 정렬한다
    const candidates = group
      .flatMap((badge) =>
        (candidatesByBadge.get(badge.id) ?? []).map((candidate) => ({
          ...candidate,
          rarity: badge.rarity as BadgeRarity,
        }))
      )
      .sort((a, b) => (rankOf(a.rarity) ?? 0) - (rankOf(b.rarity) ?? 0))
    const owned = group.filter((badge) => (candidatesByBadge.get(badge.id)?.length ?? 0) > 0)
    const pool = owned.length > 0 ? owned : group
    const representative = pool.reduce((lowest, badge) =>
      (rankOf(badge.rarity) ?? 0) < (rankOf(lowest.rarity) ?? 0) ? badge : lowest
    )
    // 등급이 없다는 것은 어느 배지에도 꽂지 않았다는 뜻이라 장착 슬롯은 항상 없다
    slots.push({ cellKey, badge: toBadge(representative), candidates, slot: null })
  }
  return slots
}

/**
 * «추가» 버튼이 개체 선택 시트를 여는지(true) 바로 장착하는지(false).
 * 후보가 2개 이상이면 일련번호로 골라야 해서 시트를 연다. **컬렉션 등급이 아직 없으면 후보가 1개여도 시트를 연다** —
 * 첫 장착이 컬렉션 등급을 정하고(모두 해제하기 전에는 되돌릴 수 없다) 다른 등급 칸이 «???»로 바뀌므로, 등급 칩과 일련번호를
 * 확인하고 장착하게 한다. 등급이 정해진 뒤에는 후보 1개를 바로 장착한다(티켓 20261028_1408, 사용자 승인 2026-10-28).
 */
export function shouldOpenCandidateSheet(candidateCount: number, tierUndecided: boolean): boolean {
  return tierUndecided || candidateCount !== 1
}
