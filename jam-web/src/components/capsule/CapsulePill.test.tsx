/**
 * 캡슐 알약 (티켓 20261018_0054 1회)
 *
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 상태별 화면을 고정한다. 고정하는 것:
 * - 알약 전체가 버튼 하나이고 `aria-label`이 상태를 글자로 알린다(«캡슐, {상태}»).
 * - 게이지는 외곽선 있는 `track-gradient`이고 숫자와 퍼센트가 어디에도 없다.
 * - 로딩 Skeleton·오류 알약·정상 알약의 높이가 같다(위젯 높이가 변하지 않는다).
 * - 면은 `--surface`와 1px `--border`뿐이다(그라데이션 배경·그림자·반투명 면 없음). «열 수 있어요»를 색으로 부추기지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsulePill.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CapsulePill, { type CapsulePillStatus } from './CapsulePill'
import { d } from '@/lib/i18n'

function render(status: CapsulePillStatus, over: { percent?: number; statusText?: string; actionText?: string } = {}): string {
  return renderToStaticMarkup(
    <CapsulePill
      status={status}
      percent={over.percent ?? 40}
      statusText={over.statusText ?? d.capsule.title}
      actionText={over.actionText ?? d.capsule.pill.filling}
      onClick={() => {}}
    />
  )
}

/** 태그와 속성을 지운 화면 글자 */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

describe('정상 알약', () => {
  it('버튼 하나이고 제목과 상태 문구가 보인다', () => {
    const html = render('filling')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('type="button"')
    expect(textOf(html)).toBe(`${d.capsule.title}${d.capsule.pill.filling}`)
  })

  it.each([
    ['filling', d.capsule.aria.filling, d.capsule.pill.filling],
    ['ready', d.capsule.aria.ready, d.capsule.pill.ready],
    ['noSlots', d.capsule.aria.noSlots, d.capsule.pill.noSlots],
  ] as const)('%s: aria-label이 «캡슐, …»로 상태를 글자로 알린다', (status, aria, action) => {
    const html = render(status, { actionText: action })
    expect(html).toContain(`aria-label="${aria}"`)
    expect(aria.startsWith('캡슐, ')).toBe(true)
    expect(textOf(html)).toContain(action)
  })

  it('게이지는 외곽선 있는 track-gradient이고 스크린리더에서 숨는다', () => {
    const html = render('filling', { percent: 35 })
    expect(html).toContain('--ds-progress-fill:35%')
    expect(html).toContain('clip-path:inset(0 calc(100% - var(--ds-progress-fill)) 0 0)')
    expect(html).toContain('var(--progress-sweep)')
    // 외곽선 1px --border, 트랙 면 --background, 높이 10
    expect(html).toMatch(/height:10px[^"]*background:var\(--background\)[^"]*border:1px solid var\(--border\)/)
    expect(html).toContain('box-sizing:border-box')
    expect(html).toMatch(/aria-hidden="true"[^>]*><div/)
  })

  it('숫자와 퍼센트가 화면과 접근성 이름 어디에도 없다', () => {
    for (const status of ['filling', 'ready', 'noSlots'] as const) {
      const html = render(status, { percent: 35, actionText: d.capsule.pill[status] })
      expect(textOf(html)).not.toMatch(/\d/)
      expect(html).not.toContain('%</')
      expect(html.match(/aria-label="[^"]*"/g)?.join('') ?? '').not.toMatch(/\d/)
    }
  })

  it('면은 --surface와 1px --border뿐이다 — 그림자·그라데이션 배경·반투명이 없다', () => {
    const html = render('ready', { actionText: d.capsule.pill.ready })
    expect(html).toContain('bg-surface')
    expect(html).toContain('border-border')
    expect(html).toContain('rounded-full')
    expect(html).not.toMatch(/shadow|backdrop-blur|bg-gradient|opacity|bg-accent|animate-/)
  })

  it('누름 피드백과 왼쪽 정렬을 쓴다', () => {
    const html = render('filling')
    expect(html).toContain('jam-press')
    expect(html).toContain('text-left')
    expect(html).not.toContain('text-center')
  })

  it('1행 오른쪽 문구는 줄어들지 않고 제목은 줄어든다(320px에서 상태 문구 한 줄 유지)', () => {
    const html = render('noSlots', { actionText: d.capsule.pill.noSlots })
    expect(html).toMatch(/class="shrink-0[^"]*whitespace-nowrap"/)
    expect(html).toMatch(/class="min-w-0 truncate/)
  })

  it('한국어 줄바꿈 클래스가 붙는다', () => {
    const html = render('filling')
    expect(html.match(/break-keep wrap-break-word/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('높이', () => {
  const heightOf = (html: string) => html.match(/height:(\d+)px/)?.[1]

  it('로딩 Skeleton·정상·오류 알약의 높이가 같다', () => {
    const loading = render('loading')
    const normal = render('filling')
    const error = render('error', { statusText: d.capsule.pill.loadFailed, actionText: d.capsule.pill.retry })
    expect(heightOf(loading)).toBe('76')
    expect(heightOf(normal)).toBe('76')
    expect(heightOf(error)).toBe('76')
  })
})

describe('로딩', () => {
  it('Skeleton 알약이 상태로 알려지고 버튼이 없다', () => {
    const html = render('loading')
    expect(html).toContain('role="status"')
    expect(html).toContain(`aria-label="${d.capsule.aria.loading}"`)
    expect(html).toContain('border-radius:var(--radius-full)')
    expect(html).not.toContain('<button')
  })
})

describe('오류', () => {
  it('같은 알약 안에서 «캡슐을 불러오지 못했어요»와 «다시 시도»로 바뀌고 게이지 줄만 비운다', () => {
    const html = render('error', { statusText: d.capsule.pill.loadFailed, actionText: d.capsule.pill.retry })
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(textOf(html)).toBe(`${d.capsule.pill.loadFailed}${d.capsule.pill.retry}`)
    expect(html).toContain(`aria-label="${d.capsule.aria.error}"`)
    expect(html).not.toContain('--ds-progress-fill')
  })
})
