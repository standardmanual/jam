/**
 * 기사 화면 본문(`ArticleView`) 렌더 테스트 (티켓 20261001_1737, 상위 20260930_1453 조각 b3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
 * TopNav는 페이지가 그린다(이 컴포넌트 밖). 커버 로드 실패는 `onError`가 브라우저에서만 일어나 `ArticleView.stories.tsx`의 `play`가 본다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ArticleView from '../ArticleView'
import type { ArticleView as ArticleViewData } from '@/lib/today/articleView'

function makeView(overrides: Partial<ArticleViewData> = {}): ArticleViewData {
  return {
    title: '가을 한강 러닝 코스 가이드',
    label: '기사',
    subtitle: '러너가 직접 걸어 본 코스',
    coverUrl: 'https://cdn.example/cover.png',
    publishedAt: '2026-10-05T03:00:00.000Z',
    paragraphs: ['첫 문단이에요.', '둘째 문단이에요.'],
    cta: { label: '미션 보기', href: '/missions/m1' },
    ...overrides,
  }
}

const render = (overrides: Partial<ArticleViewData> = {}) => renderToStaticMarkup(<ArticleView view={makeView(overrides)} />)

/** 키를 `undefined`로 덮는 대신 아예 뺀다(「값 없음」과 「키 없음」을 같게 다룬다) */
function without(...keys: (keyof ArticleViewData)[]): ArticleViewData {
  const view = makeView()
  for (const key of keys) delete view[key]
  return view
}

describe('ArticleView — 커버', () => {
  it('커버가 있으면 TopNav 바로 아래 16:9 칸에 object-cover로 그린다', () => {
    const html = render()
    expect(html).toContain('<div class="relative w-full aspect-video overflow-hidden">')
    expect(html).toContain('src="https://cdn.example/cover.png"')
    expect(html).toContain('object-cover')
    // 옛 16:10 칸이 아니다
    expect(html).not.toContain('aspect-[16/10]')
    // 커버가 본문(article)보다 앞이다
    expect(html.indexOf('aspect-video')).toBeLessThan(html.indexOf('<article'))
  })

  it('커버는 우선 로드한다(priority → eager·fetchPriority high)', () => {
    const html = render()
    expect(html).toContain('loading="eager"')
    expect(html).toContain('fetchPriority="high"')
  })

  it('커버 alt는 빈 값이다 — 바로 아래 제목(h1)이 글자로 보이므로 이중으로 읽히지 않게 한다', () => {
    const html = render()
    expect(html).toMatch(/<img[^>]*alt=""/)
    expect(html).not.toContain('alt="가을 한강 러닝 코스 가이드"')
  })

  it('커버가 없으면 16:9 칸을 만들지 않고 본문부터 시작한다', () => {
    const html = renderToStaticMarkup(<ArticleView view={without('coverUrl')} />)
    expect(html).not.toContain('aspect-video')
    expect(html).not.toContain('<img')
    expect(html).toContain('<article class="px-4 pt-6">')
  })
})

