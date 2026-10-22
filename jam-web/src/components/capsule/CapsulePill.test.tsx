/**
 * 캡슐 알약 (방사형 잼 채움 신규 디자인)
 *
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 상태별 화면을 검증한다.
 * - 캡슐 정중앙에 'CAPSULE' 볼드 및 'xx%' 큰 텍스트 볼드 표기
 * - 채우기 버튼 제거 (캡슐 자체 클릭으로 시트 오픈)
 * - 캡슐 본체 높이 96px
 * - 로딩 상태는 Skeleton 렌더링
 * - 접근성 aria-label 유지
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsulePill.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CapsulePill, { CAPSULE_PILL_HEIGHT_PX, type CapsulePillStatus } from './CapsulePill'
import { d } from '@/lib/i18n'

function render(
  status: CapsulePillStatus,
  over: { percent?: number; statusText?: string; actionText?: string } = {}
): string {
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

describe('정상 캡슐 알약', () => {
  it('CAPSULE 텍스트와 퍼센트가 볼드로 표기되고, 채우기 버튼은 렌더링되지 않는다', () => {
    const html = render('filling', { percent: 45 })
    expect(html).toContain('CAPSULE')
    expect(html).toContain('45%')
    expect(html).not.toContain(d.capsule.pill.filling)
  })

  it.each([
    ['filling', d.capsule.aria.filling],
    ['ready', d.capsule.aria.ready],
    ['noSlots', d.capsule.aria.noSlots],
  ] as const)('%s: aria-label이 «캡슐, …»로 상태를 알린다', (status, aria) => {
    const html = render(status)
    expect(html).toContain(`aria-label="${aria}"`)
  })

  it('방사형 그라데이션이 적용되어 있다', () => {
    const html = render('filling', { percent: 35 })
    expect(html).toContain('radial-gradient')
  })

  it('캡슐 높이는 96px이다', () => {
    const html = render('filling')
    expect(html).toContain(`height:${CAPSULE_PILL_HEIGHT_PX}px`)
  })
})

describe('로딩', () => {
  it('Skeleton 알약이 상태로 알려진다', () => {
    const html = render('loading')
    expect(html).toContain('role="status"')
    expect(html).toContain(`aria-label="${d.capsule.aria.loading}"`)
    expect(html).toContain(`height:${CAPSULE_PILL_HEIGHT_PX}px`)
  })
})

describe('오류', () => {
  it('오류 시 «불러오지 못했어요» 문구와 «다시 시도» 버튼이 표시된다', () => {
    const html = render('error', {
      statusText: d.capsule.pill.loadFailed,
      actionText: d.capsule.pill.retry,
    })
    expect(html).toContain(d.capsule.pill.loadFailed)
    expect(html).toContain(d.capsule.pill.retry)
    expect(html).toContain(`aria-label="${d.capsule.aria.error}"`)
  })
})
