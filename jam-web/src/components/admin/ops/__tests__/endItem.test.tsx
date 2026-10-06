/**
 * 지금 종료 줄과 확인창의 초기 렌더 (티켓 20261006_1038, 상위 20260930_1500 ⑪-b, 운영툴 PRD §8.7)
 *
 * 저장소에 jsdom·testing-library가 없어(`cancelItem.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다:
 * - 줄: 안내 한 줄과 [지금 종료하기](외곽선 변형, 붉은 면 없음), 확인창은 처음에 닫혀 있다
 * - 확인창: 제목·설명, 종류별 문단(다섯 종류, 숫자·숫자 없음·0명 생략), 계속 보이는 항목 구역(있을 때만), 시험 안내(시험 묶음만),
 *   사유 칸(선택·500자 카운터·도움말), 마지막 줄, 보조 「닫기」와 주 버튼 문구
 * - 불러오는 중·미리 보기 실패·처리 중·종료 실패는 창 안 문장이고 주 버튼은 꺼지거나 진행형이다
 * 열기 → 미리 보기 요청 → 종료 → 토스트 흐름은 브라우저 동작이라 여기서 다루지 않는다(순수 함수는 `executeView.test.ts`, 호출은 `executeClient.test.ts`).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'
import { buildEndPreview } from '@/lib/admin/opsInbox/executeView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { OpsEndItem, OpsEndPanel } from '../OpsEndItem'
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
    status: 'live',
    original: { user_experience: `${id} 경험` },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const ITEMS = [makeItem('a1', { kind: 'mission' }), makeItem('a2'), makeItem('a3', { kind: 'jam_badge' })]
const SUMMARY = <p>{itemSummaryLine(ITEMS[0])}</p>

const viewOf = (data: Record<string, unknown>) => buildEndPreview(data, 'a1', ITEMS, itemSummaryLine)
const missionView = viewOf({ kind: 'mission', isSample: false, impact: { participants: 1234, inProgressUsers: 56 }, pointedByLive: [] })
const stillLiveView = viewOf({ kind: 'mission', isSample: false, impact: {}, pointedByLive: [{ id: 'a2', kind: 'home_feed_card', label: '서버 이름' }] })
const sampleView = viewOf({ kind: 'mission', isSample: true, impact: {}, pointedByLive: [] })

const noop = () => {}
const panel = (view: Parameters<typeof OpsEndPanel>[0]['view'], extra: Partial<Parameters<typeof OpsEndPanel>[0]> = {}) =>
  inDialog(<OpsEndPanel summary={SUMMARY} view={view} onConfirm={noop} onCancel={noop} {...extra} />)

describe('OpsEndItem — 줄', () => {
  const props = { bundleId: 'bundle-1', item: ITEMS[0], items: ITEMS, onEnded: vi.fn(), onConflict: vi.fn(), onItemEnded: vi.fn() }

  it('안내 한 줄과 [지금 종료하기]가 있다', () => {
    const out = flat(<OpsEndItem {...props} />)
    expect(out).toContain('게재 중인 항목이에요. 지금 종료하면 유저 화면에서 바로 내려가요.')
    expect(buttonOf(out, '지금 종료하기')).not.toBe('')
  })

  it('버튼은 외곽선 변형이고 붉은 면이 없으며, 처음부터 꺼져 있지 않다', () => {
    const out = flat(<OpsEndItem {...props} />)
    const button = buttonOf(out, '지금 종료하기')
    expect(button).toContain('border-neutral-300')
    expect(out).not.toContain('bg-red-600')
    expect(isDisabled(button)).toBe(false)
  })

  it('확인창은 처음에 닫혀 있다(열 때 미리 보기 요청을 보낸다)', () => {
    const out = flat(<OpsEndItem {...props} />)
    expect(out).not.toContain('이 항목을 지금 종료할까요?')
    expect(out).not.toContain('role="alertdialog"')
  })
})

describe('OpsEndPanel — 제목·설명·버튼', () => {
  it('제목은 「이 항목을 지금 종료할까요?」이고 설명에 항목 한 줄 요약이 있다', () => {
    const out = panel(missionView)
    expect(out).toContain('이 항목을 지금 종료할까요?')
    expect(out).toContain('미션 · 10/5(월) 09:00 시작 · a1 경험')
  })

  it('보조 버튼은 「닫기」이고 「취소」가 아니다(주 버튼과 겹치지 않는다)', () => {
    const out = panel(missionView)
    expect(out).toContain('>닫기<')
    expect(out).not.toContain('>취소<')
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('주 버튼은 붉은 면의 「지금 종료하기」이고 켜져 있다. 붉은 면은 확인 버튼 하나뿐이다', () => {
    const out = panel(missionView)
    const confirm = buttonOf(out, '지금 종료하기')
    expect(confirm).toContain('bg-red-600')
    expect(isDisabled(confirm)).toBe(false)
    expect(out.match(/bg-red-600/g)).toHaveLength(1)
  })

  it('처리 중에는 진행형 「종료하는 중」이고 두 버튼이 모두 꺼지며 사유 칸도 잠긴다', () => {
    const out = panel(missionView, { pending: true })
    expect(isDisabled(buttonOf(out, '종료하는 중'))).toBe(true)
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(true)
    expect(out).toMatch(/<textarea[^>]*disabled/i)
  })
})

describe('OpsEndPanel — 종류별 문단', () => {
  it('카드: 홈피드와 카드 상세에서 바로 내려간다는 한 문장이다', () => {
    const out = panel(viewOf({ kind: 'home_feed_card', impact: {} }))
    expect(out).toContain('홈피드와 카드 상세에서 바로 내려가요.')
  })

  it('미션: 숫자가 있으면 천 단위 쉼표와 함께 진행 중 유저·참가자 수를 보이고 받은 보상은 그대로라고 알린다', () => {
    const out = panel(missionView)
    expect(out).toContain('참가와 진행 집계가 바로 멈춰요.')
    expect(out).toContain('진행 중인 유저 56명은 더는 달성할 수 없어요.')
    expect(out).toContain('받은 보상은 그대로예요.')
    expect(out).toContain('다음 18시 알림에서 참가자 1,234명에게 종료 결과 알림이 가요.')
  })

  it('미션: 세기가 실패했거나(impact null) 숫자 칸이 없으면 숫자 없는 문장이다', () => {
    for (const impact of [null, {}]) {
      const out = panel(viewOf({ kind: 'mission', impact }))
      expect(out).toContain('진행 중인 유저는 더는 달성할 수 없어요.')
      expect(out).toContain('다음 18시 알림에서 참가자에게 종료 결과 알림이 가요.')
      expect(out).not.toMatch(/\d명/)
    }
  })

  it('미션: 수가 0이면 그 문장을 뺀다', () => {
    const out = panel(viewOf({ kind: 'mission', impact: { participants: 0, inProgressUsers: 0 } }))
    expect(out).toContain('참가와 진행 집계가 바로 멈춰요.')
    expect(out).toContain('받은 보상은 그대로예요.')
    expect(out).not.toContain('더는 달성할 수 없어요')
    expect(out).not.toContain('종료 결과 알림이 가요')
  })

  it('JAM! 배지: 더는 획득할 수 없고 이미 획득한 배지는 그대로라고 알린다', () => {
    const out = panel(viewOf({ kind: 'jam_badge', impact: {} }))
    expect(out).toContain('이 배지를 더는 획득할 수 없어요.')
    expect(out).toContain('이미 획득한 배지는 그대로예요.')
  })

  it('컬렉션: 아직 완성하지 못한 유저 약 N명(없으면 숫자 없이, 0이면 뺀다)과 장착한 배지는 그대로라고 알린다', () => {
    const counted = panel(viewOf({ kind: 'collection_launch', impact: { fillingUsers: 40 } }))
    expect(counted).toContain('새 드랍과 완성 판정이 바로 멈춰요.')
    expect(counted).toContain('아직 완성하지 못한 유저 약 40명은 더는 완성 보상을 받을 수 없어요.')
    expect(counted).toContain('장착한 배지는 그대로예요.')
    expect(panel(viewOf({ kind: 'collection_launch', impact: null }))).toContain('아직 완성하지 못한 유저는 더는 완성 보상을 받을 수 없어요.')
    expect(panel(viewOf({ kind: 'collection_launch', impact: { fillingUsers: 0 } }))).not.toContain('완성 보상을 받을 수 없어요')
  })

  it('레시피: 믹스 화면에서 바로 사라지고 이미 받은 결과물은 그대로라고 알린다', () => {
    const out = panel(viewOf({ kind: 'recipe', impact: {} }))
    expect(out).toContain('믹스 화면에서 바로 사라지고 더는 믹스할 수 없어요.')
    expect(out).toContain('이미 받은 결과물은 그대로예요.')
  })
})

describe('OpsEndPanel — 계속 보이는 항목', () => {
  it('이 항목을 가리키는 게재 중 항목이 있으면 개수가 붙은 구역에 설명과 한 줄 요약으로 보인다', () => {
    const out = panel(stillLiveView)
    expect(out).toContain('계속 보이는 항목 1개')
    expect(out).toContain('이 항목을 가리키는 게재 중 항목은 함께 종료되지 않아요')
    const section = out.slice(out.indexOf('계속 보이는 항목 1개'))
    expect(section).toContain('홈피드 카드 · 10/5(월) 09:00 시작 · a2 경험')
  })

  it('없으면 구역을 그리지 않는다', () => {
    const out = panel(missionView)
    expect(out).not.toContain('계속 보이는 항목')
    expect(out).not.toContain('함께 종료되지 않아요')
  })

  it('종류별 문단이 구역보다 먼저 나오고, 긴 내용은 창 안에서 스크롤한다', () => {
    const out = panel(stillLiveView)
    expect(out.indexOf('참가와 진행 집계가 바로 멈춰요.')).toBeLessThan(out.indexOf('계속 보이는 항목 1개'))
    expect(out).toMatch(/class="[^"]*max-h-\[40vh\][^"]*overflow-y-auto/)
  })

  it('제출 문자열은 HTML로 해석되지 않는다', () => {
    const evil = [makeItem('a1'), makeItem('a2', { original: { user_experience: '<img src=x onerror=1>' } })]
    const view = buildEndPreview({ kind: 'mission', pointedByLive: [{ id: 'a2' }] }, 'a1', evil, itemSummaryLine)
    const out = panel(view)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
  })
})

describe('OpsEndPanel — 시험 묶음·사유 칸·마지막 줄', () => {
  it('시험 묶음이면 「시험 묶음이라 실제 자원은 바뀌지 않아요.」가 보이고, 아니면 보이지 않는다', () => {
    expect(panel(sampleView)).toContain('시험 묶음이라 실제 자원은 바뀌지 않아요.')
    expect(panel(missionView)).not.toContain('시험 묶음이라')
  })

  it('사유는 선택이다: 라벨 「종료 사유(선택)」, 500자 상한, 카운터 0/500, 도움말 「결정 기록에 남아요」', () => {
    const out = panel(missionView)
    expect(out).toContain('종료 사유(선택)')
    expect(out).toContain('결정 기록에 남아요')
    expect(out).toContain('0/500')
    expect(out).toMatch(/<textarea[^>]*maxlength="500"/i)
    // 필수가 아니다(비워도 확인 버튼이 켜져 있다)
    expect(out).not.toMatch(/<textarea[^>]*required/i)
    expect(isDisabled(buttonOf(out, '지금 종료하기'))).toBe(false)
  })

  it('마지막 줄은 되돌릴 수 없다는 것을 알리고 사유 칸 뒤에 나온다', () => {
    const out = panel(missionView)
    expect(out).toContain('지금 종료는 되돌릴 수 없어요.')
    expect(out.indexOf('종료 사유(선택)')).toBeLessThan(out.indexOf('지금 종료는 되돌릴 수 없어요.'))
  })

  it('미리 보기가 아직 없을 때도 사유 칸과 마지막 줄은 보인다', () => {
    const out = panel(null, { loading: true })
    expect(out).toContain('종료 사유(선택)')
    expect(out).toContain('지금 종료는 되돌릴 수 없어요.')
  })
})

describe('OpsEndPanel — 불러오는 중·실패', () => {
  it('불러오는 중에는 안내 글이 보이고 주 버튼은 꺼져 있다(닫기는 켜져 있다)', () => {
    const out = panel(null, { loading: true })
    expect(out).toContain('종료 영향을 확인하는 중이에요')
    expect(out).toContain('이 항목을 지금 종료할까요?')
    expect(isDisabled(buttonOf(out, '지금 종료하기'))).toBe(true)
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('불러온 뒤에는 안내 글이 없다', () => {
    expect(panel(missionView)).not.toContain('확인하는 중이에요')
  })

  it('미리 보기가 실패하면 서버 문장이 창 안에 붉은 글로 보이고 주 버튼은 꺼져 있다', () => {
    const out = panel(null, { error: '지금 종료할 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(out).toContain('role="alert"')
    expect(out).toContain('지금 종료할 항목을 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).not.toContain('확인하는 중이에요')
    expect(isDisabled(buttonOf(out, '지금 종료하기'))).toBe(true)
  })

  it('종료 실패 문장은 미리 보기를 그대로 둔 채 창 안에 붉은 글로 보이고 주 버튼은 켜져 있다', () => {
    const out = panel(stillLiveView, { error: '지금 종료하지 못했어요. 자원은 그대로 게재 중이에요. 잠시 뒤 다시 눌러 주세요.' })
    expect(out).toContain('role="alert"')
    expect(out).toContain('지금 종료하지 못했어요. 자원은 그대로 게재 중이에요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).toContain('계속 보이는 항목 1개')
    expect(isDisabled(buttonOf(out, '지금 종료하기'))).toBe(false)
  })
})
