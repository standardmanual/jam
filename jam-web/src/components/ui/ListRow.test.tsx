/**
 * ListRow 서비스 사본 (티켓 20261106_2252, 상위 20261106_1750 4단계 1배치)
 *
 * 저장소에 jsdom이 없어 서버 렌더 마크업으로 고정한다. 원본(`design-system/components/patterns/ListRow.jsx`)과 기하가 같은지는
 * `npm run ds:check`(PAIR_GEOMETRY)가 대조하고, 여기서는 사본이 지켜야 할 동작만 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/ListRow.test.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ListRow, ListRowChip, ListRowEm, LIST_ROW_STATIC_CSS } from './ListRow'

const render = (node: React.ReactElement) => renderToStaticMarkup(node)

describe('ListRow 슬롯 배치', () => {
  it('lead · 본문(eyebrow → title → meta → chips) 순서이고 시간은 eyebrow 줄 오른쪽 끝이다', () => {
    const html = render(
      <ListRow lead="L" eyebrow="라벨" time="1시간 전" title="제목" meta="부제" chips={<ListRowChip>칩</ListRowChip>} />
    )

    const order = ['>L<', '>라벨<', '>1시간 전<', '>제목<', '>부제<', '>칩<'].map((k) => html.indexOf(k))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(order.every((i) => i >= 0)).toBe(true)
    // eyebrow와 시간이 같은 space-between 줄 안에 있다
    expect(html).toMatch(/justify-content:space-between[^>]*>.*>라벨<\/span><span style="flex-shrink:0;white-space:nowrap[^"]*">1시간 전<\/span>/)
  })

  it('eyebrow가 없으면 시간이 제목 줄 오른쪽으로 간다', () => {
    const html = render(<ListRow lead="L" time="1시간 전" title="제목" />)

    expect(html).not.toContain('justify-content:space-between')
    expect(html).toMatch(/>제목<\/span><span style="flex-shrink:0;white-space:nowrap[^"]*">1시간 전<\/span>/)
  })

  it('eyebrow가 문자열이면 한 덩어리 문장(2줄 말줄임)이고 ReactNode면 칩 줄(flex-wrap)이다', () => {
    const text = render(<ListRow eyebrow="3번째 체크인 했어요" title="제목" />)
    const nodes = render(<ListRow eyebrow={<span>a</span>} title="제목" />)

    expect(text).toContain('-webkit-line-clamp:2')
    expect(text).not.toContain('flex-wrap:wrap')
    expect(nodes).toContain('flex-wrap:wrap')
  })

  it('title·meta·chips가 비면(undefined) 줄도 여백도 그리지 않는다', () => {
    const html = render(<ListRow lead="L" eyebrow="라벨" />)

    expect(html).not.toContain('font-weight:700')
    expect(html).not.toContain('font-size:var(--text-sm)')
    expect(html).not.toContain('margin-top:var(--spacing-4)')
    expect(html).not.toContain('margin-top:var(--list-row-line-gap)')
  })

  it('leadBadge는 lead 우하단의 검정 필(--foreground 면, --snow 글자)이다', () => {
    const html = render(<ListRow lead="L" leadBadge="×3" title="제목" />)

    expect(html).toMatch(/position:absolute;right:var\(--list-row-lead-badge-offset\);bottom:var\(--list-row-lead-badge-offset\)[^>]*background:var\(--foreground\);color:var\(--snow\)[^>]*>×3<\/span>/)
  })

  it('lead 크기는 --list-row-lead-size 하나다(prop 없음)', () => {
    const html = render(<ListRow lead="L" title="제목" />)

    expect(html).toContain('width:var(--list-row-lead-size);height:var(--list-row-lead-size)')
  })

  it('variant="media"는 위쪽 정렬이고 footer를 그린다. default는 가운데 정렬이고 footer를 그리지 않는다', () => {
    const media = render(<ListRow variant="media" lead="L" title="제목" footer="푸터" onClick={() => {}} />)
    const plain = render(<ListRow lead="L" title="제목" footer="푸터" onClick={() => {}} />)

    expect(media).toContain('display:flex;align-items:flex-start;flex:1 1 auto')
    expect(media).toContain('>푸터<')
    expect(plain).toContain('display:flex;align-items:center;flex:1 1 auto')
    expect(plain).not.toContain('푸터')
  })
})

describe('한 줄 말줄임', () => {
  it('title은 nowrap·ellipsis·hidden이고 text-wrap을 따로 풀지 않는다', () => {
    const html = render(<ListRow title="제목" />)

    expect(html).toContain('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')
    expect(html).not.toContain('text-wrap')
  })

  it('meta도 기본 1줄 말줄임이고, time은 줄어들지 않는 nowrap이다', () => {
    const html = render(<ListRow title="제목" meta="부제" time="2026. 9. 1." eyebrow="라벨" />)

    expect(html).toMatch(/text-overflow:ellipsis;white-space:nowrap;margin-top:var\(--list-row-line-gap\)/)
    expect(html).toMatch(/flex-shrink:0;white-space:nowrap[^"]*">2026\. 9\. 1\.<\/span>/)
  })
})

describe('값 행 본문 칸 폭', () => {
  // 규칙은 라벨 span이 아니라 본문 칸(행 hit의 직접 자식)에 건다. 라벨 span의 50%는 본문 칸 폭 기준이라 행 폭 기준이 안 된다(티켓 20261108_1817 재작업).
  // 기하(라벨 한 줄·50% 상한)는 서버 렌더를 headless Chrome에서 재서 확인했고, 여기서는 그 결과를 만드는 스타일 값을 고정한다.
  const bodyStyle = (html: string) => html.match(/<span style="(display:block;flex:[^"]*)">/)?.[1] ?? ''
  const labelStyle = (html: string, title: string) => html.match(new RegExp(`<span style="([^"]*)">${title}</span>`))?.[1] ?? ''
  const BODY_RULE = 'flex:0 1 auto;max-width:50%'

  it('label + value + titleLines 0이면 본문 칸이 내용 폭(flex 0 1 auto)·행 폭의 최대 50%이다', () => {
    const html = render(<ListRow tone="flat" titleVariant="label" titleLines={0} title="트리거 활동" value="2026 JTBC 서울 마라톤 Full" />)

    expect(bodyStyle(html)).toContain(BODY_RULE)
    expect(bodyStyle(html)).not.toContain('flex:1 1 0%')
  })

  it('값 행 라벨 span에는 폭 규칙을 걸지 않고 기본(flex 1 1 auto, min-width 0)으로 둔다', () => {
    const style = labelStyle(render(<ListRow tone="flat" titleVariant="label" titleLines={0} title="트리거 활동" value="값" />), '트리거 활동')

    expect(style).toContain('flex:1 1 auto')
    expect(style).toContain('min-width:0')
    expect(style).not.toContain('max-content')
    expect(style).not.toContain('max-width')
  })

  it('value가 없거나 빈 문자열인 label 행(체크 목록 E)은 본문 칸이 기존 그대로라 줄바꿈이 유지된다', () => {
    for (const value of [undefined, '']) {
      const html = render(<ListRow tone="flat" titleVariant="label" titleLines={0} title="배지 받기" value={value} />)

      expect(bodyStyle(html)).toContain('flex:1 1 0%')
      expect(bodyStyle(html)).not.toContain('max-width:50%')
    }
  })

  it('titleLines 1·2를 명시한 값 행과 titleLines 기본(스켈레톤 포함) 값 행에는 규칙이 켜지지 않는다', () => {
    const cases = [
      <ListRow key="1" tone="flat" titleVariant="label" titleLines={1} title="라벨" value="값" />,
      <ListRow key="2" tone="flat" titleVariant="label" titleLines={2} title="라벨" value="값" />,
      <ListRow key="d" tone="flat" titleVariant="label" title="라벨" value="값" />,
    ]
    for (const node of cases) {
      expect(bodyStyle(render(node))).toContain('flex:1 1 0%')
      expect(bodyStyle(render(node))).not.toContain('max-width:50%')
    }
  })

  it('label이 아닌 행(strong·sentence)은 value가 있고 titleLines 0이어도 규칙이 켜지지 않는다', () => {
    expect(bodyStyle(render(<ListRow title="제목" titleLines={0} value="값" />))).toContain('flex:1 1 0%')
    expect(bodyStyle(render(<ListRow titleVariant="sentence" title="문장" value="값" />))).toContain('flex:1 1 0%')
  })

  it('값 칸은 60% 상한과 오른쪽 정렬을 그대로 유지한다', () => {
    const html = render(<ListRow tone="flat" titleVariant="label" titleLines={0} title="라벨" value="값" />)

    expect(html).toContain('max-width:60%')
    expect(html).toContain('text-align:right')
  })
})

describe('클릭 영역', () => {
  it('onClick이면 button이고 aria-expanded·aria-controls가 button으로 간다', () => {
    const html = render(<ListRow title="제목" onClick={() => {}} aria-expanded={false} aria-controls="panel-1" />)

    expect(html).toMatch(/<button type="button" class="ds-list-row-hit"[^>]*aria-controls="panel-1"[^>]*aria-expanded="false"/)
    expect(html).toContain('data-interactive="true"')
  })

  it('aria-expanded=true도 그대로 전달된다', () => {
    expect(render(<ListRow title="제목" onClick={() => {}} aria-expanded />)).toContain('aria-expanded="true"')
  })

  it('쉐브론은 chevron을 켜야만 그려진다(기본은 없음)', () => {
    const none = render(<ListRow title="제목" onClick={() => {}} aria-expanded={false} />)
    const chevron = render(<ListRow title="제목" onClick={() => {}} aria-expanded={false} chevron />)

    expect(none).not.toContain('<span class="ds-list-row-chevron"')
    expect(chevron).toContain('<span class="ds-list-row-chevron" data-expanded="false"')
    expect(chevron).toContain('M5 9l7 7 7-7')
  })

  it('onClick도 href도 없으면 div이고 눌림 대상이 아니다', () => {
    const html = render(<ListRow title="제목" />)

    expect(html).toContain('<div class="ds-list-row-hit"')
    expect(html).toContain('data-interactive="false"')
  })

  it('href면 링크(a)이고 클릭 영역 안에 div가 없다', () => {
    const html = render(<ListRow lead="L" title="제목" href="/x" />)
    const hit = html.slice(html.indexOf('<a '), html.indexOf('</a>'))

    expect(hit).toContain('href="/x"')
    expect(hit).not.toContain('<div')
  })

  it('leadHref + leadLabel이면 lead는 별도 링크가 되고 aria-label을 갖는다', () => {
    const html = render(<ListRow lead="L" leadHref="/u/kim" leadLabel="kim 프로필" title="제목" onClick={() => {}} />)

    const link = html.match(/<a [^>]*ds-list-row-lead-link[^>]*>/)?.[0] ?? ''
    expect(link).toContain('aria-label="kim 프로필"')
    expect(link).toContain('href="/u/kim"')
  })

  it('leadHref만 있고 leadLabel이 없으면 개발 모드에서 경고한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<ListRow lead="L" leadHref="/u/kim" title="제목" />)

    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('스타일 블록', () => {
  it('행이 여러 개여도 style 태그는 같은 href로 한 번 주입되도록 만든다', () => {
    const html = render(
      <>
        <ListRow title="a" />
        <ListRow title="b" />
      </>
    )

    // React 19는 같은 href의 <style precedence>를 문서에서 하나로 합친다(서버 렌더에서도 1개).
    expect((html.match(/data-href="ds-list-row"/g) ?? []).length).toBe(1)
  })

  it('눌림 0.98 축소와 포커스 링을 갖고, 동작 줄이기에서는 눌림 축소·전환이 없다', () => {
    expect(LIST_ROW_STATIC_CSS).toContain('transform:scale(var(--scale-press-card,0.98))')
    expect(LIST_ROW_STATIC_CSS).toContain('outline:2px solid var(--link);outline-offset:2px')
    const reduced = LIST_ROW_STATIC_CSS.slice(LIST_ROW_STATIC_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('[data-interactive="true"]:has(.ds-list-row-hit:active){transform:none}')
    expect(reduced).toContain('.ds-list-row,.ds-list-row-chevron{transition:none!important}')
  })

  it('lead 안 이미지는 박스를 채운다(.ds-list-row-lead img 100%·cover)', () => {
    expect(LIST_ROW_STATIC_CSS).toContain('.ds-list-row-lead img{display:block;width:100%;height:100%;object-fit:cover}')
  })
})

describe('ListRowChip·ListRowEm', () => {
  it('칩은 12px 글자·--foreground 글자색이고 tone은 면 색만 바꾼다', () => {
    const neutral = render(<ListRowChip>칩</ListRowChip>)
    const accent = render(<ListRowChip tone="accent">칩</ListRowChip>)

    expect(neutral).toContain('background:var(--default-soft)')
    expect(accent).toContain('background:var(--accent-soft)')
    for (const html of [neutral, accent]) {
      expect(html).toContain('color:var(--foreground)')
      expect(html).toContain('font-size:var(--text-xs)')
    }
  })

  it('done·surface·surface-muted 톤은 면과 글자색을 함께 바꾼다', () => {
    const done = render(<ListRowChip tone="done">칩</ListRowChip>)
    const surface = render(<ListRowChip tone="surface">칩</ListRowChip>)
    const muted = render(<ListRowChip tone="surface-muted">칩</ListRowChip>)

    expect(done).toContain('background:var(--foreground)')
    expect(done).toContain('color:var(--snow)')
    expect(surface).toContain('background:var(--surface)')
    expect(surface).toContain('color:var(--foreground)')
    expect(muted).toContain('background:var(--surface)')
    expect(muted).toContain('color:var(--muted)')
  })

  it('warning 톤은 --warning 면 위에 --snow 글자를 쓰고 neutral·accent는 --foreground를 유지한다', () => {
    const warning = render(<ListRowChip tone="warning">칩</ListRowChip>)
    const neutral = render(<ListRowChip>칩</ListRowChip>)
    const accent = render(<ListRowChip tone="accent">칩</ListRowChip>)

    expect(warning).toContain('background:var(--warning)')
    expect(warning).toContain('color:var(--snow)')
    expect(warning).not.toContain('color:var(--foreground)')
    expect(neutral).toContain('color:var(--foreground)')
    expect(accent).toContain('color:var(--foreground)')
  })

  it('빈 칩은 아무것도 그리지 않는다', () => {
    expect(render(<ListRowChip>{''}</ListRowChip>)).toBe('')
    expect(render(<ListRowChip>{null}</ListRowChip>)).toBe('')
  })

  it('ListRowEm은 strong 굵기 700이다', () => {
    expect(render(<ListRowEm>값</ListRowEm>)).toContain('style="font-weight:700">값</strong>')
  })
})

describe('값 행 값 칸 오른쪽 정렬', () => {
  // 본문 칸이 내용 폭(flex 0 1 auto)이라 남는 폭을 채우지 않는다. 값 칸이 margin-left:auto로 행 오른쪽 끝에 붙어야 한다.
  // 실화면(320px)에서 짧은 값이 라벨 바로 옆에 붙은 것을 재서 찾았고(값 오른쪽 끝이 행 끝에서 7~93px 떨어짐), 이 단정이 그 회귀를 막는다.
  const valueStyle = (html: string, value: string) => html.match(new RegExp(`<span style="([^"]*)">${value}</span>`))?.[1] ?? ''

  it('값 행(label + value + titleLines 0)의 값 칸은 margin-left:auto로 오른쪽 끝에 붙는다', () => {
    const style = valueStyle(render(<ListRow tone="flat" titleVariant="label" titleLines={0} title="활동 거리" value="42.44 km" />), '42.44 km')

    expect(style).toContain('margin-left:auto')
    expect(style).toContain('text-align:right')
  })

  it('titleLines 1·2·기본 값 행은 본문 칸이 남는 폭을 채우므로 값 칸에 margin-left:auto를 걸지 않는다', () => {
    for (const lines of [1, 2, undefined]) {
      const html = render(<ListRow tone="flat" titleVariant="label" titleLines={lines} title="라벨" value="값" />)

      expect(valueStyle(html, '값')).not.toContain('margin-left')
    }
  })

  it('label이 아닌 행의 값 칸에도 margin-left를 걸지 않는다', () => {
    expect(valueStyle(render(<ListRow title="이름" value="값" />), '값')).not.toContain('margin-left')
  })
})
