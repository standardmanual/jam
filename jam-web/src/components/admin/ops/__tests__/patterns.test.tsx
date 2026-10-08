/**
 * 패턴 사전(S5) 목록·공통 탭·승인 대기 제안 줄의 렌더 (티켓 20261008_1400, 채원 판정 「⑨ 목록」)
 *
 * 저장소에 jsdom·testing-library가 없어(`home.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다.
 *
 * 지키는 것:
 * - 목록: 상태 필터 개수·링크(보관은 전체에서 빠지고 필터로 보임), 표 머리(`caption`·`scope="col"`), 번호 순서, 쉬는 이유, 「쓴 적 없어요」, 표 아래 안내
 * - 못 읽은 재료는 0이 아니다: 사용 기록 실패는 「–」 + 「사용 기록을 읽지 못했어요」, 샘플이 깨지면 「모름」, 취향 신호 실패는 「–」
 * - 빈 상태: 사전 0건 · 필터 0건 + [전체 보기]
 * - 행마다 상세 링크가 하나(표·카드 각각, 이름이 링크이고 행 전체가 눌린다), 쓰기 버튼이 없다, 이름·이유는 HTML로 해석되지 않는다
 * - 제안 줄: N건 + 「결정할 것」 탭 링크, 0건은 링크 없는 muted 한 줄, 실패는 0건이 아니라 「읽지 못했어요」
 * - 공통 탭: 규칙 번호·제목·본문, 긴 본문의 [전체 보기], 취향 신호 칩(추정/확정)·이름·이유, 구역별 실패 격리, 빈 상태
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-patterns',
  useSearchParams: () => new URLSearchParams(''),
}))

import { OpsCommonRulesView, isLongRuleBody } from '../OpsCommonRulesView'
import { OpsPatternList } from '../OpsPatternList'
import { OpsPatternProposalsStrip } from '../OpsPatternProposalsStrip'
import { buildPatternRows, type PatternListRow } from '@/lib/admin/opsPatterns/listView'
import type { OpsCommonRuleRecord, OpsPatternRecord, OpsTasteSignalRecord } from '@/lib/admin/opsPatterns/read'

const html = (node: ReactElement) => renderToStaticMarkup(node)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')

function row(patternNo: string, overrides: Partial<PatternListRow> = {}): PatternListRow {
  return {
    patternNo,
    name: `${patternNo} 이름`,
    status: 'active',
    pauseReason: null,
    uses: 1,
    lastUsedAt: '2026-10-01T00:00:00.000Z',
    sampleCount: 2,
    estimateCount: 0,
    confirmedCount: 0,
    ...overrides,
  }
}

const ROWS: PatternListRow[] = [
  row('P01'),
  row('P02', { uses: 0, lastUsedAt: null, estimateCount: 3, confirmedCount: 1 }),
  row('P14', { status: 'paused', pauseReason: '필요한 기능 O12·O14 대기', uses: 0, lastUsedAt: null, estimateCount: 3 }),
  row('P20', { status: 'archived', name: '보관한 패턴' }),
]

describe('OpsPatternList — 목록', () => {
  it('상태 필터는 개수와 링크를 보인다(전체는 보관을 뺀다)', () => {
    const out = flat(<OpsPatternList rows={ROWS} status="all" />)
    expect(out).toContain('전체 <span class="ml-1 tabular-nums">3</span>')
    expect(out).toContain('사용 중 <span class="ml-1 tabular-nums">2</span>')
    expect(out).toContain('쉬는 중 <span class="ml-1 tabular-nums">1</span>')
    expect(out).toContain('보관 <span class="ml-1 tabular-nums">1</span>')
    expect(out).toContain('href="/admin/ops-patterns?status=paused"')
    expect(out).toContain('href="/admin/ops-patterns?status=archived"')
    expect(out).toContain('href="/admin/ops-patterns"')
    expect(out).toContain('aria-current="page"')
  })

  it('기본(전체)은 보관을 숨기고, 보관 필터에서만 보인다', () => {
    expect(flat(<OpsPatternList rows={ROWS} status="all" />)).not.toContain('보관한 패턴')
    const archived = flat(<OpsPatternList rows={ROWS} status="archived" />)
    expect(archived).toContain('보관한 패턴')
    expect(archived).not.toContain('P01 이름')
  })

  it('번호 순서를 그대로 그린다', () => {
    const out = flat(<OpsPatternList rows={ROWS} status="all" />)
    expect(out.indexOf('P01 이름')).toBeLessThan(out.indexOf('P02 이름'))
    expect(out.indexOf('P02 이름')).toBeLessThan(out.indexOf('P14 이름'))
  })

  it('표는 caption(sr-only)과 scope="col" 머리를 갖고, 40rem 미만에는 카드 목록으로 바뀐다', () => {
    const out = html(<OpsPatternList rows={ROWS} status="all" />)
    expect(out).toContain('<caption class="sr-only">패턴 사전 목록</caption>')
    expect(out.match(/scope="col"/g)?.length).toBe(7)
    for (const heading of ['번호', '이름', '상태', '최근 4주', '마지막 사용', '샘플', '취향 신호']) expect(out).toContain(heading)
    expect(out).toContain('@max-[40rem]:hidden')
    expect(out).toContain('hidden divide-y divide-border @max-[40rem]:block')
    expect(out).toContain('tabular-nums')
  })

  it('쉬는 중이면 이름 아래에 쉬는 이유가 보이고, 사용 중에는 없다', () => {
    const out = flat(<OpsPatternList rows={ROWS} status="all" />)
    expect(out).toContain('쉬는 이유: 필요한 기능 O12·O14 대기')
    expect(out.match(/쉬는 이유:/g)?.length).toBe(2) // 표 + 카드
    expect(flat(<OpsPatternList rows={[row('P03', { status: 'paused', pauseReason: null })]} status="all" />)).toContain('쉬는 이유: 적지 않았어요')
  })

  it('마지막 사용: 쓴 적 없으면 「쓴 적 없어요」, 있으면 KST 날짜, 최근 4주는 「N회」', () => {
    const out = flat(<OpsPatternList rows={ROWS} status="all" />)
    expect(out).toContain('쓴 적 없어요')
    expect(out).toContain('10/1(목)')
    expect(out).toContain('1회')
    expect(out).toContain('0회')
  })

  it('취향 신호는 있는 것만 「추정 N · 확정 N」으로 잇고 샘플 수를 보인다', () => {
    const out = flat(<OpsPatternList rows={ROWS} status="all" />)
    expect(out).toContain('추정 3 · 확정 1')
    expect(out).toContain('추정 3')
    expect(out).toContain('없어요')
  })

  it('표 아래에 세기 기준 안내가 있다', () => {
    expect(flat(<OpsPatternList rows={ROWS} status="all" />)).toContain('최근 4주 사용은 시험 묶음을 세지 않아요. 조합 뽑기와 같은 기준이에요')
  })

  it('상태 칩은 아이콘과 글자다', () => {
    const out = flat(<OpsPatternList rows={ROWS} status="all" />)
    expect(out).toContain('tabler-icon-circle-check')
    expect(out).toContain('tabler-icon-player-pause')
    expect(flat(<OpsPatternList rows={ROWS} status="archived" />)).toContain('tabler-icon-archive')
  })

  it('못 읽은 재료는 0이 아니다: 사용 기록 실패는 「–」와 안내, 샘플이 깨지면 「모름」, 취향 신호 실패는 「–」', () => {
    const patterns = [
      {
        patternNo: 'P01',
        name: '첫째',
        samples: 'broken',
        status: 'active',
        pauseReason: null,
      },
    ] as unknown as OpsPatternRecord[]
    const rows = buildPatternRows(patterns, null, null)
    const out = flat(<OpsPatternList rows={rows} status="all" usageFailed />)
    expect(out).toContain('사용 기록을 읽지 못했어요')
    expect(out).not.toContain('0회')
    expect(out).not.toContain('쓴 적 없어요')
    expect(out).toContain('모름')
    expect(out).toContain('>–<')
    expect(flat(<OpsPatternList rows={ROWS} status="all" />)).not.toContain('사용 기록을 읽지 못했어요')
  })

  it('모르는 상태 값은 「상태 확인 필요」 칩이다', () => {
    expect(flat(<OpsPatternList rows={[row('P05', { status: 'weird' })]} status="all" />)).toContain('상태 확인 필요')
  })

  it('빈 상태: 사전 0건은 「아직 패턴이 없어요」, 필터 0건은 「이 상태의 패턴이 없어요」 + [전체 보기]', () => {
    const empty = flat(<OpsPatternList rows={[]} status="all" />)
    expect(empty).toContain('아직 패턴이 없어요')
    expect(empty).not.toContain('<table')
    const filtered = flat(<OpsPatternList rows={[row('P01')]} status="paused" />)
    expect(filtered).toContain('이 상태의 패턴이 없어요')
    expect(filtered).toContain('전체 보기')
    expect(filtered).not.toContain('<table')
    expect(flat(<OpsPatternList rows={[row('P20', { status: 'archived' })]} status="all" />)).not.toContain('전체 보기')
  })

  it('행마다 상세 링크가 하나다(표·카드 각각) · 쓰기 버튼이 없다 · 이름은 HTML로 해석되지 않는다', () => {
    const out = html(<OpsPatternList rows={[row('P01', { name: '<img src=x onerror=alert(1)>' })]} status="all" />)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
    const body = out.slice(out.indexOf('<table'))
    expect(body.match(/<button/g)).toBeNull()
    expect(body.match(/href="\/admin\/ops-patterns\/P01"/g)?.length).toBe(2) // 표 행 1 + 카드 줄 1
    expect(out).not.toContain('새 패턴 만들기')
  })

  it('이름이 링크이고 행 전체가 눌린다(행 relative + after:absolute after:inset-0). 보관 패턴도 번호로 연다', () => {
    const out = html(<OpsPatternList rows={[row('P01'), row('P20', { status: 'archived' })]} status="archived" />)
    expect(out).toContain('href="/admin/ops-patterns/P20"')
    expect(out).not.toContain('href="/admin/ops-patterns/P01"')
    expect(out).toContain('after:absolute after:inset-0')
    expect(out).toContain('<tr class="relative ')
    expect(out).toContain('<li class="relative ')
    // 링크 글자는 이름이고, 번호·숫자 칸은 링크 밖이다.
    expect(flat(<OpsPatternList rows={[row('P01')]} status="all" />)).toMatch(/<a [^>]*href="\/admin\/ops-patterns\/P01"[^>]*>P01 이름<\/a>/)
  })
})

describe('OpsPatternProposalsStrip — 승인 대기 제안', () => {
  it('N건이면 건수와 받은 기획함 「결정할 것」 탭 링크를 보인다', () => {
    const out = flat(<OpsPatternProposalsStrip count={2} />)
    expect(out).toContain('승인 대기 제안 2건')
    expect(out).toContain('받은 기획함에서 승인해요')
    expect(out).toContain('href="/admin/ops-inbox?tab=decide"')
    expect(out).toContain('받은 기획함으로')
  })

  it('0건이면 링크 없는 muted 한 줄이다', () => {
    const out = flat(<OpsPatternProposalsStrip count={0} />)
    expect(out).toContain('승인 대기 제안이 없어요')
    expect(out).toContain('text-muted-foreground')
    expect(out).not.toContain('<a ')
  })

  it('못 읽었으면 0건이 아니라 「읽지 못했어요」다', () => {
    const out = flat(<OpsPatternProposalsStrip count={null} />)
    expect(out).toContain('승인 대기 제안을 읽지 못했어요')
    expect(out).not.toContain('승인 대기 제안이 없어요')
    expect(out).not.toContain('<a ')
  })
})

function rule(ruleNo: number, overrides: Partial<OpsCommonRuleRecord> = {}): OpsCommonRuleRecord {
  return { ruleNo, title: `규칙 ${ruleNo} 제목`, body: `규칙 ${ruleNo} 본문`, updatedAt: '2026-10-01T00:00:00.000Z', ...overrides }
}

function signal(id: string, patternNo: string | null, basis: 'estimate' | 'confirmed'): OpsTasteSignalRecord {
  return { id, patternNo, name: `${id} 이름`, reason: `${id} 이유`, basis, evidenceDecisionId: null, confirmedAt: null, sortOrder: 1, updatedAt: '2026-10-01T01:00:00+00:00' }
}

describe('OpsCommonRulesView — 공통 탭', () => {
  const rules = Array.from({ length: 7 }, (_, index) => rule(index + 1))

  it('공통 규칙 7개를 번호·제목·본문과 함께 보인다', () => {
    const out = flat(<OpsCommonRulesView rules={rules} signals={[]} />)
    expect(out).toContain('공통 규칙 7')
    expect(out).toContain('모든 패턴에 적용돼요')
    for (let n = 1; n <= 7; n++) {
      expect(out).toContain(`규칙 ${n} 제목`)
      expect(out).toContain(`규칙 ${n} 본문`)
    }
    expect(out).toContain('whitespace-pre-wrap')
  })

  it('긴 본문만 3줄로 줄이고 [전체 보기]를 둔다', () => {
    const long = '가'.repeat(200)
    expect(isLongRuleBody(long)).toBe(true)
    expect(isLongRuleBody('a\nb\nc\nd')).toBe(true)
    expect(isLongRuleBody('짧은 본문')).toBe(false)
    const out = flat(<OpsCommonRulesView rules={[rule(1, { body: long }), rule(2)]} signals={[]} />)
    expect(out.match(/line-clamp-3/g)?.length).toBe(1)
    expect(out.match(/전체 보기/g)?.length).toBe(1)
    expect(out).toContain('aria-expanded="false"')
  })

  it('공통 취향 신호만 보이고(패턴에 묶인 것은 빠진다) 추정/확정 칩 · 이름 · 이유를 낸다', () => {
    const out = flat(
      <OpsCommonRulesView rules={rules} signals={[signal('a', null, 'estimate'), signal('b', null, 'confirmed'), signal('c', 'P01', 'confirmed')]} />
    )
    expect(out).toContain('공통 취향 신호 2')
    expect(out).toContain('어느 패턴에도 묶이지 않은 방향이에요')
    expect(out).toContain('a 이름')
    expect(out).toContain('a 이유')
    expect(out).toContain('b 이름')
    expect(out).not.toContain('c 이름')
    expect(out).toContain('추정')
    expect(out).toContain('확정')
    expect(out).toContain('border-dashed')
  })

  it('취향 신호가 0건이면 「정리된 취향 신호가 없어요」다', () => {
    expect(flat(<OpsCommonRulesView rules={rules} signals={[signal('c', 'P01', 'estimate')]} />)).toContain('정리된 취향 신호가 없어요')
  })

  it('한 구역이 실패해도 다른 구역은 보이고 실패가 0으로 보이지 않는다', () => {
    const rulesFailed = flat(<OpsCommonRulesView rules={null} signals={[signal('a', null, 'estimate')]} />)
    expect(rulesFailed).toContain('공통 규칙을 불러오지 못했어요')
    expect(rulesFailed).not.toContain('공통 규칙 0')
    expect(rulesFailed).toContain('a 이름')
    const signalsFailed = flat(<OpsCommonRulesView rules={rules} signals={null} />)
    expect(signalsFailed).toContain('공통 취향 신호를 불러오지 못했어요')
    expect(signalsFailed).not.toContain('정리된 취향 신호가 없어요')
    expect(signalsFailed).toContain('규칙 1 제목')
  })

  it('읽기만 한다: 고치기·확정하기 버튼이 없고 글은 HTML로 해석되지 않는다', () => {
    const out = html(<OpsCommonRulesView rules={[rule(1, { title: '<b>굵게</b>' })]} signals={[]} />)
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;b&gt;굵게&lt;/b&gt;')
    expect(out).not.toContain('고치기')
    expect(out).not.toContain('확정하기')
  })
})
