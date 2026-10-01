/**
 * 기사 화면 표시 데이터 변환(`toArticleView`) 테스트 (티켓 20261001_1737, 상위 20260930_1453 조각 b3)
 *
 * 순수 함수라 서버 모듈·DB 없이 값만 넣어 확인한다. 문단 나누기 규칙과 CTA 우선순위·라벨은 기사 화면이 `ArticleView`로 나뉘기 전과 같다.
 */
import { describe, it, expect } from 'vitest'
import { d } from '@/lib/i18n'
import { splitParagraphs, toArticleView, type ArticleViewSource } from '../articleView'

function makeRow(overrides: Partial<ArticleViewSource> = {}): ArticleViewSource {
  return {
    title: '가을 한강 러닝 코스 가이드',
    subtitle: '러너가 직접 걸어 본 코스',
    cover_image_url: 'https://cdn.example/cover.png',
    starts_at: '2026-10-05T00:00:00Z',
    body_markdown: '첫 문단이에요.\n\n둘째 문단이에요.',
    target_href: null,
    item_book_id: null,
    mission_id: null,
    ...overrides,
  }
}

describe('toArticleView — 값 옮기기', () => {
  it('제목·칩 라벨(「기사」)·부제·커버·게재일·문단을 표시 데이터로 옮긴다', () => {
    expect(toArticleView(makeRow())).toEqual({
      title: '가을 한강 러닝 코스 가이드',
      label: '기사',
      subtitle: '러너가 직접 걸어 본 코스',
      coverUrl: 'https://cdn.example/cover.png',
      publishedAt: '2026-10-05T00:00:00Z',
      paragraphs: ['첫 문단이에요.', '둘째 문단이에요.'],
    })
  })

  it('칩 라벨은 템플릿 이름 문구를 그대로 쓴다', () => {
    expect(toArticleView(makeRow()).label).toBe(d.todayCard.editorialArticle)
  })

  it.each([[null], [''], ['   ']])('부제가 %j이면 부제가 없다', (subtitle) => {
    expect('subtitle' in toArticleView(makeRow({ subtitle }))).toBe(false)
  })

  it.each([[null], [''], ['   \n ']])('커버 주소가 %j이면 커버가 없다', (cover) => {
    expect('coverUrl' in toArticleView(makeRow({ cover_image_url: cover }))).toBe(false)
  })

  it('커버 주소의 앞뒤 공백은 잘라서 싣는다', () => {
    expect(toArticleView(makeRow({ cover_image_url: '  https://cdn.example/cover.png ' })).coverUrl).toBe('https://cdn.example/cover.png')
  })

  it('게재일은 ISO 그대로 싣는다(KST 표기는 그리는 쪽 몫)', () => {
    expect(toArticleView(makeRow({ starts_at: '2026-10-05T16:30:00Z' })).publishedAt).toBe('2026-10-05T16:30:00Z')
  })

  it('순수 함수다 — 같은 입력은 같은 출력이고 입력 행을 바꾸지 않는다', () => {
    const row = makeRow({ target_href: '/missions/m1' })
    const snapshot = JSON.stringify(row)
    expect(toArticleView(row)).toEqual(toArticleView(row))
    expect(JSON.stringify(row)).toBe(snapshot)
  })

  it('전체 행이 없어도(미리보기 초안) 필요한 칸만으로 만들 수 있다', () => {
    const view = toArticleView({
      title: '초안',
      subtitle: null,
      cover_image_url: null,
      starts_at: '2026-10-05T00:00:00Z',
      body_markdown: null,
      target_href: null,
      item_book_id: null,
      mission_id: null,
    })
    expect(view.title).toBe('초안')
    expect(view.paragraphs).toEqual([])
    expect(view.cta).toBeUndefined()
  })
})

