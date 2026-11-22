/**
 * 배지 상세 티켓의 사진·글자 상자와 제목 숨김 prop (티켓 20261122_1223)
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/SafeImage', () => ({ default: ({ alt }: { alt: string }) => <span data-img={alt} /> }))
vi.mock('@/components/BadgeAuraBackground', () => ({ default: () => <i data-aura /> }))
vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => <i data-blob /> }))

import TicketPhoto from '../TicketPhoto'
import TicketTitleBoxes from '../TicketTitleBoxes'
import BadgeConditionCard from '../BadgeConditionCard'

const base = {
  image_url: 'https://example.com/a.png',
  name: '한강 라이더',
  rarity: 'rare' as const,
  description: '첫 문장이에요. 둘째 문장이에요.',
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
  bg_colors: ['#ff0000'],
}

describe('TicketPhoto', () => {
  it('사진 박스에는 이름·설명 글자가 없고 Aura 배경과 이미지만 있다', () => {
    const html = renderToStaticMarkup(<TicketPhoto badge={base as never} hasEarned />)
    expect(html).toContain('data-aura')
    expect(html).toContain('rounded-2xl')
    expect(html).not.toContain('<h1')
    expect(html).not.toContain('첫 문장')
  })

  it('미획득이면 대체 아이콘이 흑백이다', () => {
    const html = renderToStaticMarkup(<TicketPhoto badge={{ ...base, image_url: null } as never} hasEarned={false} />)
    expect(html).toContain('grayscale')
  })
})

describe('TicketTitleBoxes', () => {
  it('칩 → 이름 h1 → 설명 순서로 그리고 chipExtra를 칩 옆에 둔다', () => {
    const html = renderToStaticMarkup(<TicketTitleBoxes badge={base as never} chipExtra={<b>잠김</b>} />)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html.indexOf('잠김')).toBeLessThan(html.indexOf('<h1'))
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('첫 문장이에요.'))
    expect(html).toContain('둘째 문장이에요.')
  })

  it('설명이 없으면 아래 칸을 그리지 않는다', () => {
    const html = renderToStaticMarkup(<TicketTitleBoxes badge={{ ...base, description: null } as never} />)
    expect(html).toContain('<h1')
    expect(html).not.toContain('<p')
  })
})

describe('BadgeConditionCard hideTitle', () => {
  it('기본은 제목이 보이고 hideTitle이면 sr-only로 남는다', () => {
    const shown = renderToStaticMarkup(<BadgeConditionCard text="조건" spec="10회" />)
    const hidden = renderToStaticMarkup(<BadgeConditionCard text="조건" spec="10회" hideTitle />)
    expect(shown).not.toContain('sr-only')
    expect(hidden).toContain('sr-only')
  })
})
