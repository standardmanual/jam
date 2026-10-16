/**
 * Button 변형의 면·글자·테두리 짝 (티켓 20261015_2133, 2회 버튼·입력창·내비게이션)
 *
 * 서비스 `Button.tsx`(Tailwind 클래스)와 MODULAR `Button.jsx`(인라인 style)는 병존하는 쌍이다.
 * `npm run ds:check`는 색을 비교하지 못하므로, 이 파일이 변형별 토큰 한 표를 두 구현에 같이 대조한다.
 *
 * 변형 대응(결정 2): primary `--accent`, secondary `--default`, danger `--danger`(글자 `--foreground`, 흰 글자는
 * 3.57:1), outline 투명 + 1px `--field-border`, ghost 글자 `--link`.
 *
 * 확인하는 것
 * ① 변형별 면·글자·테두리 토큰이 서비스와 MODULAR에서 같다
 * ② 서비스 `surface="main"` primary는 검정(`--background-inverse` + `--snow`)이다 — 사용자 결정(2026-10-16)으로 결정 2를
 *    이 면에 적용하지 않았고, 그래서 MODULAR light primary(`--accent`)와 갈라진 채 남는다(알려진 임시 결함, 고정)
 * ③ `outline`의 뜻이 「외곽선」이고 옛 「테두리 없는 보조 채움」은 `secondary`다(이름 재사용 함정)
 * ④ surface는 primary에서만 색을 바꾼다
 * ⑤ 모든 변형에 1px 테두리가 있고 세로 패딩이 그만큼 줄어 높이가 그대로다(md 52px)
 * ⑥ MODULAR `surface="dark"`는 흰색 반투명 직접 지정이 없다
 * ⑦ 두 구현 소스에 다크 전용 값(흰색·검정 반투명 직접 지정)이 없다
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import ServiceButton from '../Button'
import { Button as DsButton } from '@ds/components/buttons/Button'

type PairVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'

/** 변형별 토큰 표. 서비스(sub 기준)와 MODULAR(light 기준)가 같은 줄을 따른다. */
const PAIRS: ReadonlyArray<{
  variant: PairVariant
  face: string
  text: string
  border: string
}> = [
  { variant: 'primary', face: 'accent', text: 'accent-foreground', border: 'transparent' },
  { variant: 'secondary', face: 'default', text: 'foreground', border: 'transparent' },
  { variant: 'danger', face: 'danger', text: 'foreground', border: 'transparent' },
  { variant: 'outline', face: 'transparent', text: 'foreground', border: 'field-border' },
  { variant: 'ghost', face: 'transparent', text: 'link', border: 'transparent' },
]

const renderService = (variant: PairVariant, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <ServiceButton variant={variant} surface="sub" {...props}>
      확인
    </ServiceButton>
  )

const renderDs = (variant: PairVariant, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <DsButton variant={variant} surface="light" {...props}>
      확인
    </DsButton>
  )

/** 서비스 마크업의 class 토큰 목록 */
const classesOf = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(/\s+/)

describe('변형별 면·글자·테두리 — 서비스와 MODULAR가 같은 토큰이다', () => {
  for (const { variant, face, text, border } of PAIRS) {
    it(`${variant}: 면 ${face} / 글자 ${text} / 테두리 ${border}`, () => {
      const service = classesOf(renderService(variant))
      expect(service).toContain(`bg-${face}`)
      expect(service).toContain(`text-${text}`)
      expect(service).toContain(`border-${border}`)

      const ds = renderDs(variant)
      expect(ds).toContain(face === 'transparent' ? 'background:transparent' : `background:var(--${face})`)
      expect(ds).toContain(`color:var(--${text})`)
      expect(ds).toContain(`border-color:${border === 'transparent' ? 'transparent' : `var(--${border})`}`)
    })
  }

  it('danger 글자는 흰색이 아니라 --foreground다(흰 글자는 3.57:1)', () => {
    expect(classesOf(renderService('danger'))).not.toContain('text-snow')
    expect(classesOf(renderService('danger'))).not.toContain('text-white')
    expect(renderDs('danger')).not.toContain('color:var(--snow)')
    expect(renderDs('danger')).not.toContain('color:#fff')
  })
})

