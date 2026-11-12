/**
 * LoadMoreButton — 더보기 버튼의 모양을 고정한다 (티켓 20261112_1626).
 *
 * 폭 전체·회색 알약(--btn-secondary)·위 16px(mt-4)이 한 곳에서만 정해지고, 로딩이면 비활성(중복 탭 차단)이다.
 * 저장소에 jsdom이 없어 서버 렌더 마크업으로 본다.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LoadMoreButton from '../LoadMoreButton'

const html = (props: { loading?: boolean; label?: string } = {}) =>
  renderToStaticMarkup(
    <LoadMoreButton loading={props.loading} onClick={() => {}}>
      {props.label ?? '더보기'}
    </LoadMoreButton>,
  )

describe('LoadMoreButton', () => {
  it('폭 전체·회색 알약·위 간격 16px로 그린다', () => {
    const out = html()
    expect(out).toContain('w-full')
    expect(out).toContain('bg-btn-secondary')
    expect(out).toContain('text-foreground')
    expect(out).toContain('rounded-full')
    expect(out).toContain('mt-4')
    expect(out).toContain('break-keep')
    expect(out).not.toContain('bg-surface')
    expect(out).not.toContain('disabled')
  })

  it('호출부가 넘긴 글자를 그대로 쓴다 — 오류 뒤에는 «다시 시도»가 같은 버튼에 들어간다', () => {
    expect(html()).toContain('>더보기</button>')
    expect(html({ label: '다시 시도' })).toContain('>다시 시도</button>')
  })

  it('로딩이면 스피너와 함께 비활성이다', () => {
    const out = html({ loading: true, label: '불러오는 중' })
    expect(out).toContain('disabled')
    expect(out).toContain('animate-spin')
    expect(out).toContain('opacity-40')
  })
})
