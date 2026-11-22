/**
 * 배지 상세 티켓 틀 (티켓 20261122_1222)
 * 서버 렌더 HTML에 티켓색 변수와 머리 글자가 담기고, 공유 버튼·옛 배경 레이어·안내 문단이 없다.
 */
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { pickTicketColor } from '@/lib/badgeTicket/ticketColor'
import BadgeTicket from '../BadgeTicket'

const color = pickTicketColor([], () => 0.3)
const render = (dateText: string | null) =>
  renderToStaticMarkup(<BadgeTicket color={color} kindLabel="CHECK IN" dateText={dateText} photo={<p>사진</p>} afterPhoto={<p>일련번호</p>} body={<p>카드</p>} />)

describe('BadgeTicket', () => {
  it('첫 HTML에 --ticket·--ticket-end 인라인 변수와 종류·날짜가 들어 있다', () => {
    const html = render('2026.11.22')
    expect(html).toContain(`--ticket:var(${color.cssVar})`)
    expect(html).toContain('--ticket-end:')
    expect(html).toContain('CHECK IN')
    expect(html).toContain('2026.11.22')
    expect(html.indexOf('사진')).toBeLessThan(html.indexOf('일련번호'))
    expect(html.indexOf('일련번호')).toBeLessThan(html.indexOf('카드'))
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

  it('액티비티 획득 정보 카드에 제목을 그리지 않는다', () => {
    expect(page).not.toContain('earnInfoTitle')
  })

  it('세 변형 모두 BadgeTicket을 쓰고 공유 버튼은 티켓 밖에 둔다', () => {
    expect(page.match(/<BadgeTicket$/gm)).toHaveLength(3)
    expect(page).toContain("'--background': '#F1E9D6'")
    expect(page.match(/공유하기 — 티켓 밖/g)).toHaveLength(3)
  })
})