describe('서비스 surface="main" primary는 검정이다(사용자 결정 2026-10-16, 알려진 임시 결함)', () => {
  it('main primary = --background-inverse 면 + --snow 글자', () => {
    const main = classesOf(
      renderToStaticMarkup(<ServiceButton variant="primary" surface="main">확인</ServiceButton>)
    )
    expect(main).toContain('bg-background-inverse')
    expect(main).toContain('text-snow')
    expect(main).not.toContain('bg-accent')
  })

  it('기본 surface는 main이라 surface를 안 적은 primary도 검정이다', () => {
    const byDefault = classesOf(renderToStaticMarkup(<ServiceButton>확인</ServiceButton>))
    expect(byDefault).toContain('bg-background-inverse')
  })

  it('MODULAR light primary는 --accent다 — 서비스 main primary와 갈라진 상태를 못박아 둔다', () => {
    expect(renderDs('primary')).toContain('background:var(--accent)')
    expect(renderDs('primary')).not.toContain('background:var(--background-inverse)')
  })

  it('서비스 sub primary는 MODULAR light primary와 같다(--accent + --accent-foreground)', () => {
    const sub = classesOf(renderService('primary'))
    expect(sub).toContain('bg-accent')
    expect(sub).toContain('text-accent-foreground')
  })
})

describe('outline과 secondary의 뜻 (이름 재사용 함정)', () => {
  it('outline은 외곽선이다: 투명 면 + field-border 테두리, 보조 채움이 아니다', () => {
    const outline = classesOf(renderService('outline'))
    expect(outline).toContain('bg-transparent')
    expect(outline).toContain('border-field-border')
    for (const fill of ['bg-default', 'bg-surface', 'bg-background']) {
      expect(outline).not.toContain(fill)
    }
  })

  it('secondary는 --default 채움이고 테두리 색은 투명이다', () => {
    const secondary = classesOf(renderService('secondary'))
    expect(secondary).toContain('bg-default')
    expect(secondary).toContain('border-transparent')
    expect(secondary).not.toContain('border-field-border')
  })

  it('옛 outline 채움(4% 블랙 틴트·흰 면)이 어느 변형에도 남지 않았다', () => {
    for (const { variant } of PAIRS) {
      const html = renderService(variant)
      expect(html).not.toContain('bg-black/')
      expect(html).not.toContain('bg-white/')
      expect(html).not.toContain('rgba(255,255,255')
    }
  })
})

describe('surface는 primary에서만 색을 바꾼다', () => {
  it('secondary·danger·outline·ghost는 main/sub가 같은 마크업이다', () => {
    for (const variant of ['secondary', 'danger', 'outline', 'ghost'] as const) {
      const main = renderToStaticMarkup(<ServiceButton variant={variant} surface="main">확인</ServiceButton>)
      const sub = renderToStaticMarkup(<ServiceButton variant={variant} surface="sub">확인</ServiceButton>)
      expect(main).toBe(sub)
    }
  })

  it('호출부가 넘기지 않으면 색 인라인 style이 없다(인라인 덮어쓰기 땜질 제거)', () => {
    for (const { variant } of PAIRS) {
      const html = renderService(variant)
      expect(html).not.toContain('background-color:')
      expect(html).not.toMatch(/style="[^"]*color:/)
    }
  })
})

