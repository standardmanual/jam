/**
 * BadgeGridCard `undiscovered` · `outlined` — 서비스 사본과 MODULAR 원본이 같은 표시를 낸다 (티켓 20261102_1834, 20261112_1627)
 *
 * 후보가 없는 칸(`undiscovered`)은 이미지를 그리지 않고 이미지 알파 윤곽의 점선(`SlotOutline`)과 배지의 실제 이름을 보여 준다.
 * 이전의 회색 실루엣 채움(`brightness(0)` + `invert`)은 걷었다. 흐림(opacity)·«???»도 없다.
 * `SlotGrid`는 미발견 칸에 `earned={false}`도 함께 넘기므로, 두 값이 같이 올 때 점선이 이긴다는 것을 여기서 고정한다.
 * 넣을 수 있는 칸(`outlined`)은 회색 이미지 위에 같은 점선이 겹치고, 점선은 이미지 래퍼의 형제라 이미지 opacity를 먹지 않는다.
 * 저장소에 jsdom이 없어 서버 렌더로 마크업만 본다 — 추적은 effect에서 시작하므로 점선 상태는 «추적 중»(path 없음)이거나,
 * 주소가 없을 때의 사각형 대체다. 두 구현의 표현만 다르다: 서비스는 이미지의 클래스, MODULAR는 인라인 style이다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import ServiceBadgeGridCard from '../BadgeGridCard'
import { BadgeGridCard as DsBadgeGridCard } from '@ds/components/patterns/BadgeGridCard'
import { d } from '@/lib/i18n'

const NAME = '한강 마스터'
const IMAGE = 'https://example.com/badge.png'

const implementations = [
  {
    label: '서비스',
    render: (props: Record<string, unknown>) => renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" {...props} />),
    isGrayscale: (html: string) => /class="[^"]*\bgrayscale\b/.test(html),
  },
  {
    label: 'MODULAR',
    render: (props: Record<string, unknown>) => renderToStaticMarkup(<DsBadgeGridCard rarity="epic" {...props} />),
    isGrayscale: (html: string) => html.includes('filter:grayscale(1)'),
  },
]

/** 점선 svg 안의 <style>(등장 애니메이션 keyframes의 opacity)은 빼고 본다 — 칸 자체에 건 흐림만 문제다 */
const withoutStyleTag = (html: string): string => html.replace(/<style>[\s\S]*?<\/style>/g, '')

const SILHOUETTE_FILTERS = ['brightness-0', 'invert-[.64]', 'brightness(0)', 'invert(0.64)']
const outlineTag = (html: string): string => {
  const match = html.match(/<svg[^>]*data-outline-state="[^"]*"[^>]*>/)
  expect(match, '점선 <svg>를 찾지 못했다').not.toBeNull()
  return match![0]
}

describe.each(implementations)('BadgeGridCard undiscovered — $label', ({ render, isGrayscale }) => {
  it('이미지를 그리지 않고 점선 svg와 실제 이름만 나오며 «???»는 없다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true })
    expect(html).not.toContain('<img')
    expect(outlineTag(html)).toContain('aria-hidden="true"')
    expect(html).toContain(`>${NAME}</p>`)
    expect(html).not.toContain('???')
  })

  it('예전 회색 실루엣 필터가 남아 있지 않다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true, earned: false })
    for (const token of SILHOUETTE_FILTERS) expect(html).not.toContain(token)
  })

  it('흐림(opacity)을 쓰지 않는다', () => {
    const html = withoutStyleTag(render({ name: NAME, imageUrl: IMAGE, undiscovered: true }))
    expect(html).not.toMatch(/opacity/)
  })

  it('earned=false가 함께 와도(SlotGrid의 실제 조합) 점선이 이기고 grayscale·이미지는 없다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true, earned: false })
    expect(html).not.toContain('<img')
    expect(isGrayscale(html)).toBe(false)
    expect(withoutStyleTag(html)).not.toMatch(/opacity/)
    expect(outlineTag(html)).toBeTruthy()
  })

  it('이미지 주소가 없으면 둥근 사각형 점선(fallback box)이 나온다', () => {
    const html = render({ name: NAME, imageUrl: null, undiscovered: true })
    expect(outlineTag(html)).toContain('data-outline-state="box"')
    expect(html).toContain('<rect')
    expect(html).toContain(`>${NAME}</p>`)
  })

  it('추적 중에는 path도 사각형도 없다(칸 크기만 잡고 있다)', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true })
    expect(outlineTag(html)).toContain('data-outline-state="loading"')
    expect(html).not.toContain('<path')
    expect(html).not.toContain('<rect')
  })

  it('미발견이 아니면서 earned=false이면 이전과 같은 grayscale이고 점선은 없다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, earned: false })
    expect(isGrayscale(html)).toBe(true)
    expect(html).not.toContain('data-outline-state')
  })

  it('획득한 카드는 필터도 점선도 없다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE })
    expect(isGrayscale(html)).toBe(false)
    expect(html).not.toContain('data-outline-state')
    expect(html).not.toMatch(/class="[^"]*\bgrayscale\b/)
  })

  it('등급 칩과 ×N을 그리지 않는다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, undiscovered: true, count: 3, rarity: 'epic' })
    expect(html).not.toContain('×3')
    expect(html).not.toContain('Epic')
  })

  it('locked이면 undiscovered가 함께 와도 이름과 그림·점선을 그리지 않는다', () => {
    const html = render({ locked: true, undiscovered: true, name: NAME, imageUrl: IMAGE })
    expect(html).not.toContain(NAME)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('data-outline-state')
    expect(html).toContain(d.lockedItem.card.name)
  })
})

