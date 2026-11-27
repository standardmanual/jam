/**
 * 챕터 오름 보상 추첨 결과의 저장 모양 (티켓 20261127_1731 C3a)
 *
 * 추첨 결과를 DB 함수가 받는 모양(`chapter_reward_grants.drawn_items`·`p_items`)으로 바꾸고(`toStoredItems`),
 * 저장된 모양을 다시 추첨하지 않고 지급 후속 처리용 모양으로 되살린다(`rebuildChapterRewardItems`).
 * 옛 캡슐의 `toRpcItems`·`StoredDrawnItem`·`rebuildRolledFromDrawn`에서 복사해 왔다 — 이 파일은 `lib/capsule/*`를 가져오지 않는다.
 * 서버 전용이다(service_role 클라이언트를 받는다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LockAssignment, LockReason } from '@/lib/drop-engine/lockAssignment'
import type { IssueBadge } from '@/lib/drop-engine/syncIssue'
import type { BadgeRarity } from '@/types/database'
import type { RolledChapterRewardItem } from './roll'

/** 보상 추첨이 읽는 아이템 배지 — 판정 칸 외에 지급 후속 처리(포인트·이름)가 쓰는 칸을 더한다 */
export type ChapterRewardBadge = IssueBadge & {
  name: string
  image_url: string | null
  point_reward: number | null
}

/** 저장된 추첨 결과 한 항목(`drawn_items` 한 칸, DB 함수 `p_items` 한 칸) */
export interface StoredChapterRewardItem {
  badge_id: string
  rarity: string
  rolled_rarity?: string | null
  locked?: boolean
  lock_reason?: string | null
  unlock_required?: number | null
}

/** 되살린 개체와 그 트라이브 이름표 — `record.ts`가 받는 모양이다 */
export interface RebuiltChapterReward {
  tribes: { id: string; name: string }[]
  items: RolledChapterRewardItem<ChapterRewardBadge>[]
}

const BADGE_COLUMNS =
  'id, name, image_url, rarity, item_book_id, drop_excluded, valid_from, valid_until, deleted_at, point_reward, always_locked, unlock_required'

/** 추첨 결과를 저장 모양으로 바꾼다 */
export function toStoredItems(rolled: { items: readonly RolledChapterRewardItem<IssueBadge>[] }): StoredChapterRewardItem[] {
  return rolled.items.map((item) => ({
    badge_id: item.badge.id,
    rarity: item.rarity,
    rolled_rarity: item.rolledRarity,
    locked: item.lock.locked,
    lock_reason: item.lock.lockReason,
    unlock_required: item.lock.unlockRequired,
  }))
}

/**
 * 저장된 추첨 결과를 `recordChapterRewardItems`가 받는 모양으로 되살린다.
 * 추첨은 다시 하지 않는다 — 저장된 `badge_id`로 배지를, 배지의 컬렉션으로 트라이브를 다시 읽어 저장된 등급·잠금을 그대로 얹는다.
 * 배지를 찾지 못하면 던진다(지급 전이라 잃는 것이 없고, 저장된 줄은 그대로 남는다).
 */
export async function rebuildChapterRewardItems(
  supabase: SupabaseClient,
  stored: readonly StoredChapterRewardItem[]
): Promise<RebuiltChapterReward> {
  if (stored.length === 0) return { tribes: [], items: [] }

  const badgeIds = [...new Set(stored.map((d) => d.badge_id))]
  const { data: badgeRows, error: badgeError } = await supabase.from('badges').select(BADGE_COLUMNS).in('id', badgeIds)
  if (badgeError) throw new Error(`badges 조회 실패: ${badgeError.message}`)
  const badgeOf = new Map(((badgeRows ?? []) as unknown as ChapterRewardBadge[]).map((b) => [b.id, b]))

  const bookIds = [...new Set([...badgeOf.values()].map((b) => b.item_book_id).filter((id): id is string => typeof id === 'string'))]
  const { data: bookRows, error: bookError } =
    bookIds.length === 0 ? { data: [], error: null } : await supabase.from('item_books').select('id, tribe_id').in('id', bookIds)
  if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
  const tribeOfBook = new Map(((bookRows ?? []) as { id: string; tribe_id: string | null }[]).map((b) => [b.id, b.tribe_id]))

  const tribeIds = [...new Set([...tribeOfBook.values()].filter((id): id is string => typeof id === 'string'))]
  const { data: tribeRows, error: tribeError } =
    tribeIds.length === 0 ? { data: [], error: null } : await supabase.from('tribes').select('id, name').in('id', tribeIds)
  if (tribeError) throw new Error(`tribes 조회 실패: ${tribeError.message}`)

  const items: RolledChapterRewardItem<ChapterRewardBadge>[] = stored.map((d) => {
    const badge = badgeOf.get(d.badge_id)
    if (!badge) throw new Error(`저장된 보상의 배지를 찾지 못했다 (badge_id: ${d.badge_id})`)
    const lock: LockAssignment = d.locked
      ? { locked: true, lockReason: (d.lock_reason ?? 'rolled') as LockReason, unlockRequired: Number(d.unlock_required ?? 0) }
      : { locked: false, lockReason: null, unlockRequired: null }
    return {
      badge,
      tribeId: (badge.item_book_id && tribeOfBook.get(badge.item_book_id)) || '',
      rarity: d.rarity as BadgeRarity,
      rolledRarity: (d.rolled_rarity || d.rarity) as BadgeRarity,
      lock,
    }
  })
  return { tribes: (tribeRows ?? []) as { id: string; name: string }[], items }
}
