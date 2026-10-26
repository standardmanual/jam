/**
 * 밸런스 지표 화면 (티켓 20261022_1136 1회 b) — 서버 렌더(`renderToStaticMarkup`)로 그린 모양만 고정한다. 지키는 것:
 * - 지표 6개마다 목표와 현재값이 같이 보인다
 * - 부족이면 숫자 없이 «아직 데이터가 부족해요»와 목표만 보인다. 표본 수가 0이어도 «0»이나 «100%»가 화면 어디에도 나오지 않는다
 * - 관찰이 충분한데 실제로 0건인 것은 값 0으로 보이고 부족과 섞이지 않는다
 * - 읽기 오류는 그 지표만 오류 카드(고정 문장)이고 나머지 지표는 그대로 보인다
 * - 바로 조정 링크는 구역 단위(`/admin/balance#구역`)이고 구역 키가 BALANCE_SECTIONS에 실재하며, 월 아이템 배지는 동기화와 캡슐 두 구역을 가리킨다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { BALANCE_SECTIONS } from '@/lib/admin/balance/sections'
import { METRIC_SPECS } from '@/lib/admin/balanceDashboard/targets'
import {
  BALANCE_METRIC_KEYS,
  type BalanceDashboardData,
  type BalanceMetricKey,
  type MetricPart,
  type MetricPartSpec,
  type MetricResult,
} from '@/lib/admin/balanceDashboard/types'
import { BalanceDashboardView } from '../BalanceDashboardView'
import { compareToTarget, formatMeasuredValue, INSUFFICIENT_TEXT, NO_TARGET_TEXT } from '../MetricCard'

const GENERATED_AT = '2026-10-26T06:30:00.000Z' // 2026.10.26 15:30 KST
const LOAD_FAILED = '지표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

const sectionLabels = Object.fromEntries(BALANCE_SECTIONS.map((section) => [section.binding.id, section.label]))

/** 표본이 0인데도 부족 상태인 칸. 화면은 이 0을 그리지 않는다 */
function insufficientPart(spec: MetricPartSpec): MetricPart {
  return {
    id: spec.id,
    measurement: { status: 'insufficient', reason: 'sample', sample: 0, minSample: spec.minSample, sampleUnit: spec.sampleUnit },
  }
}

function readyPart(spec: MetricPartSpec, value: number, sample = 30): MetricPart {
  return { id: spec.id, measurement: { status: 'ready', value, sample, sampleUnit: spec.sampleUnit } }
}

function okResult(key: BalanceMetricKey, make: (spec: MetricPartSpec) => MetricPart): MetricResult {
  return { key, status: 'ok', parts: METRIC_SPECS[key].parts.map(make) }
}

function data(make: (key: BalanceMetricKey) => MetricResult): BalanceDashboardData {
  return { generatedAt: GENERATED_AT, metrics: BALANCE_METRIC_KEYS.map(make) }
}

const html = (value: BalanceDashboardData) =>
  renderToStaticMarkup(<BalanceDashboardView data={value} sectionLabels={sectionLabels} />).replace(/<!-- -->/g, '')

/** 태그를 지운 화면 글자 */
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const allInsufficient = () => data((key) => okResult(key, insufficientPart))
const totalParts = BALANCE_METRIC_KEYS.reduce((sum, key) => sum + METRIC_SPECS[key].parts.length, 0)

/** 지표 카드 하나의 마크업 */
function cardOf(markup: string, key: BalanceMetricKey): string {
  const start = markup.indexOf(`data-metric="${key}"`)
  expect(start, `${key} 카드`).toBeGreaterThanOrEqual(0)
  const next = BALANCE_METRIC_KEYS.map((other) => markup.indexOf(`data-metric="${other}"`)).filter((at) => at > start)
  return markup.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

describe('BalanceDashboardView — 부족', () => {
  const markup = html(allInsufficient())
  const text = textOf(markup)

  it('지표 6개가 순서대로 카드로 그려지고 제목에 마침표가 없다', () => {
    const order = BALANCE_METRIC_KEYS.map((key) => markup.indexOf(`data-metric="${key}"`))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const key of BALANCE_METRIC_KEYS) {
      const title = METRIC_SPECS[key].title
      expect(text).toContain(title)
      expect(title.endsWith('.')).toBe(false)
    }
  })

  it('칸마다 «아직 데이터가 부족해요»만 보이고 값 칸이 하나도 없다', () => {
    expect(markup.split('data-measurement="insufficient"').length - 1).toBe(totalParts)
    expect(markup).not.toContain('data-measurement="ready"')
    expect(text.split(INSUFFICIENT_TEXT).length - 1).toBe(totalParts)
  })

  it('«0»·«100%»가 화면 어디에도 없다. 표본이 0이어도 그렇다 (기준 시각의 시·분 숫자는 따로 센다)', () => {
    expect(text).not.toContain('100%')
    expect(text).not.toMatch(/(?<![0-9.])0(?![0-9])/)
    expect(text).not.toMatch(/(?<![0-9.])0%/)
    // 표본 수를 알리는 글자(몇 명 기준 등)도 없다
    expect(text).not.toMatch(/명 기준|주 기준|달 기준/)
  })

  it('목표가 함께 보인다: 목표가 있는 칸은 목표 문장이, 없는 칸은 «목표 없음»이 보인다', () => {
    for (const key of BALANCE_METRIC_KEYS) {
      const card = textOf(cardOf(markup, key))
      for (const part of METRIC_SPECS[key].parts) {
        expect(card, `${key}/${part.id}`).toContain(part.target ? part.target.text : NO_TARGET_TEXT)
      }
    }
    expect(textOf(cardOf(markup, 'capsule_open'))).toContain('주 2~3번')
    expect(textOf(cardOf(markup, 'monthly_items'))).toContain('20~30개')
    expect(text.split(NO_TARGET_TEXT).length - 1).toBe(8)
  })

  it('목표와 견준 뱃지도 없다', () => {
    expect(markup).not.toContain('data-fit=')
  })

  it('기준 시각을 KST로 보인다', () => {
    expect(text).toContain('2026.10.26 15:30 기준')
  })
})

