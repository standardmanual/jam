/**
 * 챕터 게이지 카드 마크업 (티켓 20261127_1733)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 구조를 확인한다. 서버 렌더에서는 효과가 돌지 않아
 * 트랙 폭을 모르는 첫 그리기 모양이다. 상태가 움직이는 부분은 `ChapterGaugeCard.entry.test.tsx`가 맡는다.
 *
 * 고정하는 것
 *  - 접근성: 카드 role="group", 트랙 role="img"(라벨은 호출부가 넘긴 것), 칩·워드마크 aria-hidden.
 *  - 값 0: 채움을 그리지 않고(칩 둘레 오렌지 실선 방지) 칩은 있다.
 *  - 필요 잼 숫자: 카드 아래 줄은 없고 트랙 안에 aria-hidden 숫자로 있다. 챕터 10(필요량 null)은 숫자도 자리도 없고 «마지막» 류 문구가 없다.
 *  - 천 단위 쉼표, 영문 라벨은 넘긴 값 그대로.
 *  - 긴 이름·큰 챕터 번호가 넘치지 않는 클래스(min-w-0·wrap-anywhere / shrink-0).
 *  - 로딩·오류 자리는 같은 틀을 보이지 않게 깔아 높이를 지킨다.
 *  - 정본 소스(컴포넌트·스토리)와 새 토큰에 리터럴 색이 없다.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ChapterGaugeCard, { ChapterGaugeCardError, ChapterGaugeCardSkeleton } from '../ChapterGaugeCard'

const base = {
  tribeName: '야간 러너' as string | null,
  chapterNo: 12,
  chapterLabel: 'CHAPTER',
  filled: 1500,
  required: 2344 as number | null,
  ariaLabel: '챕터 12, 야간 러너',
  trackAriaLabel: '다음 챕터까지 잼 모은양 / 필요양',
}
const html = (over: Partial<typeof base> = {}) => renderToStaticMarkup(<ChapterGaugeCard {...base} {...over} />)

describe('접근성', () => {
  it('카드는 group, 트랙은 img이고 라벨은 넘긴 문구다', () => {
    const h = html()
    expect(h).toContain('role="group"')
    expect(h).toContain(`aria-label="${base.ariaLabel}"`)
    expect(h).toContain('role="img"')
    expect(h).toContain(`aria-label="${base.trackAriaLabel}"`)
  })
  it('칩과 워드마크는 aria-hidden이다', () => {
    const h = html()
    expect(h).toMatch(/<span aria-hidden="true" data-chapter-chip=""/)
    expect(h).toMatch(/<svg aria-hidden="true"/)
  })
  it('눌리는 요소가 없다', () => {
    const h = html()
    expect(h).not.toContain('<button')
    expect(h).not.toContain('jam-press')
  })
})

describe('채움', () => {
  it('값이 0이면 채움을 그리지 않고 칩은 있다', () => {
    const h = html({ filled: 0 })
    expect(h).not.toContain('data-chapter-fill')
    expect(h).toContain('data-chapter-chip')
  })
  it('값이 있으면 채움을 그린다. 시작 길이는 칩(44px)보다 트랙 안쪽 여백(2px)만큼 들어가 있다', () => {
    const h = html()
    expect(h).toContain('data-chapter-fill')
    expect(h).toContain('width:42px')
  })
  it('채움 면은 오렌지 토큰, 트랙·칩 면은 트랙 토큰이다', () => {
    const h = html()
    expect(h).toContain('background:var(--capsule-fill)')
    expect(h).toContain('background:var(--capsule-track)')
  })
})

describe('숫자와 문구', () => {
  it('필요 잼에 천 단위 쉼표가 들어가고 영문 라벨은 넘긴 값 그대로다', () => {
    const h = html({ required: 2344, chapterLabel: 'CHAPTER' })
    expect(h).toContain('>2,344<')
    expect(h).toContain('>CHAPTER<')
  })
  it('챕터 번호는 있는 그대로 그린다(9999도)', () => {
    expect(html({ chapterNo: 9999 })).toContain('>9999<')
  })
  it('필요 잼 숫자는 트랙 안 오른쪽 끝의 aria-hidden 오렌지 글자이고 카드 아래 줄은 없다', () => {
    const h = html()
    const el = h.match(/<span[^>]*data-chapter-required="value"[^>]*>/)?.[0] ?? ''
    expect(el).toContain('aria-hidden="true"')
    expect(el).toContain('right-0')
    expect(el).toContain('text-base')
    expect(el).toContain('color:var(--capsule-fill)')
    expect(h).not.toMatch(/<div[^>]*data-chapter-required/)
    // 트랙(role="img") 안에 있다
    expect(h.indexOf('role="img"')).toBeLessThan(h.indexOf('data-chapter-required="value"'))
    expect(h.indexOf('data-chapter-required="value"')).toBeLessThan(h.lastIndexOf('</div>'))
  })
  it('챕터 10(필요량 없음): 필요 잼 숫자도 자리도 없고 문구가 없다', () => {
    const last = html({ required: null, chapterNo: 10 })
    expect(last).not.toContain('data-chapter-required')
    for (const word of ['마지막', 'MAX', '만렙', 'Max']) expect(last).not.toContain(word)
  })
  it('트랙 폭을 재기 전(서버 렌더)에는 어두운 복사본을 그리지 않는다', () => {
    expect(html()).not.toContain('data-chapter-required-clip')
  })
  it('챕터 10도 채움은 가득이다', () => {
    const h = html({ required: null, chapterNo: 10, filled: 1200 })
    expect(h).toContain('data-chapter-fill')
  })
})

describe('넘침 방지', () => {
  it('이름은 줄어들 수 있고(min-w-0) 어디서든 줄바꿈하며, 챕터 블록은 줄지 않는다', () => {
    const h = html({ tribeName: '도시의 새벽을 달리는 야간 러너 모임', chapterNo: 9999 })
    expect(h).toMatch(/<p class="[^"]*min-w-0[^"]*wrap-anywhere[^"]*"/)
    expect(h).toContain('flex shrink-0 flex-col items-center')
  })
  it('윗줄은 아래 정렬·양끝 정렬이다', () => {
    expect(html()).toContain('flex items-end justify-between')
  })
  it('이름이 없어도 이름 자리는 남는다', () => {
    expect(html({ tribeName: null })).toMatch(/<p class="[^"]*min-w-0[^"]*"><\/p>/)
  })
  it('글자 크기와 굵기는 눈금 클래스다', () => {
    const h = html()
    for (const c of ['text-4xl', 'text-xl', 'text-base', 'text-xs', 'font-extrabold', 'tabular-nums']) expect(h).toContain(c)
  })
})

describe('로딩·오류 자리', () => {
  it('로딩은 같은 틀을 보이지 않게 깔고 그 위를 Skeleton이 덮는다', () => {
    const h = renderToStaticMarkup(<ChapterGaugeCardSkeleton />)
    expect(h).toContain('class="invisible"')
    expect(h).not.toContain('data-chapter-required')
    expect(h).toContain('border-radius:var(--radius-2xl)')
  })
  it('오류는 같은 틀 높이 안에 안내 블록을 둔다', () => {
    const h = renderToStaticMarkup(<ChapterGaugeCardError>불러오지 못했어요</ChapterGaugeCardError>)
    expect(h).toContain('class="invisible"')
    expect(h).toContain('role="status"')
    expect(h).toContain('불러오지 못했어요')
  })
})

describe('DS 값', () => {
  const root = join(__dirname, '..', '..', '..', '..')
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/

  it('컴포넌트·스토리·수치 파일에 리터럴 색이 없다', () => {
    for (const f of ['ChapterGaugeCard.tsx', 'ChapterGaugeCard.stories.tsx', 'chapterGaugeCardMath.ts']) {
      expect(read(`src/components/ui/${f}`), f).not.toMatch(LITERAL)
    }
  })
  it('카드 면 토큰은 기존 눈금 두 색의 세로 그라디언트다', () => {
    const css = read('design-system/tokens/component.css')
    expect(css).toContain('--chapter-card-bg: linear-gradient(180deg, var(--base-neutral-600) 0%, var(--base-neutral-800) 100%);')
    expect(read('src/components/ui/ChapterGaugeCard.tsx')).toContain("background: 'var(--chapter-card-bg)'")
  })
  it('옛 캡슐 코드를 가져오지 않는다', () => {
    expect(read('src/components/ui/ChapterGaugeCard.tsx')).not.toContain('@/lib/capsule')
    expect(read('src/components/ui/ChapterGaugeCard.tsx')).not.toContain('components/capsule')
  })
})
