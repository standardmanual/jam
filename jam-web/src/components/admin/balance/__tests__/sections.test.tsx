/**
 * 밸런스 설정 구역 레지스트리와 구역 본문 (티켓 20261022_1132 1회)
 *
 * - 레지스트리(`lib/admin/balance/sections.tsx`): 구역 키가 겹치지 않고, 구역마다 연결 객체·제목·본문이 있으며, 키로 구역을 찾는다(없으면 `undefined`).
 *   지금 구역은 잼·동기화·캡슐이다. 7-2~7-4는 이 배열에 줄을 더하면 된다
 * - 구역 본문(`BalanceSectionBody`, 서버 컴포넌트): 가짜 클라이언트로 값을 읽어 폼과 최근 변경을 그린다. **값을 읽지 못하면 던지지 않고** 오류 카드가 되고
 *   (한 구역이 실패해도 다른 구역은 보인다), 최근 변경만 못 읽으면 폼은 열린다. 읽기만 하고 아무것도 쓰지 않는다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
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
import { SYNC_BINDING } from '@/lib/admin/balance/sync'
import { CAPSULE_BINDING } from '@/lib/admin/balance/capsule'
import { BALANCE_LOAD_FAILED_MESSAGE } from '@/lib/admin/balance/save'
import { capsulePolicyRow, chapterCostRows, createFakeDb, jamPolicyRow, type FakeDb } from '@/lib/admin/balance/__tests__/fakeDb'
import { BalanceSectionBody } from '../BalanceSectionBody'
import { SHARED_VALUES_NOTICE_LINK, SHARED_VALUES_NOTICE_PREFIX, SharedValuesNotice } from '../CapsuleSection'
import { HISTORY_FAILED_MESSAGE } from '../BalanceHistory'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    jam_policy: [jamPolicyRow()],
    capsule_policy: [capsulePolicyRow()],
    capsule_chapter_costs: chapterCostRows(),
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
  it('지금 구역은 잼·동기화·캡슐 순서이고 구역 키는 겹치지 않는다', () => {
    expect(BALANCE_SECTIONS.map((section) => section.binding.id)).toEqual(['jam', 'sync', 'capsule'])
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
    expect(findBalanceSection('sync')?.binding).toBe(SYNC_BINDING)
    expect(findBalanceSection('capsule')?.binding).toBe(CAPSULE_BINDING)
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

  it('스물한 칸의 입력(저장된 값)과 여섯 묶음 제목, 등급 확률 합계 줄이 보인다', async () => {
    const out = await capsuleHtml()
    expect([...out.matchAll(/<input /g)]).toHaveLength(21)
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual([
      '나오는 개수',
      '확률',
      '등급 확률',
      '보정',
      '퀘스트 전 캡슐',
      '챕터별 채울 양',
    ])
    expect(out).toMatch(/id="balance-capsule-rarity_common"[^>]*value="70"/)
    expect(out).toMatch(/id="balance-capsule-bonus_probability"[^>]*value="0.2"/)
    expect(out).toMatch(/id="balance-capsule-chapter:1"[^>]*value="90"/)
    expect(out).toMatch(/id="balance-capsule-chapter:10"[^>]*value="220"/)
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
