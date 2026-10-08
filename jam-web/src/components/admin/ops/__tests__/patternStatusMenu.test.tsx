/**
 * 패턴 상태 바꾸기 메뉴의 렌더 (티켓 20261008_1617 ⑩a-2, 채원 판정 승인 12)
 *
 * 저장소에 jsdom이 없어(`endItem.test.tsx`와 같은 방식) 서버 렌더로 처음 그린 모양을 고정한다:
 * - 상태별 항목(사용 중 / 쉬는 중 / 보관)과 항목마다의 확인창 문구, 메뉴는 처음에 닫혀 있다
 * - 쉬게 하기·쉬는 이유 고치기: 이유 칸이 필수(비면 주 버튼이 꺼진다)이고 200자를 넘으면 붉은 문장과 함께 꺼진다
 * - 409는 창 안 문장 「그사이 상태가 바뀌었어요」 + [새로 읽기], 서버 이유 오류는 이유 칸 아래
 * 요청 본문(이유는 쉬는 중일 때만, `expectedUpdatedAt` 원문 그대로)과 409 가르기는 `patternSubmit.test.ts`가 본다.
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

import {
  OpsPatternStatusMenu,
  OpsPatternStatusPanel,
  PATTERN_STATUS_ACTIONS,
  STATUS_CONFLICT_TEXT,
  pauseReasonOverText,
  statusActionsFor,
} from '../OpsPatternStatusMenu'

const html = (node: ReactElement) => renderToStaticMarkup(node)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')
/** 확인창 껍데기 안쪽 부품은 Radix 창 문맥이 필요해 열린 창으로 감싸서 그린다(포털은 쓰지 않는다). */
const inDialog = (node: ReactElement) => flat(<AlertDialog open>{node}</AlertDialog>)
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)

const noop = () => {}

function panel(key: keyof typeof PATTERN_STATUS_ACTIONS, extra: Partial<Parameters<typeof OpsPatternStatusPanel>[0]> = {}) {
  return inDialog(
    <OpsPatternStatusPanel
      action={PATTERN_STATUS_ACTIONS[key]}
      reason=""
      onReason={noop}
      pending={false}
      error={null}
      conflict={false}
      onConfirm={noop}
      onCancel={noop}
      onReload={noop}
      {...extra}
    />
  )
}

describe('상태별 항목', () => {
  it('사용 중이면 쉬게 하기·보관하기', () => {
    expect(statusActionsFor('active').map((item) => item.label)).toEqual(['쉬게 하기', '보관하기'])
  })

  it('쉬는 중이면 다시 사용하기·쉬는 이유 고치기·보관하기', () => {
    expect(statusActionsFor('paused').map((item) => item.label)).toEqual(['다시 사용하기', '쉬는 이유 고치기', '보관하기'])
  })

  it('보관이면 다시 사용하기 하나', () => {
    expect(statusActionsFor('archived').map((item) => item.label)).toEqual(['다시 사용하기'])
  })

  it('항목이 보낼 상태: 쉬게 하기·쉬는 이유 고치기는 paused, 다시 사용하기는 active, 보관하기는 archived', () => {
    expect(PATTERN_STATUS_ACTIONS.pause.target).toBe('paused')
    expect(PATTERN_STATUS_ACTIONS['edit-reason'].target).toBe('paused')
    expect(PATTERN_STATUS_ACTIONS.resume.target).toBe('active')
    expect(PATTERN_STATUS_ACTIONS.archive.target).toBe('archived')
    expect(Object.values(PATTERN_STATUS_ACTIONS).filter((item) => item.needsReason).map((item) => item.key)).toEqual(['pause', 'edit-reason'])
  })
})

describe('메뉴 버튼', () => {
  it('[상태 바꾸기 ▾]가 보이고 메뉴는 처음에 닫혀 있다', () => {
    const out = flat(<OpsPatternStatusMenu patternNo="P03" status="active" pauseReason={null} updatedAt="2026-10-08T07:05:00.123456+00:00" />)
    expect(out).toContain('상태 바꾸기')
    expect(out).toContain('aria-haspopup="menu"')
    expect(out).toContain('aria-expanded="false"')
    expect(out).not.toContain('쉬게 하기')
    expect(out).not.toContain('role="alertdialog"')
  })
})

