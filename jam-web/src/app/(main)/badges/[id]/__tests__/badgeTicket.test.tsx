/**
 * 배지 상세 티켓 틀 (티켓 20261122_1222)
 * 서버 렌더 HTML에 티켓색 변수와 머리 글자가 담기고, 공유 버튼·옛 배경 레이어·안내 문단이 없다.
 */
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveCoverTicketColor, missionTicketColor, pickTicketColor } from '@/lib/badgeTicket/ticketColor'
import { TicketSummaryBoxView } from '../TicketTitleBoxes'
import BadgeTicket from '../BadgeTicket'

const color = pickTicketColor([], () => 0.3)
const render = (dateText: string | null) =>
  renderToStaticMarkup(<BadgeTicket color={color} kindLabel="CHECK IN" dateText={dateText} photo={<p>사진</p>} afterPhoto={<p>일련번호</p>} body={<p>카드</p>} />)

describe('BadgeTicket', () => {
  it('첫 HTML에 --ticket·--ticket-end 인라인 변수와 종류·날짜가 들어 있다', () => {
    const html = render('2026.11.22')
    expect(html).toContain(`--ticket:var(${color.cssVar})`)
    expect(html).toContain('--ticket-end:')
    expect(html).toContain(`--ticket-silhouette:${color.silhouette}`)
    expect(html).toContain('CHECK IN')
    expect(html).toContain('2026.11.22')
    expect(html.indexOf('사진')).toBeLessThan(html.indexOf('일련번호'))
    expect(html.indexOf('일련번호')).toBeLessThan(html.indexOf('카드'))
  })

  it('팔레트 색은 글자색·카드 비율 변수를 넣지 않는다(배지 상세 HTML은 그대로)', () => {
    const html = render('2026.11.22')
    expect(html).not.toContain('--ticket-text')
    expect(html).not.toContain('--card-mix')
  })

  it('표지에서 파생한 색은 hex와 글자색·카드 비율을 인라인으로 담고 data-ticket-color가 cover다', () => {
    const derived = deriveCoverTicketColor('#7d1b98')
    const html = renderToStaticMarkup(<BadgeTicket color={derived} kindLabel="COLLECTION" dateText={null} photo={<p>사진</p>} body={<p>카드</p>} />)
    expect(html).toContain(`--ticket:${derived.hex}`)
    expect(html).toContain('--ticket-text:#ffffff')
    expect(html).toContain(`--card-mix:${derived.cardMix}%`)
    expect(html).toContain('data-ticket-color="cover"')
    expect(html).toContain('COLLECTION')
  })

  it('미획득이면 날짜 줄을 그리지 않는다', () => {
    expect(render(null)).not.toMatch(/\d{4}\.\d{2}\.\d{2}/)
  })

  it('티켓 틀 파일에 클라이언트 전용 코드가 없다', () => {
    const tsx = readFileSync(new URL('../BadgeTicket.tsx', import.meta.url), 'utf-8')
    const css = readFileSync(new URL('../BadgeTicket.module.css', import.meta.url), 'utf-8')
    for (const src of [tsx, css]) {
      expect(src).not.toContain("'use client'")
      expect(src).not.toContain('useEffect')
      expect(src).not.toContain('useState')
    }
    expect(css).not.toContain('position: fixed')
  })
})

describe('배지 상세 page 세 변형', () => {
  const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf-8')

  it('옛 전체 화면 배경 레이어·테마 글자 스타일을 그리지 않는다', () => {
    expect(page).not.toContain('badgeBackgroundLayer')
    expect(page).not.toContain('themedTextStyle')
    expect(page).not.toContain('topNavStyle')
    expect(page.match(/<TicketPhoto /g)).toHaveLength(3)
  })

  it('세 변형 모두 글자 상자를 쓰고 세 부품의 제목을 숨긴다', () => {
    expect(page.match(/<TicketTitleBoxes /g)).toHaveLength(3)
    expect(page).toMatch(/<ItemEarnHistory\s+hideTitle/)
    expect(page).toContain('<PoiEarnHistory hideTitle')
    expect(page).toMatch(/<BadgeConditionCard\s+hideTitle/)
  })

  it('티켓색은 쿼리(tc·tb)를 허용 목록으로 읽어 resolveTicketColor로 정하고 TicketPhoto에 실루엣 색을 넘긴다', () => {
    expect(page).toContain('resolveTicketColor')
    expect(page).toContain('parseTicketColorParams')
    expect(page).not.toContain('pickTicketColor')
    expect(page.match(/silhouette=\{ticketColor\.silhouette\}/g)).toHaveLength(3)
  })

  it('액티비티 획득 정보 카드에 제목을 그리지 않는다', () => {
    expect(page).not.toContain('earnInfoTitle')
  })

  it('세 변형 모두 BadgeTicket을 쓰고 공유 버튼은 티켓 밖에 둔다', () => {
    expect(page.match(/<BadgeTicket$/gm)).toHaveLength(3)
    // 페이지 바탕은 다른 화면과 같은 기본값이다(덮어쓰지 않는다, 티켓 20261122_1424)
    expect(page).not.toContain("'--background':")
    expect(page.match(/공유하기 — 티켓 밖/g)).toHaveLength(3)
    // 공유 버튼이 없을 때도 티켓과 푸터 사이 여백을 둔다(정의 1 + 세 변형 3, 티켓 20261122_1442)
    expect(page.match(/noShareSpacerStyle/g)).toHaveLength(4)
  })
})

