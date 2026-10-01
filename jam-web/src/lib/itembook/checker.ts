/**
 * JAM! 아이템북 완성 체크 로직 (서버 사이드 전용)
 *
 * Phase 8 슬롯 기반 완성 모델:
 * - 완성 분모 = 소속 배지 − drop_excluded 배지, 분자 = 그 북에 장착·획득한 배지 id ∩ 분모 (completion-basis.ts)
 * - 완성 기록: user_item_book_completions (upsert, 최초 1회)
 * - reward_badge_id가 있는 경우 user_activity_badges에 보상 배지 발급
 *
 * 주의: 슬롯 기반 완성은 /api/itembooks/[id]/slot POST 핸들러에서 실시간으로 처리됨.
 *       이 함수는 Strava sync 등 배치 맥락에서 누락된 완성을 보정하는 catch-up 용도.
 *       장착 RPC는 완성 기록과 포인트만 만들고 보상 배지는 주지 않는다(마이그레이션 179). 보상 배지는
 *       `issueItemBookRewardBadges()` 한 곳에서 발급하고, 장착 라우트(`slotReward.ts`)와 이 함수의
 *       동기화 보정이 같은 함수를 쓴다(티켓 20261001_0635). 완성 기록이 이미 있는 컬렉션도 보상 배지가
 *       없으면 이 함수가 따라잡아 발급한다.
 *
 * service_role 클라이언트 사용 (RLS 우회)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { ItemBookRow, BadgeType } from '@/types/database'
import { computeBookCompletion } from './completion-basis'
import { buildFilledByBook } from './filled-by-book'
import { applyDroppableItemBookFilter } from './visibility'

export interface ItemBookCompletionResult {
  completedIds: string[]
  rewardBadgesIssued: number
  /**
   * 이번 호출에서 실제로 발급된 보상 배지 id 목록 (발급 순서).
   * 20260823_007 — 동기화 응답에 획득 배지 상세를 실어보내기 위해 추가.
   * rewardBadgesIssued는 기존 소비처가 있어 그대로 둔다(= rewardBadgeIds.length).
   */
  rewardBadgeIds: string[]
}

/**
 * 유저의 아이템북 완성 여부를 확인하고 완성 기록 및 reward_badge를 발급합니다.
 * @param userId - 대상 유저 ID
 */
