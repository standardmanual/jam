/**
 * 홈 챕터 게이지 섹션(ChapterGaugeSection) 렌더 (티켓 20261127_1735 C5b)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 마크업을 고정한다(서버 렌더 결과에 값이 들어 있다).
 * 고정하는 것: 값과 접근성 라벨, 마지막 챕터의 빈 필요 잼 줄, 챕터 없음이면 빈 출력, 오류 블록과 «다시 시도»,
 * 막힘이면 카드 아래에 막힘 카드, 카드 루트의 relative와 감싸는 곳의 z-index 없음, «캡슐» 글자 없음.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import ChapterGaugeSection from './ChapterGaugeSection'
import type { MyChapterResult } from '@/lib/chapter/read'

const textOf = (value: string) => value.replace(/<[^>]*>/g, '')

function chapterOf(over: Partial<Extract<MyChapterResult, { ok: true }>> = {}): MyChapterResult {
  return {
    ok: true,
    chapterNo: 3,
    chapterJam: 1234,
    requiredJam: 1260,
    nextChapterNo: 4,
    isLastChapter: false,
    progress: 0.97,
    tribeName: '새벽 러너',
    ...over,
  }
}

describe('ChapterGaugeSection — 카드', () => {
  const html = renderToStaticMarkup(<ChapterGaugeSection chapter={chapterOf()} blocked={null} />)

  it('서버 렌더 결과에 트라이브 이름·CHAPTER·번호·모은 잼·필요 잼이 들어 있다', () => {
    const text = textOf(html)
    expect(text).toContain('새벽 러너')
    expect(text).toContain('CHAPTER')
    expect(text).toContain('3')
    expect(text).toContain('1,234')
    expect(text).toContain('1,260')
  })

  it('접근성 라벨은 챕터 번호·트라이브와 트랙의 잼 수치를 읽어 준다', () => {
    expect(html).toContain('aria-label="챕터 3, 새벽 러너"')
    expect(html).toContain('aria-label="다음 챕터까지 잼 1,234 / 1,260"')
  })

  it('카드 루트에 relative만 있고 z-index가 없으며 막힘 카드는 없다', () => {
    expect(html).toMatch(/<div[^>]*class="[^"]*\brelative\b[^"]*"[^>]*role="group"|<div[^>]*role="group"[^>]*class="[^"]*\brelative\b/)
    expect(html).not.toMatch(/z-index|z-\d|z-\[/)
    expect(html).not.toContain('<section')
    expect(html).not.toContain('<button')
  })

  it('«캡슐» 글자가 화면에 없다', () => {
    expect(html).not.toContain('캡슐')
  })

  it('트라이브 이름이 없으면 라벨은 «챕터 n»만이다', () => {
    const noTribe = renderToStaticMarkup(<ChapterGaugeSection chapter={chapterOf({ tribeName: null })} blocked={null} />)
    expect(noTribe).toContain('aria-label="챕터 3"')
  })

  it('값이 0이어도 카드를 그리고 «0»이 있다', () => {
    const zero = renderToStaticMarkup(<ChapterGaugeSection chapter={chapterOf({ chapterJam: 0 })} blocked={null} />)
    expect(zero).toContain('다음 챕터까지 잼 0 / 1,260')
  })

  it('마지막 챕터는 필요 잼 줄이 비어 있고 트랙 라벨에 필요량이 없다', () => {
    const last = renderToStaticMarkup(
      <ChapterGaugeSection
        chapter={chapterOf({ chapterNo: 10, chapterJam: 5000, requiredJam: null, nextChapterNo: null, isLastChapter: true, progress: null })}
        blocked={null}
      />,
    )
    expect(last).toContain('data-chapter-required="empty"')
    expect(last).toContain('aria-label="잼 5,000"')
    expect(last).not.toContain(' / ')
  })
})

describe('ChapterGaugeSection — 상태', () => {
  it('챕터가 없는 유저(chapterNo null)는 막힘이 있어도 아무것도 그리지 않는다', () => {
    const none = renderToStaticMarkup(
      <ChapterGaugeSection
        chapter={chapterOf({ chapterNo: null, chapterJam: null, requiredJam: null, nextChapterNo: null, progress: null, tribeName: null })}
        blocked={{ pendingItemCount: 2 }}
      />,
    )
    expect(none).toBe('')
  })

  it('조회 실패(null, ok:false)는 카드와 같은 틀의 오류 블록과 «다시 시도» 버튼이다', () => {
    for (const chapter of [null, { ok: false } as MyChapterResult]) {
      const html = renderToStaticMarkup(<ChapterGaugeSection chapter={chapter} blocked={null} />)
      expect(textOf(html)).toContain('챕터를 불러오지 못했어요')
      expect(html).toContain('다시 시도')
      expect(html.match(/<button/g)).toHaveLength(1)
      expect(html).toContain('invisible')
      expect(html).not.toContain('role="group"')
    }
  })

  it('막힘이면 카드 아래에 막힘 카드가 이어 붙는다', () => {
    const html = renderToStaticMarkup(<ChapterGaugeSection chapter={chapterOf()} blocked={{ pendingItemCount: 2 }} />)
    expect(html.indexOf('role="group"')).toBeGreaterThan(-1)
    expect(html.indexOf('<section')).toBeGreaterThan(html.indexOf('role="group"'))
    expect(textOf(html)).toContain('아이템 배지 2개를 받으려면 인벤토리를 비워주세요.')
    expect(html).toContain('인벤토리 가기')
    expect(html).not.toMatch(/z-index|z-\d|z-\[/)
  })

  it('조회 실패 + 막힘이면 오류 블록 아래에도 막힘 카드가 붙는다', () => {
    const html = renderToStaticMarkup(<ChapterGaugeSection chapter={null} blocked={{ pendingItemCount: 0 }} />)
    expect(html.indexOf('<section')).toBeGreaterThan(html.indexOf('다시 시도'))
    expect(textOf(html)).toContain('아이템 배지를 받으려면 인벤토리를 비워주세요.')
  })
})
