/**
 * Phase 15 투데이 순수 로직 유닛테스트 (node:assert, 러너 불필요)
 * 실행: npx tsx src/lib/today/__tests__/today-logic.test.ts
 */
import assert from 'node:assert'
import { timeOfDayTag, isNewUser } from '../exposure'
import { resolveTargetHref } from '../cards'
import type { TodayCardRow } from '@/types/database'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// KST 기준: UTC 15:00 = KST 00:00(새벽), UTC 20:00 = KST 05:00(새벽),
// UTC 21:00 = KST 06:00(아침), UTC 03:00 = KST 12:00(오후),
// UTC 09:00 = KST 18:00(저녁), UTC 13:00 = KST 22:00(밤)
check('timeOfDayTag: KST 00시 → dawn', () => {
  assert.equal(timeOfDayTag(new Date('2026-07-26T15:00:00Z')), 'time_dawn')
})
check('timeOfDayTag: KST 06시 → morning', () => {
  assert.equal(timeOfDayTag(new Date('2026-07-26T21:00:00Z')), 'time_morning')
})
check('timeOfDayTag: KST 12시 → afternoon', () => {
  assert.equal(timeOfDayTag(new Date('2026-07-26T03:00:00Z')), 'time_afternoon')
})
check('timeOfDayTag: KST 18시 → evening', () => {
  assert.equal(timeOfDayTag(new Date('2026-07-26T09:00:00Z')), 'time_evening')
})
check('timeOfDayTag: KST 22시 → night', () => {
  assert.equal(timeOfDayTag(new Date('2026-07-26T13:00:00Z')), 'time_night')
})

check('isNewUser: 3일 전 가입 → true', () => {
  const now = new Date('2026-07-26T00:00:00Z')
  assert.equal(isNewUser('2026-07-23T00:00:00Z', now), true)
})
check('isNewUser: 10일 전 가입 → false', () => {
  const now = new Date('2026-07-26T00:00:00Z')
  assert.equal(isNewUser('2026-07-16T00:00:00Z', now), false)
})
check('isNewUser: created_at 없음 → false', () => {
  assert.equal(isNewUser(null, new Date()), false)
})

function makeCard(partial: Partial<TodayCardRow>): TodayCardRow {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: 't',
    subtitle: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-07-26T00:00:00Z',
    ends_at: '2026-12-30T14:59:59Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-07-26T00:00:00Z',
    created_by: null,
    ...partial,
  }
}

check('resolveTargetHref: editorial은 입력 무시하고 /today/{id}', () => {
  const card = makeCard({ template_type: 'editorial_article', target_href: '/somewhere' })
  assert.equal(resolveTargetHref(card), '/today/card-1')
})
check('resolveTargetHref: 명시적 target_href 우선', () => {
  const card = makeCard({ template_type: 'badge_spotlight', target_href: '/custom', badge_ids: ['b1'] })
  assert.equal(resolveTargetHref(card), '/custom')
})
check('resolveTargetHref: badge_spotlight 배지1개 → /badges/{id}', () => {
  const card = makeCard({ template_type: 'badge_spotlight', badge_ids: ['b1'] })
  assert.equal(resolveTargetHref(card), '/badges/b1')
})
check('resolveTargetHref: badge_spotlight 배지 여러개 → /badges', () => {
  const card = makeCard({ template_type: 'badge_spotlight', badge_ids: ['b1', 'b2'] })
  assert.equal(resolveTargetHref(card), '/badges')
})
check('resolveTargetHref: mission_spotlight → /missions/{id}', () => {
  const card = makeCard({ template_type: 'mission_spotlight', mission_id: 'm1' })
  assert.equal(resolveTargetHref(card), '/missions/m1')
})
check('resolveTargetHref: itembook_milestone → /collections/{id}', () => {
  const card = makeCard({ template_type: 'itembook_milestone', item_book_id: 'i1' })
  assert.equal(resolveTargetHref(card), '/collections/i1')
})
check('resolveTargetHref: drop_alert → /drops', () => {
  const card = makeCard({ template_type: 'drop_alert' })
  assert.equal(resolveTargetHref(card), '/drops')
})
check('resolveTargetHref: progress_nudge 배지없고 미션있으면 → /missions/{id}', () => {
  const card = makeCard({ template_type: 'progress_nudge', mission_id: 'm9' })
  assert.equal(resolveTargetHref(card), '/missions/m9')
})

console.log(`\n${passed} passed`)