describe.each(implementations)('BadgeGridCard outlined — $label', ({ render, isGrayscale }) => {
  it('회색 이미지를 그대로 두고 그 위에 점선을 겹친다(실패 때 사각형 대체는 없다)', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, earned: false, outlined: true })
    expect(html).toContain('<img')
    expect(isGrayscale(html)).toBe(true)
    expect(outlineTag(html)).toContain('data-outline-state="loading"')
    const noSrc = render({ name: NAME, imageUrl: null, earned: false, outlined: true })
    expect(outlineTag(noSrc)).toContain('data-outline-state="none"')
    expect(noSrc).not.toContain('<rect')
  })

  it('점선은 반투명이 걸린 요소 안에 있지 않다(불투명 100%)', () => {
    const html = withoutStyleTag(render({ name: NAME, imageUrl: IMAGE, earned: false, outlined: true }))
    expect(html).toMatch(/opacity/)
    // 점선 svg 자신에는 opacity가 없다
    expect(html.match(/<svg[^>]*>/)![0]).not.toMatch(/opacity/)
    // 서비스: 썸네일 래퍼(opacity-40)가 닫힌 뒤에 점선이 나온다. MODULAR: 흐림은 <img>에만 걸려 점선과 형제다
    if (html.includes('opacity-40')) expect(html.indexOf('<svg')).toBeGreaterThan(html.indexOf('</div>'))
    else expect(html.match(/<img[^>]*>/)![0]).toContain('opacity:0.4')
  })

  it('undiscovered가 함께 오면 undiscovered가 이긴다(이미지 없음)', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, earned: false, outlined: true, undiscovered: true })
    expect(html).not.toContain('<img')
    expect(outlineTag(html)).toContain('data-outline-state')
  })

  it('outlined가 아니면 점선이 없다', () => {
    const html = render({ name: NAME, imageUrl: IMAGE, earned: false })
    expect(html).not.toContain('<svg')
  })
})

describe('BadgeGridCard — 서비스 점선 주소와 합성', () => {
  it('점선이 추적할 주소는 폭 90 이미지가 이미 받는 변환본(w=256, q=75)이다 — 새 변환본을 만들지 않는다', () => {
    const url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/badges/a.png'
    // 주소는 effect에서만 쓰이므로 서버 렌더에는 드러나지 않는다. 변환 규칙 자체는 imageSrc.test.ts가 고정한다 — 여기서는 렌더가 터지지 않는지만 본다
    const html = renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" name={NAME} imageUrl={url} undiscovered />)
    expect(html).toContain('data-outline-state="loading"')
  })

  it('점선 svg는 이미지 칸(relative w-full max-w-[90px]) 안에 있고 이미지 썸네일 래퍼는 없다', () => {
    const html = renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" name={NAME} imageUrl={IMAGE} undiscovered earned={false} />)
    expect(html).not.toMatch(/<div class="w-full aspect-square/)
    expect(html).toMatch(/<div class="relative w-full max-w-\[90px\]"><svg/)
  })

  it('outlined에서 점선 svg는 썸네일 래퍼(grayscale opacity-40)의 형제로 absolute inset-0이다', () => {
    const html = renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" name={NAME} imageUrl={IMAGE} earned={false} outlined />)
    const wrapper = html.match(/<div class="(w-full aspect-square[^"]*)"/)
    expect(wrapper, '썸네일 래퍼를 찾지 못했다').not.toBeNull()
    expect(wrapper![1]).toContain('grayscale')
    expect(wrapper![1]).toContain('opacity-40')
    expect(html).toMatch(/<\/div><svg[^>]*class="absolute inset-0 h-full w-full"/)
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
