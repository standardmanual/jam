/**
 * 칩 줄(`CardChipRow`) 렌더 테스트 (티켓 20261001_1737, 상위 20260930_1453 조각 b3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
 * 줄어드는 순서·한 줄 유지의 계산 스타일은 이 방식으로 볼 수 없어 Story의 `play`가 본다(`HeroCard.stories.tsx`).
 * `BriefCard.test.tsx`의 칩 줄 단언이 brief 출력 동일을 따로 지킨다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CardChipRow, { type CardChipRowOn, type CardChipRowView } from '../CardChipRow'
import { PinIcon } from '@/components/ui/icons'

const view = (overrides: Partial<CardChipRowView> = {}): CardChipRowView => ({
  resource: 'mission',
  label: '미션',
  ...overrides,
})

const render = (overrides: Partial<CardChipRowView> = {}, className?: string, on?: CardChipRowOn) =>
  renderToStaticMarkup(<CardChipRow view={view(overrides)} className={className} on={on} />)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CardChipRow — 줄', () => {
  it('한 줄 가로 배치이고 줄바꿈하지 않는다(flex-wrap 없음)', () => {
    const html = render()
    expect(html).toMatch(/^<div class="flex items-center gap-\[var\(--spacing-8\)\]">/)
    expect(html).not.toContain('flex-wrap')
  })

  it('className은 줄 클래스 뒤에 붙는다(간격은 호출부 몫)', () => {
    expect(render({}, 'mb-[var(--spacing-8)]')).toMatch(
      /^<div class="flex items-center gap-\[var\(--spacing-8\)\] mb-\[var\(--spacing-8\)\]">/,
    )
  })

  it('className을 안 주면 클래스 끝에 공백이 남지 않는다', () => {
    expect(render()).not.toContain('gap-[var(--spacing-8)] "')
  })

  it('왼쪽부터 라벨 → 지역 핀 → 희귀도 → 게재일 순서다', () => {
    const html = render({
      resource: 'badge',
      label: '배지 소개',
      regionLabel: '성수동',
      rarity: 'epic',
      publishedAt: '2026-10-05T03:00:00.000Z',
    })
    const order = ['배지 소개</span>', '성수동', 'Epic', '10월 5일'].map((needle) => html.indexOf(needle))
    for (const index of order) expect(index).toBeGreaterThan(-1)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('라벨 칩은 줄어들지 않는다(shrink-0)', () => {
    expect(render()).toMatch(/<span class="shrink-0" style="[^"]*padding:6px 10px[^"]*">미션<\/span>/)
  })

  it('라벨이 없으면 라벨 칩을 그리지 않는다', () => {
    expect(render({ label: undefined })).not.toContain('padding:6px 10px')
  })

  it('그릴 것이 하나도 없으면 줄 자체를 그리지 않는다 — 호출부가 준 아래 마진만 남지 않는다(처음 보는 템플릿 값의 카드, 티켓 20261006_1217)', () => {
    expect(render({ label: undefined }, 'mb-[var(--spacing-8)]')).toBe('')
    expect(render({ label: '' }, 'mb-[var(--spacing-8)]')).toBe('')
    // 드랍은 지역 핀을 그리지 않으므로 라벨도 없으면 비어 있다
    expect(render({ resource: 'drop', label: undefined, regionLabel: '한강공원' })).toBe('')
  })

  it('라벨이 없어도 지역 핀·희귀도·게재일 중 하나라도 있으면 줄은 그려진다', () => {
    expect(render({ label: undefined, regionLabel: '성수동' })).toContain('성수동')
    expect(render({ label: undefined, resource: 'badge', rarity: 'epic' })).toContain('Epic')
    expect(render({ label: undefined, resource: 'article', publishedAt: '2026-10-05T03:00:00.000Z' })).toContain('10월 5일')
  })
})

describe('CardChipRow — 지역 핀', () => {
  it('핀은 줄어드는 유일한 항목이다 — min-w-0이고 글자만 말줄임, 12px 아이콘은 shrink-0', () => {
    const html = render({ regionLabel: '성수동 서울숲 근처' })
    expect(html).toContain(
      '<span class="inline-flex items-center gap-1 min-w-0 text-[length:var(--text-caption)] text-text-inverse/60">',
    )
    expect(html).toContain('<span class="truncate">성수동 서울숲 근처</span>')
    expect(html).toContain(renderToStaticMarkup(<PinIcon className="w-3 h-3 shrink-0" />))
  })

  it('지역 값이 없으면 핀을 그리지 않는다', () => {
    expect(render({ regionLabel: undefined })).not.toContain('truncate')
  })

  it('드랍은 지역 값이 있어도 핀을 그리지 않는다(필수 정보 「지역 ○○」 줄이 같은 값을 낸다)', () => {
    const html = render({ resource: 'drop', label: '드랍', regionLabel: '한강공원' })
    expect(html).not.toContain('truncate')
    expect(html).not.toContain('한강공원')
  })

  it('드랍이 아니면 어떤 자원이든 지역 값이 있을 때 핀을 그린다', () => {
    for (const resource of ['mission', 'badge', 'article', 'auto', 'collection'] as const) {
      expect(render({ resource, regionLabel: '성수동' })).toContain('<span class="truncate">성수동</span>')
    }
  })
})

describe('CardChipRow — 희귀도 칩', () => {
  it.each([['rare', 'Rare'], ['epic', 'Epic'], ['mystic', 'Mystic']])('%s는 %s 칩이고 줄어들지 않는다', (rarity, text) => {
    expect(render({ resource: 'badge', rarity })).toMatch(
      new RegExp(`<span class="shrink-0" style="[^"]*font-size:var\\(--text-micro\\)[^"]*">${text}</span>`),
    )
  })

  it.each([['common'], [null], [undefined]])('Common·등급 없음(%s)은 칩이 없다', (rarity) => {
    const html = render({ resource: 'badge', rarity })
    expect(html).not.toContain('Common')
    expect(html).not.toContain('--text-micro')
  })

  it('알 수 없는 값도 칩을 그리지 않는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(render({ resource: 'badge', rarity: 'legendary' })).not.toContain('--text-micro')
  })
})

describe('CardChipRow — 게재일', () => {
  it('「10월 5일」(KST, 연도 없음)로 줄 끝에 그린다 — ml-auto·shrink-0·줄바꿈 없음·caption·/60', () => {
    const html = render({ resource: 'article', label: '기사', publishedAt: '2026-10-05T03:00:00.000Z' })
    expect(html).toContain(
      '<time dateTime="2026-10-05T03:00:00.000Z" class="ml-auto shrink-0 whitespace-nowrap text-[length:var(--text-caption)] text-text-inverse/60">10월 5일</time>',
    )
    expect(html).not.toContain('2026년')
  })

  it('날짜는 KST 기준이다(UTC 자정 직전은 KST로 다음 날)', () => {
    expect(render({ publishedAt: '2026-10-05T16:30:00.000Z' })).toContain('>10월 6일</time>')
    expect(render({ publishedAt: '2026-10-05T14:59:00.000Z' })).toContain('>10월 5일</time>')
  })

  it('값이 없으면 그리지 않는다', () => {
    expect(render({ publishedAt: undefined })).not.toContain('<time')
  })

  it('읽을 수 없는 값이면 그리지 않는다', () => {
    expect(render({ publishedAt: '날짜 아님' })).not.toContain('<time')
  })

  it('칩처럼 필로 만들지 않는다(배경·패딩 없음)', () => {
    const html = render({ publishedAt: '2026-10-05T03:00:00.000Z' })
    const time = html.slice(html.indexOf('<time'), html.indexOf('</time>'))
    expect(time).not.toContain('style=')
    expect(time).not.toMatch(/\bbg-|\bpx-|\bpy-|rounded/)
  })
})

describe('CardChipRow — 옅은 글자', () => {
  it('옅은 글자는 /60 한 단계뿐이다(/30·/40·/50 없음)', () => {
    const html = render({
      resource: 'badge',
      regionLabel: '성수동',
      rarity: 'rare',
      publishedAt: '2026-10-05T03:00:00.000Z',
    })
    expect(html).toContain('text-text-inverse/60')
    for (const level of ['/30', '/40', '/50', '/70']) expect(html).not.toContain(`text-text-inverse${level}`)
  })
})

describe('CardChipRow — 막 위(on="scrim", 티켓 20261001_2013 b4)', () => {
  const FULL = {
    resource: 'badge',
    label: '배지 소개',
    regionLabel: '성수동',
    rarity: 'epic',
    publishedAt: '2026-10-05T03:00:00.000Z',
  } as const

  it('on을 주지 않거나 white면 변경 전과 글자 단위로 같다(라벨 칩 기본 색조, 옅은 글자 /60)', () => {
    const base = render(FULL)
    expect(render(FULL, undefined, 'white')).toBe(base)
    expect(base).toContain('background:var(--color-surface);color:var(--color-text)')
    expect(base).not.toContain('text-white')
  })

  it('라벨 칩이 surface-inverse 색조(흰 알약·어두운 글자)다 — 기본 색조(짙은 알약)는 검정 막 위에서 묻힌다', () => {
    const html = render(FULL, undefined, 'scrim')
    expect(html).toMatch(/<span class="shrink-0" style="[^"]*background:var\(--color-surface-inverse\);color:var\(--color-text-inverse\)[^"]*">배지 소개<\/span>/)
    expect(html).not.toContain('background:var(--color-surface);')
  })

  it('지역 핀·게재일 글자는 text-white이고 옅은 단계(/60)가 없다', () => {
    const html = render(FULL, undefined, 'scrim')
    expect(html).toContain(
      '<span class="inline-flex items-center gap-1 min-w-0 text-[length:var(--text-caption)] text-white">',
    )
    expect(html).toContain(
      'class="ml-auto shrink-0 whitespace-nowrap text-[length:var(--text-caption)] text-white">10월 5일</time>',
    )
    expect(html).not.toContain('text-text-inverse')
    expect(html).not.toContain('/60')
  })

  it('줄바꿈 금지·핀만 줄어듦·희귀도 칩은 바탕과 상관없이 같다', () => {
    const html = render(FULL, undefined, 'scrim')
    expect(html).toMatch(/^<div class="flex items-center gap-\[var\(--spacing-8\)\]">/)
    expect(html).not.toContain('flex-wrap')
    expect(html).toContain('<span class="truncate">성수동</span>')
    expect(html).toMatch(/<span class="shrink-0" style="[^"]*font-size:var\(--text-micro\)[^"]*">Epic<\/span>/)
    expect(html).toContain(renderToStaticMarkup(<PinIcon className="w-3 h-3 shrink-0" />))
  })

  it('드랍은 막 위에서도 핀을 그리지 않는다(규칙은 이 파일 한 곳)', () => {
    const html = render({ resource: 'drop', label: '드랍', regionLabel: '한강공원' }, undefined, 'scrim')
    expect(html).not.toContain('truncate')
    expect(html).not.toContain('한강공원')
  })

  it('왼쪽부터 라벨 → 지역 핀 → 희귀도 → 게재일 순서는 바탕과 상관없이 같다', () => {
    const html = render(FULL, undefined, 'scrim')
    const order = ['배지 소개</span>', '성수동', 'Epic', '10월 5일'].map((needle) => html.indexOf(needle))
    for (const index of order) expect(index).toBeGreaterThan(-1)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