describe('ArticleView — 머리 영역', () => {
  it('「← 오늘로」 링크가 없다(TopNav의 뒤로가기가 대신한다)', () => {
    const html = render()
    expect(html).not.toContain('←')
    expect(html).not.toContain('&larr;')
    expect(html).not.toContain('투데이로')
    expect(html).not.toContain('underline')
  })

  it('칩·제목·부제·게재일·문단·CTA 순서다', () => {
    const html = render()
    const order = ['>기사</span>', '<h1', '러너가 직접 걸어 본 코스', '2026년 10월 5일', '첫 문단이에요.', '둘째 문단이에요.', '미션 보기'].map((needle) =>
      html.indexOf(needle),
    )
    for (const index of order) expect(index).toBeGreaterThan(-1)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('칩은 MODULAR LabelChip 반전 색조(검정 바탕 위 흰 칩)이고 flex 칸으로 한 번 감쌌다', () => {
    const html = render()
    expect(html).toMatch(/<div class="flex"><span class="" style="[^"]*background:var\(--background-inverse\);color:var\(--snow\)[^"]*">기사<\/span><\/div>/)
    // LabelChip 규격(padding 6px 10px·lineHeight 1) — 옛 직접 마크업(bg-background-inverse 클래스)이 아니다
    expect(html).toContain('padding:6px 10px')
    expect(html).not.toContain('bg-background-inverse')
  })

  it('제목은 h1이고 말줄임 없이 줄바꿈된다(line-clamp·truncate 없음)', () => {
    const html = render({ title: '아주 아주 긴 제목이라서 두 줄이든 세 줄이든 끝까지 보여야 하는 기사 제목입니다 마지막 글자까지' })
    expect(html).toMatch(/<h1 class="text-3xl mt-4">아주/)
    expect(html).not.toContain('line-clamp')
    expect(html).not.toContain('truncate')
  })

  it('부제는 16px·text-muted이고 제목 아래 8px이다', () => {
    expect(render()).toContain(
      '<p class="text-base text-muted mt-2">러너가 직접 걸어 본 코스</p>',
    )
  })

  it('부제가 없으면 그리지 않는다', () => {
    expect(renderToStaticMarkup(<ArticleView view={without('subtitle')} />)).not.toContain('mt-2')
  })

  it('게재일은 「2026년 10월 5일」(연도 유지)이고 12px·text-muted다 — 불투명도 글자가 아니다', () => {
    const html = render()
    expect(html).toContain('<p class="text-xs text-muted mt-4">2026년 10월 5일</p>')
  })

  it('게재일이 없으면 그리지 않는다', () => {
    const html = renderToStaticMarkup(<ArticleView view={without('publishedAt')} />)
    // 라벨 칩의 인라인 style(font-size:var(--text-xs))이 아니라 게재일 문단의 클래스를 본다
    expect(html).not.toMatch(/class="[^"]*\btext-xs\b/)
  })
})

describe('ArticleView — 본문', () => {
  it('문단마다 <p>이고 16px·text-foreground이며 문단 안 줄바꿈을 보존한다(whitespace-pre-line)', () => {
    const html = render({ paragraphs: ['한 줄\n두 줄', '다음 문단'] })
    expect(html).toContain(
      '<p class="text-base text-foreground whitespace-pre-line">한 줄\n두 줄</p>',
    )
    expect(html).toContain('>다음 문단</p>')
  })

  it('문단 위 간격 24px, 문단 사이 간격 16px이다', () => {
    expect(render()).toContain('<div class="mt-6 flex flex-col gap-4">')
  })

  it('마크다운은 렌더하지 않는다 — 문법이 글자 그대로 나온다', () => {
    const html = render({ paragraphs: ['**굵게** # 제목'] })
    expect(html).toContain('**굵게** # 제목')
    expect(html).not.toContain('<strong')
  })

  it('본문이 없으면 「본문이 없어요」를 text-muted로 보인다 — 불투명도 글자가 아니다', () => {
    const html = render({ paragraphs: [] })
    expect(html).toContain('<p class="text-muted">본문이 없어요</p>')
    expect(html).not.toContain('whitespace-pre-line')
  })

  it('옅은 글자에 /40이 없다', () => {
    for (const html of [render(), render({ paragraphs: [] })]) {
      expect(html).not.toContain('/40')
      expect(html).not.toContain('/50')
    }
  })
})

describe('ArticleView — CTA', () => {
  it('href가 있으면 링크 필이다 — 풀폭 min-h-11·눌림(active:scale-95) 유지', () => {
    const html = render()
    expect(html).toMatch(/<a class="[^"]*" style="[^"]*" href="\/missions\/m1">/)
    expect(html).toContain(
      'class="inline-flex items-center justify-center gap-2 min-h-11 w-full font-normal transition-transform duration-100 active:scale-95 rounded-full px-8 py-[14px] text-base text-snow"',
    )
    expect(html).toContain('background-color:var(--background-inverse)')
    expect(html).toContain('>미션 보기</a>')
  })

  it('CTA 위 간격은 24px이다', () => {
    expect(render()).toContain('<div class="mt-6"><a ')
  })

  it('href가 없으면 같은 모양의 정적 필이다 — 링크도 눌림·transition도 없다', () => {
    const html = render({ cta: { label: '미션 보기' } })
    expect(html).not.toMatch(/<a[ >]/)
    expect(html).not.toContain('active:scale-95')
    expect(html).not.toContain('transition-transform')
    expect(html).toContain(
      '<div class="inline-flex items-center justify-center gap-2 min-h-11 w-full font-normal rounded-full px-8 py-[14px] text-base text-snow"',
    )
    expect(html).toContain('>미션 보기</div>')
  })

  it('정적 필은 링크 필과 눌림 클래스만 다르다(같은 모양)', () => {
    const link = render().match(/<a [^>]*class="([^"]*)"/)![1]
    const fixed = render({ cta: { label: '미션 보기' } }).match(/<div class="(inline-flex[^"]*)"/)![1]
    expect(link.replace('transition-transform duration-100 active:scale-95 ', '')).toBe(fixed)
  })

  it('cta가 없으면 블록이 없다(링크 없음과는 다른 상태)', () => {
    const html = renderToStaticMarkup(<ArticleView view={without('cta')} />)
    expect(html).not.toContain('min-h-11')
    expect(html).not.toContain('mt-6"><')
  })
})

describe('ArticleView — 바깥 틀', () => {
  it('아래 여백 40px을 루트가 가진다(미리보기에서도 같은 여백)', () => {
    // 커버가 있으면 우선 로드 <link>가 앞에 붙으므로 루트 div를 찾아 본다
    expect(render()).toContain('<div class="text-foreground pb-10"><div class="relative w-full aspect-video')
    expect(renderToStaticMarkup(<ArticleView view={without('coverUrl')} />)).toMatch(/^<div class="text-foreground pb-10">/)
  })

  it('본문 안쪽 여백은 좌우 16px·위 24px이다', () => {
    expect(render()).toContain('<article class="px-4 pt-6">')
  })

  it('표시 데이터만 받는다 — 카드 행·getPublishedArticleCard·DB 모듈을 import하지 않는다', () => {
    const source = readFileSync(resolve(__dirname, '../ArticleView.tsx'), 'utf8')
    const imports = source.match(/^import .*$/gm) ?? []
    for (const line of imports) {
      expect(line).not.toMatch(/lib\/today\/cards|supabase|types\/database|targetHref|getPublishedArticleCard/)
    }
  })
})
