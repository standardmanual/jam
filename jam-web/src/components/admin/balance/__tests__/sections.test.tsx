/**
 * 밸런스 설정 구역 레지스트리와 구역 본문 (티켓 20261022_1132 1회)
 *
 * - 레지스트리(`lib/admin/balance/sections.tsx`): 구역 키가 겹치지 않고, 구역마다 연결 객체·제목·본문이 있으며, 키로 구역을 찾는다(없으면 `undefined`).
 *   지금 구역은 잼·서비스 활동 잼·동기화·캡슐·잠긴 아이템 배지·컬렉션과 믹스·챕터·인벤토리·어뷰징·시스템 드랍·배지와 포인트다
 * - 구역 본문(`BalanceSectionBody`, 서버 컴포넌트): 가짜 클라이언트로 값을 읽어 폼과 최근 변경을 그린다. **값을 읽지 못하면 던지지 않고** 오류 카드가 되고
 *   (한 구역이 실패해도 다른 구역은 보인다), 최근 변경만 못 읽으면 폼은 열린다. 읽기만 하고 아무것도 쓰지 않는다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Children, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const h = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    if (h.client === 'throw') throw new Error('환경 변수가 없어요')
    return h.client
  },
}))

import { BALANCE_SECTIONS, findBalanceSection } from '@/lib/admin/balance/sections'
import { JAM_BINDING } from '@/lib/admin/balance/jam'
import { SERVICE_JAM_BINDING } from '@/lib/admin/balance/serviceJam'
import { SYNC_BINDING } from '@/lib/admin/balance/sync'
import { CAPSULE_BINDING } from '@/lib/admin/balance/capsule'
import { CHAPTER_BINDING } from '@/lib/admin/balance/chapter'
import { COLLECTION_BINDING } from '@/lib/admin/balance/collection'
import { ABUSING_BINDING } from '@/lib/admin/balance/abusing'
import { AMBIENT_BINDING } from '@/lib/admin/balance/ambient'
import { BADGEPOINTS_BINDING } from '@/lib/admin/balance/badgepoints'
import { INVENTORY_BINDING } from '@/lib/admin/balance/inventory'
import { LOCKED_BINDING } from '@/lib/admin/balance/locked'
import { BALANCE_LOAD_FAILED_MESSAGE } from '@/lib/admin/balance/save'
import {
  abusingPolicyRow,
  ambientDropConfigRow,
  badgePointPolicyRow,
  capsulePolicyRow,
  chapterCostRows,
  chapterDefinitionRows,
  combinePolicyRow,
  createFakeDb,
  inventoryPolicyRow,
  inventoryRows,
  jamPolicyRow,
  serviceJamRuleRows,
  tierDefaultRewardRows,
  type FakeDb,
} from '@/lib/admin/balance/__tests__/fakeDb'
import { BalanceSectionBody } from '../BalanceSectionBody'
import { SHARED_VALUES_NOTICE_LINK, SHARED_VALUES_NOTICE_PREFIX, SharedValuesNotice } from '../CapsuleSection'
import {
  CHAPTER_RISEN_NOTICE,
  ChapterNotice,
  ChapterSection,
} from '../ChapterSection'
import { ServiceJamSection } from '../ServiceJamSection'
import { AbusingSection } from '../AbusingSection'
import { BADGEPOINTS_NOTICE, BadgePointsNotice, BadgePointsSection } from '../BadgePointsSection'
import { AMBIENT_RARITY_RANDOM_NOTICE, AmbientRarityRandomNotice, AmbientSection } from '../AmbientSection'
import { COLLECTION_REWARD_NOTICE, COMBINE_FAIL_NOTICE, COMBINE_TIER_UP_NOTICE, CollectionNotice, CollectionSection } from '../CollectionSection'
import { INVENTORY_APPLY_NOTICE_FALLBACK, InventoryNotice, InventorySection, inventoryApplyNotice } from '../InventorySection'
import {
  LOCKED_AMOUNT_NOTICE,
  LOCKED_POINTS_NOTICE,
  LOCKED_ROLL_NOTICE_LINK,
  LOCKED_ROLL_NOTICE_PREFIX,
  LockedAmountNotice,
  LockedPointsNotice,
  LockedRollNotice,
  LockedSection,
} from '../LockedSection'
import { HISTORY_FAILED_MESSAGE } from '../BalanceHistory'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    jam_policy: [jamPolicyRow()],
    service_jam_rules: serviceJamRuleRows(),
    capsule_policy: [capsulePolicyRow()],
    capsule_chapter_costs: chapterCostRows(),
    item_book_tier_default_rewards: tierDefaultRewardRows(),
    combine_policy: [combinePolicyRow()],
    chapter_definitions: chapterDefinitionRows(),
    inventory_policy: [inventoryPolicyRow()],
    inventory: inventoryRows(1234),
    abusing_policy: [abusingPolicyRow()],
    ambient_drop_config: [ambientDropConfigRow()],
    badge_point_policy: [badgePointPolicyRow()],
    balance_setting_changes: [
      {
        id: 'h-1',
        section_key: 'jam',
        changes: [{ field: 'intensity_hard', from: 2, to: 3 }],
        note: '정리',
        affects_disclosure: false,
        changed_by: 'u-1',
        created_at: '2026-10-22T01:30:00.000+00:00',
      },
    ],
    users: [{ id: 'u-1', username: 'karina' }],
  })
  h.client = db.client
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const html = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: JAM_BINDING })).replace(/<!-- -->/g, '')

describe('구역 레지스트리', () => {
  it('지금 구역은 잼·서비스 활동 잼·동기화·캡슐·잠긴 아이템 배지·컬렉션과 믹스·챕터·인벤토리·어뷰징·시스템 드랍·배지와 포인트 순서이고 구역 키는 겹치지 않는다', () => {
    expect(BALANCE_SECTIONS.map((section) => section.binding.id)).toEqual([
      'jam',
      'servicejam',
      'sync',
      'capsule',
      'locked',
      'collection',
      'chapter',
      'inventory',
      'abusing',
      'ambient',
      'badgepoints',
    ])
    const ids = BALANCE_SECTIONS.map((section) => section.binding.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('구역마다 연결 객체·이동 링크 글자·제목·설명·본문이 있다', () => {
    for (const section of BALANCE_SECTIONS) {
      expect(section.binding.fields.length, section.binding.id).toBeGreaterThan(0)
      expect(typeof section.binding.read, section.binding.id).toBe('function')
      expect(typeof section.binding.write, section.binding.id).toBe('function')
      expect(section.label, section.binding.id).not.toBe('')
      expect(section.title, section.binding.id).not.toBe('')
      expect(section.description.length, section.binding.id).toBeGreaterThan(0)
      expect(typeof section.Body, section.binding.id).toBe('function')
    }
  })

  it('구역 안의 칸 이름은 겹치지 않는다', () => {
    for (const section of BALANCE_SECTIONS) {
      const keys = section.binding.fields.map((def) => def.key)
      expect(new Set(keys).size, section.binding.id).toBe(keys.length)
    }
  })

  it('구역 키로 구역을 찾고, 모르는 키는 undefined다', () => {
    expect(findBalanceSection('jam')?.binding).toBe(JAM_BINDING)
    expect(findBalanceSection('servicejam')?.binding).toBe(SERVICE_JAM_BINDING)
    expect(findBalanceSection('sync')?.binding).toBe(SYNC_BINDING)
    expect(findBalanceSection('capsule')?.binding).toBe(CAPSULE_BINDING)
    expect(findBalanceSection('locked')?.binding).toBe(LOCKED_BINDING)
    expect(findBalanceSection('collection')?.binding).toBe(COLLECTION_BINDING)
    expect(findBalanceSection('chapter')?.binding).toBe(CHAPTER_BINDING)
    expect(findBalanceSection('inventory')?.binding).toBe(INVENTORY_BINDING)
    expect(findBalanceSection('abusing')?.binding).toBe(ABUSING_BINDING)
    expect(findBalanceSection('ambient')?.binding).toBe(AMBIENT_BINDING)
    expect(findBalanceSection('badgepoints')?.binding).toBe(BADGEPOINTS_BINDING)
    expect(findBalanceSection('nope')).toBeUndefined()
    expect(findBalanceSection('')).toBeUndefined()
  })
})

describe('BalanceSectionBody', () => {
  it('폼(저장된 값)과 최근 변경(이름은 표시 이름만)을 그린다', async () => {
    const out = await html()
    expect(out).toContain('id="balance-jam-intensity_hard"')
    expect(out).toMatch(/id="balance-jam-mass_earn_alert_multiplier"[^>]*value="3"/)
    expect(out).toContain('karina · 2026.10.22 10:30')
    expect(out).toContain('강도 배율 · 격함: 2배 → 3배')
    expect(out).toContain('메모: 정리')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await html()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('값을 읽지 못하면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.readErrors.jam_policy = 'boom'
    const out = await html()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).toContain('role="alert"')
    expect(out).not.toContain('<form')
  })

  it('서비스 클라이언트를 만들지 못해도 오류 카드가 된다', async () => {
    h.client = 'throw'
    expect(await html()).toContain(BALANCE_LOAD_FAILED_MESSAGE)
  })

  it('최근 변경만 못 읽으면 폼은 열리고 목록 자리에 안내가 나온다', async () => {
    db.readErrors.balance_setting_changes = 'boom'
    const out = await html()
    expect(out).toContain('<form')
    expect(out).toContain(HISTORY_FAILED_MESSAGE)
  })
})

describe('BalanceSectionBody — 동기화 구역 (2회)', () => {
  const syncHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: SYNC_BINDING })).replace(/<!-- -->/g, '')

  it('열한 칸의 입력(저장된 값)과 네 묶음 제목, 등급 확률 합계 줄이 보인다', async () => {
    const out = await syncHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(11)
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual([
      '확정으로 받는 개수',
      '보너스',
      '등급 확률',
      '캡슐과 함께 쓰는 값',
    ])
    expect(out).toMatch(/id="balance-sync-sync_rarity_common"[^>]*value="84"/)
    expect(out).toMatch(/id="balance-sync-sync_rarity_epic"[^>]*value="2.5"/)
    expect(out).toMatch(/id="balance-sync-locked_roll_probability"[^>]*value="0.25"/)
    expect(out).toMatch(/<p role="status"[^>]*>합계 100%<\/p>/)
    expect(out).not.toContain('아이템 배지가 나오지 않아요')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await syncHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('최근 변경은 이 구역(sync)의 줄만 보인다(잼 구역 줄은 보이지 않는다)', async () => {
    const out = await syncHtml()
    expect(out).not.toContain('karina')
    expect(out).toContain('아직 바꾼 기록이 없어요.')
  })

  it('저장된 개수가 모두 0이면 경고가 서버 렌더에도 보인다(0개 허용)', async () => {
    db.tables.jam_policy = [jamPolicyRow({ sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0, sync_item_bonus_rolls: 0 })]
    expect(await syncHtml()).toContain('아이템 배지가 나오지 않아요')
  })
})

describe('BalanceSectionBody — 캡슐 구역 (2회)', () => {
  const capsuleHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: CAPSULE_BINDING })).replace(/<!-- -->/g, '')

  it('서른아홉 칸의 입력(저장된 값)과 여덟 묶음 제목, 등급 확률 합계 줄이 보인다', async () => {
    const out = await capsuleHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(39)
    expect(out).not.toContain('pre_quest_unlock_required')
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual([
      '나오는 개수',
      '확률',
      '등급 확률',
      '보정',
      '퀘스트 전 캡슐',
      '챕터별 채울 양 (동기화 자동 채움)',
      '챕터별 100% 횟수 (다음 챕터로 오르는 횟수)',
      '챕터별 채울 양 (옛 수동 채우기)',
    ])
    expect(out).toMatch(/id="balance-capsule-rarity_common"[^>]*value="70"/)
    expect(out).toMatch(/id="balance-capsule-bonus_probability"[^>]*value="0.2"/)
    expect(out).toMatch(/id="balance-capsule-chapter:1"[^>]*value="90"/)
    expect(out).toMatch(/id="balance-capsule-chapter:10"[^>]*value="220"/)
    expect(out).toMatch(/id="balance-capsule-fill_v2:1"[^>]*value="145"/)
    expect(out).toMatch(/id="balance-capsule-fill_v2:10"[^>]*value="365"/)
    expect(out).toMatch(/id="balance-capsule-advance:1"[^>]*value="6"/)
    expect(out).toMatch(/id="balance-capsule-advance:9"[^>]*value="12"/)
    expect(out).not.toContain('balance-capsule-advance:10')
    expect(out).toContain('챕터 10은 마지막이라 횟수가 없어요.')
    expect(out).toContain('기본값 6번')
    expect(out).toContain('챕터 10')
    expect(out).toContain('기본값 220잼')
    expect(out).toMatch(/<p role="status"[^>]*>합계 100%<\/p>/)
    expect(out).not.toContain('아이템 배지가 나오지 않아요')
  })

  it('Common 연속 보정과 잠길 확률 칸은 이 구역에 없다(동기화 구역에서 편집한다)', async () => {
    const out = await capsuleHtml()
    expect(out).not.toContain('common_streak_threshold')
    expect(out).not.toContain('locked_roll_probability')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await capsuleHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('챕터 행이 비어 있으면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.tables.capsule_chapter_costs = chapterCostRows().slice(0, 9)
    const out = await capsuleHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('«동기화와 같은 값이에요» 안내가 있고 동기화 구역 링크가 레지스트리의 구역 키를 가리킨다', () => {
    const out = renderToStaticMarkup(<SharedValuesNotice />).replace(/<!-- -->/g, '')
    expect(out).toContain(SHARED_VALUES_NOTICE_PREFIX)
    expect(SHARED_VALUES_NOTICE_PREFIX).toContain('동기화와 같은 값이에요')
    expect(out).toContain(`href="#${SYNC_BINDING.id}"`)
    expect(out).toContain(`>${SHARED_VALUES_NOTICE_LINK}</a>`)
    expect(out).toContain('role="note"')
    expect(out).not.toContain('role="alert"')
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })
})

describe('BalanceSectionBody — 잠긴 아이템 배지 구역 (7-2 1회)', () => {
  const lockedHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: LOCKED_BINDING })).replace(/<!-- -->/g, '')

  it('여덟 칸의 입력(저장된 값)과 두 묶음 제목이 보이고, 합계 줄은 없다', async () => {
    const out = await lockedHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(8)
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual(['여는 포인트', '등급별 최소값'])
    expect(out).toMatch(/id="balance-locked-locked_points_common"[^>]*value="50"/)
    expect(out).toMatch(/id="balance-locked-locked_points_rare"[^>]*value="100"/)
    expect(out).toMatch(/id="balance-locked-locked_points_epic"[^>]*value="200"/)
    expect(out).toMatch(/id="balance-locked-locked_points_mystic"[^>]*value="400"/)
    expect(out).toContain('기본값 400포인트')
    expect(out).toMatch(/id="balance-locked-locked_min_common"[^>]*value="30"/)
    expect(out).toMatch(/id="balance-locked-locked_min_rare"[^>]*value="60"/)
    expect(out).toMatch(/id="balance-locked-locked_min_epic"[^>]*value="120"/)
    expect(out).toMatch(/id="balance-locked-locked_min_mystic"[^>]*value="240"/)
    expect(out).toContain('기본값 240잼')
    expect(out).not.toContain('role="status"')
  })

  it('잠길 확률 칸은 이 구역에 없다(동기화 구역에서 편집한다)', async () => {
    expect(await lockedHtml()).not.toContain('locked_roll_probability')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await lockedHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('값을 읽지 못하면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.readErrors.jam_policy = 'boom'
    const out = await lockedHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('«잠길 확률은 동기화와 같은 값이에요» 안내가 있고 동기화 구역 링크가 레지스트리의 구역 키를 가리킨다', () => {
    const out = renderToStaticMarkup(<LockedRollNotice />).replace(/<!-- -->/g, '')
    expect(LOCKED_ROLL_NOTICE_PREFIX).toContain('동기화와 같은 값이에요')
    expect(out).toContain(LOCKED_ROLL_NOTICE_PREFIX)
    expect(out).toContain(`href="#${SYNC_BINDING.id}"`)
    expect(out).toContain(`>${LOCKED_ROLL_NOTICE_LINK}</a>`)
    expect(out).toContain('role="note"')
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })

  it('아래 안내는 «배지에 따로 정한 값이 먼저»이고 줄바꿈 설정이 붙는다', () => {
    const out = renderToStaticMarkup(<LockedAmountNotice />).replace(/<!-- -->/g, '')
    expect(LOCKED_AMOUNT_NOTICE).toContain('따로 정해 둔 경우에는 그 값이 먼저')
    expect(LOCKED_AMOUNT_NOTICE).toContain('새 최소값보다 낮은 값이 남아 있을 수 있어요')
    expect(LOCKED_AMOUNT_NOTICE).toContain('잼을 채워 여는 옛 방식')
    expect(out).toContain(LOCKED_AMOUNT_NOTICE)
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })

  it('여는 포인트 안내는 «배정될 때 고정»과 «0이면 포인트 없이 열림»을 알리고 줄바꿈 설정이 붙는다', () => {
    const out = renderToStaticMarkup(<LockedPointsNotice />).replace(/<!-- -->/g, '')
    expect(LOCKED_POINTS_NOTICE).toContain('배정될 때')
    expect(LOCKED_POINTS_NOTICE).toContain('이미 배정된 아이템 배지의 여는 포인트는 그대로')
    expect(LOCKED_POINTS_NOTICE).toContain('0으로 두면')
    expect(out).toContain(LOCKED_POINTS_NOTICE)
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })

  it('구역 본문은 위쪽 안내, 폼 뼈대(잠긴 구역 연결), 여는 포인트 안내, 최소값 안내 순서다', () => {
    const children = Children.toArray(LockedSection().props.children) as ReactElement<{ binding?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([LockedRollNotice, BalanceSectionBody, LockedPointsNotice, LockedAmountNotice])
    expect(children[1].props.binding).toBe(LOCKED_BINDING)
  })
})

describe('BalanceSectionBody — 컬렉션과 믹스 구역 (7-2 1회)', () => {
  const collectionHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: COLLECTION_BINDING })).replace(/<!-- -->/g, '')

  it('여섯 칸의 입력(저장된 값)과 두 묶음 제목이 보이고 윗등급 확률은 퍼센트로 보인다', async () => {
    const out = await collectionHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(6)
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual(['컬렉션 등급별 완성 포인트', '믹스'])
    expect(out).toMatch(/id="balance-collection-default_reward:common"[^>]*value="100"/)
    expect(out).toMatch(/id="balance-collection-default_reward:mystic"[^>]*value="800"/)
    expect(out).toMatch(/id="balance-collection-fail_reward_points"[^>]*value="10"/)
    expect(out).toMatch(/id="balance-collection-tier_up_probability"[^>]*value="70"/)
    expect(out).toContain('믹스 실패 포인트')
    expect(out).toContain('등급 올리기 윗등급 확률')
    expect(out).toContain('기본값 800포인트')
    expect(out).toContain('기본값 70%')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await collectionHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('등급 행이 비어 있으면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.tables.item_book_tier_default_rewards = tierDefaultRewardRows().slice(0, 2)
    const out = await collectionHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('믹스 정책 행을 읽지 못해도 이 구역만 오류 카드가 된다', async () => {
    db.readErrors.combine_policy = 'boom'
    expect(await collectionHtml()).toContain(BALANCE_LOAD_FAILED_MESSAGE)
  })

  it('안내에 «컬렉션마다 따로 정한 값이 먼저»·«이미 받은 보상은 그대로»·«재료가 사라지고 실패 포인트를 줘요»·«윗등급 확률이 확률 안내에도 반영»이 있다', () => {
    const out = renderToStaticMarkup(<CollectionNotice />).replace(/<!-- -->/g, '')
    expect(COLLECTION_REWARD_NOTICE).toContain('따로 정해 둔')
    expect(COLLECTION_REWARD_NOTICE).toContain('그 값이 먼저')
    expect(COLLECTION_REWARD_NOTICE).toContain('이미 받은 보상은 바뀌지 않아요')
    expect(COLLECTION_REWARD_NOTICE).toContain('0이면 포인트를 주지 않아요')
    expect(COMBINE_FAIL_NOTICE).toContain('재료가 사라지고')
    expect(COMBINE_FAIL_NOTICE).toContain('믹스 실패 포인트')
    expect(COMBINE_TIER_UP_NOTICE).toContain('윗등급 확률')
    expect(COMBINE_TIER_UP_NOTICE).toContain('같은 등급')
    expect(COMBINE_TIER_UP_NOTICE).toContain('확률 안내 페이지')
    expect(out).toContain(COLLECTION_REWARD_NOTICE)
    expect(out).toContain(COMBINE_FAIL_NOTICE)
    expect(out).toContain(COMBINE_TIER_UP_NOTICE)
    expect(out).toContain('role="note"')
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })

  it('구역 본문은 안내, 폼 뼈대(컬렉션과 믹스 구역 연결) 순서다', () => {
    const children = Children.toArray(CollectionSection().props.children) as ReactElement<{ binding?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([CollectionNotice, BalanceSectionBody])
    expect(children[1].props.binding).toBe(COLLECTION_BINDING)
  })
})

describe('BalanceSectionBody — 챕터 구역 (7-2 2회)', () => {
  const chapterHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: CHAPTER_BINDING })).replace(/<!-- -->/g, '')

  it('9칸의 입력(저장된 값)과 한 개 묶음 제목이 보이고, 합계 줄은 없다', async () => {
    const out = await chapterHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(9)
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual(['챕터별 필요 누적 점수'])
    expect(out).toMatch(/id="balance-chapter-required:2"[^>]*value="1000"/)
    expect(out).toMatch(/id="balance-chapter-required:10"[^>]*value="23000"/)
    expect(out).not.toContain('id="balance-chapter-required:1"')
    expect(out).toContain('챕터 10')
    expect(out).toContain('기본값 23,000점')
    expect(out).not.toContain('주간 상한')
    expect(out).not.toContain('role="status"')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await chapterHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('챕터 행이 비어 있으면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.tables.chapter_definitions = chapterDefinitionRows().slice(0, 9)
    const out = await chapterHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('표를 읽지 못해도 이 구역만 오류 카드가 된다', async () => {
    db.readErrors.chapter_definitions = 'boom'
    expect(await chapterHtml()).toContain(BALANCE_LOAD_FAILED_MESSAGE)
  })

  it('안내에 «이미 오른 유저는 내려가지 않고 낮춘 기준은 다음 점수부터»가 있고, 걷은 점수 규칙 문구는 없다', () => {
    const out = renderToStaticMarkup(<ChapterNotice />).replace(/<!-- -->/g, '')
    expect(CHAPTER_RISEN_NOTICE).toContain('이미 오른 유저의 챕터는 내려가지 않아요')
    expect(CHAPTER_RISEN_NOTICE).toContain('캡슐이 100%에 닿은 횟수로 오르고')
    expect(CHAPTER_RISEN_NOTICE).toContain('«다음 챕터까지» 게이지에만 쓰여요')
    expect(CHAPTER_RISEN_NOTICE).not.toContain('점수를 쌓')
    expect(out).toContain(CHAPTER_RISEN_NOTICE)
    expect(out).not.toContain('U11')
    expect(out).not.toContain('포인트')
    expect(out).toContain('role="note"')
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })

  it('구역 설명에 챕터 1은 0이고 번호는 늘리거나 줄이지 않는다고 적혀 있고, 활동별 점수 규칙 설명은 없다', () => {
    const description = (findBalanceSection('chapter')?.description ?? []).join(' ')
    expect(description).toContain('챕터 1은 퀘스트를 마치면 얻어서 필요한 점수가 0')
    expect(description).toContain('늘리거나 줄이지 않고 값만 바꾸며')
    expect(description).toContain('앞 챕터보다 커야 해요')
    expect(description).toContain('캡슐이 100%에 닿은 횟수로 올라요')
    expect(description).toContain('«다음 챕터까지» 게이지에만 쓰이는')
    expect(description).not.toContain('점수를 쌓')
    expect(description).not.toContain('주간 상한')
  })

  it('구역 본문은 안내, 폼 뼈대(챕터 구역 연결) 순서다', () => {
    const children = Children.toArray(ChapterSection().props.children) as ReactElement<{ binding?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([ChapterNotice, BalanceSectionBody])
    expect(children[1].props.binding).toBe(CHAPTER_BINDING)
  })
})

describe('BalanceSectionBody — 서비스 활동 잼 구역 (티켓 20261028_1735 4회)', () => {
  const serviceJamHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: SERVICE_JAM_BINDING })).replace(/<!-- -->/g, '')

  it('아홉 칸의 입력(저장된 값)과 두 묶음 제목이 보이고, 합계 줄은 없다', async () => {
    const out = await serviceJamHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(9)
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual(['활동 종류별 잼', '받을 수 있는 양의 상한'])
    expect(out).toMatch(/id="balance-servicejam-rule:mission_complete:amount"[^>]*value="20"/)
    expect(out).toMatch(/id="balance-servicejam-rule:collection_complete:amount"[^>]*value="30"/)
    expect(out).toMatch(/id="balance-servicejam-rule:drop:amount"[^>]*value="0"/)
    expect(out).toMatch(/id="balance-servicejam-service_jam_daily_cap"[^>]*value="40"/)
    expect(out).toMatch(/id="balance-servicejam-service_jam_weekly_cap"[^>]*value="100"/)
    expect(out).toContain('0이면 «상한 없음»이 아니라 서비스 활동으로 받는 잼이 없어요.')
    expect(out).not.toContain('role="status"')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await serviceJamHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('규칙 행이 비어 있으면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.tables.service_jam_rules = serviceJamRuleRows().slice(0, 6)
    const out = await serviceJamHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('구역 설명에 상한 0은 상한 없음이 아니라 받는 잼이 없다는 뜻이라고 적혀 있다', () => {
    const description = (findBalanceSection('servicejam')?.description ?? []).join(' ')
    expect(description).toContain('상한이 0이면 «상한 없음»이 아니라 서비스 활동으로 받는 잼이 없어요')
  })

  it('구역 본문은 폼 뼈대(서비스 활동 잼 구역 연결)다', () => {
    const element = ServiceJamSection() as ReactElement<{ binding?: unknown }>
    expect(element.type).toBe(BalanceSectionBody)
    expect(element.props.binding).toBe(SERVICE_JAM_BINDING)
  })
})

describe('BalanceSectionBody — 인벤토리 구역 (7-3 1회)', () => {
  const inventoryHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: INVENTORY_BINDING })).replace(/<!-- -->/g, '')

  it('한 칸의 입력(저장된 값)과 단위·기본값이 보이고, 묶음 제목과 합계 줄은 없다', async () => {
    const out = await inventoryHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(1)
    expect(out).toMatch(/id="balance-inventory-max_slots"[^>]*value="10"/)
    expect(out).toContain('인벤토리 최대치')
    expect(out).toContain('기본값 50개')
    expect(out).not.toContain('<legend')
    expect(out).not.toContain('role="status"')
  })

  it('읽기만 한다(쓰기와 RPC 호출이 없다)', async () => {
    await inventoryHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert') || call.startsWith('rpc.'))).toEqual([])
    expect(db.rpcCalls).toEqual([])
  })

  it('값을 읽지 못하면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.readErrors.inventory_policy = 'boom'
    const out = await inventoryHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('안내는 «저장하면 전체 유저 N명의 인벤토리 최대치가 즉시 바뀌어요»이고 줄바꿈 설정이 붙는다', () => {
    expect(inventoryApplyNotice(1234)).toBe('저장하면 전체 유저 1,234명의 인벤토리 최대치가 즉시 바뀌어요.')
    expect(inventoryApplyNotice(0)).toBe('저장하면 전체 유저 0명의 인벤토리 최대치가 즉시 바뀌어요.')
    const out = renderToStaticMarkup(<InventoryNotice userCount={1234} />).replace(/<!-- -->/g, '')
    expect(out).toContain('저장하면 전체 유저 1,234명의 인벤토리 최대치가 즉시 바뀌어요.')
    expect(out).toContain('role="note"')
    expect(out).not.toContain('role="alert"')
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })

  it('유저 수를 모르면 N 없이 같은 뜻의 문장을 보인다', () => {
    expect(inventoryApplyNotice(null)).toBe(INVENTORY_APPLY_NOTICE_FALLBACK)
    expect(INVENTORY_APPLY_NOTICE_FALLBACK).toBe('저장하면 전체 유저의 인벤토리 최대치가 즉시 바뀌어요.')
    expect(renderToStaticMarkup(<InventoryNotice userCount={null} />)).toContain(INVENTORY_APPLY_NOTICE_FALLBACK)
  })

  it('구역 본문은 안내, 폼 뼈대(인벤토리 구역 연결) 순서이고 안내의 N은 inventory 표에서 읽은 유저 수다', async () => {
    const section = await InventorySection()
    const children = Children.toArray(section.props.children) as ReactElement<{ binding?: unknown; userCount?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([InventoryNotice, BalanceSectionBody])
    expect(children[0].props.userCount).toBe(1234)
    expect(children[1].props.binding).toBe(INVENTORY_BINDING)
  })

  it('유저 수를 읽지 못해도 구역은 열리고 안내만 N 없이 나온다(읽기 오류는 로그로 남는다)', async () => {
    db.readErrors.inventory = 'boom'
    const section = await InventorySection()
    const children = Children.toArray(section.props.children) as ReactElement<{ userCount?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([InventoryNotice, BalanceSectionBody])
    expect(children[0].props.userCount).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('구역 설명에 «지금 있는 유저와 앞으로 가입할 유저 모두»와 «더 많이 가진 유저가 있으면 저장되지 않아요»가 있다', () => {
    const description = (findBalanceSection('inventory')?.description ?? []).join(' ')
    expect(description).toContain('지금 있는 유저 전원과 앞으로 가입할 유저에게 모두 적용돼요')
    expect(description).toContain('새 최대치보다 많은 아이템을 가진 유저가 있으면 저장되지 않아요')
  })
})

describe('BalanceSectionBody — 어뷰징 구역 (7-3 2회)', () => {
  const abusingHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: ABUSING_BINDING })).replace(/<!-- -->/g, '')

  it('열 칸의 입력(저장된 값)이 다섯 묶음 제목 아래에 보이고 단위·기본값이 붙으며, 합계 줄은 없다', async () => {
    const out = await abusingHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(10)
    for (const title of ['이동 감지', '차량', '교통수단', '종목 불일치', '장소 블록']) expect(out, title).toContain(`>${title}</legend>`)
    expect([...out.matchAll(/<legend/g)]).toHaveLength(5)
    expect(out).toMatch(/id="balance-abusing-gps_max_speed_kmh"[^>]*value="300"/)
    expect(out).toMatch(/id="balance-abusing-vehicle_speed_filter_kmh"[^>]*value="60"/)
    expect(out).toMatch(/id="balance-abusing-mismatch_run_min_speed_kmh"[^>]*value="6"/)
    expect(out).toMatch(/id="balance-abusing-poi_block_hours"[^>]*value="72"/)
    expect(out).toContain('기본값 60km/h')
    expect(out).toContain('기본값 72시간')
    expect(out).toContain('20km/h 아래로는 내릴 수 없어요')
    expect(out).not.toContain('role="status"')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await abusingHtml()
    expect(db.calls.filter((call) => call.startsWith('abusing_policy.') && call !== 'abusing_policy.select')).toEqual([])
  })

  it('행이 없으면 기본값으로 폼을 열고(읽기 오류 카드가 아니다) 첫 저장이 행을 만든다', async () => {
    db.tables.abusing_policy = []
    const out = await abusingHtml()
    expect(out).toMatch(/id="balance-abusing-gps_max_speed_kmh"[^>]*value="300"/)
    expect(out).not.toContain(BALANCE_LOAD_FAILED_MESSAGE)
  })

  it('값을 읽지 못하면 던지지 않고 이 구역만 오류 카드가 된다(기본값으로 바꿔 보이지 않는다)', async () => {
    db.readErrors.abusing_policy = 'boom'
    const out = await abusingHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('구역 본문은 폼 뼈대(어뷰징 구역 연결)다', () => {
    const body = AbusingSection()
    expect(body.type).toBe(BalanceSectionBody)
    expect((body.props as { binding: unknown }).binding).toBe(ABUSING_BINDING)
  })

  it('구역 설명이 기준값의 뜻과 적용 시점을 말한다', () => {
    const section = findBalanceSection('abusing')
    expect(section?.label).toBe('어뷰징')
    const description = (section?.description ?? []).join(' ')
    expect(description).toContain('비정상 이동(GPS 조작)')
    expect(description).toContain('저장 즉시 다음 동기화와 장소 픽업부터 적용돼요')
  })
})

describe('BalanceSectionBody — 시스템 드랍 구역 (7-3 3회)', () => {
  const ambientHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: AMBIENT_BINDING })).replace(/<!-- -->/g, '')

  it('여덟 칸의 입력(저장된 값)이 세 묶음 제목 아래에 보이고, 등급 비율은 퍼센트로 보이며 합계 줄이 있다', async () => {
    const out = await ambientHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(8)
    for (const title of ['예약 배포', '배치 규모', '등급 비율']) expect(out, title).toContain(`>${title}</legend>`)
    expect([...out.matchAll(/<legend/g)]).toHaveLength(3)
    expect(out).toMatch(/id="balance-ambient-schedule_hour_kst"[^>]*value="3"/)
    expect(out).toMatch(/id="balance-ambient-exclusion_window_minutes"[^>]*value="15"/)
    expect(out).toMatch(/id="balance-ambient-batch_size"[^>]*value="30"/)
    expect(out).toMatch(/id="balance-ambient-max_active_per_poi"[^>]*value="1"/)
    // DB는 0.600·0.300·0.100·0.000이지만 화면은 퍼센트다
    expect(out).toMatch(/id="balance-ambient-rarity_common"[^>]*value="60"/)
    expect(out).toMatch(/id="balance-ambient-rarity_rare"[^>]*value="30"/)
    expect(out).toMatch(/id="balance-ambient-rarity_epic"[^>]*value="10"/)
    expect(out).toMatch(/id="balance-ambient-rarity_mystic"[^>]*value="0"/)
    expect(out).toContain('기본값 3시')
    expect(out).toContain('기본값 15분')
    expect(out).toContain('기본값 100%')
    expect(out).toMatch(/<p role="status"[^>]*>합계 100%<\/p>/)
    expect(out).toContain('180분까지만 정할 수 있어요')
    expect(out).not.toContain('720')
  })

  it('소수 퍼센트로 저장된 값(0.333·0.333·0.334)은 긴 소수 없이 33.3·33.3·33.4로 보인다', async () => {
    db.tables.ambient_drop_config = [ambientDropConfigRow({ rarity_common: '0.333', rarity_rare: '0.333', rarity_epic: '0.334', rarity_mystic: '0.000' })]
    const out = await ambientHtml()
    expect(out).toMatch(/id="balance-ambient-rarity_common"[^>]*value="33.3"/)
    expect(out).toMatch(/id="balance-ambient-rarity_epic"[^>]*value="33.4"/)
    expect(out).toMatch(/<p role="status"[^>]*>합계 100%<\/p>/)
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await ambientHtml()
    expect(db.calls.filter((call) => call.startsWith('ambient_drop_config.') && call !== 'ambient_drop_config.select')).toEqual([])
  })

  it('값을 읽지 못하면 던지지 않고 이 구역만 오류 카드가 된다(기본값으로 바꿔 보이지 않는다)', async () => {
    db.readErrors.ambient_drop_config = 'boom'
    const out = await ambientHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('행이 없으면 기본값으로 바꿔 보이지 않고 오류 카드가 된다', async () => {
    db.tables.ambient_drop_config = []
    const out = await ambientHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('등급이 무작위이면 폼 위에 «비율을 쓰지 않아요» 안내 한 줄과 폼 뼈대 순서다', async () => {
    db.tables.ambient_drop_config = [ambientDropConfigRow({ rarity_mode: 'random' })]
    const section = await AmbientSection()
    const children = Children.toArray(section.props.children) as ReactElement<{ binding?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([AmbientRarityRandomNotice, BalanceSectionBody])
    expect(children[1].props.binding).toBe(AMBIENT_BINDING)
  })

  it('등급이 명시이면 안내 없이 폼 뼈대뿐이다', async () => {
    const section = await AmbientSection()
    const children = Children.toArray(section.props.children) as ReactElement<{ binding?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([BalanceSectionBody])
    expect(children[0].props.binding).toBe(AMBIENT_BINDING)
  })

  it('등급 축을 읽지 못해도 구역은 열리고 안내만 빠진다(값 읽기를 막지 않는다. 읽기 오류는 로그로 남는다)', async () => {
    db.tables.ambient_drop_config = [ambientDropConfigRow({ rarity_mode: 'weird' })]
    const section = await AmbientSection()
    const children = Children.toArray(section.props.children) as ReactElement<{ binding?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([BalanceSectionBody])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ambient 등급 축 조회 실패'), expect.stringContaining('rarity_mode'))
    // 구역 값 읽기는 그대로 성공한다
    const out = await ambientHtml()
    expect(out).toMatch(/id="balance-ambient-batch_size"[^>]*value="30"/)
  })

  it('안내 문장은 무작위라 비율을 쓰지 않는다는 뜻이고 줄바꿈 설정이 붙으며 링크가 없다', () => {
    expect(AMBIENT_RARITY_RANDOM_NOTICE).toBe('지금 등급은 「무작위」로 정해서 아래 등급 비율을 쓰지 않아요. 앰비언트 드랍 화면에서 등급을 「명시」로 바꾸면 이 비율대로 정해요.')
    const out = renderToStaticMarkup(<AmbientRarityRandomNotice />).replace(/<!-- -->/g, '')
    expect(out).toContain(AMBIENT_RARITY_RANDOM_NOTICE)
    expect(out).toContain('role="note"')
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
    expect(out).not.toContain('<a ')
  })

  it('구역 설명이 예약 배포·상호 배제 창·등급 비율과 적용 시점, 옛 화면에 남은 일을 말한다', () => {
    const section = findBalanceSection('ambient')
    expect(section?.label).toBe('시스템 드랍')
    expect(section?.title).toBe('시스템 드랍')
    const description = (section?.description ?? []).join(' ')
    expect(description).toContain('예약 배포')
    expect(description).toContain('상호 배제 창')
    expect(description).toContain('등급 비율')
    expect(description).toContain('저장하면 다음 배포부터 적용돼요')
    expect(description).toContain('앰비언트 드랍 화면')
  })
})

describe('BalanceSectionBody — 배지와 포인트 구역 (7-4 1회)', () => {
  const badgePointsHtml = async () => renderToStaticMarkup(await BalanceSectionBody({ binding: BADGEPOINTS_BINDING })).replace(/<!-- -->/g, '')

  it('다섯 칸의 입력(저장된 값)과 두 묶음 제목이 보이고, 합계 줄은 없다', async () => {
    const out = await badgePointsHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(5)
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual(['등급별 포인트', '레벨형'])
    expect(out).toMatch(/id="balance-badgepoints-common_points"[^>]*value="10"/)
    expect(out).toMatch(/id="balance-badgepoints-rare_points"[^>]*value="20"/)
    expect(out).toMatch(/id="balance-badgepoints-epic_points"[^>]*value="50"/)
    expect(out).toMatch(/id="balance-badgepoints-mystic_points"[^>]*value="100"/)
    expect(out).toMatch(/id="balance-badgepoints-leveled_points"[^>]*value="10"/)
    expect(out).toContain('기본값 100포인트')
    expect(out).not.toContain('role="status"')
  })

  it('저장된 값이 기본값과 달라도 저장된 값을 보인다', async () => {
    db.tables.badge_point_policy = [badgePointPolicyRow({ rare_points: 25, leveled_points: 0 })]
    const out = await badgePointsHtml()
    expect(out).toMatch(/id="balance-badgepoints-rare_points"[^>]*value="25"/)
    expect(out).toMatch(/id="balance-badgepoints-leveled_points"[^>]*value="0"/)
  })

  it('칸 안내가 «이미 있는 배지는 바뀌지 않아요»를 말한다', async () => {
    const out = await badgePointsHtml()
    expect([...out.matchAll(/이미 있는 배지는 바뀌지 않아요/g)]).toHaveLength(5)
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await badgePointsHtml()
    expect(db.calls.filter((call) => call.endsWith('.update') || call.endsWith('.insert'))).toEqual([])
  })

  it('값을 읽지 못하면 던지지 않고 이 구역만 오류 카드가 된다', async () => {
    db.readErrors.badge_point_policy = 'boom'
    const out = await badgePointsHtml()
    expect(out).toContain(BALANCE_LOAD_FAILED_MESSAGE)
    expect(out).not.toContain('<form')
  })

  it('위 안내는 «새 배지의 기본값이고 이미 있는 배지·받은 포인트는 그대로, 숨김은 0»이며 줄바꿈 설정이 붙는다', () => {
    const out = renderToStaticMarkup(<BadgePointsNotice />).replace(/<!-- -->/g, '')
    expect(BADGEPOINTS_NOTICE).toContain('새 배지의 기본값')
    expect(BADGEPOINTS_NOTICE).toContain('이미 있는 배지의 포인트는 바뀌지 않고')
    expect(BADGEPOINTS_NOTICE).toContain('이미 받은 포인트도 그대로')
    expect(BADGEPOINTS_NOTICE).toContain('숨김 배지는 항상 0')
    expect(out).toContain(BADGEPOINTS_NOTICE)
    expect(out).toContain('role="note"')
    expect(out).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word/)
  })

  it('구역 본문은 안내, 폼 뼈대(배지와 포인트 구역 연결) 순서다', () => {
    const children = Children.toArray(BadgePointsSection().props.children) as ReactElement<{ binding?: unknown }>[]
    expect(children.map((child) => child.type)).toEqual([BadgePointsNotice, BalanceSectionBody])
    expect(children[1].props.binding).toBe(BADGEPOINTS_BINDING)
  })

  it('구역 설명이 새 배지 양식의 기본값, 포인트를 정하지 않고 만든 배지, 적용 시점을 말한다', () => {
    const section = findBalanceSection('badgepoints')
    expect(section?.label).toBe('배지와 포인트')
    expect(section?.title).toBe('배지와 포인트')
    const description = (section?.description ?? []).join(' ')
    expect(description).toContain('새 배지 양식')
    expect(description).toContain('레벨형')
    expect(description).toContain('「단계 추가」')
    expect(description).toContain('저장하면 다음에 만드는 배지부터 적용돼요')
  })
})
