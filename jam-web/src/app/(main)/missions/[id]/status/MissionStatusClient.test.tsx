/**
 * 미션 현황 화면 마크업 시험 (티켓 20261111_2049, 티켓 20261127_1145에서 티켓 구조로 고쳤다)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다. 서버 렌더는 효과(fetch)를 돌리지 않으므로
 * 래퍼의 첫 번째 상태(`data`)만 시험용 값으로 바꿔 끼운다. 화면 구성(`page.tsx`)과 같은 모양으로 티켓 틀과 두 슬롯을 조립해 그린다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/[id]/status/MissionStatusClient.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const hoisted = vi.hoisted(() => ({ data: null as unknown, error: null as string | null, showLoader: false }))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  let call = 0
  // 래퍼의 useState 호출 순서: data → error → loading (렌더마다 처음부터 센다)
  const useState = () => {
    const i = call++ % 3
    if (i === 0) return [hoisted.data, () => {}]
    if (i === 1) return [hoisted.error, () => {}]
    return [false, () => {}]
  }
  return { ...actual, default: { ...actual, useState }, useState }
})

vi.mock('@/components/ui/TopNav', () => ({
  default: (props: { headerStyle?: { background?: string } }) => (
    <header data-testid="topnav" data-bg={props.headerStyle?.background} />
  ),
}))
vi.mock('@/hooks/useDebouncedLoading', () => ({ useDebouncedLoading: () => hoisted.showLoader }))

import BadgeTicket from '@/app/(main)/badges/[id]/BadgeTicket'
import { missionTicketColor } from '@/lib/badgeTicket/ticketColor'
import MissionStatusClient from './MissionStatusClient'
import MissionSummary from './MissionSummary'
import MissionBoard from './MissionBoard'

const ranked = (userId: string, rank: number, extra: Record<string, unknown> = {}) => ({
  userId, displayName: `이름-${userId}`, username: userId, avatarUrl: null,
  progressValue: 10 * (4 - rank), isCompleted: false, completedAt: null, rank, ...extra,
})
const person = (userId: string, achieved: boolean, extra: Record<string, unknown> = {}) => ({
  userId, displayName: `이름-${userId}`, username: userId, avatarUrl: null, achieved, achievedAt: null, ...extra,
})

function render(data: unknown, missionType = 'distance', kind: 'RANKING' | 'MISSION' = 'RANKING') {
  hoisted.data = data
  return renderToStaticMarkup(
    <MissionStatusClient missionId="m1" missionTitle="미션" displayType="ranking" missionType={missionType as never}>
      <BadgeTicket
        color={missionTicketColor()}
        kindLabel={kind}
        dateText="2026.11.27"
        surface="inverse"
        photo={<MissionSummary />}
        body={<MissionBoard />}
      />
    </MissionStatusClient>,
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

beforeEach(() => {
  hoisted.data = null
  hoisted.error = null
  hoisted.showLoader = false
})

describe('MissionStatusClient — 티켓 골격', () => {
  const data = { type: 'ranking', entries: [ranked('me', 1)], me: ranked('me', 1), totalParticipants: 1 }

  it('티켓 틀(머리 RANKING·날짜·절취선 2개·검정 바탕 변형)이 서버 마크업에 그려지고 티켓색은 코랄 토큰이다', () => {
    const html = render(data)
    expect(html).toContain('RANKING')
    expect(html).toContain('2026.11.27')
    expect(html).toContain('data-ticket-color="mission"')
    expect(html).toContain('--ticket:var(--mission-ticket)')
    expect(html).toContain('--ticket-text:#000000')
    expect(html).toMatch(/--ticket-end:oklch\(from var\(--ticket\)/)
    expect(html).toContain('_onInverse_')
    expect(html.match(/class="_tear_/g)).toHaveLength(2)
  })

  it('옛 구조(--mission-accent 루트 배경·--status-card-bg 카드·인라인 프로필 원)가 없고 화면 코드에 색 리터럴이 없다', () => {
    const html = render(data)
    expect(html).not.toContain('var(--mission-accent)')
    expect(html).not.toContain('--status-card-bg')
    expect(html).not.toContain('width:114px')
    expect(html).not.toMatch(/style="[^"]*background:#/)
    expect(html).not.toContain('rgba(')
  })

  it('상단 바 배경은 투명이고 페이지 래퍼가 반전 바탕을 건다', () => {
    const html = render(data)
    expect(html).toContain('data-bg="transparent"')
    expect(html).toContain('_page_')
  })

  it('MISSION 머리 글자는 달성형이다', () => {
    const html = render({ type: 'achievement', entries: [], me: person('me', true), totalParticipants: 1 }, 'distance', 'MISSION')
    expect(html).toContain('MISSION')
    expect(html).not.toContain('RANKING')
  })
})

describe('MissionStatusClient — 로딩·오류', () => {
  it('로딩 중에도 티켓 틀은 그려지고(머리·절취선), 로더가 뜨기 전에는 요약 자리만 비어 있다', () => {
    const html = render(null)
    expect(html).toContain('RANKING')
    expect(html).toContain('_slot_')
    expect(html).not.toContain('내 기록')
  })

  it('디바운스를 지나면 요약 자리에 눈 모양 로더가 뜬다', () => {
    hoisted.showLoader = true
    const html = render(null)
    expect(html).toMatch(/_slot_[^>]*><div class="wandering-eyes"/)
  })

  it('오류 문구는 요약 자리에 티켓 면 글자색(--foreground)으로 나오고 카드는 그리지 않는다', () => {
    hoisted.error = '불러오지 못했어요'
    const html = render(null)
    expect(html).toContain('불러오지 못했어요')
    expect(html).toMatch(/<p class="[^"]*text-foreground[^"]*">불러오지 못했어요/)
    expect(html).not.toContain('전체 랭킹')
  })
})

describe('MissionStatusClient — 랭킹형', () => {
  const entries = [ranked('a', 1), ranked('me', 2), ranked('c', 3)]
  const base = { type: 'ranking', entries, me: entries[1], totalParticipants: 3 }

  it('«내 요약» 위 칸에 아바타 96·이름·내 기록·값·단위가 차례로 나온다', () => {
    const html = render(base)
    const order = ['이름-me', '내 기록', '>20.0', 'km</span>'].map((s) => html.indexOf(s))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('width:96px;height:96px')
    expect(html).toContain('_avatar_')
    expect(html).toContain('text-5xl font-bold')
  })

  it('아래 두 칸은 «내 순위»와 «1위와 차이»다(1위 값 30 − 내 값 20 = 10.0km)', () => {
    const html = render(base)
    const stats = html.slice(html.indexOf('_titleStats_'))
    expect(stats.indexOf('내 순위')).toBeLessThan(stats.indexOf('1위와 차이'))
    expect(stats).toContain('>2위<')
    expect(stats).toContain('>10.0km<')
  })

  it('내가 1위이면 «1위와 차이»는 «—»다', () => {
    const me = ranked('me', 1)
    const html = render({ type: 'ranking', entries: [me, ranked('c', 2)], me, totalParticipants: 2 })
    expect(html).toMatch(/1위와 차이<\/span><span class="_titleStatValue_[^"]*">—</)
  })

  it('«전체 랭킹» 카드는 검정 면(Card inverse)이고 모든 참가자가 나오며 내 행에만 «나» 원이 있다', () => {
    const html = render(base)
    expect(html).toContain('전체 랭킹')
    expect(html).toContain('>참가자 3명')
    expect(html).not.toContain('다른 참가자')
    expect(html).toContain('background:var(--background-inverse)')
    for (const id of ['a', 'me', 'c']) expect(html).toContain(`이름-${id}`)
    expect(html.match(/role="img" aria-label="나"/g)).toHaveLength(1)
  })

  it('행은 onInverse 톤이고 막대 채움·«나» 원은 티켓색 한 색(--mission-ticket)이다', () => {
    const html = render(base)
    expect(html).toContain('background:var(--surface-on-inverse)')
    expect(html).toContain('width:22px;height:22px;background:var(--mission-ticket)')
    expect(html.match(/background:var\(--mission-ticket\)/g)!.length).toBeGreaterThanOrEqual(4)
    expect(html).toContain('background:var(--capsule-track)')
    expect(html).not.toContain('background:var(--accent)')
  })

  it('내 순위가 공개 목록 밖이어도 위쪽 순위는 보이고 목록에 «나» 원은 없다', () => {
    const outside = ranked('me', 12)
    const html = render({ type: 'ranking', entries: [ranked('a', 1), ranked('c', 2)], me: outside, totalParticipants: 12 })
    expect(html).toContain('>12위<')
    expect(html).not.toContain('role="img" aria-label="나"')
  })

  it('me가 null이면 이름·값·순위·차이가 «—»이고 아바타는 사람 아이콘이다', () => {
    const html = render({ type: 'ranking', entries, me: null, totalParticipants: 3 }, 'activity_count')
    expect(html).toContain('>—</p>')
    expect(html).toMatch(/내 순위<\/span><span class="_titleStatValue_[^"]*">—</)
    expect(html).toMatch(/1위와 차이<\/span><span class="_titleStatValue_[^"]*">—</)
    expect(html).toContain('<svg')
  })

  it('값이 0이어도 «0»과 단위가 나온다', () => {
    const me = ranked('me', 2, { progressValue: 0 })
    const html = render({ type: 'ranking', entries: [ranked('a', 1), me], me, totalParticipants: 2 }, 'activity_count')
    expect(html).toContain('>0<span')
    expect(html).toContain('회</span>')
  })

  it('목록이 비어도(me null·entries 0) 요약 상자만 그리고 카드는 그리지 않는다', () => {
    const html = render({ type: 'ranking', entries: [], me: null, totalParticipants: 0 })
    expect(html).toContain('내 기록')
    expect(html).not.toContain('전체 랭킹')
  })

  it('긴 이름은 한 줄 말줄임(최대 280) 클래스를 쓴다', () => {
    const me = ranked('me', 1, { displayName: '아주아주아주아주아주아주아주아주긴이름' })
    const html = render({ type: 'ranking', entries: [me], me, totalParticipants: 1 })
    expect(html).toContain('_name_')
  })
})

describe('MissionStatusClient — 달성형', () => {
  const me = person('me', true)
  const others = [person('a', true), person('c', false)]

  it('내가 달성하면 ink 면 알약(done), 미달성이면 면 없는 외곽선 알약(outline)이고 둘 다 큰 크기다', () => {
    const done = render({ type: 'achievement', entries: others, me, totalParticipants: 3 }, 'distance', 'MISSION')
    expect(done).toContain('내 상황')
    expect(done).toMatch(/background:var\(--foreground\);color:var\(--snow\)[^>]*>달성<\/span>/)
    expect(done).toContain('font-size:var(--text-3xl)')
    const notYet = render({ type: 'achievement', entries: others, me: person('me', false), totalParticipants: 3 }, 'distance', 'MISSION')
    expect(notYet).toMatch(/background:transparent;color:var\(--foreground\)[^>]*box-shadow:inset 0 0 0 2px currentColor[^>]*>미달성<\/span>/)
    expect(notYet).not.toContain('background:var(--muted)')
  })

  it('아래 칸은 «전체 참가자» 한 칸뿐이다(«달성한 참가자»는 두지 않는다)', () => {
    const html = render({ type: 'achievement', entries: others, me, totalParticipants: 3 }, 'distance', 'MISSION')
    const stats = html.slice(html.indexOf('_titleStats_'))
    expect(stats).toContain('전체 참가자')
    expect(stats).toContain('>3명<')
    expect(stats.match(/_titleStat_/g)).toHaveLength(1)
    expect(html).not.toContain('달성한 참가자')
  })

  it('«달성 현황» 카드에는 서버가 준 순서 그대로 다른 참가자만 나오고 «나»는 없다', () => {
    const html = render({ type: 'achievement', entries: others, me, totalParticipants: 3 }, 'distance', 'MISSION')
    expect(html).toContain('달성 현황')
    expect(html).toContain('다른 참가자 2명')
    expect(html).not.toContain('>참가자 3명')
    expect(html.indexOf('이름-a')).toBeLessThan(html.indexOf('이름-c'))
    expect(html.match(/이름-me/g)).toHaveLength(1) // 요약 상자에 한 번
    expect(html).not.toContain('role="img" aria-label="나"')
  })

  it('행 칩은 달성이 코랄 한 색(ticket), 미달성이 한 단계 밝은 회색(on-inverse)이다', () => {
    const html = render({ type: 'achievement', entries: others, me, totalParticipants: 3 }, 'distance', 'MISSION')
    expect(html).toMatch(/background:var\(--mission-ticket\);color:var\(--ticket-text, var\(--ticket-ink\)\)[^>]*>달성<\/span>/)
    expect(html).toMatch(/background:var\(--surface-on-inverse\);color:var\(--muted-on-inverse\)[^>]*>미달성<\/span>/)
  })

  it('내가 참가자가 아니면(me가 null) «다른 참가자 N명»에 totalParticipants를 그대로 쓰고 알약은 미달성이다', () => {
    const html = render({ type: 'achievement', entries: others, me: null, totalParticipants: 2 }, 'distance', 'MISSION')
    expect(html).toContain('다른 참가자 2명')
    expect(html).toContain('>미달성</span>')
  })

  it('내가 참가 중인데 다른 참가자가 없으면 검정 카드 안에 «아직 다른 참가자가 없어요» EmptyState가 나온다', () => {
    const html = render({ type: 'achievement', entries: [], me, totalParticipants: 1 }, 'distance', 'MISSION')
    expect(html).toContain('아직 다른 참가자가 없어요')
    expect(html).toContain('다른 참가자가 생기면 여기에 보여요')
    expect(html).toMatch(/_darkCard_[^>]*>[\s\S]*아직 다른 참가자가 없어요/)
    expect(html).not.toContain('다른 참가자 0명')
  })

  it('카드 제목은 화면 전용 글자 크기 토큰(CSS 모듈)을 쓴다', () => {
    const html = render({ type: 'achievement', entries: others, me, totalParticipants: 3 }, 'distance', 'MISSION')
    expect(html).toContain('_cardTitle_')
  })
})