describe('BalanceDashboardView — 값', () => {
  it('값이 있으면 단위와 함께 보이고 목표와 견준 뱃지가 붙는다', () => {
    const markup = html(
      data((key) =>
        okResult(key, (spec) => {
          if (key === 'capsule_open' && spec.id === 'chapter:1') return readyPart(spec, 2.5, 12)
          if (key === 'capsule_open' && spec.id === 'chapter:10') return readyPart(spec, 0.5, 6)
          if (key === 'inventory_full') return readyPart(spec, 1 / 3, 24)
          return insufficientPart(spec)
        })
      )
    )
    const capsule = cardOf(markup, 'capsule_open')
    expect(textOf(capsule)).toContain('주 2.5번')
    expect(textOf(capsule)).toContain('12명 기준')
    expect(capsule).toContain('data-fit="within"')
    expect(textOf(capsule)).toContain('목표 안이에요')
    expect(capsule).toContain('data-fit="below"')
    expect(textOf(capsule)).toContain('목표보다 낮아요')
    // 목표가 없는 챕터 2~9는 값이 없어도 뱃지가 없다
    expect(capsule.split('data-fit=').length - 1).toBe(2)

    const inventory = cardOf(markup, 'inventory_full')
    expect(textOf(inventory)).toContain('33.3%')
    expect(inventory).toContain('data-fit="above"')
    expect(textOf(inventory)).toContain('목표보다 높아요')
  })

  it('관찰이 충분한데 0건인 것은 값 0으로 보이고 부족과 섞이지 않는다', () => {
    const markup = html(
      data((key) => okResult(key, (spec) => (key === 'monthly_items' ? readyPart(spec, 0, 8) : insufficientPart(spec))))
    )
    const monthly = cardOf(markup, 'monthly_items')
    expect(textOf(monthly)).toContain('0개')
    expect(textOf(monthly)).toContain('목표보다 낮아요')
    expect(monthly).not.toContain('data-measurement="insufficient"')
    expect(textOf(monthly)).not.toContain(INSUFFICIENT_TEXT)
  })

  it('등급 체감은 유저가 관찰된 기간의 합으로 표본을 보인다', () => {
    const markup = html(
      data((key) => okResult(key, (spec) => (key === 'rarity_feel' ? readyPart(spec, spec.id === 'rare' ? 1 : 0.28, 12.5) : insufficientPart(spec))))
    )
    const rarity = textOf(cardOf(markup, 'rarity_feel'))
    expect(rarity).toContain('주 1번')
    expect(rarity).toContain('한 달 0.28번')
    expect(rarity).toContain('유저 합계 12.5주 기준')
    expect(rarity).toContain('유저 합계 12.5달 기준')
  })
})

describe('BalanceDashboardView — 읽기 오류', () => {
  const markup = html(
    data((key) =>
      key === 'chapter_reach'
        ? { key, status: 'error', message: LOAD_FAILED }
        : okResult(key, insufficientPart)
    )
  )

  it('읽지 못한 지표만 오류 카드(고정 문장)이고 값·목표 표와 조정 링크가 없다', () => {
    const card = cardOf(markup, 'chapter_reach')
    expect(card).toContain('data-status="error"')
    expect(card).toContain('role="alert"')
    expect(textOf(card)).toContain(LOAD_FAILED)
    expect(textOf(card)).toContain('챕터 도달 속도')
    expect(card).not.toContain('<table')
    expect(card).not.toContain('data-adjust-links')
    expect(card).not.toContain(INSUFFICIENT_TEXT)
  })

  it('나머지 지표는 그대로 부족 상태로 보인다', () => {
    expect(markup.split('data-status="error"').length - 1).toBe(1)
    expect(markup.split('data-status="ok"').length - 1).toBe(5)
    expect(markup.split('data-measurement="insufficient"').length - 1).toBe(totalParts - METRIC_SPECS.chapter_reach.parts.length)
  })
})