describe('TicketPhoto·StravaLink', () => {
  const photo = readFileSync(new URL('../TicketPhoto.tsx', import.meta.url), 'utf-8')
  const strava = readFileSync(new URL('../../../../../components/StravaLink.tsx', import.meta.url), 'utf-8')

  it('사진 자리에 Aura·회색·반투명 처리가 없고 미획득은 실루엣 필터를 쓴다', () => {
    expect(photo).not.toMatch(/BadgeAuraBackground|resolveAuraColors|AURA_GLOW/)
    expect(photo).not.toContain('grayscale')
    expect(photo).not.toContain('opacity-50')
    expect(photo).toContain('feComposite')
    expect(photo).toContain('--ticket-silhouette')
  })

  it('Strava 버튼은 공용 Button primary(검정 바탕·흰 글씨) 풀폭 링크다', () => {
    expect(strava).toContain("import Button from '@/components/ui/Button'")
    expect(strava).toContain('variant="primary"')
    expect(strava).toContain('fullWidth')
    expect(strava).not.toContain('#FC4C02')
  })
})

describe('BadgeTicket — 미션 현황 변형 (티켓 20261127_1145)', () => {
  const mission = missionTicketColor()
  const renderMission = (surface?: 'default' | 'inverse') =>
    renderToStaticMarkup(<BadgeTicket color={mission} kindLabel="RANKING" dateText="2026.11.27" surface={surface} photo={<p>사진</p>} body={<p>카드</p>} />)

  it('미션 티켓색은 토큰 변수와 서버가 정한 글자색을 첫 HTML에 담는다', () => {
    const html = renderMission()
    expect(html).toContain('--ticket:var(--mission-ticket)')
    expect(html).toContain('--ticket-text:#000000')
    expect(html).toContain('data-ticket-color="mission"')
  })

  it('surface="inverse"일 때만 검정 바탕 변형 클래스가 붙는다', () => {
    expect(renderMission()).not.toContain('onInverse')
    expect(renderMission('inverse')).toContain('onInverse')
  })

  it('CSS 모듈은 검정 바탕 변형에서 --background를 --background-inverse로 덮는다', () => {
    const css = readFileSync(new URL('../BadgeTicket.module.css', import.meta.url), 'utf-8')
    expect(css).toMatch(/\.onInverse\s*\{[^}]*--background:\s*var\(--background-inverse\)/)
  })
})

describe('TicketSummaryBoxView (티켓 20261127_1145)', () => {
  const html = renderToStaticMarkup(
    <TicketSummaryBoxView top={<p>위 칸</p>} stats={[{ label: '내 순위', value: '2위' }, { label: '1위와 차이', value: '10.0km' }]} />,
  )

  it('위 칸 슬롯과 통계 두 칸을 같은 글자 상자 안에 차례로 그린다', () => {
    expect(html.indexOf('위 칸')).toBeLessThan(html.indexOf('내 순위'))
    expect(html.indexOf('내 순위')).toBeLessThan(html.indexOf('1위와 차이'))
    expect(html.match(/_titleStat_/g)).toHaveLength(2)
    expect(html).not.toContain('<h1')
  })

  it('통계 칸 값은 줄바꿈하지 않고 28px, 가운데 세로 선은 2px이다', () => {
    const css = readFileSync(new URL('../BadgeTicket.module.css', import.meta.url), 'utf-8')
    expect(css).toMatch(/\.titleStatValue\s*\{[^}]*font-size:\s*28px[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.titleStat \+ \.titleStat\s*\{[^}]*border-left:\s*2px solid/)
  })
})
