/**
 * 아이템북 완성 판정(POI 배지 포함) 유닛테스트 (순수 JS, node:assert)
 *
 * 대상 로직: src/lib/itembook/checker.ts 의 checkItemBookCompletion
 *   - 북 소속 배지: type IN ('item', 'poi') 합산
 *   - item 타입: user_item_book_slots 카운트(슬롯팅 여부)
 *   - poi 타입: user_poi_badge_earns에서 (user_id, badge_id) distinct 존재 여부
 *     → 여러 번 획득해도 완성 판정에는 배지당 1로만 카운트(중복 미가산)
 *   - total(북 소속 배지 총 개수) <= slotted(item 슬롯 수 + poi distinct 보유 수) 면 완성
 *
 * 이 스크립트는 실제 Supabase 없이, checker.ts의 카운팅 방식을 그대로 재현한
 * 순수 함수로 완성 판정 로직만 검증한다.
 *
 * 실행: node scripts/test-itembook-poi-completion.js
 */

const assert = require('node:assert')

/**
 * checker.ts 2~5단계(북별 소속 배지 카운트 → 채움 카운트 → 완성 판정)를 그대로 재현.
 *
 * @param {Array<{id: string, item_book_id: string, type: 'item'|'poi'}>} bookBadges - 북 소속 배지 전체
 * @param {Array<{item_book_id: string}>} userSlots - 유저의 item 슬롯(user_item_book_slots)
 * @param {Array<{badge_id: string}>} userPoiEarns - 유저의 poi 배지 획득 이력(user_poi_badge_earns, 중복 가능)
 * @param {Set<string>} alreadyCompletedBookIds - 이미 완성 처리된 북 id
 * @returns {string[]} 이번에 새로 완성된 북 id 목록
 */
function computeNewlyCompletedBooks(bookBadges, userSlots, userPoiEarns, alreadyCompletedBookIds = new Set()) {
  // 2. 북별 전체 소속 배지 수 (item + poi)
  const badgeCountByBook = new Map()
  const poiBadgesByBook = new Map()
  for (const b of bookBadges) {
    if (!b.item_book_id) continue
    badgeCountByBook.set(b.item_book_id, (badgeCountByBook.get(b.item_book_id) ?? 0) + 1)
    if (b.type === 'poi') {
      const list = poiBadgesByBook.get(b.item_book_id) ?? []
      list.push(b.id)
      poiBadgesByBook.set(b.item_book_id, list)
    }
  }

  // 3. 유저의 item 슬롯 수 (북별)
  const slotCountByBook = new Map()
  for (const s of userSlots) {
    slotCountByBook.set(s.item_book_id, (slotCountByBook.get(s.item_book_id) ?? 0) + 1)
  }

  // 3-1. poi 배지는 "1회 이상 획득 이력 존재"(distinct badge_id)로 채움 판정 — 중복 미가산
  const allPoiBadgeIds = Array.from(poiBadgesByBook.values()).flat()
  if (allPoiBadgeIds.length > 0) {
    const earnedPoiBadgeIds = new Set(
      userPoiEarns.filter((e) => allPoiBadgeIds.includes(e.badge_id)).map((e) => e.badge_id)
    )

    for (const [bookId, poiBadgeIds] of poiBadgesByBook) {
      const earnedCount = poiBadgeIds.filter((id) => earnedPoiBadgeIds.has(id)).length
      if (earnedCount > 0) {
        slotCountByBook.set(bookId, (slotCountByBook.get(bookId) ?? 0) + earnedCount)
      }
    }
  }

  // 5. 완성 판정
  const completedIds = []
  const bookIds = new Set(bookBadges.map((b) => b.item_book_id))
  for (const bookId of bookIds) {
    const total = badgeCountByBook.get(bookId) ?? 0
    if (total === 0) continue
    const slotted = slotCountByBook.get(bookId) ?? 0
    if (slotted < total) continue
    if (!alreadyCompletedBookIds.has(bookId)) {
      completedIds.push(bookId)
    }
  }
  return completedIds
}

let passCount = 0
function check(label, fn) {
  fn()
  passCount++
  console.log(`  PASS: ${label}`)
}

// ===========================================================================
// 시나리오 1: 아이템 배지 2개 + POI 배지 1개 구성. 아이템 2개만 슬롯팅, POI 미획득 → 미완성
// ===========================================================================
console.log('시나리오 1: 아이템 2개 슬롯팅 + POI 배지 미획득 → 미완성')
{
  const bookBadges = [
    { id: 'badge-item-1', item_book_id: 'book-1', type: 'item' },
    { id: 'badge-item-2', item_book_id: 'book-1', type: 'item' },
    { id: 'badge-poi-1', item_book_id: 'book-1', type: 'poi' },
  ]
  const userSlots = [
    { item_book_id: 'book-1' },
    { item_book_id: 'book-1' },
  ]
  const userPoiEarns = [] // POI 배지 획득 이력 없음

  const completed = computeNewlyCompletedBooks(bookBadges, userSlots, userPoiEarns)

  check('book-1은 완성되지 않음(총 3개 중 2개만 채움)', () => {
    assert.deepStrictEqual(completed, [])
  })
}

