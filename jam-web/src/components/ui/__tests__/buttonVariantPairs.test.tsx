/**
 * Button 변형의 면·글자·테두리 짝 (티켓 20261015_2133, 2회 버튼·입력창·내비게이션)
 *
 * 서비스 `Button.tsx`(Tailwind 클래스)가 유일한 구현이다(MODULAR 사본은 티켓 20261126_0720에서 지웠다).
 * 자동 검사(`scripts/check-token-refs.mjs`)는 색을 비교하지 못하므로, 이 파일이 변형별 토큰 한 표를 고정한다.
 *
 * 변형 대응(티켓 20261107_2202): primary `--accent`(글자 `--accent-foreground`), secondary·outline `--btn-secondary`(외곽선 없음,
 * 둘은 같은 면), danger `--danger`(글자 `--snow`), ghost 글자 `--link`.
 *
 * 확인하는 것
 * ① 변형별 면·글자·테두리 토큰 표
 * ② 서비스 `surface="main"` primary는 검정(`--background-inverse` + `--snow`)이다 — 사용자 결정(2026-10-16)으로 결정 2를
 *    이 면에 적용하지 않았고, 그래서 sub primary(`--accent`)와 갈라진 채 남는다(알려진 임시 결함, 고정)
 * ③ `outline`의 뜻이 「외곽선」이고 옛 「테두리 없는 보조 채움」은 `secondary`다(이름 재사용 함정)
 * ④ surface는 primary에서만 색을 바꾼다
 * ⑤ 모든 변형에 1px 테두리가 있고 세로 패딩이 그만큼 줄어 높이는 4px 눈금으로 옮겼다(md 50px, 7회차 사용자 결정)
 * ⑥ `surface="dark"`의 면·글자·테두리 토큰 쌍
 * ⑦ 소스에 다크 전용 값(흰색·검정 반투명 직접 지정)이 없다
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import ServiceButton from '../Button'

type PairVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'

/** 변형별 토큰 표(sub 기준). */
const PAIRS: ReadonlyArray<{
  variant: PairVariant
  face: string
  text: string
  border: string
}> = [
  { variant: 'primary', face: 'accent', text: 'accent-foreground', border: 'transparent' },
  { variant: 'secondary', face: 'btn-secondary', text: 'foreground', border: 'transparent' },
  { variant: 'danger', face: 'danger', text: 'snow', border: 'transparent' },
  { variant: 'outline', face: 'btn-secondary', text: 'foreground', border: 'transparent' },
  { variant: 'ghost', face: 'transparent', text: 'link', border: 'transparent' },
]

const renderService = (variant: PairVariant, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <ServiceButton variant={variant} surface="sub" {...props}>
      확인
    </ServiceButton>
  )

/** 서비스 마크업의 class 토큰 목록 */
const classesOf = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(/\s+/)

