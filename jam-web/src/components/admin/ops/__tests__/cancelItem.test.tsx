/**
 * 공개 전 취소 줄과 확인창의 초기 렌더 (티켓 20261002_1649, 상위 20260930_1500 ⑤-b, 운영툴 PRD §8.7)
 *
 * 저장소에 jsdom·testing-library가 없어(`execute.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다:
 * - 줄: 안내 한 줄과 [공개 전 취소하기](외곽선 변형, 붉은 면 없음), 확인창은 처음에 닫혀 있다
 * - 확인창: 제목·설명, 함께 취소될 항목(있을 때만), 취소를 막는 항목과 서버 이유(있으면 확인 버튼이 꺼진다), 사유 칸(선택·500자 카운터·도움말),
 *   마지막 줄(시험 묶음은 다른 문장), 보조 「닫기」와 주 버튼 문구
 * - 불러오는 중·미리 보기 실패·처리 중·취소 실패는 창 안 문장이고 주 버튼은 꺼지거나 진행형이다
 * 열기 → 미리 보기 요청 → 취소 → 토스트 흐름은 브라우저 동작이라 여기서 다루지 않는다(순수 함수는 `executeView.test.ts`, 호출은 `executeClient.test.ts`).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'
import { buildCancelPreview } from '@/lib/admin/opsInbox/executeView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { OpsCancelItem, OpsCancelPanel } from '../OpsCancelItem'
import { itemSummaryLine } from '../OpsItemActions'

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')
/** 확인창 껍데기 안쪽 부품은 Radix 창 문맥이 필요해 열린 창으로 감싸서 그린다(포털은 쓰지 않는다). */
const inDialog = (node: ReactElement) => flat(<AlertDialog open>{node}</AlertDialog>)
/** 글자로 그 버튼을 찾아 여는 태그부터 닫는 태그까지 돌려준다. */
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
/** 여는 태그에 `disabled` 속성이 있는지(클래스 이름의 `disabled:`는 세지 않는다). */
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)