describe('1px 테두리와 세로 패딩 — 높이가 그대로다', () => {
  it('서비스: 모든 변형에 border 1px 클래스가 있다', () => {
    for (const { variant } of PAIRS) {
      expect(classesOf(renderService(variant))).toContain('border')
    }
    const arrow = renderToStaticMarkup(<ServiceButton variant="arrow">확인</ServiceButton>)
    expect(classesOf(arrow)).toContain('border')
  })

  it('서비스 md: 세로 패딩 13px + 테두리 1px씩 + 줄 높이 24px = 52px(옛 패딩 14px)', () => {
    for (const { variant } of PAIRS) {
      const c = classesOf(renderService(variant))
      expect(c).toContain('py-[13px]')
      expect(c).not.toContain('py-[14px]')
    }
    expect(2 * 13 + 2 * 1 + 24).toBe(2 * 14 + 24)
  })

  it('서비스 sm·lg·xs도 테두리 두께만큼 세로 패딩이 줄었다', () => {
    expect(classesOf(renderService('secondary', { size: 'sm' }))).toContain('py-[9px]')
    expect(classesOf(renderService('secondary', { size: 'lg' }))).toContain('py-[17px]')
    const xs = renderService('secondary', { size: 'xs' })
    expect(xs).toContain('padding-top:calc(12px * var(--scale-compact) - 1px)')
    expect(xs).toContain('padding-bottom:calc(12px * var(--scale-compact) - 1px)')
  })

  it('서비스 arrow: 세로 패딩 23px(py-5.75, 스케일 유틸리티) + 테두리 1px(옛 py-6 = 24px)', () => {
    const html = renderToStaticMarkup(<ServiceButton variant="arrow">확인</ServiceButton>)
    expect(classesOf(html)).toContain('py-5.75')
    expect(classesOf(html)).toContain('border-transparent')
  })

  it('MODULAR: 테두리 2px → 1px, 세로 패딩 12px → 13px(md)·+1px(sm)이라 높이가 같다', () => {
    const md = renderDs('secondary')
    expect(md).toContain('border-width:1px')
    expect(md).toContain('padding:13px 24px')
    const sm = renderDs('secondary', { size: 'sm' })
    expect(sm).toContain('padding:calc(12px * var(--scale-compact) + 1px) calc(24px * var(--scale-compact))')
    expect(2 * 13 + 2 * 1).toBe(2 * 12 + 2 * 2)
  })
})

describe('MODULAR surface="dark" (반전 면 위)', () => {
  const renderDark = (variant: string) =>
    renderToStaticMarkup(
      <DsButton variant={variant as PairVariant} surface="dark">
        확인
      </DsButton>
    )

  it('primary는 --snow 채움 + --foreground 글자다(반전 면 위 알약 윤곽)', () => {
    const html = renderDark('primary')
    expect(html).toContain('background:var(--snow)')
    expect(html).toContain('color:var(--foreground)')
  })

  it('secondary는 투명 + 1px --snow 테두리 + --snow 글자이고 흰색 반투명이 없다', () => {
    const html = renderDark('secondary')
    expect(html).toContain('background:transparent')
    expect(html).toContain('border-color:var(--snow)')
    expect(html).toContain('color:var(--snow)')
    expect(html).not.toContain('rgba(255,255,255')
  })

  it('ghost는 --snow 글자다', () => {
    expect(renderDark('ghost')).toContain('color:var(--snow)')
  })

  it('danger·outline은 dark 값이 없어 light 값을 쓴다', () => {
    expect(renderDark('danger')).toBe(renderDs('danger'))
    expect(renderDark('outline')).toBe(renderDs('outline'))
  })
})

describe('두 구현 소스에 다크 전용 값이 없다', () => {
  const sources = {
    'Button.tsx': readFileSync(path.resolve(__dirname, '../Button.tsx'), 'utf8'),
    'Button.jsx': readFileSync(path.resolve(__dirname, '../../../../design-system/components/buttons/Button.jsx'), 'utf8'),
  }

  for (const [name, source] of Object.entries(sources)) {
    it(`${name}: 흰색·검정 반투명과 text-white를 직접 지정하지 않는다`, () => {
      expect(source).not.toMatch(/rgba\(\s*255/)
      expect(source).not.toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0/)
      expect(source).not.toMatch(/bg-(white|black)\//)
      expect(source).not.toContain('text-white')
    })
  }
})
