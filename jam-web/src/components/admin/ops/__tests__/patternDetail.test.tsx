/**
 * 패턴 상세(S5 상세)의 렌더 (티켓 20261008_1435, 채원 판정 「⑨ 상세」)
 *
 * 저장소에 jsdom·testing-library가 없어(`patterns.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다.
 *
 * 지키는 것:
 * - 머리: 되돌아가기 링크·`P03 이름`·상태 칩·출처 글자(칩 아님)·쉬는 이유(쉬는 중만, 비었으면 「적지 않았어요」)
 * - 요약·손잡이·샘플·주의점: 값이 보이고, 깨진 JSONB는 칸마다 「적지 않았어요」·「역할 모름」·「목록에 없는 모양」으로 화면이 유지된다
 * - 취향 신호: 0건 문구, 추정/확정 칩, 확정일(KST), 근거 반려 기록 글자(링크 없음)
 * - 사용 이력: 요약 줄·줄(시각·종류·이름·상태 칩)·줄이 받은 기획함 항목으로 가는 링크·쪽 이동·빈 상태·실패(요약 「–」 + 안내)
 * - 결과 구역은 글자만(링크 없음), 레일에 목차·마지막 수정·만든 날이 있고 수정한 사람은 없다, actions 자리가 없으면 쓰기 버튼이 없고, 있으면 [수정하기](고치기 링크)와 [상태 바꾸기 ▾]가 머리 아래에 놓인다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-patterns/P03',
  useSearchParams: () => new URLSearchParams(''),
}))

import {
  OpsPatternDetailActions,
  OpsPatternDetailHeader,
  OpsPatternKnobsSection,
  OpsPatternPitfallsSection,
  OpsPatternRail,
  OpsPatternResultSection,
  OpsPatternSamplesSection,
  OpsPatternSignals,
  OpsPatternSummarySection,
  PATTERN_DETAIL_SECTIONS,
  PatternSection,
} from '../OpsPatternDetail'
import { OpsPatternUsage } from '../OpsPatternUsage'
import { selectPatternUsage, tasteSignalLines } from '@/lib/admin/opsPatterns/detailView'
import type { OpsPatternUsageRow } from '@/lib/admin/opsPatterns/draw'
import type { OpsPatternRecord, OpsTasteSignalRecord } from '@/lib/admin/opsPatterns/read'

const html = (node: ReactElement) => renderToStaticMarkup(node)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')

const KNOBS = {
  condition: { open: '비 오는 날', closed: '평일 낮' },
  place: { open: '카페', closed: '병원' },
  time: { open: '저녁', closed: '새벽' },
  reward: { open: '배지', closed: '현금' },
  tribe: { rule: '한 트라이브만', example: '야행성' },
}

function pattern(overrides: Partial<OpsPatternRecord> = {}): OpsPatternRecord {
  return {
    patternNo: 'P03',
    name: '비 오는 날 카페',
    principle: '비가 오면 카페에서 쓰는 배지를 연다',
    userExperience: '비 오는 날 알림을 받는다',
    menus: ['홈피드', '탐색'],
    samples: [
      { no: 2, name: '둘째 샘플', role: 'aux', impl: '보조 장치' },
      { no: 1, name: '첫째 샘플', role: 'main', impl: '본체' },
    ],
    cardShapes: [{ shape: 'hero', note: '큰 사진' }],
    knobs: KNOBS,
    pitfalls: '첫 줄\n둘째 줄',
    status: 'active',
    statusLabel: '사용 중',
    pauseReason: null,
    origin: 'seed',
    originItemId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-10-07T15:05:00.000Z',
    ...overrides,
  } as OpsPatternRecord
}

describe('머리', () => {
  it('되돌아가기 링크·번호와 이름·상태 칩·출처 글자(칩 아님)를 보인다', () => {
    const out = flat(<OpsPatternDetailHeader pattern={pattern()} />)
    expect(out).toContain('href="/admin/ops-patterns"')
    expect(out).toContain('패턴 사전')
    expect(out).toContain('<span class="tabular-nums">P03</span> 비 오는 날 카페')
    expect(out).toContain('사용 중')
    expect(out).toContain('tabler-icon-circle-check')
    expect(out).toContain('<p class="text-sm text-muted-foreground">출처: 원고 입력</p>')
    expect(out).not.toContain('쉬는 이유')
  })

  it('쉬는 중이면 쉬는 이유가, 비었으면 「적지 않았어요」가 보인다', () => {
    expect(flat(<OpsPatternDetailHeader pattern={pattern({ status: 'paused', pauseReason: '기능 대기' })} />)).toContain('쉬는 이유: 기능 대기')
    expect(flat(<OpsPatternDetailHeader pattern={pattern({ status: 'paused', pauseReason: null })} />)).toContain('쉬는 이유: 적지 않았어요')
  })

  it('출처는 세 값 모두 글자이고, 모르는 값은 「출처 확인 필요」다. 보관 패턴 머리도 그려진다', () => {
    expect(flat(<OpsPatternDetailHeader pattern={pattern({ origin: 'manual' })} />)).toContain('출처: 직접 만듦')
    expect(flat(<OpsPatternDetailHeader pattern={pattern({ origin: 'proposal' })} />)).toContain('출처: 제안 승인')
    expect(flat(<OpsPatternDetailHeader pattern={pattern({ origin: 'weird' as never })} />)).toContain('출처 확인 필요')
    expect(flat(<OpsPatternDetailHeader pattern={pattern({ status: 'archived' })} />)).toContain('보관')
  })

  it('이름은 HTML로 해석되지 않고, actions 자리를 안 주면 쓰기 버튼은 없다', () => {
    const out = html(<OpsPatternDetailHeader pattern={pattern({ name: '<img src=x onerror=alert(1)>' })} />)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(out).not.toContain('<button')
    expect(out).not.toContain('수정하기')
    expect(out).not.toContain('상태 바꾸기')
  })
})

describe('머리의 쓰기 버튼', () => {
  it('[수정하기]는 고치기 화면 링크이고 [상태 바꾸기 ▾]가 옆에 놓인다', () => {
    const record = pattern()
    const out = flat(<OpsPatternDetailHeader pattern={record} actions={<OpsPatternDetailActions pattern={record} />} />)
    expect(out).toMatch(/<a[^>]*href="\/admin\/ops-patterns\/P03\/edit"[^>]*>수정하기<\/a>/)
    expect(out).toContain('상태 바꾸기')
    expect(out.indexOf('수정하기')).toBeGreaterThan(out.indexOf('출처: 원고 입력'))
    expect(out.indexOf('상태 바꾸기')).toBeGreaterThan(out.indexOf('수정하기'))
  })

  it('쉬는 중·보관 패턴에도 같은 두 버튼이 놓인다', () => {
    for (const status of ['paused', 'archived'] as const) {
      const record = pattern({ status, pauseReason: status === 'paused' ? '기능 대기' : null })
      const out = flat(<OpsPatternDetailHeader pattern={record} actions={<OpsPatternDetailActions pattern={record} />} />)
      expect(out).toContain('수정하기')
      expect(out).toContain('상태 바꾸기')
    }
  })
})

describe('요약·손잡이·샘플·주의점', () => {
  it('요약: 작동 원리·유저가 겪는 것·메뉴(쉼표)·카드 모양과 메모', () => {
    const out = flat(<OpsPatternSummarySection pattern={pattern()} />)
    for (const text of ['작동 원리', '비가 오면 카페에서 쓰는 배지를 연다', '유저가 겪는 것', '쓰는 메뉴', '홈피드, 탐색', '카드 모양', 'hero', '큰 사진']) {
      expect(out).toContain(text)
    }
  })

  it('요약이 비면 칸마다 「적지 않았어요」다', () => {
    const out = flat(<OpsPatternSummarySection pattern={pattern({ principle: '', userExperience: '  ', menus: [], cardShapes: {} as never })} />)
    expect(out.match(/적지 않았어요/g)?.length).toBe(4)
  })

  it('손잡이: 5줄, 조건·장소·시간·보상은 「열 수 있는 값 | 닫은 값」, 트라이브는 「규칙 | 예시」', () => {
    const out = flat(<OpsPatternKnobsSection knobs={KNOBS} />)
    for (const text of ['조건', '장소', '시간', '보상', '트라이브', '비 오는 날', '평일 낮', '한 트라이브만', '야행성']) expect(out).toContain(text)
    expect(out.match(/열 수 있는 값/g)?.length).toBe(4)
    expect(out.match(/닫은 값/g)?.length).toBe(4)
    expect(out).toContain('규칙')
    expect(out).toContain('예시')
    expect(out.indexOf('조건')).toBeLessThan(out.indexOf('장소'))
    expect(out.indexOf('보상')).toBeLessThan(out.indexOf('트라이브'))
  })

  it('knobs가 깨져도 5줄이 유지되고 칸이 「적지 않았어요」다', () => {
    const out = flat(<OpsPatternKnobsSection knobs={'망가짐'} />)
    expect(out.match(/적지 않았어요/g)?.length).toBe(10)
    expect(out).toContain('트라이브')
  })

  it('샘플: 번호 순, 역할 이름, 표는 caption·scope="col", 40rem 미만은 카드 줄', () => {
    const out = flat(<OpsPatternSamplesSection samples={pattern().samples} />)
    expect(out.indexOf('첫째 샘플')).toBeLessThan(out.indexOf('둘째 샘플'))
    expect(out).toContain('<caption class="sr-only">패턴 샘플 목록</caption>')
    expect(out.match(/scope="col"/g)?.length).toBe(4)
    for (const text of ['번호', '이름', '역할', '구현', '본체', '보조 장치']) expect(out).toContain(text)
    expect(out).toContain('>주<')
    expect(out).toContain('>보조<')
    expect(out).toContain('@max-[40rem]:hidden')
    expect(out).toContain('hidden divide-y divide-border @max-[40rem]:block')
  })

  it('샘플이 깨지면 칸마다 문구가 나온다: 모르는 역할 · 빈 이름 · 배열이 아니면 구역 전체', () => {
    const broken = flat(<OpsPatternSamplesSection samples={[{ no: 1, name: '', role: 'boss', impl: 7 }]} />)
    expect(broken).toContain('역할 모름')
    expect(broken.match(/적지 않았어요/g)?.length).toBe(4) // 이름·구현 × 표·카드
    const notArray = flat(<OpsPatternSamplesSection samples={{ no: 1 }} />)
    expect(notArray).toContain('적지 않았어요')
    expect(notArray).not.toContain('<table')
  })

  it('카드 모양이 목록에 없으면 「목록에 없는 모양」이다', () => {
    const out = flat(<OpsPatternSummarySection pattern={pattern({ cardShapes: [{ shape: 'banner', note: '' }] as never })} />)
    expect(out).toContain('목록에 없는 모양')
  })

  it('주의점은 줄바꿈을 지키고(whitespace-pre-wrap) 비면 「적지 않았어요」다', () => {
    const out = flat(<OpsPatternPitfallsSection pitfalls={'첫 줄\n둘째 줄'} />)
    expect(out).toContain('whitespace-pre-wrap')
    expect(out).toContain('첫 줄\n둘째 줄')
    expect(flat(<OpsPatternPitfallsSection pitfalls="" />)).toContain('적지 않았어요')
  })

  it('구역 제목이 목차와 같은 순서·글자로 모두 있다', () => {
    expect(PATTERN_DETAIL_SECTIONS.map((section) => section.label)).toEqual(['요약', '손잡이', '샘플', '주의점', '취향 신호', '사용 이력', '결과'])
    const out = flat(
      <>
        <OpsPatternSummarySection pattern={pattern()} />
        <OpsPatternKnobsSection knobs={KNOBS} />
        <OpsPatternSamplesSection samples={pattern().samples} />
        <OpsPatternPitfallsSection pitfalls="x" />
        <PatternSection id="signals">
          <OpsPatternSignals signals={[]} />
        </PatternSection>
        <PatternSection id="usage">
          <OpsPatternUsage patternNo="P03" summary={null} lines={[]} page={1} />
        </PatternSection>
        <OpsPatternResultSection />
      </>
    )
    for (const section of PATTERN_DETAIL_SECTIONS) expect(out).toContain(`id="pattern-section-${section.id}"`)
    const positions = PATTERN_DETAIL_SECTIONS.map((section) => out.indexOf(`id="pattern-section-${section.id}"`))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
})

describe('취향 신호', () => {
  function signal(id: string, overrides: Partial<OpsTasteSignalRecord> = {}): OpsTasteSignalRecord {
    return { id, patternNo: 'P03', name: `${id} 이름`, reason: `${id} 이유`, basis: 'estimate', evidenceDecisionId: null, confirmedAt: null, sortOrder: 1, updatedAt: '2026-10-01T01:00:00+00:00', ...overrides }
  }

  it('0건이면 안내 한 줄이다', () => {
    expect(flat(<OpsPatternSignals signals={[]} />)).toContain('이 패턴에 정리된 취향 신호가 없어요')
  })

  it('추정/확정 칩과 이름·이유를 보이고, 확정이면 확정일(KST)이 붙는다', () => {
    const lines = tasteSignalLines(
      [signal('a'), signal('b', { basis: 'confirmed', confirmedAt: '2026-10-07T16:00:00.000Z' }), signal('c', { patternNo: 'P04' }), signal('d', { patternNo: null })],
      'P03'
    )
    const out = flat(<OpsPatternSignals signals={lines} />)
    expect(out).toContain('추정')
    expect(out).toContain('확정')
    expect(out).toContain('2026-10-08(KST)')
    expect(out).toContain('a 이름')
    expect(out).toContain('b 이유')
    expect(out).not.toContain('c 이름')
    expect(out).not.toContain('d 이름')
    expect(out.match(/\(KST\)/g)?.length).toBe(1)
  })

  it('근거 결정이 있으면 「근거 반려 기록 있음」 글자만 보이고 링크는 없다(⑩b)', () => {
    const lines = tasteSignalLines([signal('a', { evidenceDecisionId: '00000000-0000-4000-8000-000000000009' })], 'P03')
    const out = flat(<OpsPatternSignals signals={lines} />)
    expect(out).toContain('근거 반려 기록 있음')
    expect(out).not.toContain('<a ')
    expect(flat(<OpsPatternSignals signals={tasteSignalLines([signal('b')], 'P03')} />)).not.toContain('근거 반려 기록 있음')
  })

  it('이름·이유는 HTML로 해석되지 않는다', () => {
    const out = html(<OpsPatternSignals signals={tasteSignalLines([signal('a', { reason: '<b>굵게</b>' })], 'P03')} />)
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;b&gt;굵게&lt;/b&gt;')
  })
})

describe('사용 이력', () => {
  function usageRow(n: number, overrides: { title?: string; status?: string; startsAt?: string; patternNo?: string } = {}): OpsPatternUsageRow {
    return {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      bundle_id: `00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`,
      item_key: `item-${n}`,
      kind: 'home_feed_card',
      status: overrides.status ?? 'approved',
      starts_at: overrides.startsAt ?? `2026-10-${String(n).padStart(2, '0')}T03:00:00.000Z`,
      original: { pattern_no: overrides.patternNo ?? 'P03', copy: { title: overrides.title ?? `카드 ${n}` } },
      edited: null,
      ops_bundles: { is_sample: false, received_at: '2026-09-30T00:00:00.000Z' },
    }
  }

  const lines = (count: number) => selectPatternUsage(Array.from({ length: count }, (_, i) => usageRow(i + 1)), 'P03')

  it('요약 줄과 이력 줄(시각·종류·이름·상태 칩)을 보인다. 최신이 위다', () => {
    const out = flat(<OpsPatternUsage patternNo="P03" summary={{ uses: 2, lastUsedAt: '2026-10-03T03:00:00.000Z' }} lines={lines(3)} page={1} />)
    expect(out).toContain('최근 4주 2회 · 마지막 사용 2026-10-03 12:00')
    expect(out).toContain('<caption class="sr-only">패턴 사용 이력</caption>')
    expect(out.match(/scope="col"/g)?.length).toBe(4)
    for (const text of ['사용 시각', '종류', '이름', '상태', '홈피드 카드', '카드 1', '승인됨']) expect(out).toContain(text)
    expect(out.indexOf('카드 3')).toBeLessThan(out.indexOf('카드 2'))
    expect(out).toContain('@max-[40rem]:hidden')
    expect(out).toContain('hidden divide-y divide-border @max-[40rem]:block')
  })

  it('줄이 그 항목의 받은 기획함 상세로 가는 링크이고, 행 전체가 눌린다', () => {
    const out = flat(<OpsPatternUsage patternNo="P03" summary={{ uses: 1, lastUsedAt: '2026-10-01T03:00:00.000Z' }} lines={lines(1)} page={1} />)
    expect(out).toMatch(/href="\/admin\/ops-inbox\/00000000-0000-4000-8000-000000001001[^"]*"/)
    expect(out).toContain('after:absolute after:inset-0')
    expect(out).toContain('<tr class="relative ')
  })

  it('10건씩 나눠 보이고 쪽 이동 링크가 있다(1쪽에는 이전이 없고 마지막 쪽에는 다음이 없다)', () => {
    const all = lines(23)
    const first = flat(<OpsPatternUsage patternNo="P03" summary={{ uses: 23, lastUsedAt: null }} lines={all} page={1} />)
    expect(first.match(/<tr class="relative/g)?.length).toBe(10)
    expect(first).toContain('1 / 3쪽')
    expect(first).toContain('href="/admin/ops-patterns/P03?usagePage=2"')
    expect(first).not.toContain('이전')
    const last = flat(<OpsPatternUsage patternNo="P03" summary={{ uses: 23, lastUsedAt: null }} lines={all} page={3} />)
    expect(last.match(/<tr class="relative/g)?.length).toBe(3)
    expect(last).toContain('3 / 3쪽')
    expect(last).toContain('href="/admin/ops-patterns/P03?usagePage=2"')
    expect(last).not.toContain('다음')
    const middle = flat(<OpsPatternUsage patternNo="P03" summary={{ uses: 23, lastUsedAt: null }} lines={all} page={2} />)
    expect(middle).toContain('href="/admin/ops-patterns/P03"') // 이전(1쪽)은 쿼리가 없다
    expect(middle).toContain('href="/admin/ops-patterns/P03?usagePage=3"')
  })

  it('한 쪽이면 쪽 이동이 없다', () => {
    expect(flat(<OpsPatternUsage patternNo="P03" summary={{ uses: 3, lastUsedAt: null }} lines={lines(3)} page={1} />)).not.toContain('쪽 이동')
  })

  it('0건이면 「아직 이 패턴을 쓴 기록이 없어요」와 「쓴 적 없어요」다', () => {
    const out = flat(<OpsPatternUsage patternNo="P03" summary={{ uses: 0, lastUsedAt: null }} lines={[]} page={1} />)
    expect(out).toContain('최근 4주 0회 · 쓴 적 없어요')
    expect(out).toContain('아직 이 패턴을 쓴 기록이 없어요')
    expect(out).not.toContain('<table')
  })

  it('읽기 실패는 0이 아니라 요약 「–」 + 「사용 기록을 읽지 못했어요」 안내다', () => {
    const out = flat(<OpsPatternUsage patternNo="P03" summary={null} lines={null} page={1} />)
    expect(out).toContain('최근 4주 – · 마지막 사용 –')
    expect(out).toContain('사용 기록을 읽지 못했어요')
    expect(out).not.toContain('0회')
    expect(out).not.toContain('아직 이 패턴을 쓴 기록이 없어요')
    expect(out).not.toContain('<table')
  })

  it('항목 이름은 HTML로 해석되지 않는다', () => {
    const rows = [usageRow(1, { title: '<img src=x onerror=alert(1)>' })]
    const out = html(<OpsPatternUsage patternNo="P03" summary={null} lines={selectPatternUsage(rows, 'P03')} page={1} />)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('결과 구역·레일', () => {
  it('결과 구역은 글자만이고 링크가 없다', () => {
    const out = flat(<OpsPatternResultSection />)
    expect(out).toContain('결과와 기록에서 봐요')
    expect(out).not.toContain('<a ')
    expect(out).not.toContain('href=')
  })

  it('레일에 목차 7개·마지막 수정(KST)·만든 날이 있고 수정한 사람은 없다', () => {
    const out = flat(<OpsPatternRail pattern={pattern()} />)
    expect(out).toContain('목차')
    for (const section of PATTERN_DETAIL_SECTIONS) expect(out).toContain(`href="#pattern-section-${section.id}"`)
    expect(out).toContain('마지막 수정')
    expect(out).toContain('2026-10-08 00:05')
    expect(out).toContain('만든 날')
    expect(out).toContain('2026-09-01')
    for (const hidden of ['수정한 사람', '수정자', 'updated_by', 'updatedBy']) expect(out).not.toContain(hidden)
  })
})
