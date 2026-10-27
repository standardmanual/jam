/**
 * 운영 상황판 「내 차례」 카드 줄 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.1)
 *
 * 저장소에 jsdom·testing-library가 없어(`home.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다.
 *
 * 지키는 것: 결정 필요·문제 카드의 상태 글자와 건수, 마감 문구(수 18:00까지 / 마감이 지났어요), 이유 칩 요약,
 * 주 버튼 글자와 링크(시험 포함이면 sample=1), 0장이면 한 줄 안내, 제목이 HTML로 해석되지 않는다.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { MyTurnCard } from '@/lib/admin/opsBoard/myTurn'
import { OpsMyTurn, deadlineText } from '../OpsMyTurn'

const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

/** 2026-10-27(화) 12:00 KST. 그 주 결정 마감은 수요일 18:00(2026-10-28T09:00Z)이다. */
const NOW = new Date('2026-10-27T12:00:00+09:00')
const DEADLINE = '2026-10-28T09:00:00.000Z'

function card(over: Partial<MyTurnCard> = {}): MyTurnCard {
  return {
    id: 'decide:b1',
    kind: 'decide',
    reason: 'items',
    title: 'LP 리바이벌',
    count: 3,
    deadlineIso: DEADLINE,
    reasonChips: [
      { kind: 'trend', count: 2 },
      { kind: 'season', count: 1 },
    ],
    href: '/admin/ops-inbox/b1',
    ...over,
  }
}

describe('결정 필요 카드', () => {
  it('상태 글자·제목·건수·마감·이유 요약·주 버튼이 한 장에 있다', () => {
    const out = flat(<OpsMyTurn cards={[card()]} now={NOW} />)
    expect(out).toContain('결정 필요')
    expect(out).toContain('LP 리바이벌')
    expect(out).toContain('3건')
    expect(out).toContain('수 18:00까지')
    expect(out).toContain('data-rationale-kind="trend"')
    expect(out).toContain('트렌드</span><span class="tabular-nums">2</span>')
    expect(out).toContain('시즌</span><span class="tabular-nums">1</span>')
    expect(out).toContain('border-dashed')
    expect(out).toContain('결정하기')
    expect(out).toContain('href="/admin/ops-inbox/b1"')
  })

  it('마감이 지났으면 「마감이 지났어요」다', () => {
    const out = flat(<OpsMyTurn cards={[card()]} now={new Date('2026-10-28T19:00:00+09:00')} />)
    expect(out).toContain('마감이 지났어요')
    expect(out).not.toContain('수 18:00까지')
  })

  it('상태는 점·아이콘·글자를 함께 쓰고 점은 화면 읽기에서 뺀다', () => {
    const out = flat(<OpsMyTurn cards={[card()]} now={NOW} />)
    expect(out).toContain('motion-safe:animate-pulse')
    expect(out).toContain('aria-hidden="true"')
    expect(out).toContain('<svg')
  })

  it('이유가 없으면 이유 줄이 없다', () => {
    const out = flat(<OpsMyTurn cards={[card({ reasonChips: [] })]} now={NOW} />)
    expect(out).not.toContain('트렌드')
  })
})

describe('문제 카드', () => {
  it('실패 항목 카드는 「문제」 + 「확인하기」이고 마감 줄이 없다', () => {
    const out = flat(
      <OpsMyTurn cards={[card({ id: 'failed:b1', kind: 'problem', reason: 'failed_items', count: 2, deadlineIso: null, reasonChips: [] })]} now={NOW} />
    )
    expect(out).toContain('문제')
    expect(out).toContain('2건')
    expect(out).toContain('확인하기')
    expect(out).not.toContain('결정하기')
    expect(out).not.toContain('까지')
    expect(out).toContain('border-destructive')
  })

  it('루틴 멈춤 카드는 「기획함 열기」이고 받은 기획함으로 간다', () => {
    const out = flat(
      <OpsMyTurn
        cards={[card({ id: 'stalled:s1', kind: 'problem', reason: 'routine_stalled', title: '루틴이 멈췄어요', count: 1, deadlineIso: null, reasonChips: [], href: '/admin/ops-inbox' })]}
        now={NOW}
      />
    )
    expect(out).toContain('루틴이 멈췄어요')
    expect(out).toContain('기획함 열기')
    expect(out).toContain('href="/admin/ops-inbox"')
  })
})

describe('카드 줄', () => {
  it('카드가 0장이면 한 줄 안내다', () => {
    const out = flat(<OpsMyTurn cards={[]} now={NOW} />)
    expect(out).toContain('내 차례인 일이 없어요')
    expect(out).not.toContain('<ul')
  })

  it('카드가 여럿이면 가로로 스크롤하는 목록이고 받은 순서를 지킨다', () => {
    const out = flat(<OpsMyTurn cards={[card({ id: 'a', title: '첫째' }), card({ id: 'b', title: '둘째' })]} now={NOW} />)
    expect(out).toContain('overflow-x-auto')
    expect(out.indexOf('첫째')).toBeLessThan(out.indexOf('둘째'))
  })

  it('시험 묶음 포함이면 링크에 sample=1이 이어진다', () => {
    const out = flat(<OpsMyTurn cards={[card()]} now={NOW} includeSample />)
    expect(out).toContain('href="/admin/ops-inbox/b1?sample=1"')
  })

  it('제목은 HTML로 해석되지 않는다', () => {
    const out = flat(<OpsMyTurn cards={[card({ title: '<img src=x onerror=alert(1)>' })]} now={NOW} />)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('한국어 줄바꿈 클래스가 있다', () => {
    expect(flat(<OpsMyTurn cards={[card()]} now={NOW} />)).toContain('break-keep wrap-break-word')
  })
})

describe('deadlineText', () => {
  it('마감을 읽을 수 없으면 null이다', () => {
    expect(deadlineText(null, NOW)).toBeNull()
    expect(deadlineText('not-a-date', NOW)).toBeNull()
  })
})
