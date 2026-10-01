/**
 * 운영 설정(S7) 구역 읽기 (티켓 20260930_1459 조각 B·C)
 *
 * 서버 컴포넌트 `BalanceSection`·`SignalSection`이 구역 본문에 넘기는 값과 실패 격리를 고정한다. 실제 DB에는 닿지 않는다(읽기 함수는 모의):
 * - 밸런스: 규칙과 열린 컬렉션 수를 읽어 본문에 넘긴다
 * - 밸런스: 규칙 조회가 실패하면 던지지 않고 rules가 null이다(이 구역만 오류 카드), 열린 수를 못 읽으면 그 값만 null이다(구역은 열린다)
 * - 신호 기준값: 기준값 25개의 현재 상태를 읽어 본문에 넘기고, 읽지 못하면 던지지 않고 null이다(이 구역만 오류 카드, 기본값을 현재 값처럼 보이지 않는다)
 * - 한 구역이 실패해도 다른 구역은 영향을 받지 않는다. 서비스 클라이언트를 만들지 못해도 던지지 않는다
 * - 구역 목록(`OPS_SETTINGS_SECTIONS`)은 구역 하나당 배열 한 줄이다: ID가 겹치지 않고 밸런스·신호 기준값 구역이 있으며 이동 링크가 둘 다 보인다
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const h = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  listOpsRules: vi.fn(),
  loadOpenCollectionsNow: vi.fn(),
  listSignalThresholds: vi.fn(),
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
vi.mock('@/lib/admin/opsSignals/saveThresholds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsSignals/saveThresholds')>()
  return { ...actual, listSignalThresholds: h.listSignalThresholds }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { BalanceSection } from '../BalanceSection'
import { SignalSection } from '../SignalSection'
import { OPS_SETTINGS_SECTIONS } from '../sections'
import { OpsSettingsNav } from '@/components/admin/ops/OpsSettingsNav'

const RULES = [{ ruleKey: 'open_collections_max' }]
const THRESHOLDS = [{ ruleKey: 'approvalDeadlineHours', value: 48 }]

type SectionProps = { rules: unknown; openCollectionsNow: number | null }
const propsOf = (element: ReactElement) => element.props as SectionProps

beforeEach(() => {
  h.createServiceClient.mockReset()
  h.createServiceClient.mockReturnValue({})
  h.listOpsRules.mockReset()
  h.listOpsRules.mockResolvedValue(RULES)
  h.loadOpenCollectionsNow.mockReset()
  h.loadOpenCollectionsNow.mockResolvedValue({ ok: true, data: 30 })
  h.listSignalThresholds.mockReset()
  h.listSignalThresholds.mockResolvedValue(THRESHOLDS)
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

describe('SignalSection', () => {
  it('기준값 25개의 현재 상태를 읽어 본문에 넘긴다(신호 묶음만 읽는다)', async () => {
    const element = await SignalSection()
    expect(element.props).toEqual({ thresholds: THRESHOLDS })
    expect(h.listSignalThresholds).toHaveBeenCalledTimes(1)
    expect(h.listOpsRules).not.toHaveBeenCalled()
  })

  it('조회가 실패하면 던지지 않고 thresholds가 null이다(이 구역만 오류 카드). 밸런스 구역은 영향이 없다', async () => {
    h.listSignalThresholds.mockRejectedValue(new Error('기준값 조회 실패: down'))
    const signal = await SignalSection()
    expect(signal.props).toEqual({ thresholds: null })
    expect(console.error).toHaveBeenCalled()
    const balance = await BalanceSection()
    expect(propsOf(balance)).toEqual({ rules: RULES, openCollectionsNow: 30 })
  })

  it('밸런스 구역이 실패해도 신호 기준값 구역은 그대로 읽는다', async () => {
    h.listOpsRules.mockRejectedValue(new Error('규칙 조회 실패: down'))
    expect(propsOf(await BalanceSection())).toEqual({ rules: null, openCollectionsNow: 30 })
    expect((await SignalSection()).props).toEqual({ thresholds: THRESHOLDS })
  })

  it('서비스 클라이언트를 만들지 못해도 던지지 않는다', async () => {
    h.createServiceClient.mockImplementation(() => {
      throw new Error('env missing')
    })
    expect((await SignalSection()).props).toEqual({ thresholds: null })
  })
})

describe('OPS_SETTINGS_SECTIONS', () => {
  it('구역 ID가 겹치지 않고 밸런스 구역이 첫 구역, 신호 기준값 구역이 두 번째다', () => {
    const ids = OPS_SETTINGS_SECTIONS.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['balance', 'signals'])
    expect(OPS_SETTINGS_SECTIONS[1].title).toBe('신호 기준값')
    expect(OPS_SETTINGS_SECTIONS[1].label).toBe('신호 기준값')
  })

  it('구역이 2개가 되어 이동 링크 [밸런스 규칙] [신호 기준값]이 보인다', () => {
    const out = renderToStaticMarkup(<OpsSettingsNav sections={OPS_SETTINGS_SECTIONS} />).replace(/<!-- -->/g, '')
    expect(out).toContain('href="#balance"')
    expect(out).toContain('href="#signals"')
    expect(out).toContain('>밸런스 규칙</a>')
    expect(out).toContain('>신호 기준값</a>')
  })

  it('신호 기준값 구역 설명은 승인을 막지 않고 바꾼 값만 저장한다는 것과 밸런스 구역 안내를 담는다', () => {
    expect(OPS_SETTINGS_SECTIONS[1].description).toEqual([
      '운영 신호가 언제 뜨는지 정하는 숫자와 시각이에요. 신호는 승인을 막지 않아요.',
      '바꾼 값만 저장하고, 나머지는 기본값을 써요. 바꾼 값은 다음 신호 계산부터 반영돼요.',
      '밸런스 경고의 기준은 「밸런스 규칙」 구역에서 바꿔요.',
    ])
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
