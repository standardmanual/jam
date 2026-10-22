import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RadialCapsule from './RadialCapsule'

describe('RadialCapsule', () => {
  it('기본 렌더링 시 "채우기" 버튼, 퍼센트, CAPSULE 텍스트가 정상 생성된다', () => {
    const html = renderToStaticMarkup(<RadialCapsule percent={50} actionText="채우기" />)
    expect(html).toContain('채우기')
    expect(html).toContain('CAPSULE')
    expect(html).toContain('50%')
    expect(html).toContain('radial-gradient')
  })

  it('0%일 때도 중심 코어의 시각적 그라데이션 및 핫 코어가 렌더링된다', () => {
    const html = renderToStaticMarkup(<RadialCapsule percent={0} animateOnMount={false} />)
    expect(html).toContain('radial-gradient')
    expect(html).toContain('#FF1A00')
    expect(html).toContain('0%')
    expect(html).toContain('CAPSULE')
  })

  it('100%일 때 "열기" 문구 및 100% 텍스트로 변경 가능하다', () => {
    const html = renderToStaticMarkup(
      <RadialCapsule percent={100} actionText="열기" animateOnMount={false} />
    )
    expect(html).toContain('열기')
    expect(html).toContain('100%')
    expect(html).toContain('CAPSULE')
  })

  it('라벨과 서브라벨이 주어지면 표시된다', () => {
    const html = renderToStaticMarkup(
      <RadialCapsule percent={30} label="캡슐 게이지" subLabel="90 / 300 JAM" />
    )
    expect(html).toContain('캡슐 게이지')
    expect(html).toContain('90 / 300 JAM')
  })
})