function makeItem(id: string, overrides: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id,
    position: Number(id.replace(/\D/g, '')) || 0,
    itemKey: `key-${id}`,
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: '2026-10-05T09:00:00+09:00',
    endsAt: null,
    status: 'scheduled',
    original: { user_experience: `${id} 경험` },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const ITEMS = [makeItem('a1'), makeItem('a2', { kind: 'mission' }), makeItem('a3', { status: 'live' })]
const SUMMARY = <p>{itemSummaryLine(ITEMS[0])}</p>
const BLOCKER_REASON = '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.'

const viewOf = (data: Record<string, unknown>) => buildCancelPreview(data, 'a1', ITEMS, itemSummaryLine)
const alone = viewOf({ cancelIds: ['a1'], blockers: [] })
const withAlso = viewOf({ cancelIds: ['a2', 'a1'], blockers: [] })
const blocked = viewOf({ cancelIds: ['a1'], blockers: [{ id: 'a3', reason: BLOCKER_REASON }] })

const noop = () => {}
const panel = (view: Parameters<typeof OpsCancelPanel>[0]['view'], extra: Partial<Parameters<typeof OpsCancelPanel>[0]> = {}) =>
  inDialog(<OpsCancelPanel summary={SUMMARY} view={view} isSample={false} onConfirm={noop} onCancel={noop} {...extra} />)

describe('OpsCancelItem — 줄', () => {
  const props = { bundleId: 'bundle-1', item: ITEMS[0], items: ITEMS, isSample: false, onCancelled: vi.fn(), onConflict: vi.fn() }

  it('안내 한 줄과 [공개 전 취소하기]가 있다', () => {
    const out = flat(<OpsCancelItem {...props} />)
    expect(out).toContain('예약된 항목이에요. 공개 시각 전에는 취소할 수 있어요.')
    expect(buttonOf(out, '공개 전 취소하기')).not.toBe('')
  })

  it('버튼은 외곽선 변형이고 붉은 면이 없으며, 처음부터 꺼져 있지 않다', () => {
    const out = flat(<OpsCancelItem {...props} />)
    const button = buttonOf(out, '공개 전 취소하기')
    expect(button).toContain('border-neutral-300')
    expect(out).not.toContain('bg-red-600')
    expect(isDisabled(button)).toBe(false)
  })

  it('확인창은 처음에 닫혀 있다(열 때 미리 보기 요청을 보낸다)', () => {
    const out = flat(<OpsCancelItem {...props} />)
    expect(out).not.toContain('이 항목을 공개 전에 취소할까요?')
    expect(out).not.toContain('role="alertdialog"')
  })
})

describe('OpsCancelPanel — 제목·설명·버튼', () => {
  it('제목은 「이 항목을 공개 전에 취소할까요?」이고 설명에 항목 한 줄 요약이 있다', () => {
    const out = panel(alone)
    expect(out).toContain('이 항목을 공개 전에 취소할까요?')
    expect(out).toContain('홈피드 카드 · 10/5(월) 09:00 시작 · a1 경험')
  })

  it('보조 버튼은 「닫기」이고 「취소」가 아니다(주 버튼과 겹치지 않는다)', () => {
    const out = panel(alone)
    expect(out).toContain('>닫기<')
    expect(out).not.toContain('>취소<')
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('주 버튼은 붉은 면이고, 함께 취소될 항목이 없으면 「공개 전 취소하기」다', () => {
    const out = panel(alone)
    const confirm = buttonOf(out, '공개 전 취소하기')
    expect(confirm).toContain('bg-red-600')
    expect(isDisabled(confirm)).toBe(false)
    // 붉은 면은 확인 버튼 하나뿐이다
    expect(out.match(/bg-red-600/g)).toHaveLength(1)
  })

  it('함께 취소될 항목이 있으면 주 버튼은 「N개 공개 전 취소하기」이고 N은 이 항목을 포함한다', () => {
    const out = panel(withAlso)
    expect(buttonOf(out, '2개 공개 전 취소하기')).not.toBe('')
    expect(isDisabled(buttonOf(out, '2개 공개 전 취소하기'))).toBe(false)
  })

  it('처리 중에는 진행형 「취소하는 중」이고 두 버튼이 모두 꺼지며 사유 칸도 잠긴다', () => {
    const out = panel(alone, { pending: true })
    expect(isDisabled(buttonOf(out, '취소하는 중'))).toBe(true)
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(true)
    expect(out).toMatch(/<textarea[^>]*disabled/i)
  })
})

describe('OpsCancelPanel — 함께 취소될 항목·막는 항목', () => {
  it('함께 취소될 항목은 개수가 붙은 구역에 항목마다 한 줄 요약으로 보인다(이 항목은 뺀다)', () => {
    const out = panel(withAlso)
    expect(out).toContain('함께 취소될 항목 1개')
    const section = out.slice(out.indexOf('함께 취소될 항목 1개'))
    expect(section).toContain('미션 · 10/5(월) 09:00 시작 · a2 경험')
    expect(section).not.toContain('a1 경험')
  })

  it('이 항목뿐이면 함께 취소될 항목 구역을 그리지 않는다', () => {
    const out = panel(alone)
    expect(out).not.toContain('함께 취소될 항목')
    expect(out).not.toContain('취소를 막는 항목')
  })

  it('막는 항목이 있으면 구역에 한 줄 요약과 서버 이유가 보이고 확인 버튼이 꺼진다', () => {
    const out = panel(blocked)
    expect(out).toContain('취소를 막는 항목 1개')
    const section = out.slice(out.indexOf('취소를 막는 항목 1개'))
    expect(section).toContain('홈피드 카드 · 10/5(월) 09:00 시작 · a3 경험')
    expect(section).toContain(BLOCKER_REASON)
    expect(isDisabled(buttonOf(out, '공개 전 취소하기'))).toBe(true)
    // 닫기는 막지 않는다
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('함께 취소될 항목과 막는 항목이 같이 있으면 함께 취소될 항목 → 막는 항목 순이고 확인 버튼이 꺼진다', () => {
    const both = viewOf({ cancelIds: ['a1', 'a2'], blockers: [{ id: 'a3', reason: BLOCKER_REASON }] })
    const out = panel(both)
    expect(out.indexOf('함께 취소될 항목 1개')).toBeGreaterThan(-1)
    expect(out.indexOf('함께 취소될 항목 1개')).toBeLessThan(out.indexOf('취소를 막는 항목 1개'))
    expect(isDisabled(buttonOf(out, '2개 공개 전 취소하기'))).toBe(true)
  })

  it('긴 목록은 창 안에서 스크롤한다', () => {
    expect(panel(withAlso)).toMatch(/class="[^"]*max-h-\[40vh\][^"]*overflow-y-auto/)
  })

  it('제출 문자열은 HTML로 해석되지 않는다', () => {
    const evil = [makeItem('a1'), makeItem('a2', { original: { user_experience: '<img src=x onerror=1>' } })]
    const view = buildCancelPreview({ cancelIds: ['a1', 'a2'] }, 'a1', evil, itemSummaryLine)
    const out = panel(view)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
  })
})

describe('OpsCancelPanel — 사유 칸·마지막 줄', () => {
  it('사유는 선택이다: 라벨 「취소 사유(선택)」, 500자 상한, 카운터 0/500, 도움말 「결정 기록에 남아요」', () => {
    const out = panel(alone)
    expect(out).toContain('취소 사유(선택)')
    expect(out).toContain('결정 기록에 남아요')
    expect(out).toContain('0/500')
    expect(out).toMatch(/<textarea[^>]*maxlength="500"/i)
    // 필수가 아니다(비워도 확인 버튼이 켜져 있다)
    expect(out).not.toMatch(/<textarea[^>]*required/i)
    expect(isDisabled(buttonOf(out, '공개 전 취소하기'))).toBe(false)
  })

  it('마지막 줄은 되돌릴 수 없다는 것과 예약해 둔 자원도 지워진다는 것을 알린다', () => {
    const out = panel(alone)
    expect(out).toContain('공개 전 취소는 되돌릴 수 없어요. 예약해 둔 자원도 지워져요.')
    expect(out).not.toContain('시험 묶음이라')
  })

  it('시험 묶음이면 둘째 문장이 「시험 묶음이라 지울 자원은 없어요」로 바뀐다', () => {
    const out = panel(alone, { isSample: true })
    expect(out).toContain('공개 전 취소는 되돌릴 수 없어요. 시험 묶음이라 지울 자원은 없어요.')
    expect(out).not.toContain('예약해 둔 자원도 지워져요')
  })

  it('미리 보기가 아직 없을 때도 사유 칸과 마지막 줄은 보인다', () => {
    const out = panel(null, { loading: true })
    expect(out).toContain('취소 사유(선택)')
    expect(out).toContain('공개 전 취소는 되돌릴 수 없어요')
  })
})

describe('OpsCancelPanel — 불러오는 중·실패', () => {
  it('불러오는 중에는 안내 글이 보이고 주 버튼은 꺼져 있다(닫기는 켜져 있다)', () => {
    const out = panel(null, { loading: true })
    expect(out).toContain('함께 취소될 항목을 확인하는 중이에요')
    expect(out).toContain('이 항목을 공개 전에 취소할까요?')
    expect(isDisabled(buttonOf(out, '공개 전 취소하기'))).toBe(true)
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('불러온 뒤에는 안내 글이 없다', () => {
    expect(panel(alone)).not.toContain('확인하는 중이에요')
  })

  it('미리 보기가 실패하면 서버 문장이 창 안에 붉은 글로 보이고 주 버튼은 꺼져 있다', () => {
    const out = panel(null, { error: '함께 취소될 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(out).toContain('role="alert"')
    expect(out).toContain('함께 취소될 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).not.toContain('확인하는 중이에요')
    expect(isDisabled(buttonOf(out, '공개 전 취소하기'))).toBe(true)
  })

  it('취소 실패 문장은 미리 보기를 그대로 둔 채 창 안에 붉은 글로 보이고 주 버튼은 켜져 있다', () => {
    const out = panel(withAlso, { error: '취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(out).toContain('role="alert"')
    expect(out).toContain('취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).toContain('함께 취소될 항목 1개')
    expect(isDisabled(buttonOf(out, '2개 공개 전 취소하기'))).toBe(false)
  })
})
