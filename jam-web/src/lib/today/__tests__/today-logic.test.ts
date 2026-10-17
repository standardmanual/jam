/**
 * Phase 15 투데이 순수 로직 유닛테스트 (node:assert, 러너 불필요)
 * 실행: npx tsx src/lib/today/__tests__/today-logic.test.ts
 */
import assert from 'node:assert'
import {
  timeOfDayTag,
  isNewUser,
  hasIncompleteBook,
  minRemainingSlots,
  daysSinceLastSync,
  ITEMBOOK_REMAINING_MAX,
  STRAVA_STALE_DAYS,
} from '../exposure'
import { resolveTargetHref } from '../cards'
import { resolveFriendActivityHref, buildCollectionProgress } from '../status'
import type { TodayCardRow } from '@/types/database'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// 시간대 태그 경계 (티켓 20261001_1201, 운영 패턴 사전의 시각 정의와 일치).
// night 22~05 / dawn 05~08 / morning 08~11 / afternoon 11~17 / evening 17~22 (KST)
// KST 오프셋(+09:00)을 붙여 만든 시각으로 경계 직전·직후를 고정한다.
function kstAt(hhmm: string): Date {
  return new Date(`2026-07-26T${hhmm}:00+09:00`)
}
const TIME_OF_DAY_BOUNDARIES: ReadonlyArray<readonly [string, string]> = [
  ['00:00', 'time_night'],
  ['04:59', 'time_night'],
  ['05:00', 'time_dawn'],
  ['07:59', 'time_dawn'],
  ['08:00', 'time_morning'],
  ['10:59', 'time_morning'],
  ['11:00', 'time_afternoon'],
  ['16:59', 'time_afternoon'],
  ['17:00', 'time_evening'],
  ['21:59', 'time_evening'],
  ['22:00', 'time_night'],
  ['23:59', 'time_night'],
]
for (const [hhmm, expected] of TIME_OF_DAY_BOUNDARIES) {
  check(`timeOfDayTag: KST ${hhmm} → ${expected}`, () => {
    assert.equal(timeOfDayTag(kstAt(hhmm)), expected)
  })
}
check('timeOfDayTag: 서버가 UTC여도 KST 기준 (UTC 20:00 = KST 05:00 → dawn)', () => {
  assert.equal(timeOfDayTag(new Date('2026-07-26T20:00:00Z')), 'time_dawn')
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
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    description: null,
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
check('resolveTargetHref: recipe_reveal → /combine (공개 전·후 같다, 레시피 id가 있어도 레시피별 주소는 없다, 티켓 20261006_1217)', () => {
  assert.equal(resolveTargetHref(makeCard({ template_type: 'recipe_reveal' })), '/combine')
  assert.equal(resolveTargetHref(makeCard({ template_type: 'recipe_reveal', recipe_id: 'r1' })), '/combine')
})
check('resolveTargetHref: recipe_reveal 운영자가 지정한 주소가 우선', () => {
  const card = makeCard({ template_type: 'recipe_reveal', recipe_id: 'r1', target_href: '/combine?tab=recipes' })
  assert.equal(resolveTargetHref(card), '/combine?tab=recipes')
  // 공백뿐인 주소는 지정하지 않은 것과 같다
  assert.equal(resolveTargetHref(makeCard({ template_type: 'recipe_reveal', target_href: '   ' })), '/combine')
})
check('resolveTargetHref: progress_nudge 배지없고 미션있으면 → /missions/{id}', () => {
  const card = makeCard({ template_type: 'progress_nudge', mission_id: 'm9' })
  assert.equal(resolveTargetHref(card), '/missions/m9')
})
check('resolveTargetHref: ranking_board 명시적 target_href 우선(티켓 20260911_1440)', () => {
  const card = makeCard({ template_type: 'ranking_board', ranking_mode_id: 'rm1', target_href: '/custom' })
  assert.equal(resolveTargetHref(card), '/custom')
})
check('resolveTargetHref: ranking_board 랭킹모드가 미션 참가자 대상이면 → /missions/{id}/status', () => {
  const card = makeCard({ template_type: 'ranking_board', ranking_mode_id: 'rm1' })
  assert.equal(resolveTargetHref(card, { rankingModeTargetMissionId: 'm1' }), '/missions/m1/status')
})
check('resolveTargetHref: ranking_board 수동 지정 유저 대상(미션 컨텍스트 없음) → /missions', () => {
  const card = makeCard({ template_type: 'ranking_board', ranking_mode_id: 'rm1' })
  assert.equal(resolveTargetHref(card), '/missions')
})

check('resolveFriendActivityHref: 1명 + username 있음 → 프로필 href', () => {
  assert.equal(resolveFriendActivityHref(1, 'jaesook'), '/jaesook')
})
check('resolveFriendActivityHref: 1명이지만 username 없음(탈퇴 등) → /feed 폴백', () => {
  assert.equal(resolveFriendActivityHref(1, null), '/feed')
})
check('resolveFriendActivityHref: 2명 이상 → /feed', () => {
  assert.equal(resolveFriendActivityHref(2, 'jaesook'), '/feed')
})


// ─── 컬렉션 완성 분모 통일 (티켓 20260921_1113) ─────────────────────────────
const bk = (id: string, excluded = false) => ({ id, item_book_id: 'B', type: 'item', drop_excluded: excluded })
const books1 = [{ id: 'B', name: '북' }]
/** 컬렉션별 분자 — 장착한 배지 id를 한 컬렉션(B)의 집합으로 만든다 (티켓 20261016_2340 2회-나) */
const filled = (book: string, ...ids: string[]) => new Map([[book, new Set(ids)]])

check('buildCollectionProgress: 제외 배지는 분모에서 빠진다 (2/3, 제외 1개)', () => {
  const r = buildCollectionProgress(books1, [bk('a'), bk('b'), bk('c'), bk('x', true)], filled('B', 'a'), new Map())
  assert.equal(r.length, 1)
  assert.equal(r[0].total, 3)
  assert.equal(r[0].current, 1)
})
check('buildCollectionProgress: 제외 배지를 장착해도 분자에 세지 않는다', () => {
  const r = buildCollectionProgress(books1, [bk('a'), bk('b'), bk('x', true)], filled('B', 'a', 'x'), new Map())
  assert.equal(r[0].current, 1)
  assert.equal(r[0].total, 2)
})
check('buildCollectionProgress: 분모를 모두 채우면 후보에서 빠진다', () => {
  const r = buildCollectionProgress(books1, [bk('a'), bk('b'), bk('x', true)], filled('B', 'a', 'b'), new Map())
  assert.equal(r.length, 0)
})
check('buildCollectionProgress: 다른 컬렉션 슬롯의 배지는 분자에 들지 않는다 (컬렉션별 분자)', () => {
  // a는 B 소속이지만 C 컬렉션 슬롯에 들어 있다 — B의 분자에는 세지 않는다
  const r = buildCollectionProgress(books1, [bk('a'), bk('b')], filled('C', 'a'), new Map())
  assert.equal(r[0].current, 0)
  assert.equal(r[0].total, 2)
})
check('buildCollectionProgress: 소프트 삭제 배지는 분모에서 빠진다', () => {
  const deleted = { ...bk('d'), deleted_at: '2026-10-01T00:00:00Z' }
  const r = buildCollectionProgress(books1, [bk('a'), bk('b'), deleted], filled('B', 'a'), new Map())
  assert.equal(r[0].total, 2)
})
check('buildCollectionProgress: tier_mode 컬렉션은 꽂은 등급의 이름 수로 센다', () => {
  const t = (id: string, name: string, rarity: string) => ({ ...bk(id), name, rarity })
  const badges = [t('c1', '조각', 'common'), t('c2', '시계', 'common'), t('r1', '조각', 'rare'), t('r2', '시계', 'rare')]
  const r = buildCollectionProgress(books1, badges, filled('B', 'r1'), new Map(), new Set(['B']))
  assert.equal(r[0].total, 2)
  assert.equal(r[0].current, 1)
})
check('hasIncompleteBook: 제외 배지 장착만으로 조기 완성 처리되지 않는다', () => {
  assert.equal(hasIncompleteBook(['B'], [bk('a'), bk('b'), bk('x', true)], filled('B', 'a', 'x')), true)
})
check('hasIncompleteBook: 분모를 다 채우면 false', () => {
  assert.equal(hasIncompleteBook(['B'], [bk('a'), bk('b'), bk('x', true)], filled('B', 'a', 'b')), false)
})

// ─── 세그먼트 확장 1차 — 컬렉션 잔여·동기화 경과 태그 (티켓 20260923_2253) ────────────────
check('minRemainingSlots: 분모를 다 채운 북은 후보에서 제외(0개 경계) → null', () => {
  assert.equal(minRemainingSlots(['B'], [bk('a'), bk('b'), bk('c')], filled('B', 'a', 'b', 'c')), null)
})
check(`minRemainingSlots: 잔여 ${ITEMBOOK_REMAINING_MAX}개 경계 → 임계값 충족`, () => {
  const remaining = minRemainingSlots(['B'], [bk('a'), bk('b'), bk('c'), bk('d')], filled('B', 'a'))
  assert.equal(remaining, 3)
  assert.equal(remaining !== null && remaining <= ITEMBOOK_REMAINING_MAX, true)
})
check(`minRemainingSlots: 잔여 ${ITEMBOOK_REMAINING_MAX + 1}개 경계 → 임계값 미충족`, () => {
  const remaining = minRemainingSlots(['B'], [bk('a'), bk('b'), bk('c'), bk('d'), bk('e')], filled('B', 'a'))
  assert.equal(remaining, 4)
  assert.equal(remaining !== null && remaining <= ITEMBOOK_REMAINING_MAX, false)
})
check('minRemainingSlots: 여러 북 중 잔여가 가장 적은 북의 값을 반환한다', () => {
  const bkC = (id: string) => ({ id, item_book_id: 'C', type: 'item', drop_excluded: false })
  const badges = [bk('a'), bk('b'), bk('c'), bk('d'), bkC('x'), bkC('y')]
  // B: 분모4 채움1(잔여3), C: 분모2 채움1(잔여1) → 최소값 1
  assert.equal(minRemainingSlots(['B', 'C'], badges, new Map([['B', new Set(['a'])], ['C', new Set(['x'])]])), 1)
})

check('daysSinceLastSync: 연결 자체가 없으면 null(태그 대상 아님)', () => {
  assert.equal(daysSinceLastSync(null, new Date('2026-09-23T00:00:00Z')), null)
})
check('daysSinceLastSync: 연결은 있지만 한 번도 동기화 안 함 → 항상 경과(Infinity)', () => {
  assert.equal(daysSinceLastSync({ last_synced_at: null }, new Date('2026-09-23T00:00:00Z')), Infinity)
})
check(`daysSinceLastSync: ${STRAVA_STALE_DAYS - 1}일 경과 → 임계값(${STRAVA_STALE_DAYS}) 미충족`, () => {
  const days = daysSinceLastSync({ last_synced_at: '2026-09-10T00:00:00Z' }, new Date('2026-09-23T00:00:00Z'))
  assert.equal(days, 13)
  assert.equal(days !== null && days >= STRAVA_STALE_DAYS, false)
})
check(`daysSinceLastSync: ${STRAVA_STALE_DAYS}일 경과 → 임계값 충족`, () => {
  const days = daysSinceLastSync({ last_synced_at: '2026-09-09T00:00:00Z' }, new Date('2026-09-23T00:00:00Z'))
  assert.equal(days, 14)
  assert.equal(days !== null && days >= STRAVA_STALE_DAYS, true)
})

console.log(`\n${passed} passed`)