describe('BalanceDashboardView — 바로 조정 링크', () => {
  const markup = html(allInsufficient())

  const hrefsOf = (key: BalanceMetricKey) =>
    [...cardOf(markup, key).matchAll(/href="([^"]+)"/g)].map((match) => match[1])

  it('링크는 구역 단위(/admin/balance#구역)만 있고 칸 단위(#구역-칸) 링크는 없다', () => {
    const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toMatch(/^\/admin\/balance#[a-z]+$/)
  })

  it('링크의 구역 id가 BALANCE_SECTIONS에 실재한다', () => {
    const ids = new Set(BALANCE_SECTIONS.map((section) => section.binding.id))
    for (const key of BALANCE_METRIC_KEYS) {
      for (const href of hrefsOf(key)) expect(ids.has(href.split('#')[1]), `${key}의 ${href}`).toBe(true)
    }
  })

  it('지표마다 이동 칸 정의와 같은 구역으로 간다. 월 아이템 배지만 동기화와 캡슐 두 구역이다', () => {
    for (const key of BALANCE_METRIC_KEYS) {
      expect(hrefsOf(key), key).toEqual(METRIC_SPECS[key].adjust.map((target) => `/admin/balance#${target.sectionId}`))
    }
    expect(hrefsOf('monthly_items')).toEqual(['/admin/balance#sync', '/admin/balance#capsule'])
    for (const key of BALANCE_METRIC_KEYS.filter((other) => other !== 'monthly_items')) {
      expect(hrefsOf(key)).toHaveLength(1)
    }
  })

  it('링크 글자에 구역 이름이 들어가고, 두 구역이면 함께 정해진다는 안내가 붙는다', () => {
    const monthly = textOf(cardOf(markup, 'monthly_items'))
    expect(monthly).toContain('동기화 구역에서 바꾸기')
    expect(monthly).toContain('캡슐 구역에서 바꾸기')
    expect(monthly).toContain('이 지표는 아래 구역의 수치가 함께 정해요')
    const inventory = textOf(cardOf(markup, 'inventory_full'))
    expect(inventory).toContain('인벤토리 구역에서 바꾸기')
    expect(inventory).not.toContain('함께 정해요')
  })
})

describe('값 글자와 목표 견줌', () => {
  it('단위별로 필요한 자리까지만 쓴다', () => {
    expect(formatMeasuredValue('per_week', 2)).toBe('주 2번')
    expect(formatMeasuredValue('per_week', 2.456)).toBe('주 2.46번')
    expect(formatMeasuredValue('per_month', 0.25)).toBe('한 달 0.25번')
    expect(formatMeasuredValue('count_30d', 24.04)).toBe('24개')
    expect(formatMeasuredValue('count_30d', 24.5)).toBe('24.5개')
    expect(formatMeasuredValue('ratio', 0.5)).toBe('50%')
    expect(formatMeasuredValue('ratio', 1)).toBe('100%')
    expect(formatMeasuredValue('ratio', 0)).toBe('0%')
    expect(formatMeasuredValue('ratio', 1 / 3)).toBe('33.3%')
  })

  it('범위의 양 끝은 안이고, 보이는 자릿수로 맞춰 견준다', () => {
    const target = { low: 2, high: 3, text: '주 2~3번' }
    expect(compareToTarget('per_week', 1.99, target)).toBe('below')
    expect(compareToTarget('per_week', 2, target)).toBe('within')
    expect(compareToTarget('per_week', 3, target)).toBe('within')
    expect(compareToTarget('per_week', 3.01, target)).toBe('above')
    // 1.9996은 «주 2번»으로 보이므로 낮다고 하지 않는다
    expect(compareToTarget('per_week', 1.9996, target)).toBe('within')
  })

  it('비율 목표: 과반이면 충족, 인벤토리는 20% 이하가 안이다', () => {
    const half = { low: 0.5, high: 1, text: '' }
    expect(compareToTarget('ratio', 0.49, half)).toBe('below')
    expect(compareToTarget('ratio', 0.5, half)).toBe('within')
    expect(compareToTarget('ratio', 1, half)).toBe('within')
    const inventory = { low: 0, high: 0.2, text: '' }
    expect(compareToTarget('ratio', 0, inventory)).toBe('within')
    expect(compareToTarget('ratio', 0.2, inventory)).toBe('within')
    expect(compareToTarget('ratio', 0.21, inventory)).toBe('above')
  })
})
