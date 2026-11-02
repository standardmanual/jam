/**
 * BadgeGridCard `undiscovered` — 서비스 사본과 MODULAR 원본이 같은 미발견 표시를 낸다 (티켓 20261102_1834)
 *
 * 미발견 칸은 이미지 바깥 윤곽의 회색 실루엣(`brightness(0)` + `invert`)과 배지의 실제 이름을 보여 준다. 흐림(opacity)·«???»는 없다.
 * `SlotGrid`는 미발견 칸에 `earned={false}`도 함께 넘기므로, 두 값이 같이 올 때 실루엣이 이긴다는 것을 여기서 고정한다.
 * 저장소에 jsdom이 없어 서버 렌더로 마크업만 본다. 두 구현의 표현만 다르다: 서비스는 `<img>`의 클래스, MODULAR는 인라인 style이다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import ServiceBadgeGridCard, { UNDISCOVERED_SILHOUETTE_CLASS } from '../BadgeGridCard'
import { BadgeGridCard as DsBadgeGridCard } from '@ds/components/patterns/BadgeGridCard'
import { d } from '@/lib/i18n'

const NAME = '한강 마스터'
const IMAGE = 'https://example.com/badge.png'

const implementations = [
  {
    label: '서비스',
    render: (props: Record<string, unknown>) => renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" {...props} />),
    isSilhouette: (img: string) => img.includes('brightness-0') && img.includes('invert-[.64]'),
    isGrayscale: (img: string) => /class="[^"]*\bgrayscale\b/.test(img),
  },
  {
    label: 'MODULAR',
    render: (props: Record<string, unknown>) => renderToStaticMarkup(<DsBadgeGridCard rarity="epic" {...props} />),
    isSilhouette: (img: string) => img.includes('filter:brightness(0) invert(0.64)'),
    isGrayscale: (img: string) => img.includes('filter:grayscale(1)'),
  },
]

const imgTag = (html: string): string => {
  const match = html.match(/<img[^>]*>/)
  expect(match, '<img>를 찾지 못했다').not.toBeNull()
  return match![0]
}

describe.each(implementations)('BadgeGridCard undiscovered — $label', ({ render, isSilhouette, isGrayscale }) => {
  it('이미지에 실루엣 필터가 걸리고 alt와 이름 줄이 실제 이름이며 «???»는 없다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true })
    const img = imgTag(html)
    expect(isSilhouette(img)).toBe(true)
    expect(img).toContain(`alt="${NAME}"`)
    expect(html).toContain(`>${NAME}</p>`)
    expect(html).not.toContain('???')
  })

  it('흐림(opacity)을 쓰지 않는다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true })
    expect(html).not.toMatch(/opacity/)
  })

  it('earned=false가 함께 와도(SlotGrid의 실제 조합) 실루엣이 이기고 grayscale은 걸리지 않는다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true, earned: false })
    const img = imgTag(html)
    expect(isSilhouette(img)).toBe(true)
    expect(isGrayscale(img)).toBe(false)
    expect(html).not.toMatch(/opacity/)
  })

  it('미발견이 아니면서 earned=false이면 이전과 같은 grayscale이고 실루엣이 아니다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, earned: false })
    // 서비스 사본은 grayscale 클래스가 썸네일 래퍼에, MODULAR는 <img> 인라인 style에 있다
    expect(isGrayscale(imgTag(html)) || /class="[^"]*\bgrayscale\b/.test(html)).toBe(true)
    expect(isSilhouette(imgTag(html))).toBe(false)
  })

  it('획득한 카드는 필터가 걸리지 않는다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE })
    expect(isGrayscale(imgTag(html))).toBe(false)
    expect(isSilhouette(imgTag(html))).toBe(false)
    expect(html).not.toMatch(/class="[^"]*\bgrayscale\b/)
  })

  it('등급 칩과 ×N을 그리지 않는다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true, count: 3, rarity: 'epic' })
    expect(html).not.toContain('×3')
    expect(html).not.toContain('Epic')
  })

  it('이미지가 없으면 필터 없이 대체 그림과 이름이 나온다', () => {
    const html = render({ name: NAME, imageUrl: null, undiscovered: true })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('brightness')
    expect(html).not.toContain('invert')
    expect(html).toContain(`>${NAME}</p>`)
  })

  it('locked이면 undiscovered가 함께 와도 이름과 그림을 그리지 않는다', () => {
    const html = render({ locked: true, undiscovered: true, name: NAME, imageUrl: IMAGE })
    expect(html).not.toContain(NAME)
    expect(html).not.toContain('<img')
    expect(html).toContain(d.lockedItem.card.name)
  })
})

describe('BadgeGridCard undiscovered — 서비스 클래스 합성', () => {
  it('실루엣 클래스는 <img>에만 있고 썸네일 래퍼에는 없다(대체 아이콘이 검정으로 칠해지지 않게)', () => {
    expect(UNDISCOVERED_SILHOUETTE_CLASS).toBe('brightness-0 invert-[.64]')
    const html = renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" name={NAME} imageUrl={IMAGE} undiscovered earned={false} />)
    expect(imgTag(html)).toContain(UNDISCOVERED_SILHOUETTE_CLASS)
    const wrapper = html.match(/<div class="(w-full aspect-square[^"]*)"/)
    expect(wrapper, '썸네일 래퍼를 찾지 못했다').not.toBeNull()
    expect(wrapper![1]).not.toContain('brightness')
    expect(wrapper![1]).not.toContain('invert')
    expect(wrapper![1]).not.toContain('grayscale')
  })

  it('이름 줄은 두 줄 말줄임과 줄바꿈 클래스를 그대로 가진다', () => {
    const html = renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" name="아주 긴 아이템 배지 이름입니다" imageUrl={null} undiscovered />)
    const cls = html.match(/<p class="([^"]*font-bold[^"]*)"/)![1]
    expect(cls).toContain('line-clamp-2')
    expect(cls).toContain('break-keep')
    expect(cls).toContain('wrap-break-word')
    expect(cls).toContain('text-foreground')
  })
})
