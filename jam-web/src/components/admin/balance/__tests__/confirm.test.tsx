/**
 * 확률 확인창의 알맹이 (티켓 20261022_1132 2회, 사용자 결정 2, 가정 마)
 *
 * 확인창 껍데기는 Radix 포털을 쓰므로 `ops/__tests__/render.test.tsx`와 같은 방식으로 열린 `AlertDialog` 안에 알맹이만 서버 렌더로 그린다. 지키는 것:
 * - 바뀐 칸마다 «이름: 전 → 후»가 보이고, 반영되지 않는 칸이 함께 저장되면 그 칸 수만 알린다(없으면 문장이 없다)
 * - «확률 안내 페이지에 바로 반영돼요. 바꾸기 전에 공지가 필요한지 확인해요.»와 프로덕션 즉시 반영 안내가 보인다
 * - 변경 메모 입력은 선택이고 200자 제한이 걸려 있으며 글자 수가 보인다
 * - [저장하기]와 [취소]가 있고, 처리 중에는 글자가 바뀌며 둘 다 눌리지 않고 메모 입력이 잠긴다
 * - 한국어를 그리는 요소에 줄바꿈 클래스가 붙어 있다
 */
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'
import {
  BalanceProbabilityConfirmPanel,
  CONFIRM_BUTTON,
  CONFIRM_CANCEL,
  CONFIRM_CHANGES_TITLE,
  CONFIRM_NOTICE,
  CONFIRM_PENDING,
  CONFIRM_PRODUCTION,
  CONFIRM_TITLE,
  otherChangesText,
  type BalanceProbabilityConfirmPanelProps,
} from '../BalanceProbabilityConfirm'

const flat = (node: ReactElement) => renderToStaticMarkup(<AlertDialog open>{node}</AlertDialog>).replace(/<!-- -->/g, '')
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function panel(overrides: Partial<BalanceProbabilityConfirmPanelProps> = {}): string {
  const props: BalanceProbabilityConfirmPanelProps = {
    lines: [
      { label: '등급 확률 · Common', before: '84%', after: '80%' },
      { label: '등급 확률 · Rare', before: '13%', after: '17%' },
    ],
    otherChangeCount: 0,
    note: '',
    onNoteChange: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  return flat(<BalanceProbabilityConfirmPanel {...props} />)
}

describe('확률 확인창', () => {
  it('제목과 «공지가 필요한지 확인해요» 안내, 프로덕션 즉시 반영 안내가 보인다', () => {
    const out = panel()
    expect(out).toContain(CONFIRM_TITLE)
    expect(CONFIRM_NOTICE).toBe('확률 안내 페이지에 바로 반영돼요. 바꾸기 전에 공지가 필요한지 확인해요.')
    expect(out).toContain(CONFIRM_NOTICE)
    expect(out).toContain(CONFIRM_PRODUCTION)
    expect(CONFIRM_PRODUCTION).toContain('프로덕션에 바로 반영돼요')
  })

  it('바뀐 칸마다 이름과 전 → 후가 보인다(전은 취소선, 후는 굵게)', () => {
    const out = panel()
    expect(out).toContain('등급 확률 · Common: ')
    expect(out).toMatch(/line-through[^>]*>84%<\/span>/)
    expect(out).toMatch(/font-bold[^>]*>80%<\/span>/)
    expect(out).toMatch(/line-through[^>]*>13%<\/span>/)
    expect(out).toMatch(/font-bold[^>]*>17%<\/span>/)
    expect([...out.matchAll(/→/g)]).toHaveLength(2)
  })

  it('반영되지 않는 칸이 함께 저장되면 그 칸 수를 알리고, 없으면 문장이 없다', () => {
    expect(panel({ otherChangeCount: 3 })).toContain('그 밖에 3칸도 함께 저장돼요.')
    expect(otherChangesText(1)).toBe('그 밖에 1칸도 함께 저장돼요.')
    expect(panel()).not.toContain('그 밖에')
  })

  it('변경 메모는 선택이고 200자 제한과 글자 수가 보인다', () => {
    const out = panel({ note: '공지 예정' })
    expect(out).toContain('변경 메모 (선택)')
    expect(out).toMatch(/<textarea[^>]*maxLength="200"/)
    expect(out).not.toMatch(/<textarea[^>]*required/)
    expect(out).toContain('최대 200자 · 5자')
  })

  it('[저장하기]와 [취소]가 눌린다', () => {
    const out = panel()
    expect(isDisabled(buttonOf(out, CONFIRM_BUTTON))).toBe(false)
    expect(isDisabled(buttonOf(out, CONFIRM_CANCEL))).toBe(false)
  })

  it('처리 중에는 버튼 글자가 바뀌고 둘 다 눌리지 않으며 메모 입력이 잠긴다', () => {
    const out = panel({ pending: true })
    expect(isDisabled(buttonOf(out, CONFIRM_PENDING))).toBe(true)
    expect(isDisabled(buttonOf(out, CONFIRM_CANCEL))).toBe(true)
    expect(out).not.toContain(`>${CONFIRM_BUTTON}</button>`)
    expect(out).toMatch(/<textarea[^>]*disabled/)
  })

  it('안내·소제목·메모 이름표에 줄바꿈 클래스가 붙어 있다', () => {
    const out = panel({ otherChangeCount: 2 })
    for (const text of [CONFIRM_NOTICE, CONFIRM_PRODUCTION, CONFIRM_CHANGES_TITLE, '그 밖에 2칸도 함께 저장돼요.', '변경 메모 (선택)']) {
      const match = out.match(new RegExp(`<(p|h3|label)[^>]*class="([^"]*)"[^>]*>${escapeRegExp(text)}`))
      expect(match, text).not.toBeNull()
      expect(match?.[2], text).toContain('break-keep')
      expect(match?.[2], text).toContain('wrap-break-word')
    }
  })
})