export async function checkItemBookCompletion(userId: string): Promise<ItemBookCompletionResult> {
  const supabase = createServiceClient()

  // 1. 노출 중 item_books 전체 조회 — is_active && 노출 기간 내(마이그레이션 171, 티켓 20260914_1729).
  //    판정 원천은 visibility.ts(티켓 20260930_1516).
  const now = new Date().toISOString()
  const { data: itemBooksRaw, error: itemBooksError } = await applyDroppableItemBookFilter(
    supabase.from('item_books').select('*'),
    now
  )

  const itemBooks = itemBooksRaw as ItemBookRow[] | null

  if (itemBooksError || !itemBooks || itemBooks.length === 0) {
    if (itemBooksError) console.error('[checkItemBookCompletion] item_books 조회 오류:', itemBooksError)
    return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
  }

  const bookIds = itemBooks.map((b) => b.id)

  // 2. 북별 전체 소속 배지 수 (item + poi)
  //    Phase 16: poi 타입 배지도 북에 소속 가능. "보유" 판정 방식만 타입별로 다름.
  //    20260825_025: 완성 기준선(분모)은 소프트 삭제 여부와 무관하게 고정한다.
  //    삭제된 배지도 그대로 카운트해 분모·분자가 항상 같은 배지 집합을 기준으로 하게 한다.
  //
  //    티켓 20260825_029: 활성 아이템북 전체(bookIds)를 대상으로 item+poi 타입을 함께 모으는
  //    쿼리라 type 필터만으로는 PostgREST 기본 응답 상한(1000행) 미만이 구조적으로 보장되지
  //    않는다(POI 배지만도 1,800건이 넘고 그중 일부가 item_book_id로 컬렉션에 소속될 수 있음
  //    — Phase 16). 절단되면 분모(badgeCountByBook)가 실제보다 작게 잡혀 컬렉션이 실제로는
  //    완성되지 않았는데 완성으로 오판·보상 배지가 오발급될 위험이 있다. range로 페이지를
  //    끝까지 넘겨 전량을 가져온다.
  const CHECKER_BADGE_PAGE_SIZE = 1000
  type BookBadgeRow = { id: string; item_book_id: string; type: BadgeType; drop_excluded: boolean }
  const bookBadges: BookBadgeRow[] = []
  for (let from = 0; ; from += CHECKER_BADGE_PAGE_SIZE) {
    const { data: pageRaw, error } = await supabase
      .from('badges')
      .select('id, item_book_id, type, drop_excluded')
      .in('item_book_id', bookIds)
      .in('type', ['item', 'checkin'])
      .order('id')
      .range(from, from + CHECKER_BADGE_PAGE_SIZE - 1)

    if (error) {
      console.error('[checkItemBookCompletion] badges 조회 오류:', error)
      break
    }
    const page = (pageRaw ?? []) as BookBadgeRow[]
    bookBadges.push(...page)
    if (page.length < CHECKER_BADGE_PAGE_SIZE) break
  }

  const poiBadgesByBook = new Map<string, string[]>()
  for (const b of bookBadges) {
    if (!b.item_book_id) continue
    if (b.type === 'checkin') {
      const list = poiBadgesByBook.get(b.item_book_id) ?? []
      list.push(b.id)
      poiBadgesByBook.set(b.item_book_id, list)
    }
  }

  // 3. 유저가 장착한 배지 id (북별 분자는 분모와의 교집합으로 계산)
  const { data: slotsRaw, error: slotsError } = await supabase
    .from('user_item_book_slots')
    .select('item_book_id, badge_id')
    .eq('user_id', userId)
    .in('item_book_id', bookIds)

  if (slotsError) {
    console.error('[checkItemBookCompletion] user_item_book_slots 조회 오류:', slotsError)
    return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
  }

  // 3-1. Phase 16: checkin 타입 배지는 슬롯팅이 아니라 "1회 이상 획득 이력 존재"로 채움 판정
  //      (반복 획득되지만 완성 기여는 배지당 1로만 카운트)
  const allPoiBadgeIds = Array.from(poiBadgesByBook.values()).flat()
  let earnedPoiBadgeIds = new Set<string>()
  if (allPoiBadgeIds.length > 0) {
    const { data: poiEarnsRaw, error: poiEarnsError } = await supabase
      .from('user_checkin_badge_earns')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', allPoiBadgeIds)

    if (poiEarnsError) {
      console.error('[checkItemBookCompletion] user_checkin_badge_earns 조회 오류:', poiEarnsError)
      return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
    }

    earnedPoiBadgeIds = new Set(
      ((poiEarnsRaw ?? []) as { badge_id: string }[]).map((e) => e.badge_id)
    )
  }

  // 북별 채운 배지 집합 — 표시 쪽(completable.ts)과 같은 순수 함수로 구성한다
  // (티켓 20260924_0937·20260926_1344). 장착 RPC(mig/179)처럼 그 컬렉션의 슬롯만 분자로 센다.
  const filledByBook = buildFilledByBook({
    slots: (slotsRaw ?? []) as { item_book_id: string; badge_id: string }[],
    checkinBadgesByBook: poiBadgesByBook,
    earnedCheckinBadgeIds: earnedPoiBadgeIds,
  })

  // 4. 기존 완성 기록 조회 (중복 처리 방지)
  const { data: existingCompRaw } = await supabase
    .from('user_item_book_completions')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', bookIds)

  const alreadyCompletedSet = new Set(
    ((existingCompRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id)
  )

  // 5. 완성 판정
  //    completedIds는 이번에 «새로» 완성한 북만 담는다(완성 기록·`itemBooksCompleted` 집계의 기준).
  //    보상 배지 후보(completeBooks)는 이미 완성 기록이 있는 북도 담는다 — 장착 RPC가 완성 기록만 남기고
  //    보상 배지를 주지 않던 시기의 완성분을 따라잡기 위해서다(티켓 20261001_0635).
  const completedIds: string[] = []
  const completeBooks: ItemBookRow[] = []

  const completionByBook = computeBookCompletion(bookBadges, new Set<string>(), {
    types: ['item', 'checkin'],
    filledByBook,
  })

  for (const book of itemBooks) {
    // 분모가 0인 북(배지 없음)은 complete=false
    if (!completionByBook.get(book.id)?.complete) continue

    completeBooks.push(book)
    if (!alreadyCompletedSet.has(book.id)) completedIds.push(book.id)
  }

  if (completeBooks.length === 0) {
    return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
  }

  // 6. 완성 기록 upsert (새로 완성한 북만)
  if (completedIds.length > 0) {
    console.info(`[checkItemBookCompletion] 완성된 아이템북 — userId: ${userId}, ids: ${completedIds.join(', ')}`)
    const completionRows = completedIds.map((id) => ({ user_id: userId, item_book_id: id }))
    const completionsTable = supabase.from('user_item_book_completions')
    await completionsTable.upsert(completionRows, { onConflict: 'user_id,item_book_id', ignoreDuplicates: true })
  }

  // 7. reward_badge_id 발급 — 새 완성분과 보정분(완성 기록은 있으나 배지가 없는 북)을 함께 넘긴다
  const rewardBadgeIds = await issueItemBookRewardBadges(supabase, userId, completeBooks)

  return { completedIds, rewardBadgesIssued: rewardBadgeIds.length, rewardBadgeIds }
}

/** 보상 배지 발급에 필요한 `item_books` 컬럼만 */
export type ItemBookRewardFields = Pick<ItemBookRow, 'id' | 'name' | 'reward_badge_id'>

/**
 * 완성한 컬렉션의 보상 배지(`reward_badge_id`)를 발급한다. 반환값은 이번 호출에서 실제로 발급된 배지 id(발급 순서).
 *
 * 동기화 보정(`checkItemBookCompletion`)과 컬렉션 장착 라우트(`slotReward.ts`)가 **같은 함수**를 쓴다
 * (티켓 20261001_0635). 완성 여부는 부르는 쪽이 판정한다 — 이 함수는 받은 북이 모두 완성됐다고 보고
 * 보유 확인 → insert만 한다. 이미 보유했거나(`user_activity_badges`에 있음) 동시 발급 경합으로 `23505`가
 * 나면 건너뛰므로 같은 배지는 한 번만 발급된다. `reward_badge_id`가 빈 북은 건너뛴다.
 */
export async function issueItemBookRewardBadges(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  books: readonly ItemBookRewardFields[]
): Promise<string[]> {
  const rewardBadgeIds: string[] = []

  // 7-0. 보상 배지 타입 확인 — 아래 발급 로직은 "보상 배지는 항상 activity 타입"이라는
  //      가정 하에 무조건 user_activity_badges에 쓴다. 이 가정이 깨지면(예: 콘텐츠 쪽에서
  //      checkin/item 타입 배지를 보상으로 지정) 조용히 잘못된 테이블에 기록되므로,
  //      동작은 바꾸지 않되 경고 로그로 드러낸다 (티켓 20260906_2023).
  const rewardBadgeIdCandidates = books
    .map((b) => b.reward_badge_id)
    .filter((id): id is string => Boolean(id))
  if (rewardBadgeIdCandidates.length === 0) return rewardBadgeIds

  const rewardBadgeTypeById = new Map<string, BadgeType>()
  const { data: rewardBadgeTypesRaw, error: rewardBadgeTypesError } = await supabase
    .from('badges')
    .select('id, type')
    .in('id', rewardBadgeIdCandidates)

  if (rewardBadgeTypesError) {
    console.error('[issueItemBookRewardBadges] reward_badge type 조회 오류:', rewardBadgeTypesError)
  } else {
    for (const b of (rewardBadgeTypesRaw ?? []) as { id: string; type: BadgeType }[]) {
      rewardBadgeTypeById.set(b.id, b.type)
    }
  }

  for (const book of books) {
    if (!book.reward_badge_id) continue

    const rewardBadgeType = rewardBadgeTypeById.get(book.reward_badge_id)
    if (rewardBadgeType && rewardBadgeType !== 'activity') {
      console.error(
        `[issueItemBookRewardBadges] reward_badge type 불일치 — book: ${book.id}, reward_badge_id: ${book.reward_badge_id}, type: ${rewardBadgeType} (activity 예상, user_activity_badges에 기록됨)`
      )
    }

    const { data: existing } = await supabase
      .from('user_activity_badges')
      .select('id')
      .eq('user_id', userId)
      .eq('badge_id', book.reward_badge_id)
      .maybeSingle()

    if (existing) continue

    const rewardBadgePayload = {
      user_id: userId,
      badge_id: book.reward_badge_id,
      triggered_by: `itembook_complete:${book.id}`,
    }
    const activityBadgesTable = supabase.from('user_activity_badges')
    const { error: insertError } = await activityBadgesTable.insert(rewardBadgePayload)

    if (insertError) {
      if (insertError.code === '23505') continue
      console.error(`[issueItemBookRewardBadges] 보상 배지 발급 오류 (book: ${book.id}):`, insertError)
      continue
    }

    rewardBadgeIds.push(book.reward_badge_id)
    console.info(`[issueItemBookRewardBadges] 보상 배지 발급 완료 — userId: ${userId}, book: ${book.name}, reward_badge_id: ${book.reward_badge_id}`)
  }

  return rewardBadgeIds
}
