/**
 * 운영 설정(S7) 구역 읽기 (티켓 20260930_1459 조각 B)
 *
 * 서버 컴포넌트 `BalanceSection`이 구역 본문에 넘기는 값과 실패 격리를 고정한다. 실제 DB에는 닿지 않는다(읽기 함수는 모의):
 * - 규칙과 열린 컬렉션 수를 읽어 본문에 넘긴다
 * - 규칙 조회가 실패하면 던지지 않고 rules가 null이다(이 구역만 오류 카드), 열린 수를 못 읽으면 그 값만 null이다(구역은 열린다)
 * - 서비스 클라이언트를 만들지 못해도 던지지 않는다
 * - 구역 목록(`OPS_SETTINGS_SECTIONS`)은 구역 하나당 배열 한 줄이다: ID가 겹치지 않고 밸런스 구역이 있다
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

const h = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  listOpsRules: vi.fn(),
  loadOpenCollectionsNow: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: h.createServiceClient }))
vi.mock('@/lib/admin/opsInbox/balance/save', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/balance/save')>()
  return { ...actual, listOpsRules: h.listOpsRules }
})
vi.mock('@/lib/admin/opsInbox/balance/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/balance/state')>()
  return { ...actual, loadOpenCollectionsNow: h.loadOpenCollectionsNow }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { BalanceSection } from '../BalanceSection'
import { OPS_SETTINGS_SECTIONS } from '../sections'

const RULES = [{ ruleKey: 'open_collections_max' }]

type SectionProps = { rules: unknown; openCollectionsNow: number | null }
const propsOf = (element: ReactElement) => element.props as SectionProps

beforeEach(() => {
  h.createServiceClient.mockReset()
  h.createServiceClient.mockReturnValue({})
  h.listOpsRules.mockReset()
  h.listOpsRules.mockResolvedValue(RULES)
  h.loadOpenCollectionsNow.mockReset()
  h.loadOpenCollectionsNow.mockResolvedValue({ ok: true, data: 30 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('BalanceSection', () => {
  it('규칙과 지금 열린 컬렉션 수를 읽어 본문에 넘긴다(밸런스 묶음만 읽는다)', async () => {
    const element = await BalanceSection()
    expect(propsOf(element)).toEqual({ rules: RULES, openCollectionsNow: 30 })
    expect(h.listOpsRules).toHaveBeenCalledWith(expect.anything(), 'balance')
  })

  it('규칙 조회가 실패하면 던지지 않고 rules가 null이다(열린 수는 그대로 읽는다)', async () => {
    h.listOpsRules.mockRejectedValue(new Error('규칙 조회 실패: down'))
    const element = await BalanceSection()
    expect(propsOf(element)).toEqual({ rules: null, openCollectionsNow: 30 })
    expect(console.error).toHaveBeenCalled()
  })

  it('열린 컬렉션 수를 못 읽으면 그 값만 null이고 규칙은 그대로다(저장은 막지 않는다)', async () => {
    h.loadOpenCollectionsNow.mockResolvedValue({ ok: false })
    const element = await BalanceSection()
    expect(propsOf(element)).toEqual({ rules: RULES, openCollectionsNow: null })
  })

  it('서비스 클라이언트를 만들지 못해도 던지지 않는다', async () => {
    h.createServiceClient.mockImplementation(() => {
      throw new Error('env missing')
    })
    const element = await BalanceSection()
    expect(propsOf(element)).toEqual({ rules: null, openCollectionsNow: null })
  })
})

describe('OPS_SETTINGS_SECTIONS', () => {
  it('구역 ID가 겹치지 않고 밸런스 구역이 첫 구역이다', () => {
    const ids = OPS_SETTINGS_SECTIONS.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('balance')
  })

  it('구역마다 이동 링크 글자·제목·설명·본문 컴포넌트가 있다', () => {
    for (const section of OPS_SETTINGS_SECTIONS) {
      expect(section.label).not.toBe('')
      expect(section.title).not.toBe('')
      expect(section.description.length).toBeGreaterThan(0)
      expect(typeof section.Body).toBe('function')
    }
    expect(OPS_SETTINGS_SECTIONS[0].title).toBe('밸런스 규칙')
  })
})