// ===========================================================================
// 시나리오 2: 위 상태에서 POI 배지를 1회 획득 → 완성
// ===========================================================================
console.log('시나리오 2: 위 상태에서 POI 배지 1회 획득 → 완성')
{
  const bookBadges = [
    { id: 'badge-item-1', item_book_id: 'book-1', type: 'item' },
    { id: 'badge-item-2', item_book_id: 'book-1', type: 'item' },
    { id: 'badge-poi-1', item_book_id: 'book-1', type: 'poi' },
  ]
  const userSlots = [
    { item_book_id: 'book-1' },
    { item_book_id: 'book-1' },
  ]
  const userPoiEarns = [
    { badge_id: 'badge-poi-1' }, // POI 배지 1회 획득
  ]

  const completed = computeNewlyCompletedBooks(bookBadges, userSlots, userPoiEarns)

  check('book-1이 완성됨', () => {
    assert.deepStrictEqual(completed, ['book-1'])
  })
}

// ===========================================================================
// 시나리오 3: POI 배지만으로 구성된 북(아이템 배지 0개) — POI 배지 1개를 1회 이상 획득 → 완성
// ===========================================================================
console.log('시나리오 3: POI 배지만으로 구성된 북 — POI 1개 획득 → 완성')
{
  const bookBadges = [
    { id: 'badge-poi-only', item_book_id: 'book-2', type: 'poi' },
  ]
  const userSlots = [] // 아이템 슬롯 없음
  const userPoiEarns = [
    { badge_id: 'badge-poi-only' },
  ]

  const completed = computeNewlyCompletedBooks(bookBadges, userSlots, userPoiEarns)

  check('book-2가 완성됨(POI 배지 단독 구성)', () => {
    assert.deepStrictEqual(completed, ['book-2'])
  })

  // 대조군: 획득 이력이 없으면 미완성
  const notCompleted = computeNewlyCompletedBooks(bookBadges, userSlots, [])
  check('POI 배지를 획득하지 않았으면 미완성', () => {
    assert.deepStrictEqual(notCompleted, [])
  })
}

// ===========================================================================
// 시나리오 4: POI 배지를 여러 번(3번) 획득해도 완성 판정에 중복 가산되지 않음
//            (distinct badge_id 기준이어야 함 — Set 기반 카운팅 그대로 재현)
// ===========================================================================
console.log('시나리오 4: POI 배지 3회 중복 획득 — 완성 판정은 여전히 배지 종류 수 기준')
{
  // 아이템 배지 2개 + POI 배지 1개 구성인데, 아이템은 1개만 슬롯팅됨(총 2/3만 채움)
  const bookBadges = [
    { id: 'badge-item-1', item_book_id: 'book-3', type: 'item' },
    { id: 'badge-item-2', item_book_id: 'book-3', type: 'item' },
    { id: 'badge-poi-1', item_book_id: 'book-3', type: 'poi' },
  ]
  const userSlots = [
    { item_book_id: 'book-3' }, // 아이템 1개만 슬롯팅(2개 중)
  ]
  const userPoiEarns = [
    { badge_id: 'badge-poi-1' },
    { badge_id: 'badge-poi-1' },
    { badge_id: 'badge-poi-1' },
  ] // 같은 POI 배지를 3번 획득(반복 발급)

  const completed = computeNewlyCompletedBooks(bookBadges, userSlots, userPoiEarns)

  check('POI 3회 획득해도 아이템 슬롯 부족분은 채워지지 않음 → 미완성', () => {
    assert.deepStrictEqual(completed, [])
  })

  // 대조군: 아이템도 2개 다 채우면, POI 3회 획득이어도 정확히 "책 완성" 1건만 반환(중복 완성 아님)
  const userSlotsFull = [
    { item_book_id: 'book-3' },
    { item_book_id: 'book-3' },
  ]
  const completedFull = computeNewlyCompletedBooks(bookBadges, userSlotsFull, userPoiEarns)
  check('아이템 2개 다 채우면 완성되고, POI 중복 획득 횟수가 결과에 영향 없음(book-3 1건)', () => {
    assert.deepStrictEqual(completedFull, ['book-3'])
  })
}

// ===========================================================================
// 시나리오 5: 이미 완성 처리된 북은 재완성 목록에 포함되지 않음
// ===========================================================================
console.log('시나리오 5: 이미 완성된 북은 재완성 목록에서 제외')
{
  const bookBadges = [
    { id: 'badge-poi-only', item_book_id: 'book-2', type: 'poi' },
  ]
  const userPoiEarns = [{ badge_id: 'badge-poi-only' }]

  const completed = computeNewlyCompletedBooks(bookBadges, [], userPoiEarns, new Set(['book-2']))
  check('이미 완성 처리된 book-2는 다시 반환되지 않음', () => {
    assert.deepStrictEqual(completed, [])
  })
}

console.log(`\nPASS — 총 ${passCount}개 검증 케이스 통과 (test-itembook-poi-completion.js)`)