describe('splitParagraphs — 문단 나누기(마크다운 파서 없음)', () => {
  it('빈 줄 기준으로 나누고 앞뒤 공백을 자른다', () => {
    expect(splitParagraphs('  첫째  \n\n  둘째\n\n\n\n셋째  ')).toEqual(['첫째', '둘째', '셋째'])
  })

  it('공백뿐인 줄도 빈 줄로 본다', () => {
    expect(splitParagraphs('첫째\n   \t \n둘째')).toEqual(['첫째', '둘째'])
  })

  it('문단 안의 단일 줄바꿈은 그대로 둔다(그리는 쪽이 whitespace-pre-line으로 보존)', () => {
    expect(splitParagraphs('한 줄\n두 줄\n\n다음 문단')).toEqual(['한 줄\n두 줄', '다음 문단'])
  })

  it('마크다운 문법은 해석하지 않고 글자 그대로 둔다', () => {
    expect(splitParagraphs('# 제목\n\n**굵게** - 목록')).toEqual(['# 제목', '**굵게** - 목록'])
  })

  it.each([[null], [undefined], [''], ['   \n\n  ']])('%j는 빈 배열이다(그리는 쪽이 「본문이 없어요」)', (body) => {
    expect(splitParagraphs(body)).toEqual([])
  })

  it('CRLF 줄바꿈도 빈 줄로 나눈다', () => {
    expect(splitParagraphs('첫째\r\n\r\n둘째')).toEqual(['첫째', '둘째'])
  })
})

describe('toArticleView — CTA (우선순위·라벨은 기사 화면이 나뉘기 전과 같다)', () => {
  it('대상이 하나도 없으면 CTA가 없다(블록 자체를 그리지 않는다)', () => {
    expect('cta' in toArticleView(makeRow())).toBe(false)
  })

  it('target_href가 있으면 직접 링크 「자세히 보기」다', () => {
    expect(toArticleView(makeRow({ target_href: '/missions/m1' })).cta).toEqual({ label: '자세히 보기', href: '/missions/m1' })
  })

  it('target_href는 앞뒤 공백을 잘라 쓴다', () => {
    expect(toArticleView(makeRow({ target_href: '  /badges  ' })).cta?.href).toBe('/badges')
  })

  it('target_href가 공백뿐이면 없는 것으로 보고 다음 우선순위로 간다', () => {
    expect(toArticleView(makeRow({ target_href: '   ', mission_id: 'm1' })).cta).toEqual({ label: '미션 보기', href: '/missions/m1' })
  })

  it('item_book_id가 있으면 컬렉션 「컬렉션 보기」다', () => {
    expect(toArticleView(makeRow({ item_book_id: 'c1' })).cta).toEqual({ label: '컬렉션 보기', href: '/collections/c1' })
  })

  it('mission_id가 있으면 미션 「미션 보기」다', () => {
    expect(toArticleView(makeRow({ mission_id: 'm1' })).cta).toEqual({ label: '미션 보기', href: '/missions/m1' })
  })

  it('우선순위는 target_href → item_book_id → mission_id다', () => {
    const all = { target_href: '/direct', item_book_id: 'c1', mission_id: 'm1' }
    expect(toArticleView(makeRow(all)).cta?.href).toBe('/direct')
    expect(toArticleView(makeRow({ ...all, target_href: null })).cta?.href).toBe('/collections/c1')
    expect(toArticleView(makeRow({ ...all, target_href: null, item_book_id: null })).cta?.href).toBe('/missions/m1')
  })

  it('라벨은 ko.ts의 ctaView* 문구를 그대로 쓴다', () => {
    expect(toArticleView(makeRow({ target_href: '/x' })).cta?.label).toBe(d.todayCard.ctaViewDetails)
    expect(toArticleView(makeRow({ item_book_id: 'c1' })).cta?.label).toBe(d.todayCard.ctaViewCollection)
    expect(toArticleView(makeRow({ mission_id: 'm1' })).cta?.label).toBe(d.todayCard.ctaViewMission)
  })
})

describe('toArticleView — linkless 옵션(링크 없는 미리보기)', () => {
  it('CTA 라벨은 그대로 두고 href만 뺀다', () => {
    const view = toArticleView(makeRow({ mission_id: 'm1' }), { linkless: true })
    expect(view.cta).toEqual({ label: '미션 보기' })
    expect('href' in (view.cta ?? {})).toBe(false)
  })

  it('CTA가 없는 기사는 linkless여도 CTA가 없다(링크 없음과 CTA 없음은 다른 상태)', () => {
    expect('cta' in toArticleView(makeRow(), { linkless: true })).toBe(false)
  })

  it('CTA 밖의 값은 linkless와 상관없이 같다', () => {
    const row = makeRow({ target_href: '/x' })
    expect({ ...toArticleView(row, { linkless: true }), cta: undefined }).toEqual({ ...toArticleView(row), cta: undefined })
  })

  it('옵션을 주지 않으면 href가 있다', () => {
    expect(toArticleView(makeRow({ target_href: '/x' })).cta?.href).toBe('/x')
  })
})
