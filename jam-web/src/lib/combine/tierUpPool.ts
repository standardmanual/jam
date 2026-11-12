/**
 * 등급 올리기의 후보 풀을 읽는다 (티켓 20261111_0846) — 서비스에서 활성인 컬렉션과 그 아이템 배지 전체.
 *
 * 유저의 소속 트라이브(`users.tribe_id`)·트라이브 표·보정 카운터(`user_drop_state`)는 읽지 않는다. 등급 올리기는 트라이브를 보지 않으므로
 * 소속 트라이브가 없는 유저도 읽을 수 있다. 캡슐용 `loadRollData`(`@/lib/capsule/open`)는 그대로 둔다.
 * 읽지 못하면 던진다 — 틀린 값으로 굴리지 않는다. 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import type { IssueBadge, IssueBook } from '@/lib/drop-engine/syncIssue'

/** 굴림이 결과로 돌려주는 칸까지 포함한 아이템 배지 — 이름·그림·설명문·잠김 */
export type TierUpPoolBadge = IssueBadge & {
  name: string
  image_url: string | null
  /** 배지 설명문 — 등급 올리기 결과 연출이 문장 줄로 보여 준다(티켓 20261112_2141). 비어 있으면 null이거나 빈 문자열이다 */
  description?: string | null
}

export async function loadTierUpPool(supabase: SupabaseClient): Promise<{ books: IssueBook[]; badges: TierUpPoolBadge[] }> {
  const { data: bookRows, error: bookError } = await supabase
    .from('item_books')
    .select('id, tribe_id, is_active, drop_excluded, valid_from, valid_until')
    .eq('is_active', true)
    .eq('drop_excluded', false)
  if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
  const books = (bookRows ?? []) as IssueBook[]

  const badges = await fetchAllRowsIn<TierUpPoolBadge, string>(
    'tier-up:item-badges',
    'id',
    books.map((b) => b.id),
    (chunk) =>
      supabase
        .from('badges')
        .select('id, name, image_url, description, rarity, item_book_id, drop_excluded, valid_from, valid_until, deleted_at, always_locked, unlock_required')
        .eq('type', 'item')
        .is('deleted_at', null)
        .in('item_book_id', chunk)
  )
  return { books, badges }
}
