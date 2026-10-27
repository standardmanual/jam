/**
 * 기획 이유 칩 (티켓 20261026_2024 1회차, 어드민 상황판 PRD §3 원칙 4)
 *
 * 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다: 점선 테두리 + 종류 아이콘(장식) + 회색 글자, 상태 색을 쓰지 않는다,
 * 「+N」 줄임, 칩이 없으면 아무것도 그리지 않는다, 글자가 HTML로 해석되지 않는다.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { OpsRationaleChip, OpsRationaleChips, kindChipEntries } from '../OpsRationaleChip'

const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

describe('OpsRationaleChip', () => {
  it('점선 테두리·종류 아이콘(화면 읽기에서 제외)·글자로 그린다', () => {
    const out = flat(<OpsRationaleChip kind="trend" label="LP 인기" />)
    expect(out).toContain('border-dashed')
    expect(out).toContain('data-rationale-kind="trend"')
    expect(out).toContain('<svg')
    expect(out).toContain('aria-hidden="true"')
    expect(out).toContain('LP 인기')
  })

  it('상태 색(호박·파랑·초록·빨강)을 쓰지 않는다', () => {
    for (const kind of ['trend', 'season', 'weather', 'signal', 'pattern'] as const) {
      const out = flat(<OpsRationaleChip kind={kind} label="x" count={2} />)
      expect(out, kind).not.toMatch(/amber|blue|green|red|emerald/)
      expect(out, kind).toContain('<svg')
    }
  })

  it('다섯 종류의 아이콘이 서로 다르다', () => {
    const icons = (['trend', 'season', 'weather', 'signal', 'pattern'] as const).map((kind) =>
      /<svg[^>]*class="([^"]*)"/.exec(flat(<OpsRationaleChip kind={kind} label="x" />))?.[1]
    )
    expect(new Set(icons).size).toBe(5)
  })

  it('건수가 있으면 글자 뒤에 붙고, 글자는 HTML로 해석되지 않는다', () => {
    const out = flat(<OpsRationaleChip kind="season" label="<b>가을</b>" count={3} />)
    expect(out).toContain('&lt;b&gt;가을&lt;/b&gt;')
    expect(out).not.toContain('<b>')
    expect(out).toContain('<span class="tabular-nums">3</span>')
  })
})

describe('OpsRationaleChips', () => {
  const chips = [
    { kind: 'trend', label: 'a' },
    { kind: 'season', label: 'b' },
    { kind: 'weather', label: 'c' },
  ] as const

  it('최대 개수를 넘으면 나머지를 「+N」으로 줄인다', () => {
    const out = flat(<OpsRationaleChips chips={chips} max={2} />)
    expect(out.match(/data-rationale-kind/g)).toHaveLength(2)
    expect(out).toContain('+1')
  })

  it('최대 개수를 안 주면 전부 보이고, 칩이 없으면 아무것도 그리지 않는다', () => {
    expect(flat(<OpsRationaleChips chips={chips} />).match(/data-rationale-kind/g)).toHaveLength(3)
    expect(flat(<OpsRationaleChips chips={[]} />)).toBe('')
  })

  it('kindChipEntries는 종류 이름을 글자로 쓴다', () => {
    expect(kindChipEntries([{ kind: 'signal', count: 4 }])).toEqual([{ kind: 'signal', label: '신호', count: 4 }])
  })
})
