/**
 * 운영 홈·일정표 공용 부품의 렌더 (티켓 20261006_1339 ②-a, 채원 판정 「②가 먼저 만들어 둘 공용」 (1)~(3))
 *
 * 저장소에 jsdom·testing-library가 없어(`endItem.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다.
 * 스위치의 눌림은 `Switch`를 가짜로 바꿔 `onCheckedChange`를 붙잡아 직접 부르고, 전환 중 모양은 `useTransition`만 가짜로 바꿔 본다.
 * 지키는 것:
 * - 신호 칩 2종: 중단·주의·참고는 아이콘 + 글자로 나뉘고(색 단독 아님), 확인 안 함은 점선 + 물음표 + 사유별 글자
 * - `ITEM_STATUS_TONES` 내보내기(일정표 막대가 같은 색을 쓴다)
 * - 시험 스위치: 라벨 `min-h-11`, 켜짐·꺼짐 글자, 도움말, 시험 묶음 0개 안내, 전환 중 비활성·`aria-busy`·`opacity-60`,
 *   바꾸면 `?sample=1`만 붙이고 빼면서 다른 쿼리 키를 유지한다
 * - 신호 한 줄: 수준 칩 → 이름 → 문장 → 날짜 → 시험 칩 → 링크 순서, 문장은 텍스트로만, 링크는 `signalResultHref` 한 곳
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const hoisted = vi.hoisted(() => ({
  replace: vi.fn(),
  search: { value: '' },
  pathname: { value: '/admin' },
  transition: { pending: false },
  switchProps: { current: null as null | Record<string, unknown> },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: hoisted.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => hoisted.pathname.value,
  useSearchParams: () => new URLSearchParams(hoisted.search.value),
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useTransition: () => [hoisted.transition.pending, (callback: () => void) => callback()] as const }
})

vi.mock('@/components/admin/ui/switch', async () => {
  const React = await import('react')
  return {
    Switch: (props: Record<string, unknown>) => {
      hoisted.switchProps.current = props
      return React.createElement('button', {
        type: 'button',
        role: 'switch',
        id: props.id as string,
        'aria-checked': props.checked as boolean,
        'aria-describedby': props['aria-describedby'] as string,
        disabled: props.disabled as boolean,
      })
    },
  }
})

import { ITEM_STATUS_TONES, TONE, OpsStatusBadge } from '../OpsStatusBadge'
import { OpsSampleBusy, OpsSampleScope, OpsSampleSwitch } from '../OpsSampleSwitch'
import { OpsSignalRow } from '../OpsSignalRow'
import { OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { OPS_SIGNAL_UNCHECKED_TEXT, makeSignalResult } from '@/lib/admin/opsSignals/catalog'

const html = (node: ReactElement) => renderToStaticMarkup(node)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')

beforeEach(() => {
  hoisted.replace.mockReset()
  hoisted.search.value = ''
  hoisted.pathname.value = '/admin'
  hoisted.transition.pending = false
  hoisted.switchProps.current = null
})

describe('OpsStatusBadge — 신호 칩 2종', () => {
  it('중단: 붉은 테두리 + 팔각 느낌표 + 「중단」 글자', () => {
    const out = flat(<OpsStatusBadge type="signal" level="stop" />)
    expect(out).toContain('중단')
    expect(out).toContain('border-destructive')
    expect(out).toContain('tabler-icon-alert-octagon')
    expect(out).toContain('aria-hidden="true"')
    // 연한 붉은 배경은 쓰지 않는다
    expect(out).not.toContain('bg-red')
    expect(out).not.toContain('bg-destructive')
  })

  it('주의는 경고 색 + 삼각 느낌표, 참고는 중립 + 정보 아이콘이다(밸런스 경고 줄과 같다)', () => {
    const warn = flat(<OpsStatusBadge type="signal" level="warn" />)
    expect(warn).toContain('주의')
    expect(warn).toContain('border-amber-300')
    expect(warn).toContain('tabler-icon-alert-triangle')
    const info = flat(<OpsStatusBadge type="signal" level="info" />)
    expect(info).toContain('참고')
    expect(info).toContain(TONE.neutral)
    expect(info).toContain('tabler-icon-info-circle')
  })

  it('세 수준은 아이콘으로도 서로 다르다', () => {
    const icons = (['stop', 'warn', 'info'] as const).map((level) => /tabler-icon-[a-z-]+/.exec(flat(<OpsStatusBadge type="signal" level={level} />))?.[0])
    expect(new Set(icons).size).toBe(3)
  })

  it('확인 안 함: 점선 + 물음표 + 사유별 글자', () => {
    const notStarted = flat(<OpsStatusBadge type="signal-unchecked" reason="not_started" />)
    expect(notStarted).toContain(OPS_SIGNAL_UNCHECKED_TEXT.not_started.label)
    expect(notStarted).toContain('border-dashed')
    expect(notStarted).toContain('tabler-icon-question-mark')
    expect(notStarted).toContain(TONE.muted)
    expect(flat(<OpsStatusBadge type="signal-unchecked" reason="not_built" />)).toContain('아직 확인하지 않아요')
    expect(flat(<OpsStatusBadge type="signal-unchecked" reason="load_failed" />)).toContain('확인하지 못했어요')
  })

  it('기존 칩은 그대로다(시험·항목 상태)', () => {
    expect(flat(<OpsStatusBadge type="sample" />)).toContain('시험')
    expect(flat(<OpsStatusBadge type="item" status="live" />)).toContain('게재중')
  })
})

describe('ITEM_STATUS_TONES — 일정표 막대가 쓰는 색', () => {
  it('10개 상태마다 색이 있고 모두 TONE 안의 값이다', () => {
    expect(Object.keys(ITEM_STATUS_TONES).sort()).toEqual([...OPS_ITEM_STATUSES].sort())
    for (const tone of Object.values(ITEM_STATUS_TONES)) expect(Object.keys(TONE)).toContain(tone)
  })

  it('승인 전은 중립, 예약됨은 보조, 게재중은 주, 종료는 흐림, 실패는 붉은 테두리다', () => {
    expect(ITEM_STATUS_TONES.arrived).toBe('neutral')
    expect(ITEM_STATUS_TONES.scheduled).toBe('secondary')
    expect(ITEM_STATUS_TONES.live).toBe('primary')
    expect(ITEM_STATUS_TONES.ended).toBe('muted')
    expect(ITEM_STATUS_TONES.failed).toBe('destructive')
  })
})

describe('OpsSampleSwitch', () => {
  const sw = (props: { includeSample: boolean; sampleBundleCount?: number }) =>
    flat(
      <OpsSampleScope>
        <OpsSampleSwitch {...props} />
      </OpsSampleScope>
    )

  it('라벨 안에 스위치가 있고 눌리는 영역이 min-h-11이다', () => {
    const out = sw({ includeSample: false })
    const label = /<label[^>]*>[\s\S]*?<\/label>/.exec(out)?.[0] ?? ''
    expect(label).toContain('min-h-11')
    expect(label).toContain('시험 묶음 포함해서 보기')
    expect(label).toContain('role="switch"')
  })

  it('꺼져 있으면 「꺼짐」, 켜져 있으면 「켜짐」 글자가 있다', () => {
    expect(sw({ includeSample: false })).toContain('꺼짐')
    expect(sw({ includeSample: false })).not.toContain('켜짐')
    expect(sw({ includeSample: true })).toContain('켜짐')
    expect(sw({ includeSample: true })).not.toContain('꺼짐')
    expect(sw({ includeSample: true })).toContain('aria-checked="true"')
  })

  it('도움말 한 줄이 스위치에 이어져 있다', () => {
    const out = sw({ includeSample: false })
    expect(out).toContain('슬랙은 어떤 경우에도 가지 않아요')
    const describedBy = /aria-describedby="([^"]+)"/.exec(out)?.[1]
    expect(describedBy).toBeTruthy()
    expect(out).toContain(`id="${describedBy}"`)
  })

  it('시험 묶음이 0개일 때만 「지금 시험 묶음이 없어요」를 보인다', () => {
    expect(sw({ includeSample: false, sampleBundleCount: 0 })).toContain('지금 시험 묶음이 없어요')
    expect(sw({ includeSample: false, sampleBundleCount: 2 })).not.toContain('지금 시험 묶음이 없어요')
    expect(sw({ includeSample: false })).not.toContain('지금 시험 묶음이 없어요')
  })

  it('켜면 sample=1만 붙이고 다른 쿼리 키를 유지한다', () => {
    hoisted.search.value = 'trend=week'
    sw({ includeSample: false })
    const onChange = hoisted.switchProps.current?.onCheckedChange as (next: boolean) => void
    onChange(true)
    expect(hoisted.replace).toHaveBeenCalledWith('/admin?trend=week&sample=1', { scroll: false })
  })

  it('끄면 sample만 빼고 다른 쿼리 키를 유지한다(꺼짐이면 키가 없다)', () => {
    hoisted.pathname.value = '/admin/ops-schedule'
    hoisted.search.value = 'view=month&sample=1&date=2026-10-07'
    sw({ includeSample: true })
    const onChange = hoisted.switchProps.current?.onCheckedChange as (next: boolean) => void
    onChange(false)
    expect(hoisted.replace).toHaveBeenCalledWith('/admin/ops-schedule?view=month&date=2026-10-07', { scroll: false })

    hoisted.replace.mockReset()
    hoisted.pathname.value = '/admin'
    hoisted.search.value = 'sample=1'
    sw({ includeSample: true })
    ;(hoisted.switchProps.current?.onCheckedChange as (next: boolean) => void)(false)
    expect(hoisted.replace).toHaveBeenCalledWith('/admin', { scroll: false })
  })

  it('전환 중이 아니면 스위치가 켜져 있고 아래 영역은 흐리지 않는다', () => {
    const out = flat(
      <OpsSampleScope>
        <OpsSampleSwitch includeSample={false} />
        <OpsSampleBusy>내용</OpsSampleBusy>
      </OpsSampleScope>
    )
    expect(out).not.toMatch(/<button[^>]*disabled/)
    expect(out).toContain('aria-busy="false"')
    expect(out).not.toContain('opacity-60')
  })

  it('전환 중이면 스위치는 비활성이고 아래 영역은 aria-busy + opacity-60(모션 줄임 땐 전환 없음)이다', () => {
    hoisted.transition.pending = true
    const out = flat(
      <OpsSampleScope>
        <OpsSampleSwitch includeSample={false} />
        <OpsSampleBusy>내용</OpsSampleBusy>
      </OpsSampleScope>
    )
    expect(out).toMatch(/<button[^>]*disabled/)
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain('opacity-60')
    expect(out).toContain('motion-reduce:transition-none')
  })
})

describe('OpsSignalRow', () => {
  const result = (over: Parameters<typeof makeSignalResult>[1] = {}, message = '보이는 카드가 1장이라 적어요.') =>
    makeSignalResult(message, over)

  it('수준 칩 → 이름 → 문장 → 날짜 → 시험 칩 → 링크 순서다', () => {
    const out = flat(
      <OpsSignalRow
        name="비어 있는 컨텐츠"
        level="warn"
        result={result({ date: '2026-10-07', bundleId: 'b1', itemId: 'i1', isSample: true })}
      />
    )
    const order = ['주의', '비어 있는 컨텐츠', '보이는 카드가 1장이라 적어요', '10월 7일(수)</span>', '시험', '기획 보기']
    const positions = order.map((text) => out.indexOf(text))
    expect(positions, out).not.toContain(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('문장은 텍스트로만 그린다(HTML로 해석하지 않는다)', () => {
    const out = html(<OpsSignalRow name="실행 실패" level="stop" result={result({}, '<img src=x onerror=alert(1)> 실패')} />)
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt; 실패')
    expect(out).not.toContain('<img')
  })

  it('항목이 있으면 받은 기획함의 그 항목으로, 켜져 있으면 sample=1을 이어 붙인다', () => {
    const base = <OpsSignalRow name="예약 누락" level="stop" result={result({ bundleId: 'b1', itemId: 'i1' })} />
    expect(html(base)).toContain('href="/admin/ops-inbox/b1?item=i1"')
    const on = html(<OpsSignalRow name="예약 누락" level="stop" includeSample result={result({ bundleId: 'b1', itemId: 'i1' })} />)
    expect(on).toContain('href="/admin/ops-inbox/b1?item=i1&amp;sample=1"')
  })

  it('묶음만 있으면 기획 상세, 날짜만 있으면 그날(/admin/today?date=)이다', () => {
    const bundleOnly = html(<OpsSignalRow name="형식 오류" level="warn" result={result({ bundleId: 'b1' })} />)
    expect(bundleOnly).toContain('href="/admin/ops-inbox/b1"')
    expect(bundleOnly).toContain('기획 보기')
    const dateOnly = flat(<OpsSignalRow name="겹침" level="info" result={result({ date: '2026-10-07' })} />)
    expect(dateOnly).toContain('href="/admin/today?date=2026-10-07"')
    expect(dateOnly).toContain('그날 보기')
  })

  it('갈 곳이 없으면 링크를 그리지 않고, 시험이 아니면 「시험」 칩이 없다', () => {
    const out = flat(<OpsSignalRow name="행동 횟수 급증" level="info" result={result()} />)
    expect(out).not.toContain('<a ')
    expect(out).not.toContain('시험')
    expect(out).not.toContain('10월 7일')
  })
})
