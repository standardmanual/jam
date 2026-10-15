/**
 * 면(surface)과 글자·아이콘 색의 짝 (티켓 20261015_2131 재작업, 채원② 중대 1~3)
 *
 * 라이트 전환 뒤 `--background-inverse`는 #171717, `--snow`는 #fcfcfc, accent는 #19b551이다.
 * 이 짝이 어긋나면 글자가 배경과 같은 색이 되어 사라진다(실측: 1.00~3.37:1).
 *
 * 확인하는 것: ① 서비스 Button `sub`의 글자가 accent 면 위 --accent-foreground, 밝은 면 위 --foreground다
 * ② MODULAR Button·IconButton `surface="dark"`(반전 면 위)의 글자·아이콘이 --snow다
 * ③ MODULAR ShapeTag 글자가 surface와 무관하게 --foreground다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import ServiceButton from '../Button'
import { Button as DsButton } from '@ds/components/buttons/Button'
import { IconButton } from '@ds/components/buttons/IconButton'
import { ShapeTag } from '@ds/components/cards/ShapeTag'

describe('서비스 Button — sub 면의 글자색 쌍', () => {
  it('primary는 accent 면 위에 accent-foreground 글자다(흰 글자 아님)', () => {
    const html = renderToStaticMarkup(
      <ServiceButton surface="sub" variant="primary">확인</ServiceButton>
    )
    expect(html).toContain('text-accent-foreground')
    expect(html).toContain('background-color:var(--accent)')
    expect(html).not.toContain('text-white')
    expect(html).not.toContain('text-snow')
  })

  it('outline·arrow는 밝은 면 위에 foreground 글자다(snow 아님)', () => {
    for (const variant of ['outline', 'arrow'] as const) {
      const html = renderToStaticMarkup(
        <ServiceButton surface="sub" variant={variant}>확인</ServiceButton>
      )
      expect(html).toContain('text-foreground')
      expect(html).not.toContain('text-snow')
    }
  })
})

describe('MODULAR Button·IconButton — surface="dark"는 반전 면 위 --snow', () => {
  it('Button dark의 secondary·ghost 글자가 --snow다', () => {
    for (const variant of ['secondary', 'ghost'] as const) {
      const html = renderToStaticMarkup(
        <DsButton surface="dark" variant={variant}>확인</DsButton>
      )
      expect(html).toContain('color:var(--snow)')
      expect(html).not.toContain('color:var(--background-inverse)')
    }
  })

  it('IconButton dark의 아이콘이 --snow, light는 --foreground다', () => {
    const dark = renderToStaticMarkup(<IconButton icon="close" label="닫기" surface="dark" />)
    expect(dark).toContain('color:var(--snow)')
    expect(dark).not.toContain('color:var(--background-inverse)')

    const light = renderToStaticMarkup(<IconButton icon="close" label="닫기" surface="light" />)
    expect(light).toContain('color:var(--foreground)')
  })
})

describe('MODULAR ShapeTag — 글자는 항상 --foreground', () => {
  it('surface가 light여도 dark여도 같다', () => {
    for (const surface of ['light', 'dark', undefined] as const) {
      const html = renderToStaticMarkup(
        <ShapeTag shape="pill" colorIndex={0} surface={surface}>태그</ShapeTag>
      )
      expect(html).toContain('color:var(--foreground)')
      expect(html).not.toContain('color:var(--snow)')
    }
  })
})
