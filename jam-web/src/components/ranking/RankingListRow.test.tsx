/**
 * RankingListRow 선택 prop 시험 (티켓 20261111_2049)
 *
 * 홈 피드 랭킹보드 카드도 쓰는 공용 컴포넌트라, prop을 안 주면 지금 모양(검정 막대·«나» 칩)이 그대로여야 한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RankingListRow from './RankingListRow'

const entry = { userId: 'u1', displayName: '러너', username: 'runner', avatarUrl: null, value: 5, rank: 2 }
const render = (extra: Record<string, unknown> = {}, isMe = true) =>
  renderToStaticMarkup(
    <RankingListRow entry={entry} maxValue={10} isMe={isMe} formatValue={(v) => `${v}km`} {...extra} />,
  ).replace(/<style[\s\S]*?<\/style>/g, '')

describe('RankingListRow — 기본값은 홈 랭킹보드 카드의 모양이다', () => {
  it('막대 채움은 --accent이고 내 행 표식은 «나» 칩이다', () => {
    const html = render()
    expect(html).toContain('background:var(--accent)')
    expect(html).not.toContain('var(--jam-red)')
    expect(html).toContain('background:var(--accent-soft);color:var(--foreground)')
    expect(html).toContain('>나</span>')
    expect(html).not.toContain('role="img"')
  })
})

describe('RankingListRow — barColor·meMarker', () => {
  it('barColor를 주면 막대 채움 색이 바뀌고 --accent는 쓰지 않는다', () => {
    const html = render({ barColor: 'var(--jam-red)' })
    expect(html).toContain('background:var(--jam-red)')
    expect(html).not.toContain('background:var(--accent)')
  })

  it('meMarker="circle"이면 이름 옆에 22px --jam-red 원이 있고 «나» 칩은 없다', () => {
    const html = render({ meMarker: 'circle' })
    expect(html).toContain('role="img" aria-label="나"')
    expect(html).toContain('width:22px;height:22px;border-radius:50%;background:var(--jam-red);color:var(--foreground);font-size:11px;font-weight:700;line-height:1')
    expect(html).not.toContain('background:var(--accent-soft)')
  })

  it('내 행이 아니면 표식이 없다', () => {
    const html = render({ meMarker: 'circle' }, false)
    expect(html).not.toContain('role="img"')
    expect(html).not.toContain('>나</span>')
  })
})
