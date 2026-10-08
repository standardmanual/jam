/**
 * 취향 신호·공통 규칙 줄 안 편집의 렌더 (티켓 20261008_1754 ⑩b-2, 채원 판정 승인 16~19)
 *
 * 저장소에 jsdom이 없어(`patternStatusMenu.test.tsx`와 같은 방식) 서버 렌더로 처음 그린 모양을 고정한다:
 * - 버튼 글자: 추정 [이유 고치고 확정하기] / 확정 [이유·근거 고치기], 공통 신호는 근거가 없어 확정 뒤 [이유 고치기]
 * - 펼침: 이유 칸에 원문, 추정 [확정하기] / 확정 [저장하기] + [취소], 추정으로 되돌리는 버튼 없음
 * - 근거 묶음: 머리글(건수)·「근거 없이 확정」 기본·「지금 붙은 근거 유지」·반려 줄(날짜·문장·이름·이유·[기획 보기] label 밖)·더 보기·0건·읽기 실패
 * - 공통 신호는 근거 묶음이 없다. 공통 규칙은 [고치기] → 칸 두 개, 고친 칸이 없으면 [저장하기]가 꺼지고, 확인창 문장
 * 읽기 요청과 저장 본문은 `tasteClient.test.ts`·`tasteDraft.test.ts`가 본다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-patterns/P03',
  useSearchParams: () => new URLSearchParams(''),
}))

import { OpsCommonRuleEditPanel, OpsCommonRuleConfirm, OpsCommonRuleItem } from '../OpsCommonRuleEditor'
import { OpsEvidencePicker, type OpsEvidencePickerProps } from '../OpsEvidencePicker'
import { OpsTasteSignalList, OpsTasteSignalRow } from '../OpsTasteSignalEditor'
import { toTasteSignalLine } from '@/lib/admin/opsPatterns/detailView'
import type { OpsCommonRuleRecord, OpsTasteSignalRecord } from '@/lib/admin/opsPatterns/read'
import type { OpsPatternRejectionRecord } from '@/lib/admin/opsPatterns/tasteWrite'

const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')
const inDialog = (node: ReactElement) => flat(<AlertDialog open>{node}</AlertDialog>)
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)
const noop = () => {}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function signal(overrides: Partial<OpsTasteSignalRecord> = {}): OpsTasteSignalRecord {
  return {
    id: 's1',
    patternNo: 'P03',
    name: '조용한 방향',
    reason: '원문 이유',
    basis: 'estimate',
    evidenceDecisionId: null,
    confirmedAt: null,
    sortOrder: 1,
    updatedAt: '2026-10-08T07:05:00.123456+00:00',
    ...overrides,
  }
}

function rejection(n: number, overrides: Partial<OpsPatternRejectionRecord> = {}): OpsPatternRejectionRecord {
  return {
    id: uuid(n),
    createdAt: '2026-10-07T16:30:00.000Z',
    actorType: 'admin',
    agentName: null,
    bundleId: uuid(100 + n),
    itemId: uuid(200 + n),
    itemName: `문안 ${n}`,
    reason: `반려 이유 ${n}`,
    ...overrides,
  }
}

function row(record: OpsTasteSignalRecord, patternNo: string | null, open: boolean) {
  return flat(
    <ul>
      <OpsTasteSignalRow signal={toTasteSignalLine(record)} patternNo={patternNo} open={open} onOpen={noop} onClose={noop} />
    </ul>
  )
}

function picker(extra: Partial<OpsEvidencePickerProps> = {}) {
  return flat(
    <OpsEvidencePicker
      state={{ status: 'ready', data: { rejections: [rejection(1), rejection(2)], hasMore: false, total: 2 } }}
      attachedId={null}
      choice=""
      onChoice={noop}
      onRetry={noop}
      onMore={noop}
      idPrefix="t"
      {...extra}
    />
  )
}

describe('취향 신호 줄 — 닫힌 모양', () => {
  it('추정이면 [이유 고치고 확정하기], 확정이면 [이유·근거 고치기]이고 편집 영역은 없다', () => {
    const estimate = row(signal(), 'P03', false)
    expect(estimate).toContain('>이유 고치고 확정하기</button>')
    expect(estimate).toContain('aria-expanded="false"')
    expect(estimate).not.toContain('<textarea')
    const confirmed = row(signal({ basis: 'confirmed', confirmedAt: '2026-10-07T16:00:00.000Z' }), 'P03', false)
    expect(confirmed).toContain('>이유·근거 고치기</button>')
    expect(confirmed).toContain('2026-10-08(KST)')
  })

  it('공통 신호는 확정 뒤 [이유 고치기]다', () => {
    expect(row(signal({ patternNo: null, basis: 'confirmed', confirmedAt: '2026-10-07T16:00:00.000Z' }), null, false)).toContain('>이유 고치기</button>')
    expect(row(signal({ patternNo: null }), null, false)).toContain('>이유 고치고 확정하기</button>')
  })

  it('한 번에 한 줄만 펼친다: 목록은 처음에 모든 줄이 닫혀 있다', () => {
    const lines = [signal({ id: 'a' }), signal({ id: 'b' })].map(toTasteSignalLine)
    const out = flat(<OpsTasteSignalList signals={lines} patternNo="P03" />)
    expect(out.match(/aria-expanded="false"/g)?.length).toBe(2)
    expect(out).not.toContain('<textarea')
  })
})

describe('취향 신호 줄 — 펼친 모양', () => {
  it('이유 칸에 원문이 채워지고 추정이면 [확정하기]·[취소]다', () => {
    const out = row(signal(), 'P03', true)
    expect(out).toContain('aria-expanded="true"')
    expect(out).toMatch(/<textarea[^>]*>원문 이유<\/textarea>/)
    expect(out).toContain('>확정하기</button>')
    expect(out).toContain('>취소</button>')
    expect(out).not.toContain('>저장하기</button>')
  })

  it('확정이면 [저장하기]이고 추정으로 되돌리는 버튼은 없다', () => {
    const out = row(signal({ basis: 'confirmed', confirmedAt: '2026-10-07T16:00:00.000Z' }), 'P03', true)
    expect(out).toContain('>저장하기</button>')
    expect(out).not.toContain('>확정하기</button>')
    expect(out).not.toContain('추정으로')
    expect(out).not.toContain('되돌리')
  })

  it('이유가 비어 있으면(원문 없음) 주 버튼이 꺼진다', () => {
    const out = row(signal({ reason: '' }), 'P03', true)
    expect(isDisabled(buttonOf(out, '확정하기'))).toBe(true)
    expect(isDisabled(buttonOf(row(signal(), 'P03', true), '확정하기'))).toBe(false)
  })

  it('패턴 줄은 근거 묶음이 있고, 읽기 전에는 「근거 없이 확정」이 기본 선택이다', () => {
    const out = row(signal(), 'P03', true)
    expect(out).toContain('<fieldset')
    expect(out).toContain('근거 없이 확정')
    expect(out).toMatch(/value=""[^>]*checked|checked=""[^>]*value=""/)
    expect(out).toContain('반려 기록을 불러오는 중이에요')
  })

  it('확정 신호의 근거가 목록에 없으면 「지금 붙은 근거 유지」가 맨 위에 있고 선택돼 있다', () => {
    const out = row(signal({ basis: 'confirmed', confirmedAt: '2026-10-07T16:00:00.000Z', evidenceDecisionId: uuid(9) }), 'P03', true)
    expect(out.indexOf('지금 붙은 근거 유지')).toBeGreaterThan(-1)
    expect(out.indexOf('지금 붙은 근거 유지')).toBeLessThan(out.indexOf('근거 없이 확정'))
    expect(out).toMatch(new RegExp(`value="${uuid(9)}"[^>]*checked|checked=""[^>]*value="${uuid(9)}"`))
  })

  it('공통 신호는 근거 묶음이 없다', () => {
    const out = row(signal({ patternNo: null }), null, true)
    expect(out).toContain('<textarea')
    expect(out).not.toContain('<fieldset')
    expect(out).not.toContain('근거 없이 확정')
    expect(out).not.toContain('type="radio"')
    expect(out).toContain('>확정하기</button>')
  })

  it('한국어 줄바꿈 설정이 붙는다(§3.2)', () => {
    const out = row(signal(), 'P03', true)
    expect(out).toContain('break-keep')
    expect(out).toContain('wrap-break-word')
    expect(out).toContain('whitespace-nowrap')
  })
})

describe('근거 묶음', () => {
  it('머리글에 건수, 반려 줄에 날짜(KST)·결정 문장·항목 이름·이유가 있다', () => {
    const out = picker()
    expect(out).toContain('같은 패턴 항목의 반려 기록 2건 — 근거로 붙일 수 있어요(선택)')
    expect(out).toContain('2026-10-08')
    expect(out).toContain('관리자가 반려했어요')
    expect(out).toContain('문안 1')
    expect(out).toContain('반려 이유 1')
    expect(out.match(/type="radio"/g)?.length).toBe(3)
  })

  it('[기획 보기] 링크는 라디오 label 밖에 있다', () => {
    const out = picker()
    expect(out.match(/기획 보기/g)?.length).toBe(2)
    for (const labelHtml of out.match(/<label[\s\S]*?<\/label>/g) ?? []) expect(labelHtml).not.toContain('기획 보기')
    expect(out).toContain(`href="/admin/ops-inbox`)
  })

  it('반려 이유가 없으면 이유 줄을 생략한다', () => {
    const out = picker({ state: { status: 'ready', data: { rejections: [rejection(1, { reason: null })], hasMore: false, total: 1 } } })
    expect(out).toContain('문안 1')
    expect(out).not.toContain('반려 이유')
  })

  it('선택한 결정의 라디오가 checked이고, 목록에 있으면 「지금 붙은 근거 유지」는 나오지 않는다', () => {
    const out = picker({ attachedId: uuid(2), choice: uuid(2) })
    expect(out).not.toContain('지금 붙은 근거 유지')
    expect(out).toMatch(new RegExp(`value="${uuid(2)}"[^>]*checked|checked=""[^>]*value="${uuid(2)}"`))
  })

  it('hasMore이면 [더 보기]가 있고, 아니면 없다', () => {
    expect(picker()).not.toContain('>더 보기</button>')
    const more = picker({ state: { status: 'ready', data: { rejections: [rejection(1)], hasMore: true, total: 15 } } })
    expect(more).toContain('>더 보기</button>')
    expect(isDisabled(buttonOf(picker({ state: { status: 'ready', data: { rejections: [rejection(1)], hasMore: true, total: 15 } }, moreLoading: true }), '더 보기'))).toBe(true)
    expect(picker({ state: { status: 'ready', data: { rejections: [rejection(1)], hasMore: true, total: 15 } }, moreFailed: true })).toContain('반려 기록을 불러오지 못했어요')
  })

  it('0건이면 안내 문장이 있고 「근거 없이 확정」은 계속 고를 수 있다', () => {
    const out = picker({ state: { status: 'ready', data: { rejections: [], hasMore: false, total: 0 } } })
    expect(out).toContain('붙일 반려 기록이 없어요. 근거 없이 확정할 수 있어요')
    expect(out).toContain('근거 없이 확정')
    expect(out).toContain('0건')
  })

  it('읽기 실패는 줄 안 문장 + [다시 시도]이고 「근거 없이 확정」은 계속 고를 수 있다', () => {
    const out = picker({ state: { status: 'failed' } })
    expect(out).toContain('반려 기록을 불러오지 못했어요')
    expect(out).toContain('>다시 시도</button>')
    expect(out).toContain('근거 없이 확정')
    expect(isDisabled(buttonOf(out, '다시 시도'))).toBe(false)
  })

  it('서버가 근거를 거절한 문장은 묶음 아래에 보인다', () => {
    const out = picker({ error: '이 패턴의 반려 기록만 근거로 붙일 수 있어요.' })
    expect(out).toContain('이 패턴의 반려 기록만 근거로 붙일 수 있어요.')
    expect(out).toContain('aria-describedby="t-evidence-error"')
  })

  it('반려 이유는 HTML로 해석되지 않는다', () => {
    const out = renderToStaticMarkup(
      <OpsEvidencePicker
        state={{ status: 'ready', data: { rejections: [rejection(1, { reason: '<b>굵게</b>' })], hasMore: false, total: 1 } }}
        attachedId={null}
        choice=""
        onChoice={noop}
        onRetry={noop}
        onMore={noop}
        idPrefix="t"
      />
    )
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;b&gt;굵게&lt;/b&gt;')
  })
})

describe('공통 규칙 고치기', () => {
  const rule: OpsCommonRuleRecord = { ruleNo: 3, title: '규칙 제목', body: '규칙 본문', updatedAt: '2026-10-08T07:05:00.123456+00:00' }

  it('닫힌 규칙은 번호·제목과 [고치기]만 있고 추가·삭제 버튼은 없다', () => {
    const out = flat(
      <ol>
        <OpsCommonRuleItem rule={rule}>
          <p>읽기 본문</p>
        </OpsCommonRuleItem>
      </ol>
    )
    expect(out).toContain('규칙 제목')
    expect(out).toContain('읽기 본문')
    expect(out).toContain('>고치기</button>')
    expect(out).not.toContain('<textarea')
    expect(out).not.toContain('삭제')
    expect(out).not.toContain('추가')
  })

  it('펼치면 제목·본문 칸에 현재 값이 채워지고, 고친 칸이 없으면 [저장하기]가 꺼지며 「저장 전」 칩이 없다', () => {
    const out = flat(<OpsCommonRuleEditPanel rule={rule} panelId="r" onClosed={noop} onSaved={noop} />)
    expect(out).toContain('value="규칙 제목"')
    expect(out).toMatch(/<textarea[^>]*>규칙 본문<\/textarea>/)
    expect(isDisabled(buttonOf(out, '저장하기'))).toBe(true)
    expect(out).toContain('>취소</button>')
    expect(out).not.toContain('저장 전')
  })

  it('한국어 줄바꿈 설정이 붙는다(§3.2)', () => {
    const out = flat(<OpsCommonRuleEditPanel rule={rule} panelId="r" onClosed={noop} onSaved={noop} />)
    expect(out).toContain('break-keep')
    expect(out).toContain('wrap-break-word')
  })

  it('저장 확인창은 모든 패턴에 적용되고 이전 내용이 남지 않는다고 알린다', () => {
    const out = inDialog(<OpsCommonRuleConfirm pending={false} onConfirm={noop} onCancel={noop} />)
    expect(out).toContain('이 공통 규칙을 저장할까요?')
    expect(out).toContain('모든 패턴에 적용되는 규칙이에요. 저장하면 에이전트가 바로 새 내용을 읽고, 이전 내용은 남지 않아요')
    expect(out).toContain('>저장하기</button>')
    expect(out).toContain('>취소</button>')
  })

  it('저장하는 동안 확인 버튼 글자는 「저장하는 중」이다', () => {
    expect(inDialog(<OpsCommonRuleConfirm pending onConfirm={noop} onCancel={noop} />)).toContain('저장하는 중')
  })
})
