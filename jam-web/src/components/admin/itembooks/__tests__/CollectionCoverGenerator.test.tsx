/**
 * 표지 생성기 보기(`CollectionCoverGeneratorView`)의 상태별 표시 (티켓 20261124_1744).
 * jsdom이 없어 훅 없는 보기 컴포넌트를 서버 렌더로 그린다. 적용 때 두 요청은 collectionCoverState.test.ts가 확인한다.
 * 실행: cd jam-web && npx vitest run src/components/admin/itembooks/__tests__/CollectionCoverGenerator.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

import { CollectionCoverGeneratorView, type CoverViewProps } from '../CollectionCoverGenerator'

const noop = () => {}
function view(over: Partial<CoverViewProps> = {}): string {
  const props: CoverViewProps = {
    loading: false,
    nameEn: 'ALLEY FILM SNAPS',
    onNameEn: noop,
    tribeNameEn: 'CLICK CREW',
    badges: [{ id: 'b1', name: '필름', image_url: 'https://x.test/b1.png', deleted_at: null }],
    badgeId: 'b1',
    onBadge: noop,
    result: {
      bgHex: '#336699',
      bgSource: 'generated',
      textColors: { title: '#161412', tribe: '#ffffff', join: '#ffffff' },
    },
    textOverrides: {},
    onReroll: noop,
    onBgManual: noop,
    onTextColor: noop,
    onReset: noop,
    canvas: <canvas width={1024} height={1024} />,
    applying: false,
    error: null,
    onApplyClick: noop,
    ...over,
  }
  return renderToStaticMarkup(<CollectionCoverGeneratorView {...props} />).replace(/<!-- -->/g, '')
}

const applyDisabled = (html: string) => /<button[^>]*disabled=""[^>]*>적용<\/button>/.test(html)

describe('CollectionCoverGeneratorView', () => {
  it('준비되면 적용 버튼이 켜지고 영역 이름과 줄바꿈 클래스가 보인다', () => {
    const html = view()
    expect(html).toContain('대표 이미지 생성기')
    expect(html).toContain('break-keep')
    expect(html).toContain('배경색 다시 뽑기')
    expect(html).toContain('기본값으로 되돌리기')
    expect(applyDisabled(html)).toBe(false)
  })

  it('로딩 중에는 스켈레톤과 안내가 보이고 적용은 막힌다', () => {
    const html = view({ loading: true, result: null })
    expect(html).toContain('animate-pulse')
    expect(html).toContain('불러오는 중')
    expect(applyDisabled(html)).toBe(true)
  })

  it('컬렉션 영문 이름이 비면 입력 요구 문구를 보이고 적용을 막는다', () => {
    const html = view({ nameEn: '  ' })
    expect(html).toContain('영문 이름을 적어 주세요')
    expect(applyDisabled(html)).toBe(true)
  })

  it('트라이브 영문 이름이 없으면 경고하고 적용을 막는다', () => {
    const html = view({ tribeNameEn: null, result: null })
    expect(html).toContain('트라이브 영문 이름이 비어 있어요')
    expect(applyDisabled(html)).toBe(true)
  })

  it('이미지 있는 배지가 없으면 경고하고 적용을 막는다', () => {
    const html = view({ badges: [{ id: 'b1', name: '필름', image_url: null }], badgeId: null, result: null })
    expect(html).toContain('이미지가 있는 아이템 배지가 없어요')
    expect(applyDisabled(html)).toBe(true)
  })

  it('적용 중에는 문구가 바뀌고 버튼이 막힌다', () => {
    const html = view({ applying: true })
    expect(html).toContain('적용하는 중')
    expect(html).toContain('이미지를 올리고 설정을 저장하고 있어요')
  })

  it('실패하면 [현상]→[원인]→[해결책] 문구를 그대로 보인다', () => {
    const html = view({ error: '[현상] 올리지 못했어요.\n[원인] 서버\n[해결책] 다시 해 보세요.' })
    expect(html).toContain('적용하지 못했어요')
    expect(html).toContain('[원인] 서버')
  })

  it('직접 지정한 글자색만 «자동» 버튼이 눌리지 않은 채로 보인다', () => {
    const html = view({ textOverrides: { join: '#ff0000' } })
    expect(html).toMatch(/aria-pressed="false"[^>]*aria-label="JOIN AND MOVE 글자색 자동"|aria-label="JOIN AND MOVE 글자색 자동"[^>]*aria-pressed="false"/)
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="제목 글자색 자동"|aria-label="제목 글자색 자동"[^>]*aria-pressed="true"/)
  })
})
