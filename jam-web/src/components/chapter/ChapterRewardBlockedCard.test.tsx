/**
 * 챕터 게이지 아래 막힘 안내 카드(ChapterRewardBlockedCard) 렌더 (티켓 20261127_1735 C5b)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 마크업만 고정한다. 고정하는 것: 두 줄 안내 + «인벤토리 가기» 버튼 하나, 윗모서리 각짐과 위로 겹침(`-mt-4`),
 * 겹친 만큼 늘린 윗 여백, 제목·아이콘·«캡슐» 글자가 없다, 반전 면, 줄바꿈 클래스, 그라디언트·그림자·고정 위치·z-index·애니메이션이 없다.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import ChapterRewardBlockedCard from './ChapterRewardBlockedCard'
import { d } from '@/lib/i18n'

const html = renderToStaticMarkup(<ChapterRewardBlockedCard pendingItemCount={2} />)
const textOf = (value: string) => value.replace(/<[^>]*>/g, '')

describe('ChapterRewardBlockedCard', () => {
  it('문구는 d.chapterGauge.blocked에 있고 옛 d.capsule.blockedBanner는 없다', () => {
    expect(Object.keys(d.chapterGauge.blocked)).toEqual(['line1', 'line2', 'line2NoCount', 'cta'])
    expect('blockedBanner' in d.capsule).toBe(false)
  })

  it('두 줄 안내와 «인벤토리 가기» 버튼 하나가 보인다', () => {
    expect(textOf(html)).toContain('인벤토리가 가득 찼어요.')
    expect(textOf(html)).toContain('아이템 배지 2개를 받으려면 인벤토리를 비워주세요.')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('>인벤토리 가기</button>')
  })

  it('pendingItemCount가 0 이하이면 숫자 없는 문장이다', () => {
    for (const count of [0, -1]) {
      const text = textOf(renderToStaticMarkup(<ChapterRewardBlockedCard pendingItemCount={count} />))
      expect(text).toContain('아이템 배지를 받으려면 인벤토리를 비워주세요.')
      expect(text).not.toMatch(/\d|\{count\}/)
    }
  })

  it('윗모서리가 각지고 카드 모서리 반지름(16px)만큼 위로 겹치며, 윗 여백이 그만큼 늘어난다', () => {
    expect(html).toContain('border-top-left-radius:0')
    expect(html).toContain('border-top-right-radius:0')
    expect(html).toMatch(/class="-mt-4 /)
    // 겹침 16px + 안내까지 간격 7px
    expect(html).toContain('padding-top:23px')
  })

  it('반전 면이고 안내는 왼쪽 정렬·snow 글자이며 줄바꿈 클래스가 있고 text-balance는 없다', () => {
    expect(html).toContain('var(--background-inverse)')
    expect(html).toContain('text-left')
    const note = html.match(/<p [^>]*>/)?.[0] ?? ''
    expect(note).toContain('text-snow')
    for (const cls of ['break-keep', 'wrap-break-word', 'min-w-0', 'flex-1']) expect(note).toContain(cls)
    expect(html).not.toContain('text-balance')
  })

  it('버튼은 소형 secondary이고 줄바꿈 없이 오른쪽에 유지된다', () => {
    const button = html.match(/<button[^>]*>/)?.[0] ?? ''
    expect(button).toContain('bg-btn-secondary')
    expect(button).toContain('whitespace-nowrap')
    expect(button).toContain('shrink-0')
    expect(html).toContain('flex-row')
  })

  it('제목·아이콘·«캡슐» 글자·그라디언트·그림자·고정 위치·z-index·애니메이션이 없다', () => {
    expect(html).not.toMatch(/<h\d|<svg/)
    expect(textOf(html)).not.toContain('캡슐')
    expect(html).not.toMatch(/gradient|shadow|backdrop|fixed|sticky|z-index|z-\d|z-\[|animate-/)
    // 카드 면 자체에는 전환도 없다(버튼의 눌림 전환은 기존 Button 상태다)
    const card = html.match(/<section[^>]*><div [^>]*>/)?.[0] ?? ''
    expect(card).not.toContain('transition')
  })

  it('section의 aria-labelledby가 안내 문단 id를 가리킨다', () => {
    const labelledby = html.match(/<section aria-labelledby="([^"]+)"/)?.[1]
    expect(labelledby).toBeTruthy()
    expect(html).toContain(`<p id="${labelledby}"`)
  })
})
