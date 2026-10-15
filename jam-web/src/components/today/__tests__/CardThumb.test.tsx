/**
 * 64px 칸 공용(`CardThumb`) 렌더 테스트 (티켓 20261001_2104, 상위 20260930_1453 조각 b5)
 *
 * `BriefCard`의 `BriefSlot`을 그대로 옮긴 것이라 `BriefCard.test.tsx`의 썸네일 단언도 같은 마크업을 본다. 여기서는 칸이 모양을 모른 채
 * (`resource`·`regionLabel`만 읽고) 그림·흑백·자원 아이콘 대체·칸 크기를 지키는지 고정한다. 이미지 로드 실패는 「주소 없음」과 같은 대체 경로를 타므로
 * 「주소 없음」으로 검증하고, 실패 후 칸 높이 같은 계산 스타일은 Story의 `play`(`ListCard.stories.tsx`)가 본다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CardThumb from '../CardThumb'
import { BookIcon, FlaskIcon, MedalIcon, TargetIcon } from '@/components/ui/icons'

const BOX = 'w-16 h-16 shrink-0 rounded-2xl bg-black/[0.04] overflow-hidden flex items-center justify-center'
const ICON_CLASS = 'w-6 h-6 text-snow/60'
const icon = (Icon: typeof MedalIcon) => renderToStaticMarkup(<Icon className={ICON_CLASS} />)

describe('CardThumb — 64px 칸', () => {
  it('칸은 64px 정사각이고 줄지 않으며 옅은 면(bg-black/[0.04])·모서리 --radius-2xl다', () => {
    const html = renderToStaticMarkup(<CardThumb view={{ resource: 'badge' }} src="https://cdn.example/b.png" />)
    expect(html.startsWith(`<div class="${BOX}">`)).toBe(true)
  })

  it('그림이 있으면 alt가 빈 값인 64px 그림을 칸 가득(object-cover) 그리고 컬러다', () => {
    const html = renderToStaticMarkup(<CardThumb view={{ resource: 'badge' }} src="https://cdn.example/b.png" />)
    expect(html).toContain('alt=""')
    expect(html).toContain('width="64"')
    expect(html).toContain('height="64"')
    expect(html).toContain('w-full h-full object-cover')
    expect(html).not.toContain('grayscale')
  })

  it('dimmed면 그림에만 grayscale을 건다', () => {
    const html = renderToStaticMarkup(<CardThumb view={{ resource: 'badge' }} src="https://cdn.example/b.png" dimmed />)
    expect(html.match(/grayscale/g)).toHaveLength(1)
    expect(html).toContain('w-full h-full object-cover grayscale')
  })

  it.each([[undefined], [null], ['']])('그림 주소가 %p이면 같은 칸에 자원 아이콘을 그린다(그림 태그 없음)', (src) => {
    const html = renderToStaticMarkup(<CardThumb view={{ resource: 'badge' }} src={src} />)
    expect(html).toBe(`<div class="${BOX}">${icon(MedalIcon)}</div>`)
    expect(html).not.toContain('<img')
  })

  it('아이콘은 카드의 자원이 정한다 — 재료(recipe)는 메달이 아니라 플라스크다', () => {
    expect(renderToStaticMarkup(<CardThumb view={{ resource: 'recipe' }} />)).toContain(icon(FlaskIcon))
    expect(renderToStaticMarkup(<CardThumb view={{ resource: 'mission' }} />)).toContain(icon(TargetIcon))
    expect(renderToStaticMarkup(<CardThumb view={{ resource: 'collection' }} />)).toContain(icon(BookIcon))
    expect(renderToStaticMarkup(<CardThumb view={{ resource: 'recipe' }} />)).not.toContain(icon(MedalIcon))
  })

  it('아이콘 색은 /60 한 단계다(/40 없음)', () => {
    const html = renderToStaticMarkup(<CardThumb view={{ resource: 'badge' }} />)
    expect(html).toContain('text-snow/60')
    expect(html).not.toContain('/40')
  })

  it('dimmed여도 그림이 없으면 아이콘은 흑백 처리하지 않는다', () => {
    expect(renderToStaticMarkup(<CardThumb view={{ resource: 'badge' }} dimmed />)).not.toContain('grayscale')
  })
})