describe('변형별 면·글자·테두리 토큰', () => {
  for (const { variant, face, text, border } of PAIRS) {
    it(`${variant}: 면 ${face} / 글자 ${text} / 테두리 ${border}`, () => {
      const service = classesOf(renderService(variant))
      expect(service).toContain(`bg-${face}`)
      expect(service).toContain(`text-${text}`)
      expect(service).toContain(`border-${border}`)
    })
  }

  it('danger 글자는 --snow다(--danger가 검정이라 --foreground 글자는 보이지 않는다)', () => {
    expect(classesOf(renderService('danger'))).not.toContain('text-foreground')
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

  it('서비스 sub primary는 --accent 면 + --accent-foreground 글자다', () => {
    const sub = classesOf(renderService('primary'))
    expect(sub).toContain('bg-accent')
    expect(sub).toContain('text-accent-foreground')
  })
})

describe('outline과 secondary의 뜻 (이름 재사용 함정)', () => {
  it('outline은 외곽선이 없어 secondary와 같은 면이다(사용자 결정 2026-11-07)', () => {
    const outline = classesOf(renderService('outline'))
    expect(outline).toContain('bg-btn-secondary')
    expect(outline).toContain('border-transparent')
    expect(outline).not.toContain('border-field-border')
  })

  it('secondary는 --btn-secondary 채움이고 테두리 색은 투명이다', () => {
    const secondary = classesOf(renderService('secondary'))
    expect(secondary).toContain('bg-btn-secondary')
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

describe('1px 테두리와 세로 패딩 — 4px 눈금 높이', () => {
  it('서비스: 모든 변형에 border 1px 클래스가 있다', () => {
    for (const { variant } of PAIRS) {
      expect(classesOf(renderService(variant))).toContain('border')
    }
    const arrow = renderToStaticMarkup(<ServiceButton variant="arrow">확인</ServiceButton>)
    expect(classesOf(arrow)).toContain('border')
  })

  it('서비스 md: 세로 패딩 12px + 테두리 1px씩 + 줄 높이 24px = 50px', () => {
    for (const { variant } of PAIRS) {
      const c = classesOf(renderService(variant))
      expect(c).toContain('py-3')
      expect(c).not.toContain('py-[13px]')
    }
    expect(2 * 12 + 2 * 1 + 24).toBe(50)
  })

  it('서비스 sm 42px·lg 58px·xs: 6 variant × 4 size 전 조합에서 세로 패딩 클래스가 하나뿐이다', () => {
    const verticalOf = (html: string) => classesOf(html).filter((c) => /^py-/.test(c))
    const expected = { xs: undefined, sm: 'py-2', md: undefined, lg: 'py-4' } as const
    for (const variant of [...PAIRS.map((p) => p.variant), 'arrow'] as const) {
      for (const size of ['xs', 'sm', 'md', 'lg'] as const) {
        const html = renderToStaticMarkup(
          <ServiceButton variant={variant} surface="sub" size={size}>확인</ServiceButton>
        )
        const py = verticalOf(html)
        expect(py, `${variant}/${size}`).toHaveLength(1)
        const want = expected[size] ?? (variant === 'arrow' ? 'py-6' : 'py-3')
        expect(py[0], `${variant}/${size}`).toBe(want)
      }
    }
    expect(2 * 8 + 2 + 24).toBe(42)
    expect(2 * 16 + 2 + 24).toBe(58)
    const xs = renderService('secondary', { size: 'xs' })
    expect(xs).toContain('padding-top:calc(12px * var(--scale-compact) - 1px)')
    expect(xs).toContain('padding-bottom:calc(12px * var(--scale-compact) - 1px)')
  })

  it('sm은 최소 높이 44px(min-h-11)를 걸지 않아 42px로 남는다', () => {
    expect(classesOf(renderService('secondary', { size: 'sm' }))).not.toContain('min-h-11')
    expect(classesOf(renderService('secondary', { size: 'md' }))).toContain('min-h-11')
  })

  it('서비스 outline은 크기별 높이 클래스·인라인 패딩이 secondary와 같다(보조 버튼을 outline으로 바꿔도 높이 불변)', () => {
    const heightClasses = (html: string) =>
      classesOf(html)
        .filter((c) => /^(min-h|py|px)-/.test(c))
        .sort()
    for (const size of ['xs', 'sm', 'md', 'lg'] as const) {
      const secondary = renderService('secondary', { size })
      const outline = renderService('outline', { size })
      expect(heightClasses(outline), size).toEqual(heightClasses(secondary))
      expect(outline.match(/style="[^"]*"/)?.[0], size).toBe(secondary.match(/style="[^"]*"/)?.[0])
    }
  })

  it('서비스 primary: 좌우 여백 24px(px-6) — 다른 변형과 같다(티켓 20261126_1635)', () => {
    const html = renderToStaticMarkup(<ServiceButton variant="primary">확인</ServiceButton>)
    expect(classesOf(html)).toContain('px-6')
    expect(classesOf(html)).not.toContain('px-8')
    expect(readFileSync(path.resolve(__dirname, '../Button.tsx'), 'utf8')).not.toContain('spacing-allow')
  })

  it('서비스 arrow: 세로 패딩 24px(py-6) + 테두리 1px — 높이 82px(줄 높이 32px)', () => {
    const html = renderToStaticMarkup(<ServiceButton variant="arrow">확인</ServiceButton>)
    expect(classesOf(html)).toContain('py-6')
    expect(classesOf(html)).toContain('border-transparent')
    expect(2 * 24 + 2 + 32).toBe(82)
  })
})

describe('surface="dark" (반전 면 위)', () => {
  it('서비스 Button surface="dark" 토큰 쌍: primary --snow 면, secondary 투명 + --snow 테두리, ghost --snow 글자(티켓 20261125_1444)', () => {
    const primary = classesOf(renderToStaticMarkup(<ServiceButton variant="primary" surface="dark">확인</ServiceButton>))
    expect(primary).toContain('bg-snow')
    expect(primary).toContain('text-foreground')

    const secondary = classesOf(renderToStaticMarkup(<ServiceButton variant="secondary" surface="dark">확인</ServiceButton>))
    expect(secondary).toContain('bg-transparent')
    expect(secondary).toContain('border-snow')
    expect(secondary).toContain('text-snow')

    const ghost = classesOf(renderToStaticMarkup(<ServiceButton variant="ghost" surface="dark">확인</ServiceButton>))
    expect(ghost).toContain('bg-transparent')
    expect(ghost).toContain('text-snow')
  })
})

describe('소스에 다크 전용 값이 없다', () => {
  const sources = {
    'Button.tsx': readFileSync(path.resolve(__dirname, '../Button.tsx'), 'utf8'),
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
