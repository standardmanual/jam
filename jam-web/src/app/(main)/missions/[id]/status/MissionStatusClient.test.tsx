/**
 * 미션 상황 화면 마크업 시험 (티켓 20261111_2049)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다. 서버 렌더는 효과(fetch)를 돌리지 않으므로
 * 화면의 첫 번째 상태(`data`)만 시험용 값으로 바꿔 끼운다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/[id]/status/MissionStatusClient.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const hoisted = vi.hoisted(() => ({ data: null as unknown }))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  let call = 0
  // 컴포넌트의 useState 호출 순서: data → error → loading (렌더마다 처음부터 센다)
  const useState = () => {
    const i = call++ % 3
    if (i === 0) return [hoisted.data, () => {}]
    if (i === 1) return [null, () => {}]
    return [false, () => {}]
  }
  return { ...actual, default: { ...actual, useState }, useState }
})

vi.mock('@/components/ui/TopNav', () => ({
  default: (props: { headerStyle?: { background?: string } }) => (
    <header data-testid="topnav" data-bg={props.headerStyle?.background} />
  ),
}))
vi.mock('@/hooks/useDebouncedLoading', () => ({ useDebouncedLoading: () => false }))

import MissionStatusClient from './MissionStatusClient'

const ranked = (userId: string, rank: number, extra: Record<string, unknown> = {}) => ({
  userId, displayName: `이름-${userId}`, username: userId, avatarUrl: null,
  progressValue: 10 * (4 - rank), isCompleted: false, completedAt: null, rank, ...extra,
})
const person = (userId: string, achieved: boolean, extra: Record<string, unknown> = {}) => ({
  userId, displayName: `이름-${userId}`, username: userId, avatarUrl: null, achieved, achievedAt: null, ...extra,
})

function render(data: unknown, missionType = 'distance') {
  hoisted.data = data
  return renderToStaticMarkup(
    <MissionStatusClient missionId="m1" missionTitle="미션" displayType="ranking" missionType={missionType as never} />,
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

beforeEach(() => {
  hoisted.data = null
})

describe('MissionStatusClient — 공통 골격', () => {
  it('루트에 배경 그라데이션·흰 빛 토큰을 깔고 상단 바 배경은 투명이다', () => {
    const html = render({ type: 'ranking', entries: [ranked('me', 1)], me: ranked('me', 1), totalParticipants: 1 })
    expect(html).toContain('var(--status-page-gradient)')
    expect(html).toContain('var(--status-glow)')
    expect(html).toContain('data-bg="transparent"')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    expect(html).not.toContain('rgba(')
    // 프로필 원은 흰 링 3px만 두르고 그림자는 쓰지 않는다(목록 행의 inset 0 그림자는 ListRow 자체 스타일이라 여기서 보지 않는다)
    const hero = html.slice(0, html.indexOf('전체 랭킹'))
    expect(hero).toContain('border:3px solid var(--card-bg)')
    expect(hero).not.toContain('shadow')
  })
})

describe('MissionStatusClient — 랭킹형', () => {
  const entries = [ranked('a', 1), ranked('me', 2), ranked('c', 3)]
  const base = { type: 'ranking', entries, me: entries[1], totalParticipants: 3 }

  it('위쪽에 진행 상황·진행값·단위·내 순위가 차례로 나오고 포디엄·내 순위 카드는 없다', () => {
    const html = render(base)
    const order = ['나의 진행 상황', '>20.0', 'km', '내 순위', '2위</p>'].map((s) => html.indexOf(s))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('var(--jam-red)')
    expect(html).toContain('width:114px')
  })

  it('«전체 랭킹» 카드에 1위부터 모든 참가자가 나오고 내 행에만 «나» 칩이 있다', () => {
    const html = render(base)
    expect(html).toContain('전체 랭킹')
    expect(html).toContain('>참가자 3명')
    expect(html).not.toContain('다른 참가자')
    expect(html).toContain('var(--card-bg-translucent)')
    for (const id of ['a', 'me', 'c']) expect(html).toContain(`이름-${id}`)
    expect(html.match(/>나<\/span>/g)).toHaveLength(1)
  })

  it('내 순위가 공개 목록 밖이어도 위쪽 순위는 보이고 목록에 내 행은 없다', () => {
    const outside = ranked('me', 12)
    const html = render({ type: 'ranking', entries: [ranked('a', 1), ranked('c', 2)], me: outside, totalParticipants: 12 })
    expect(html).toContain('12위</p>')
    expect(html).not.toContain('>나</span>')
  })

  it('me가 null이면 진행값 0과 «—»로 구조를 유지한다', () => {
    const html = render({ type: 'ranking', entries, me: null, totalParticipants: 3 }, 'activity_count')
    expect(html).toContain('>0<')
    expect(html).toContain('>—</p>')
    expect(html).toContain('내 순위')
  })

  it('참가자가 없으면 카드 대신 EmptyState가 나온다', () => {
    const html = render({ type: 'ranking', entries: [], me: null, totalParticipants: 0 })
    expect(html).toContain('아직 참가자가 없어요')
    expect(html).not.toContain('전체 랭킹')
  })
})

describe('MissionStatusClient — 달성형', () => {
  const me = person('me', true)

  it('내가 달성하면 --jam-red 알약, 미달성이면 --base-neutral-600 알약이다', () => {
    const done = render({ type: 'achievement', entries: [me, person('a', false)], me, totalParticipants: 2 })
    expect(done).toContain('background:var(--jam-red);color:var(--snow)')
    expect(done).toContain('>달성</span>')
    const notYet = render({ type: 'achievement', entries: [person('a', true)], me: person('me', false), totalParticipants: 2 })
    expect(notYet).toContain('background:var(--base-neutral-600);color:var(--snow)')
  })

  it('«달성 현황» 카드에는 서버가 내 행을 뺀 다른 참가자가 준 순서 그대로 나오고 «나» 칩은 없다', () => {
    const html = render({
      type: 'achievement',
      entries: [person('a', true), person('c', false)],
      me,
      totalParticipants: 3,
    })
    expect(html).toContain('달성 현황')
    // totalParticipants(3)는 나를 포함한 수라 목록(2행)과 맞도록 «다른 참가자 2명»으로 보인다
    expect(html).toContain('다른 참가자 2명')
    expect(html).not.toContain('>참가자 3명')
    expect(html.indexOf('이름-a')).toBeGreaterThan(-1)
    expect(html.indexOf('이름-a')).toBeLessThan(html.indexOf('이름-c'))
    // 내 이름은 위쪽 «나» 영역에 한 번만 나온다(목록에는 없다)
    expect(html.match(/이름-me/g)).toHaveLength(1)
    expect(html).not.toContain('>나</span>')
    expect(html).not.toContain('— 나 —')
  })

  it('내가 참가자가 아니면(me가 null) «다른 참가자 N명»에 totalParticipants를 그대로 쓴다', () => {
    const html = render({ type: 'achievement', entries: [person('a', true), person('c', false)], me: null, totalParticipants: 2 })
    expect(html).toContain('다른 참가자 2명')
  })

  it('내가 참가 중인데 다른 참가자가 없으면 «아직 다른 참가자가 없어요» EmptyState가 나온다', () => {
    const html = render({ type: 'achievement', entries: [], me, totalParticipants: 1 })
    expect(html).toContain('아직 다른 참가자가 없어요')
    expect(html).toContain('다른 참가자가 생기면 여기에 보여요')
    expect(html).not.toContain('아직 참가자가 없어요')
    expect(html).not.toContain('참가자 1명')
  })

  it('참가자가 한 명도 없으면(me도 null) 기존 «아직 참가자가 없어요» EmptyState가 나온다', () => {
    const html = render({ type: 'achievement', entries: [], me: null, totalParticipants: 0 })
    expect(html).toContain('아직 참가자가 없어요')
    expect(html).not.toContain('아직 다른 참가자가 없어요')
  })

  it('카드 제목은 화면 전용 글자 크기 토큰을 쓴다', () => {
    const html = render({ type: 'achievement', entries: [person('a', true)], me, totalParticipants: 2 })
    expect(html).toContain('var(--status-card-title-size)')
  })
})