describe('확인창 문구', () => {
  it('쉬게 하기: 조합 뽑기에서만 빠지고 예약된 항목에는 영향이 없다고 알린다', () => {
    const out = panel('pause')
    expect(out).toContain('이 패턴을 쉬게 할까요?')
    expect(out).toContain('조합 뽑기에서만 빠져요. 이미 예약된 항목에는 영향이 없어요')
    expect(buttonOf(out, '쉬게 하기')).not.toBe('')
  })

  it('쉬는 이유 고치기도 같은 설명이다', () => {
    const out = panel('edit-reason', { reason: '시즌이 끝났어요' })
    expect(out).toContain('쉬는 이유를 고칠까요?')
    expect(out).toContain('조합 뽑기에서만 빠져요. 이미 예약된 항목에는 영향이 없어요')
    expect(out).toContain('시즌이 끝났어요</textarea>')
  })

  it('다시 사용하기: 조합 뽑기에 다시 나온다고 알리고 이유 칸이 없다', () => {
    const out = panel('resume')
    expect(out).toContain('조합 뽑기에 다시 나와요')
    expect(out).not.toContain('<textarea')
    expect(isDisabled(buttonOf(out, '다시 사용하기'))).toBe(false)
  })

  it('보관하기: 목록에서 숨고 조합 뽑기에서 빠지지만 번호와 취향 신호는 남는다고 알린다', () => {
    const out = panel('archive')
    expect(out).toContain('목록에서 숨고 조합 뽑기에서 빠져요. 번호와 취향 신호는 남아요')
    expect(out).not.toContain('<textarea')
  })
})

describe('쉬는 이유 칸', () => {
  it('필수 표시가 있고 비어 있으면 주 버튼이 꺼진다', () => {
    const out = panel('pause')
    expect(out).toContain('쉬는 이유')
    expect(out).toContain('<span class="sr-only"> (필수)</span>')
    expect(/<textarea[^>]*>/.exec(out)?.[0]).toContain('aria-required="true"')
    expect(isDisabled(buttonOf(out, '쉬게 하기'))).toBe(true)
  })

  it('공백만 있어도 꺼져 있고, 글자가 있으면 켜진다', () => {
    expect(isDisabled(buttonOf(panel('pause', { reason: '   ' }), '쉬게 하기'))).toBe(true)
    expect(isDisabled(buttonOf(panel('pause', { reason: '시즌 끝' }), '쉬게 하기'))).toBe(false)
  })

  it('200자를 넘으면 붉은 문장과 함께 주 버튼이 꺼지고 200자 정확히는 켜진다', () => {
    const over = panel('pause', { reason: 'a'.repeat(201) })
    expect(over).toContain(pauseReasonOverText())
    expect(over).toContain('201 / 200')
    expect(/<textarea[^>]*>/.exec(over)?.[0]).toContain('aria-invalid="true"')
    expect(isDisabled(buttonOf(over, '쉬게 하기'))).toBe(true)
    const exact = panel('pause', { reason: 'a'.repeat(200) })
    expect(exact).not.toContain(pauseReasonOverText())
    expect(isDisabled(buttonOf(exact, '쉬게 하기'))).toBe(false)
  })

  it('서버가 이유 칸을 거절하면 그 문장이 칸 아래에 붙는다', () => {
    const out = panel('pause', { reason: '시즌 끝', reasonError: '쉬는 이유를 200자 이내로 적어 주세요.' })
    expect(out).toContain('id="pattern-status-reason-error"')
    expect(out).toContain('쉬는 이유를 200자 이내로 적어 주세요.')
  })
})

describe('실패와 처리 중', () => {
  it('409는 창 안 문장 「그사이 상태가 바뀌었어요」와 [새로 읽기]를 보인다', () => {
    const out = panel('archive', { error: STATUS_CONFLICT_TEXT, conflict: true })
    expect(STATUS_CONFLICT_TEXT).toBe('그사이 상태가 바뀌었어요')
    expect(out).toContain('role="alert"')
    expect(out).toContain('그사이 상태가 바뀌었어요')
    expect(buttonOf(out, '새로 읽기')).not.toBe('')
  })

  it('충돌이 아닌 실패에는 [새로 읽기]가 없다', () => {
    const out = panel('archive', { error: '패턴을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' })
    expect(out).toContain('패턴을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(out).not.toContain('새로 읽기')
  })

  it('처리 중에는 주 버튼이 항목의 진행형 문구로 바뀌고 두 버튼이 모두 꺼진다', () => {
    const out = panel('archive', { pending: true })
    expect(isDisabled(buttonOf(out, '보관하는 중'))).toBe(true)
    expect(isDisabled(buttonOf(out, '취소'))).toBe(true)
    expect(buttonOf(out, '보관하기')).toBe('')
  })
})
