import type { BadgeRarity } from '@/types/database'

/** 등급 노출 순서 — 낮은 등급이 먼저다(티켓 20261102_2300). */
const RARITY_ORDER: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

interface BookRarityBadge {
  item_book_id: string | null
  type: string
  rarity: string | null
  deleted_at?: string | null
}

/**
 * 컬렉션별 «등록된 아이템 배지의 등급 목록»을 만든다.
 * - `type = 'item'`이고 삭제되지 않은 배지만 센다(체크인·그 밖의 종류 제외).
 * - `rarity`가 NULL(무한레벨형)이거나 알 수 없는 값이면 건너뛴다.
 * - 중복 없이 Common → Rare → Epic → Mystic 순이다. 입력 순서와 무관하다.
 * 등급이 하나도 없는 컬렉션은 맵에 키가 없다.
 */
export function buildBookRarities(badges: readonly BookRarityBadge[]): Map<string, BadgeRarity[]> {
  const seen = new Map<string, Set<BadgeRarity>>()
  for (const b of badges) {
    if (!b.item_book_id || b.type !== 'item' || b.deleted_at) continue
    if (!b.rarity || !RARITY_ORDER.includes(b.rarity as BadgeRarity)) continue
    const set = seen.get(b.item_book_id)
    if (set) set.add(b.rarity as BadgeRarity)
    else seen.set(b.item_book_id, new Set([b.rarity as BadgeRarity]))
  }
  const result = new Map<string, BadgeRarity[]>()
  for (const [bookId, set] of seen) {
    result.set(bookId, RARITY_ORDER.filter((r) => set.has(r)))
  }
  return result
}
