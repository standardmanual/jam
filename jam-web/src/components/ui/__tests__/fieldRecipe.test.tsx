/**
 * 입력창(Input·Select·Textarea) 면·테두리·상태 레시피 (티켓 20261015_2133, 2회 버튼·입력창·내비게이션)
 *
 * 입력창은 서비스에서 쓰지 않는 미도입 MODULAR 컴포넌트라(스토리북에서만 바뀐다) 서비스 쌍이 없다.
 * 서비스에서 같은 모양을 쓰는 `UserSearchBar`(흰 면 + 1px --field-border)와 레시피가 같은지가 기준이다.
 *
 * 확인하는 것
 * ① 면 --surface + 1px --field-border, 글자 --foreground. 옛 --background-secondary·--border 면/테두리가 없다
 * ② Input·Select는 캡슐(--field-radius), Textarea만 --radius-2xl이다
 * ③ 오류 --danger, 성공 --success. --rarity-* 색을 쓰지 않는다
 * ④ 상태가 바뀌어도 border는 1px 그대로이고 같은 색 inset 링 1px로 시각 2px을 만든다(두께가 변하면 글자가 1px 움직인다)
 * ⑤ Input의 `surface="inverse"`(흰색 반투명 테두리)가 사라졌다
 * ⑥ Select 미선택 글자 --muted, 선택됨 --foreground
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Input } from '@ds/components/forms/Input'
import { Select } from '@ds/components/forms/Select'
import { Textarea } from '@ds/components/forms/Textarea'

const OPTIONS = [
  { value: 'running', label: '러닝' },
  { value: 'cycling', label: '사이클링' },
]

type FieldState = 'default' | 'error' | 'success'

/** 컴포넌트 이름 → 상태를 받아 렌더하는 함수 */
const FIELDS: Record<string, (state: FieldState) => string> = {
  Input: (state) => renderToStaticMarkup(<Input aria-label="입력" state={state} />),
  Select: (state) =>
    renderToStaticMarkup(<Select aria-label="선택" options={OPTIONS} value="running" onChange={() => {}} state={state} />),
  Textarea: (state) => renderToStaticMarkup(<Textarea aria-label="내용" state={state} />),
}

describe('입력창 면과 기본 테두리', () => {
  for (const [name, render] of Object.entries(FIELDS)) {
    it(`${name}: 흰 면(--surface) + 1px --field-border + 글자 --foreground`, () => {
      const html = render('default')
      expect(html).toContain('background:var(--surface)')
      expect(html).toContain('border:1px solid var(--field-border)')
      expect(html).toContain('color:var(--foreground)')
    })

    it(`${name}: 옛 면(--background-secondary)·테두리(--border)와 흰색 반투명이 없다`, () => {
      const html = render('default')
      expect(html).not.toContain('--background-secondary')
      expect(html).not.toContain('1px solid var(--border)')
      expect(html).not.toContain('rgba(255,255,255')
    })
  }
})

describe('입력창 모양', () => {
  it('Input·Select는 캡슐(--field-radius)이다', () => {
    expect(FIELDS.Input('default')).toContain('border-radius:var(--field-radius)')
    expect(FIELDS.Select('default')).toContain('border-radius:var(--field-radius)')
  })

  it('Textarea만 --radius-2xl이다(여러 줄은 캡슐이면 모서리가 글자를 먹는다)', () => {
    const html = FIELDS.Textarea('default')
    expect(html).toContain('border-radius:var(--radius-2xl)')
    expect(html).not.toContain('--field-radius')
  })

  it('Input은 높이 44px 고정이다', () => {
    expect(FIELDS.Input('default')).toContain('height:44px')
  })
})

describe('입력창 상태 테두리', () => {
  const STATE_COLOR: Record<Exclude<FieldState, 'default'>, string> = {
    error: 'var(--danger)',
    success: 'var(--success)',
  }

  for (const [name, render] of Object.entries(FIELDS)) {
    for (const state of ['error', 'success'] as const) {
      it(`${name} ${state}: 1px 테두리 + 같은 색 inset 링 1px(시각 2px)`, () => {
        const html = render(state)
        expect(html).toContain(`border:1px solid ${STATE_COLOR[state]}`)
        expect(html).toContain(`box-shadow:inset 0 0 0 1px ${STATE_COLOR[state]}`)
      })
    }

    it(`${name}: 희귀도 색(--rarity-*)을 쓰지 않는다`, () => {
      for (const state of ['default', 'error', 'success'] as const) {
        expect(render(state)).not.toContain('--rarity-')
      }
    })

    it(`${name}: 상태가 바뀌어도 border 두께가 1px 그대로다(글자 위치 불변)`, () => {
      for (const state of ['default', 'error', 'success'] as const) {
        const html = render(state)
        expect(html).toMatch(/border:1px solid/)
        expect(html).not.toMatch(/border:2px/)
      }
    })
  }

  it('오류만 aria-invalid가 붙는다', () => {
    expect(FIELDS.Input('error')).toContain('aria-invalid="true"')
    expect(FIELDS.Input('success')).not.toContain('aria-invalid')
    expect(FIELDS.Input('default')).not.toContain('aria-invalid')
  })

  it('기본 상태에는 링이 없다', () => {
    for (const render of Object.values(FIELDS)) {
      expect(render('default')).toContain('box-shadow:none')
    }
  })
})

describe('Input surface="inverse" 삭제', () => {
  it('Input.jsx 소스에 inverse 분기와 흰색 반투명 테두리가 없다', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../../../design-system/components/forms/Input.jsx'),
      'utf8'
    )
    expect(source).not.toMatch(/isInverse|surface\s*=\s*['"]default['"]/)
    expect(source).not.toMatch(/rgba\(\s*255/)
  })
})

describe('Select 글자색', () => {
  it('미선택은 --muted, 선택됨은 --foreground다', () => {
    const empty = renderToStaticMarkup(
      <Select aria-label="선택" options={OPTIONS} placeholder="활동 유형" value="" onChange={() => {}} />
    )
    expect(empty).toContain('color:var(--muted)')
    const picked = renderToStaticMarkup(
      <Select aria-label="선택" options={OPTIONS} value="cycling" onChange={() => {}} />
    )
    expect(picked).toContain('color:var(--foreground)')
  })

  it('화살표(chevron)는 --foreground 색을 따라간다', () => {
    expect(FIELDS.Select('default')).toContain('position:absolute;right:16px;color:var(--foreground)')
  })
})
