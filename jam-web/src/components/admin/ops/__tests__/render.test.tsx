/**
 * 받은 기획함 화면 부품의 초기 렌더 (티켓 20260930_1817, 결정 화면 부품은 티켓 20260930_1818)
 *
 * 저장소에 jsdom·testing-library가 없어(`OnboardingSyncButton.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로
 * 처음 그린 모양만 고정한다: 상태가 아이콘과 글자로 나오는지, 지금 단계 표시가 붙는지, 제출 문자열이 HTML로 해석되지 않는지,
 * 색 견본이 `#rrggbb`일 때만 그려지는지, 슬롯이 비면 자리를 잡지 않는지. 클릭·URL 바꾸기·전환 요청은 브라우저 동작이라
 * 여기서 다루지 않는다(화면 확인은 카리나가 한다).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'

const nav = vi.hoisted(() => ({ search: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-inbox/x',
  useSearchParams: () => new URLSearchParams(nav.search),
}))

import { OpsStatusBadge } from '../OpsStatusBadge'
import { OpsStageBar } from '../OpsStageBar'
import { OpsItemList } from '../OpsItemList'
import { OpsItemDetail } from '../OpsItemDetail'
import { OpsFormatErrorSummary, OpsItemFormatErrors } from '../OpsFormatErrors'
import { OpsBundleWorkspace } from '../OpsBundleWorkspace'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'
import { OpsConfirmPanel } from '../OpsConfirmDialog'
import { OpsDiffLines } from '../OpsDiffLines'
import { OpsBulkApprove, OpsBulkApprovePanel, buildBulkSummary, bulkResultMessage } from '../OpsBulkApprove'
import { FormatErrorWarning, OpsItemActions, OpsRejectPanel, canSubmitRejectReason, decisionGuidance } from '../OpsItemActions'
import { OPS_EDIT_STALE_MESSAGE, OpsItemEditForm } from '../OpsItemEditForm'
import { OpsDecisionWorkspace } from '../OpsDecisionWorkspace'
import { OpsSampleDeleteMenu } from '../OpsSampleDeleteMenu'
import { readEditableValues } from '@/lib/admin/opsInbox/edit'
import type { OpsWorkspaceContext } from '../OpsBundleWorkspace'
import type { OpsBundleExecution, OpsDecisionRecord, OpsItemRecord } from '@/lib/admin/opsInbox/query'

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')
/** 확인창 껍데기 안쪽 부품은 Radix 창 문맥이 필요해 열린 창으로 감싸서 그린다(포털은 쓰지 않는다). */
const inDialog = (node: ReactElement) => flat(<AlertDialog open>{node}</AlertDialog>)
/** 글자로 그 버튼을 찾아 여는 태그부터 닫는 태그까지 돌려준다. */
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
/** 여는 태그에 `disabled` 속성이 있는지(클래스 이름의 `disabled:`는 세지 않는다). */
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)

function makeCtx(overrides: Partial<OpsWorkspaceContext> = {}): OpsWorkspaceContext {
  return { bundleId: 'bundle-1', items: [], selectedItem: null, draft: null, setDraft: vi.fn(), selectItem: vi.fn(), ...overrides }
}

function makeItem(overrides: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: 'P-07',
    startsAt: '2026-10-05T09:00:00+09:00',
    endsAt: '2026-10-06T09:00:00+09:00',
    status: 'reviewing',
    original: {
      user_experience: '비 오는 월요일 아침, 홈에서 카드를 만나요',
      copy: { title: '우산 챙겨 달리기' },
      colors: { background: '#1a2b3c' },
      world_review: { world_related: true, winter_reviewed: false, reason: '비 오는 날 이야기예요' },
    },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const SUBMIT: OpsDecisionRecord = {
  id: 'd1',
  itemId: null,
  action: 'submit',
  actor: 'token:윤진',
  batchId: null,
  diff: null,
  reason: null,
  slackResult: null,
  createdAt: '2026-10-01T00:12:00Z',
}

beforeEach(() => {
  nav.search = ''
})

describe('OpsStatusBadge — 아이콘과 글자', () => {
  it('항목 상태 10개가 모두 글자로 나오고 아이콘은 장식(aria-hidden)이다', () => {
    const labels: Record<string, string> = {
      arrived: '새로 도착',
      reviewing: '검토중',
      approved: '승인됨',
      preparing: '준비중',
      scheduled: '예약됨',
      live: '게재중',
      ended: '종료',
      rejected: '반려',
      cancelled: '취소',
      failed: '실패',
    }
    for (const [status, label] of Object.entries(labels)) {
      const out = html(<OpsStatusBadge type="item" status={status} />)
      expect(out, status).toContain(label)
      expect(out, status).toContain('<svg')
      expect(out, status).toContain('aria-hidden="true"')
    }
  })

  it('반려·실패는 붉은 테두리와 글자만이고 연한 붉은 배경을 쓰지 않는다', () => {
    for (const status of ['rejected', 'failed']) {
      const out = html(<OpsStatusBadge type="item" status={status} />)
      expect(out).toContain('border-destructive')
      expect(out).toContain('text-destructive')
      expect(out).not.toMatch(/bg-destructive|bg-red-|bg-rose-/)
    }
  })

  it('10개 밖 상태 값은 「상태 확인 필요」다', () => {
    expect(html(<OpsStatusBadge type="item" status="weird" />)).toContain('상태 확인 필요')
  })

  it('묶음 단계·일부 실패·형식 오류 N·시험', () => {
    expect(html(<OpsStatusBadge type="stage" stage="review" />)).toContain('검토중')
    expect(html(<OpsStatusBadge type="stage" stage="prepare" />)).toContain('준비중')
    expect(html(<OpsStatusBadge type="partial-failure" />)).toContain('일부 실패')
    expect(html(<OpsStatusBadge type="format-errors" count={3} />)).toContain('형식 오류 3')
    expect(html(<OpsStatusBadge type="format-errors" count={3} short />)).toContain('3건')
    expect(html(<OpsStatusBadge type="format-errors" count={3} />)).toContain('border-amber-300 bg-amber-50 text-amber-900')
    expect(html(<OpsStatusBadge type="sample" />)).toContain('시험')
  })
})

describe('OpsStageBar', () => {
  it('6단계가 모두 그려지고 지금 단계에만 aria-current="step"과 숨은 글이 붙는다', () => {
    const out = html(<OpsStageBar statuses={['arrived', 'reviewing', 'reviewing']} />)
    for (const label of ['도착', '검토', '준비', '예약', '게재', '종료']) expect(out).toContain(label)
    expect(out.match(/aria-current="step"/g)).toHaveLength(1)
    expect(out).toContain('지금 단계')
    // 검토 단계가 지금 단계이고 도착 단계는 지난 단계(체크)다
    expect(out).toContain('지난 단계')
    expect(out).toContain('<svg')
  })

  it('단계 아래에 항목 수를 그리고 0이면 「-」다', () => {
    const out = html(<OpsStageBar statuses={['reviewing', 'reviewing', 'arrived']} />)
    expect(out).toContain('2개')
    expect(out).toContain('1개')
    expect(out).toContain('>-<')
  })

  it('반려가 섞이면 표시줄 밖 칩으로 알리고, 표시줄은 남은 항목으로 계산한다', () => {
    const out = html(<OpsStageBar statuses={['reviewing', 'rejected', 'rejected']} />)
    expect(out).toContain('검토에서 반려 2개')
    expect(out).toContain('aria-current="step"')
  })

  it('취소·실패 칩, 0인 것은 숨긴다', () => {
    const out = html(<OpsStageBar statuses={['scheduled', 'cancelled', 'failed']} />)
    expect(out).toContain('예약 단계에서 취소 1개')
    expect(out).toContain('실패 1개')
    expect(out).not.toContain('반려')
  })

  it('전부 반려·취소이면 표시줄 자리에 배너를 둔다', () => {
    expect(html(<OpsStageBar statuses={['rejected', 'rejected']} />)).toContain('이 기획은 모두 반려됐어요')
    expect(html(<OpsStageBar statuses={['cancelled']} />)).toContain('이 기획은 모두 취소됐어요')
    expect(html(<OpsStageBar statuses={['rejected', 'cancelled']} />)).toContain('이 기획은 모두 반려되거나 취소됐어요')
    expect(html(<OpsStageBar statuses={['rejected', 'rejected']} />)).not.toContain('aria-current="step"')
  })

  it('전부 실패이면 모든 단계를 점선으로 그린다(지금 단계 없음)', () => {
    const out = html(<OpsStageBar statuses={['failed', 'failed']} />)
    expect(out).not.toContain('aria-current="step"')
    expect(out).toContain('실패 2개')
    expect(out).not.toContain('이 기획은 모두')
  })

  it('항목이 없으면 「도착」이 지금 단계다', () => {
    const out = html(<OpsStageBar statuses={[]} />)
    expect(out.match(/aria-current="step"/g)).toHaveLength(1)
  })

  it('barAction 슬롯이 있을 때만 자리를 잡는다', () => {
    expect(html(<OpsStageBar statuses={['reviewing']} barAction={<button>11개 승인하기</button>} />)).toContain('11개 승인하기')
    expect(html(<OpsStageBar statuses={['reviewing']} />)).not.toContain('승인하기')
  })
})

describe('OpsItemList', () => {
  const noop = () => {}

  it('공개 시각 날짜별 머리줄과 개수, 시각 없는 항목은 맨 끝 묶음이다', () => {
    const out = html(
      <OpsItemList
        items={[
          makeItem({ id: 'a', startsAt: '2026-10-05T09:00:00+09:00', position: 0 }),
          makeItem({ id: 'b', startsAt: '2026-10-05T18:00:00+09:00', position: 1 }),
          makeItem({ id: 'c', startsAt: null, position: 2 }),
        ]}
        selectedId={null}
        onSelect={noop}
      />
    )
    expect(out).toContain('10/5(월) · 2개')
    expect(out).toContain('공개 시각이 없어요 · 1개')
    expect(out.indexOf('10/5(월)')).toBeLessThan(out.indexOf('공개 시각이 없어요'))
    expect(out).toContain('홈피드 카드')
    expect(out).toContain('10/5(월) 09:00 시작')
  })

  it('선택한 행에만 aria-current와 chevron이 있다', () => {
    const out = html(<OpsItemList items={[makeItem({ id: 'a' }), makeItem({ id: 'b', position: 1 })]} selectedId="a" onSelect={noop} />)
    expect(out.match(/aria-current="true"/g)).toHaveLength(1)
    expect(out).toContain('border-l-primary')
  })

  it('종류 허용값 밖은 「종류 확인 필요」, 유저가 겪는 것이 비면 안내 글이다', () => {
    const out = html(
      <OpsItemList items={[makeItem({ kind: 'banner', original: { value: 1 } })]} selectedId={null} onSelect={noop} />
    )
    expect(out).toContain('종류 확인 필요')
    expect(out).toContain('유저가 겪는 것이 비어 있어요')
  })

  it('형식 오류 칩은 항목의 오류 개수다', () => {
    const out = html(<OpsItemList items={[makeItem({ formatErrors: ['a: 틀려요.', 'b: 틀려요.'] })]} selectedId={null} onSelect={noop} />)
    expect(out).toContain('형식 오류 2')
  })

  it('제출 문자열은 HTML로 해석되지 않는다', () => {
    const out = html(
      <OpsItemList
        items={[makeItem({ original: { user_experience: '<img src=x onerror=alert(1)><script>alert(2)</script>' } })]}
        selectedId={null}
        onSelect={noop}
      />
    )
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('상태가 「실패」인 행에만 칩 아래에 실패 사유가 한 줄(줄임)로 보인다', () => {
    const items = [
      makeItem({ id: 'f', status: 'failed', position: 0 }),
      makeItem({ id: 'g', status: 'failed', position: 1 }),
      makeItem({ id: 'a', status: 'approved', position: 2 }),
    ]
    const reasons = { f: '연결된 미션이 반려됐어요', a: '승인된 행에는 보이지 않아요' }
    const out = html(<OpsItemList items={items} selectedId={null} onSelect={noop} failReasonsByItem={reasons} />)
    expect(out).toContain('연결된 미션이 반려됐어요')
    expect(out).toMatch(/<p class="truncate[^"]*"[^>]*>연결된 미션이 반려됐어요<\/p>/)
    expect(out).not.toContain('승인된 행에는 보이지 않아요')
    // 사유가 없는 실패 행은 줄을 그리지 않는다
    expect(out.match(/class="truncate/g)).toHaveLength(1)
    // 칩 줄 아래, 유저가 겪는 것 위에 놓인다
    expect(out.indexOf('연결된 미션이 반려됐어요')).toBeLessThan(out.indexOf('비 오는 월요일 아침'))
    expect(out.indexOf('실패</span>')).toBeLessThan(out.indexOf('연결된 미션이 반려됐어요'))
  })

  it('실패 사유 지도가 없으면 줄을 그리지 않는다', () => {
    const out = html(<OpsItemList items={[makeItem({ status: 'failed' })]} selectedId={null} onSelect={noop} />)
    expect(out).not.toContain('class="truncate')
  })

  it('rowLead 슬롯이 있을 때만 행 왼쪽 자리를 잡는다', () => {
    const items = [makeItem({ id: 'a' })]
    expect(html(<OpsItemList items={items} selectedId={null} onSelect={noop} rowLead={() => <input type="checkbox" />} />)).toContain('type="checkbox"')
    expect(html(<OpsItemList items={items} selectedId={null} onSelect={noop} />)).not.toContain('size-10')
  })
})

describe('OpsItemDetail', () => {
  const noop = () => {}
  const base = { items: [makeItem()], decisions: [SUBMIT], onSelectItem: noop }

  it('종류·상태 칩·패턴 번호와 ③ 유저가 겪는 것·④ 내용·⑤ 검수를 그린다', () => {
    const out = html(<OpsItemDetail item={makeItem()} {...base} />)
    expect(out).toContain('홈피드 카드')
    expect(out).toContain('검토중')
    expect(out).toContain('패턴 P-07')
    expect(out).toContain('비 오는 월요일 아침, 홈에서 카드를 만나요')
    expect(out).toContain('우산 챙겨 달리기')
    expect(out).toContain('10/5(월) 09:00')
    expect(out).toContain('10/6(화) 09:00')
    expect(out).toContain('세계관과 닿는 카드예요')
    expect(out).toContain('윈터 검수 아직이에요')
    expect(out).toContain('비 오는 날 이야기예요')
  })

  it('색 견본은 #rrggbb일 때만 style에 넣는다', () => {
    const ok = html(<OpsItemDetail item={makeItem()} {...base} />)
    expect(ok).toContain('background-color:#1a2b3c')

    const bad = html(
      <OpsItemDetail
        item={makeItem({
          original: { colors: { a: 'red;background:url(//evil)', b: '#12345', c: 'javascript:alert(1)', d: '#GGGGGG' } },
        })}
        {...base}
      />
    )
    // (접힌 상자(Accordion)가 자기 CSS 변수용 style을 붙이므로 견본의 색 속성이 없는지를 본다)
    expect(bad).not.toContain('background-color')
    expect(bad.match(/style="/g)).toHaveLength(1)
    // 값은 글자로만 보인다
    expect(bad).toContain('javascript:alert(1)')
  })

  it('제출 문자열(문안·검수 이유·에이전트 이름)은 HTML로 해석되지 않는다', () => {
    const out = html(
      <OpsItemDetail
        item={makeItem({
          original: {
            user_experience: '<b>굵게</b>',
            copy: { title: '<script>alert(1)</script>' },
            world_review: { world_related: false, winter_reviewed: false, reason: '<i>이유</i>' },
          },
        })}
        {...base}
        decisions={[{ ...SUBMIT, actor: 'token:<u>이름</u>' }]}
      />
    )
    expect(out).not.toMatch(/<(b|i|u|script)>/)
    expect(out).toContain('&lt;b&gt;굵게&lt;/b&gt;')
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('형식 오류는 경로 이름표와 사유로 나뉘고 승인할 수 있다는 안내가 붙는다', () => {
    const out = html(
      <OpsItemDetail item={makeItem({ formatErrors: ['items[0].starts_at: 시간대가 붙은 ISO 8601 형식이어야 해요.'] })} {...base} />
    )
    expect(out).toContain('공개 시각')
    expect(out).toContain('시간대가 붙은 ISO 8601 형식이어야 해요.')
    expect(out).toContain('형식 오류가 있어도 승인할 수 있어요')
    expect(out).not.toContain('items[0]')
  })

  it('연결은 눌러서 그 항목을 고르는 버튼이고, 없는 키는 안내 글이다(item_key를 제목으로 쓰지 않는다)', () => {
    const target = makeItem({ id: 'm1', position: 1, itemKey: 'mission-1', kind: 'mission', original: { user_experience: '미션을 시작해요' } })
    const out = html(
      <OpsItemDetail
        item={makeItem({ original: { links: ['mission-1', 'ghost'] } })}
        {...base}
        items={[makeItem(), target]}
      />
    )
    expect(out).toContain('미션 · 미션을 시작해요')
    expect(out).toContain('찾을 수 없는 연결이에요')
    expect(out).not.toContain('mission-1')
    expect(out).not.toContain('card-1')
  })

  it('제출 원본은 접힌 상자에 글로 담긴다', () => {
    const out = html(<OpsItemDetail item={makeItem()} {...base} />)
    expect(out).toContain('제출 원본 보기')
  })

  it('결정 기록: 토큰 제출은 「에이전트(이름)가 제출했어요」, 슬랙 실패는 표시한다', () => {
    const out = html(
      <OpsItemDetail
        item={makeItem()}
        {...base}
        decisions={[{ ...SUBMIT, slackResult: { channel: 'report', ok: false, error: 'not_configured' } }]}
      />
    )
    expect(out).toContain('에이전트(윤진)가 제출했어요')
    expect(out).toContain('10/1(목) 09:12')
    expect(out).toContain('슬랙 알림 실패')
    expect(html(<OpsItemDetail item={makeItem()} {...base} />)).not.toContain('슬랙 알림 실패')
    expect(html(<OpsItemDetail item={makeItem()} {...base} decisions={[{ ...SUBMIT, actor: 'admin-uuid' }]} />)).toContain('관리자가 제출했어요')
  })

  it('결정 기록: 에이전트 이름이 비어 있으면 「에이전트()가」 대신 「에이전트가」로 쓴다', () => {
    const out = html(<OpsItemDetail item={makeItem()} {...base} decisions={[{ ...SUBMIT, actor: 'token:' }]} />)
    expect(out).toContain('에이전트가 제출했어요')
    expect(out).not.toContain('에이전트()')
  })

  it('다른 항목의 결정 기록은 보이지 않는다', () => {
    const other: OpsDecisionRecord = { ...SUBMIT, id: 'd2', itemId: 'someone-else', actor: 'token:남' }
    const out = html(<OpsItemDetail item={makeItem()} {...base} decisions={[other]} />)
    expect(out).not.toContain('에이전트(남)')
    expect(out).toContain('아직 기록이 없어요')
  })

  it('detailFooter·detailEdit 슬롯은 있을 때만 그린다', () => {
    const plain = html(<OpsItemDetail item={makeItem()} {...base} />)
    expect(plain).not.toContain('승인하기')
    const withSlots = html(
      <OpsItemDetail
        item={makeItem()}
        {...base}
        detailFooter={() => <button>승인하기</button>}
        detailEdit={() => <p>편집 모드예요</p>}
      />
    )
    expect(withSlots).toContain('승인하기')
    expect(withSlots).toContain('편집 모드예요')
    // 편집 모드는 ③·④ 자리를 대신한다
    expect(withSlots).not.toContain('우산 챙겨 달리기')
  })

  it('종류가 허용값 밖이고 값이 비어도 죽지 않는다', () => {
    const out = html(<OpsItemDetail item={makeItem({ kind: null, original: 5, startsAt: null, endsAt: null })} {...base} />)
    expect(out).toContain('종류 확인 필요')
    expect(out).toContain('유저가 겪는 것이 비어 있어요')
    expect(out).toContain('검수 결과가 없어요')
  })
})

describe('OpsFormatErrors', () => {
  it('묶음 요약은 5건까지 보이고 나머지는 「더 보기」다', () => {
    const errors = Array.from({ length: 7 }, (_, i) => `items[${i}].kind: 틀려요 ${i}.`)
    const out = html(<OpsFormatErrorSummary errors={errors} />)
    expect(out).toContain('형식 오류')
    expect(out).toContain('7건이 있어요')
    expect(out).toContain('틀려요 4.')
    expect(out).not.toContain('틀려요 5.')
    expect(out).toContain('나머지 2건 더 보기')
    expect(out).toContain('1번째 항목')
  })

  it('오류가 없으면 아무것도 그리지 않는다', () => {
    expect(html(<OpsFormatErrorSummary errors={[]} />)).toBe('')
    expect(html(<OpsItemFormatErrors errors={[]} />)).toBe('')
  })
})

describe('OpsBundleWorkspace — 셸', () => {
  const props = { bundleId: 'bundle-1', bundleFormatErrors: [] as string[], decisions: [SUBMIT] }

  it('표시줄·탭 5개(개수)·목록·상세·카드 미리보기를 그린다', () => {
    const items = [
      makeItem({ id: 'a', status: 'reviewing' }),
      makeItem({ id: 'b', position: 1, status: 'rejected', formatErrors: ['x: 틀려요.'] }),
    ]
    const out = html(<OpsBundleWorkspace {...props} items={items} />)
    expect(out).toContain('전체')
    expect(out).toContain('결정할 것')
    expect(out).toContain('멈춘 것')
    expect(out).toContain('밸런스 경고') // 5번째 탭(밸런스 결과를 넘기지 않으면 0)
    expect(out).toContain('aria-label="미리보기"')
    expect(out).toContain('기기 폭') // 선택 항목(카드)의 미리보기와 360·430 전환
    expect(out).toContain('색 견본')
    expect(out).toContain('aria-current="step"')
    // 처음 선택: 결정 전 첫 항목(a)
    expect(out.match(/aria-current="true"/g)).toHaveLength(1)
  })

  it('?item=이 가리키는 항목을 선택하고, 없는 값이면 처음 선택 규칙으로 돌아간다', () => {
    const items = [makeItem({ id: 'a', status: 'reviewing' }), makeItem({ id: 'b', position: 1, status: 'approved', kind: 'mission' })]
    nav.search = 'item=b'
    const picked = html(<OpsBundleWorkspace {...props} items={items} />)
    expect(picked).toMatch(/id="ops-item-row-b"[^>]*border-l-primary/)
    nav.search = 'item=ghost'
    const fallback = html(<OpsBundleWorkspace {...props} items={items} />)
    expect(fallback).toMatch(/id="ops-item-row-a"[^>]*border-l-primary/)
  })

  it('항목이 0개이면 안내 글과 형식 오류 알림이 나온다', () => {
    const out = html(<OpsBundleWorkspace {...props} bundleFormatErrors={['week: 틀려요.']} items={[]} />)
    expect(out).toContain('이 기획에는 항목이 없어요')
    expect(out).toContain('형식 오류')
  })

  it('서랍은 ?drawer=empty일 때만 그리고, 열려도 목록·상세는 그대로 보인다', () => {
    const items = [makeItem({ id: 'a' })]
    expect(html(<OpsBundleWorkspace {...props} items={items} />)).not.toContain('서랍 닫기')
    nav.search = 'drawer=empty'
    const out = html(<OpsBundleWorkspace {...props} items={items} />)
    expect(out).toContain('서랍 닫기')
    expect(out).toContain('서랍은 곧 열려요')
    expect(out).toContain('홈피드 카드')
    expect(out).toContain('비 오는 월요일 아침')
    expect(out).not.toContain('bg-black/80') // 딤이 없다
    nav.search = 'drawer=other'
    expect(html(<OpsBundleWorkspace {...props} items={items} />)).not.toContain('서랍 닫기')
  })

  it('슬롯이 비면 자리를 잡지 않고, 채우면 그 자리에 나온다', () => {
    const items = [makeItem({ id: 'a', status: 'reviewing' })]
    const bare = html(<OpsBundleWorkspace {...props} items={items} />)
    expect(bare).not.toContain('승인하기')
    const filled = html(
      <OpsBundleWorkspace
        {...props}
        items={items}
        barAction={() => <span>바 슬롯</span>}
        rowLead={() => <span>행 슬롯</span>}
        notices={() => <p>알림 슬롯</p>}
        listHeader={() => <span>목록 머리 슬롯</span>}
        detailFooter={() => <span>푸터 슬롯</span>}
        detailHistoryAction={() => <span>기록 머리 슬롯</span>}
      />
    )
    for (const text of ['바 슬롯', '행 슬롯', '알림 슬롯', '목록 머리 슬롯', '푸터 슬롯', '기록 머리 슬롯']) expect(filled).toContain(text)
  })

  it('슬롯이 받는 상태에 선택 항목과 초안 자리가 있다', () => {
    const seen: Array<{ selected: string | null; draft: unknown }> = []
    html(
      <OpsBundleWorkspace
        {...props}
        items={[makeItem({ id: 'a' })]}
        barAction={(ctx) => {
          seen.push({ selected: ctx.selectedItem?.id ?? null, draft: ctx.draft })
          return null
        }}
      />
    )
    expect(seen[0]).toEqual({ selected: 'a', draft: null })
  })
})

// ── 결정 화면 부품 (티켓 20260930_1818) ─────────────────────────────────────────────────────────

describe('OpsDiffLines — 수정 전후 차이', () => {
  it('「문안 · body: 전 → 후」 한 줄씩, 전은 취소선·후는 굵게, 「→」 글자를 함께 그린다', () => {
    const out = flat(<OpsDiffLines diff={[{ path: 'copy.body', before: '오늘은 가볍게', after: '오늘은 천천히' }]} />)
    expect(out).toContain('문안 · body')
    expect(out).toMatch(/line-through[^>]*>오늘은 가볍게</)
    expect(out).toMatch(/font-bold[^>]*>오늘은 천천히</)
    expect(out).toContain('→')
    expect(out).toContain('전 ')
    expect(out).toContain('후 ')
  })

  it('비어 있는 값은 「(없음)」, 시각은 KST로 그린다', () => {
    const out = flat(<OpsDiffLines diff={[{ path: 'ends_at', before: null, after: '2026-10-05T00:00:00.000Z' }]} />)
    expect(out).toContain('종료 시각')
    expect(out).toContain('(없음)')
    expect(out).toContain('10/5(월) 09:00')
  })

  it('바뀐 칸이 없으면 아무것도 그리지 않고, 값은 HTML로 해석되지 않는다', () => {
    expect(html(<OpsDiffLines diff={[]} />)).toBe('')
    const out = html(<OpsDiffLines diff={[{ path: 'copy.title', before: 'a', after: '<img src=x onerror=alert(1)>' }]} />)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})

describe('반려 창 — 이유가 필수', () => {
  it('공백만 있는 이유는 보낼 수 없다', () => {
    expect(canSubmitRejectReason('')).toBe(false)
    expect(canSubmitRejectReason('   ')).toBe(false)
    expect(canSubmitRejectReason('\n \t')).toBe(false)
    expect(canSubmitRejectReason('  문안이 길어요 ')).toBe(true)
  })

  it('처음에는 이유가 비어 있어 [반려하기]가 비활성이고, 붉은 면은 이 버튼 하나뿐이다', () => {
    const out = inDialog(<OpsRejectPanel summary={<p>홈피드 카드</p>} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(out).toContain('이 항목을 반려할까요?')
    expect(out).toContain('반려 이유')
    expect(out).toContain('에이전트가 다음 기획에 참고해요. 구체적으로 적어 주세요')
    expect(out).toContain('반려는 되돌릴 수 없어요')
    expect(out).toContain('0/500')
    expect(out).toMatch(/<textarea[^>]*maxlength="500"/i)
    const confirm = buttonOf(out, '반려하기')
    expect(isDisabled(confirm)).toBe(true)
    expect(confirm).toContain('bg-red-600')
    expect(out.match(/bg-red-600/g)).toHaveLength(1)
    expect(isDisabled(buttonOf(out, '취소'))).toBe(false)
  })

  it('실패 문장은 창 안에 붉은 글로 남고, 처리 중에는 버튼이 진행형 「반려하는 중」이다', () => {
    const out = inDialog(
      <OpsRejectPanel summary={null} error="이미 다른 곳에서 처리한 항목이에요. 화면을 새로 불러왔어요." pending onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(out).toContain('role="alert"')
    expect(out).toContain('이미 다른 곳에서 처리한 항목이에요. 화면을 새로 불러왔어요.')
    expect(out).toContain('반려하는 중')
    expect(out).not.toContain('처리 중...')
  })
})

describe('승인 창 — 형식 오류 경고', () => {
  it('형식 오류가 있어도 「그래도 승인할 수 있어요」로 경고만 하고 5건까지 보인다', () => {
    const errors = Array.from({ length: 7 }, (_, i) => `items[0].copy.k${i}: 틀려요${i}.`)
    const out = flat(<FormatErrorWarning errors={errors} />)
    expect(out).toContain('형식 오류가 7건 있어요')
    expect(out).toContain('그래도 승인할 수 있어요')
    expect(out).toContain('틀려요4.')
    expect(out).not.toContain('틀려요5.')
    expect(out).toContain('외 2건')
    expect(out).toContain('border-amber-300')
  })

  it('확인창 껍데기는 제목·설명·취소·확인 버튼을 그리고 tone이 destructive일 때만 확인 버튼이 붉다', () => {
    const normal = inDialog(<OpsConfirmPanel title="이 항목을 승인할까요?" confirmLabel="승인하기" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(normal).toContain('이 항목을 승인할까요?')
    expect(buttonOf(normal, '승인하기')).not.toContain('bg-red-600')
    const danger = inDialog(<OpsConfirmPanel title="t" tone="destructive" confirmLabel="반려하기" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(buttonOf(danger, '반려하기')).toContain('bg-red-600')
  })
})

describe('일괄 승인', () => {
  const kinds = [
    'home_feed_card',
    'home_feed_card',
    'home_feed_card',
    'home_feed_card',
    'home_feed_card',
    'home_feed_card',
    'home_feed_card',
    'mission',
    'mission',
    'drop_schedule',
    'drop_schedule',
  ]
  const checked = kinds.map((kind, i) => makeItem({ id: `c${i}`, position: i, kind }))
  const excluded = [
    makeItem({
      id: 'x',
      position: 11,
      formatErrors: ['items[11].kind: 틀려요.'],
      original: { user_experience: '비 오는 월요일 아침, 홈에서 우산 챙겨 달리기 카드를 만나요' },
    }),
  ]

  it('요약은 「11개 승인, 1개 제외」와 종류별 개수, 제외 이유를 보여 준다', () => {
    const summary = buildBulkSummary(checked, excluded)
    expect(summary.approveCount).toBe(11)
    expect(summary.excludeCount).toBe(1)
    expect(summary.kinds).toEqual([
      { label: '홈피드 카드', count: 7 },
      { label: '미션', count: 2 },
      { label: '드랍 일정', count: 2 },
    ])
    expect(summary.excludedLines[0].reason).toBe('형식 오류가 있어요')
    expect(summary.errorCount).toBe(0)

    const out = inDialog(<OpsBulkApprovePanel summary={summary} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(out).toContain('11개 승인, 1개 제외')
    expect(out).toContain('홈피드 카드 7 · 미션 2 · 드랍 일정 2')
    expect(out).toContain('제외할 것')
    expect(out).toContain('형식 오류가 있어요')
    expect(out).toContain('승인은 되돌릴 수 없어요. 예약은 승인한 뒤 [예약 등록하기]에서 해요.')
    expect(out).not.toContain('공개는 아직 연결 전이에요')
    expect(isDisabled(buttonOf(out, '11개 승인하기'))).toBe(false)
    // 승인할 것에 형식 오류가 없으면 경고 상자는 없다
    expect(out).not.toContain('형식 오류가 있는 항목')
  })

  it('체크를 푼 항목은 「체크를 풀었어요」, 형식 오류가 든 항목을 승인하면 경고 상자가 붙는다', () => {
    const withError = makeItem({ id: 'e', position: 12, formatErrors: ['items[12].kind: 틀려요.'] })
    const unchecked = makeItem({ id: 'u', position: 13 })
    const summary = buildBulkSummary([...checked, withError], [unchecked])
    expect(summary.excludedLines[0].reason).toBe('체크를 풀었어요')
    expect(summary.errorCount).toBe(1)
    const out = inDialog(<OpsBulkApprovePanel summary={summary} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(out).toContain('12개 승인, 1개 제외')
    expect(out).toContain('형식 오류가 있는 항목 1개가 들어 있어요')
  })

  it('제외한 것이 없으면 「제외할 것」 줄을 그리지 않고, 제외한 줄은 5개까지만 보인다', () => {
    const none = inDialog(<OpsBulkApprovePanel summary={buildBulkSummary(checked, [])} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(none).toContain('11개 승인, 0개 제외')
    expect(none).not.toContain('제외할 것')
    const many = Array.from({ length: 7 }, (_, i) => makeItem({ id: `m${i}`, position: 20 + i }))
    const out = inDialog(<OpsBulkApprovePanel summary={buildBulkSummary(checked, many)} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(out).toContain('외 2개')
  })

  it('[N개 승인하기]는 0개면 비활성이고 「승인할 항목을 골라 주세요」를 알린다', () => {
    const empty = flat(<OpsBulkApprove bundleId="b" checked={[]} excluded={excluded} onApproved={vi.fn()} onConflict={vi.fn()} />)
    expect(isDisabled(buttonOf(empty, '0개 승인하기'))).toBe(true)
    expect(empty).toContain('승인할 항목을 골라 주세요')
    const some = flat(<OpsBulkApprove bundleId="b" checked={checked} excluded={excluded} onApproved={vi.fn()} onConflict={vi.fn()} />)
    expect(isDisabled(buttonOf(some, '11개 승인하기'))).toBe(false)
    expect(some).not.toContain('승인할 항목을 골라 주세요')
    // 눌러야 요약 창이 뜬다(처음에는 창이 없다)
    expect(some).not.toContain('11개 승인, 1개 제외')
  })

  it('결과 토스트 문장: 그 사이 처리된 항목이 있으면 건너뛴 수를 함께 알린다', () => {
    expect(bulkResultMessage(11, 0)).toBe('11개를 승인했어요')
    expect(bulkResultMessage(10, 1)).toBe('10개 승인, 1개는 이미 처리돼 건너뛰었어요')
  })
})

describe('OpsItemActions — 항목 결정 줄', () => {
  it('검토중 항목에만 [반려하기](붉은 글 테두리형)·[수정하기]·[승인하기]가 있고 창은 처음에 닫혀 있다', () => {
    const item = makeItem({ status: 'reviewing' })
    const out = flat(<OpsItemActions bundleId="b" item={item} ctx={makeCtx()} onDecided={vi.fn()} onConflict={vi.fn()} />)
    for (const label of ['반려하기', '수정하기', '승인하기']) expect(out).toContain(label)
    expect(buttonOf(out, '반려하기')).toContain('border-destructive')
    expect(buttonOf(out, '반려하기')).toContain('text-destructive')
    expect(out).not.toContain('bg-red-600')
    expect(out).not.toContain('이 항목을 승인할까요?')
  })

  it('검토중이 아니면 버튼 대신 안내 글만 둔다', () => {
    for (const [status, text] of [
      ['approved', '승인한 항목은 여기서 고칠 수 없어요'],
      ['rejected', '반려한 항목은 여기서 고칠 수 없어요'],
      ['cancelled', '취소한 항목은 여기서 고칠 수 없어요'],
      ['failed', '실패한 항목은 여기서 고칠 수 없어요'],
    ] as const) {
      const out = flat(<OpsItemActions bundleId="b" item={makeItem({ status })} ctx={makeCtx()} onDecided={vi.fn()} onConflict={vi.fn()} />)
      expect(out).toContain(text)
      expect(out).not.toContain('<button')
    }
    expect(decisionGuidance('scheduled')).toContain('다음 단계')
    expect(decisionGuidance('arrived')).toContain('검토중으로 바뀌고')
  })

  it('수정 중인 항목은 결정 버튼이 비활성이고 안내가 붙는다', () => {
    const item = makeItem({ status: 'reviewing' })
    const ctx = makeCtx({ draft: { itemId: item.id, values: {} } })
    const out = flat(<OpsItemActions bundleId="b" item={item} ctx={ctx} onDecided={vi.fn()} onConflict={vi.fn()} />)
    for (const label of ['반려하기', '수정하기', '승인하기']) expect(isDisabled(buttonOf(out, label))).toBe(true)
    expect(out).toContain('수정 중이에요')
  })
})

describe('OpsItemEditForm — 직접 수정 양식', () => {
  const item = makeItem({
    original: {
      user_experience: '비 오는 월요일 아침',
      copy: { title: '우산 챙겨 달리기', body: '오늘은 가볍게' },
      colors: { background: '#1a2b3c' },
      starts_at: '2026-10-05T00:00:00.000Z',
      ends_at: '2026-10-06T00:00:00.000Z',
      segment: 'all',
      links: ['other-card'],
    },
  })
  const values = readEditableValues(item)
  const form = (draftValues: Record<string, unknown>, baseUpdatedAt = item.updatedAt) =>
    flat(
      <OpsItemEditForm
        bundleId="b"
        item={item}
        ctx={makeCtx({ draft: { itemId: item.id, values: draftValues, baseUpdatedAt } })}
        onSaved={vi.fn()}
        onConflict={vi.fn()}
      />
    )

  it('칸 다섯 갈래를 그린다: 유저가 겪는 것·문안 칸들·색·공개/종료 시각(KST)·대상', () => {
    const out = form(values)
    expect(out).toContain('유저가 겪는 것')
    expect(out).toContain('문안 · title')
    expect(out).toContain('문안 · body')
    expect(out).toContain('색 · background')
    expect(out).toContain('type="datetime-local"')
    expect(out).toContain('value="2026-10-05T09:00"')
    expect(out).toContain('value="2026-10-06T09:00"')
    expect(out).toContain('대상')
    expect(out).toContain('수정한 이유(선택)')
  })

  it('못 고치는 칸(종류·연결·검수)은 읽기 전용 목록에 따로 둔다', () => {
    const out = form(values)
    expect(out).toContain('고칠 수 없는 것')
    for (const label of ['종류', '연결', '검수·판정']) expect(out).toContain(`${label}:`)
    expect(out).toContain('홈피드 카드')
  })

  it('손대지 않았으면 「수정됨」 칩이 없고 [저장하기]가 비활성이다', () => {
    const out = form(values)
    expect(out).not.toContain('수정됨')
    expect(out).toContain('아직 바뀐 내용이 없어요')
    expect(isDisabled(buttonOf(out, '저장하기'))).toBe(true)
  })

  it('고친 칸에 「수정됨」 칩과 「바뀌는 내용」 차이 줄이 나오고 [저장하기]가 켜진다', () => {
    const out = form({ ...values, 'copy.body': '오늘은 천천히' })
    expect(out).toContain('수정됨')
    expect(out).toContain('바뀌는 내용')
    expect(out).toMatch(/line-through[^>]*>오늘은 가볍게</)
    expect(out).toMatch(/font-bold[^>]*>오늘은 천천히</)
    expect(isDisabled(buttonOf(out, '저장하기'))).toBe(false)
    expect(out.match(/수정됨/g)).toHaveLength(1)
  })

  it('틀린 칸은 칸 아래 인라인 문장이 나오고 저장할 수 없다(색 형식·시각 비우기)', () => {
    const badColor = form({ ...values, 'colors.background': 'red' })
    expect(badColor).toContain('색은 #rrggbb 형식으로 적어 주세요')
    expect(isDisabled(buttonOf(badColor, '저장하기'))).toBe(true)
    const clearedTime = form({ ...values, ends_at: '' })
    expect(clearedTime).toContain('시각은 비울 수 없어요')
    expect(isDisabled(buttonOf(clearedTime, '저장하기'))).toBe(true)
  })

  it('초안을 연 뒤 항목이 바뀌었으면(수정 시각이 달라졌으면) 안내하고 저장을 막는다', () => {
    const out = form({ ...values, 'copy.body': '오늘은 천천히' }, '2026-09-30T00:00:00Z')
    expect(out).toContain(OPS_EDIT_STALE_MESSAGE)
    expect(isDisabled(buttonOf(out, '저장하기'))).toBe(true)
  })

  it('이 항목의 초안이 아니면 아무것도 그리지 않는다', () => {
    const other = flat(
      <OpsItemEditForm bundleId="b" item={item} ctx={makeCtx({ draft: { itemId: 'other', values } })} onSaved={vi.fn()} onConflict={vi.fn()} />
    )
    expect(other).toBe('')
    const none = flat(<OpsItemEditForm bundleId="b" item={item} ctx={makeCtx()} onSaved={vi.fn()} onConflict={vi.fn()} />)
    expect(none).toBe('')
  })

  it('문안 값은 HTML로 해석되지 않는다', () => {
    const out = form({ ...values, 'copy.body': '<script>alert(1)</script>' })
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('OpsItemDetail — 결정 기록(1818)', () => {
  const base = { items: [] as OpsItemRecord[], decisions: [] as OpsDecisionRecord[], onSelectItem: vi.fn() }
  const decision = (overrides: Partial<OpsDecisionRecord>): OpsDecisionRecord => ({
    id: 'd',
    itemId: 'item-1',
    action: 'approve',
    actor: 'admin-1',
    batchId: null,
    diff: null,
    reason: null,
    slackResult: null,
    createdAt: '2026-10-01T01:00:00Z',
    ...overrides,
  })

  it('승인·반려·수정·되돌림 줄과 사유, 차이 줄을 그린다', () => {
    const decisions = [
      decision({ id: 'd1', action: 'approve' }),
      decision({ id: 'd2', action: 'reject', reason: '문안이 너무 길어요' }),
      decision({
        id: 'd3',
        action: 'edit',
        reason: '문장을 다듬었어요',
        diff: [{ path: 'copy.body', before: '가볍게', after: '천천히' }],
      }),
      decision({
        id: 'd4',
        action: 'revert',
        diff: [{ path: 'copy.body', before: '천천히', after: '가볍게' }],
      }),
    ]
    const out = flat(<OpsItemDetail item={makeItem()} {...base} decisions={decisions} />)
    for (const text of ['승인했어요', '반려했어요', '수정했어요', '수정을 되돌렸어요']) expect(out).toContain(text)
    expect(out).toContain('반려 이유: 문안이 너무 길어요')
    expect(out).toContain('수정한 이유: 문장을 다듬었어요')
    expect(out).toContain('문안 · body')
    expect(out).toContain('되돌림')
  })

  it('예약 등록 기록: execute·fail·cancel 이름표와 「실패 사유」·「취소 사유」', () => {
    const decisions = [
      decision({ id: 'd1', action: 'execute' }),
      decision({ id: 'd2', action: 'fail', reason: '연결된 미션이 반려됐어요' }),
      decision({ id: 'd3', action: 'cancel', reason: '기획이 바뀌었어요' }),
    ]
    const out = flat(<OpsItemDetail item={makeItem()} {...base} decisions={decisions} />)
    expect(out).toContain('관리자가 예약 등록했어요')
    expect(out).toContain('실패 사유: 연결된 미션이 반려됐어요')
    expect(out).toContain('관리자가 공개 전에 취소했어요')
    expect(out).toContain('취소 사유: 기획이 바뀌었어요')
    expect(out).not.toContain('기록을 남겼어요')
  })

  it('실패 기록은 「관리자가」를 붙이지 않는다(실행한 관리자가 실패한 것이 아니다)', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'fail', reason: '이유' })]} />)
    expect(out).toContain('예약 등록에 실패했어요')
    expect(out).not.toContain('관리자가 예약 등록에 실패했어요')
  })

  describe('상태 맞추기(20261002_1814) — 시스템 행위자·end·external_change', () => {
    const SYSTEM = 'system:reconcile'

    it('행위자가 system:으로 시작하면 「시스템이」로 쓴다(관리자·에이전트로 읽히지 않는다)', () => {
      const out = flat(
        <OpsItemDetail item={makeItem()} {...base} decisions={[decision({ id: 'd1', action: 'cancel', actor: SYSTEM, reason: '연결된 자원이 밖에서 지워졌어요' })]} />
      )
      expect(out).toContain('시스템이 공개 전에 취소했어요')
      expect(out).toContain('취소 사유: 연결된 자원이 밖에서 지워졌어요')
      expect(out).not.toContain('관리자가')
      expect(out).not.toContain('에이전트(')
    })

    it('end: 「종료했어요」와 「종료 사유」', () => {
      const out = flat(
        <OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'end', actor: SYSTEM, reason: '연결된 자원이 밖에서 지워졌어요' })]} />
      )
      expect(out).toContain('시스템이 종료했어요')
      expect(out).toContain('종료 사유: 연결된 자원이 밖에서 지워졌어요')
      expect(out).not.toContain('기록을 남겼어요')
    })

    it('fail: 행위자가 시스템이면 「시스템이 실패로 닫았어요」, 사람이면 지금처럼 「예약 등록에 실패했어요」', () => {
      const bySystem = flat(<OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'fail', actor: SYSTEM, reason: '준비중에서 멈췄어요' })]} />)
      expect(bySystem).toContain('시스템이 실패로 닫았어요')
      expect(bySystem).toContain('실패 사유: 준비중에서 멈췄어요')
      expect(bySystem).not.toContain('예약 등록에 실패했어요')
      const byAdmin = flat(<OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'fail', actor: 'admin-1', reason: '이유' })]} />)
      expect(byAdmin).toContain('예약 등록에 실패했어요')
      expect(byAdmin).not.toContain('시스템이')
      expect(byAdmin).not.toContain('관리자가 예약 등록에 실패했어요')
    })

    it('external_change: 이름표와 시각·비활성 차이를 줄마다 보인다(KST)', () => {
      const diff = {
        starts_at: { item: '2026-10-07T00:00:00Z', resource: '2026-10-07T03:30:00Z' },
        ends_at: { item: '2026-10-09T00:00:00Z', resource: null },
        is_active: { item: true, resource: false },
      }
      const out = flat(<OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'external_change', actor: SYSTEM, diff })]} />)
      expect(out).toContain('시스템이 밖에서 바뀐 것을 찾았어요')
      expect(out).toContain('공개 시각: 10/7(수) 09:00 → 10/7(수) 12:30')
      expect(out).toContain('종료 시각: 10/9(금) 09:00 → (없음)')
      expect(out).toContain('자원이 비활성이에요')
    })

    it('external_change: 다른 칸만 줄로 그리고, 모양이 맞지 않는 칸·값은 건너뛴다', () => {
      const only = flat(
        <OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'external_change', actor: SYSTEM, diff: { ends_at: { item: null, resource: '2026-10-09T00:00:00Z' } } })]} />
      )
      expect(only).toContain('종료 시각: (없음) → 10/9(금) 09:00')
      expect(only).not.toContain('공개 시각:')
      expect(only).not.toContain('자원이 비활성이에요')
      for (const diff of [null, 'x', [], { starts_at: 'x', ends_at: { item: 1, resource: null }, is_active: { item: true, resource: true } }]) {
        const out = flat(<OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'external_change', actor: SYSTEM, diff: diff as OpsDecisionRecord['diff'] })]} />)
        expect(out).toContain('시스템이 밖에서 바뀐 것을 찾았어요')
        expect(out).not.toContain('시각:')
        expect(out).not.toContain('자원이 비활성이에요')
      }
    })

    it('external_change의 diff는 edit·revert의 차이 줄(취소선)로 그리지 않는다', () => {
      const out = flat(
        <OpsItemDetail item={makeItem()} {...base} decisions={[decision({ action: 'external_change', actor: SYSTEM, diff: { starts_at: { item: '2026-10-07T00:00:00Z', resource: '2026-10-07T03:30:00Z' } } })]} />
      )
      expect(out).not.toContain('line-through')
    })
  })

  it('되돌림 줄에는 버튼이 없다', () => {
    const decisions = [decision({ action: 'revert', diff: [{ path: 'copy.body', before: 'a', after: 'b' }] })]
    const out = flat(<OpsItemDetail item={makeItem()} {...base} decisions={decisions} />)
    const log = out.slice(out.indexOf('결정 기록'))
    expect(log).not.toContain('<button')
  })

  it('일괄 승인은 표시가 붙고, 일반 승인에는 붙지 않는다', () => {
    const bulk = flat(<OpsItemDetail item={makeItem()} {...base} decisions={[decision({ batchId: 'batch-1' })]} />)
    expect(bulk).toContain('일괄 승인')
    const single = flat(<OpsItemDetail item={makeItem()} {...base} decisions={[decision({})]} />)
    expect(single).not.toContain('일괄 승인')
  })

  it('detailHistoryAction은 결정 기록 머리 오른쪽에 있고, 비면 자리를 잡지 않는다', () => {
    const withAction = flat(<OpsItemDetail item={makeItem()} {...base} detailHistoryAction={() => <button>마지막 수정 되돌리기</button>} />)
    expect(withAction).toContain('마지막 수정 되돌리기')
    const plain = flat(<OpsItemDetail item={makeItem()} {...base} />)
    expect(plain).not.toContain('마지막 수정 되돌리기')
    expect(plain).toContain('결정 기록')
  })
})

describe('OpsDecisionWorkspace — 결정 슬롯', () => {
  const NO_EXECUTION: OpsBundleExecution = { approvedCount: 0, readyCount: 0 }
  const props = { bundleId: 'bundle-1', bundleFormatErrors: [] as string[], execution: NO_EXECUTION }
  const items = [
    makeItem({ id: 'a', position: 0, status: 'reviewing' }),
    makeItem({ id: 'b', position: 1, status: 'reviewing', kind: 'mission', formatErrors: ['items[1].kind: 틀려요.'] }),
    makeItem({ id: 'c', position: 2, status: 'approved', kind: 'drop_schedule' }),
  ]

  it('기본 체크는 형식 오류 없는 검토중 항목이고, 머리줄이 「결정할 것 2개 중 1개 선택」을 알린다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} items={items} decisions={[SUBMIT]} />)
    expect(out).toContain('전체 선택')
    expect(out).toContain('결정할 것 2개 중 1개 선택')
    // 체크박스는 머리줄 1개 + 검토중 행 2개. 승인된 행에는 없다.
    expect(out.match(/role="checkbox"/g)).toHaveLength(3)
    expect(out.match(/role="checkbox"[^>]*aria-checked="true"/g)).toHaveLength(1)
    expect(out).toContain('1개 승인하기')
  })

  it('「공개는 아직 연결 전이에요」와 연결하지 않은 종류 알림은 어디에도 없고 알림 줄을 그리지 않는다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} items={items} decisions={[SUBMIT]} />)
    expect(out).not.toContain('공개는 아직 연결 전이에요')
    expect(out).not.toContain('예약 등록을 연결하지 않았어요')
    const empty = flat(<OpsDecisionWorkspace {...props} items={[]} decisions={[SUBMIT]} />)
    expect(empty).not.toContain('공개는 아직 연결 전이에요')
    expect(empty).not.toContain('role="alert"')
  })

  it('승인됨 항목이 있으면 단계 표시줄 오른쪽에 예약 등록 버튼이 있고, 문구는 예약할 항목 수(N)에 따라 나뉜다', () => {
    const ready = flat(<OpsDecisionWorkspace {...props} execution={{ approvedCount: 2, readyCount: 2 }} items={items} decisions={[SUBMIT]} />)
    expect(ready).toContain('>2개 예약 등록하기<')
    const none = flat(<OpsDecisionWorkspace {...props} execution={{ approvedCount: 1, readyCount: 0 }} items={items} decisions={[SUBMIT]} />)
    expect(none).toContain('>예약 등록하기<')
    // 못 하는 이유를 볼 수 있게 끄지 않는다
    expect(isDisabled(buttonOf(none, '예약 등록하기'))).toBe(false)
  })

  it('승인됨 항목이 없으면 예약 등록 버튼이 없다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} items={items} decisions={[SUBMIT]} />)
    expect(out).not.toContain('예약 등록하기')
  })

  it('일괄 승인 버튼이 함께 있으면 예약 등록 버튼은 그 오른쪽이다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} execution={{ approvedCount: 1, readyCount: 1 }} items={items} decisions={[SUBMIT]} />)
    expect(out.indexOf('1개 승인하기')).toBeGreaterThan(-1)
    expect(out.indexOf('1개 승인하기')).toBeLessThan(out.indexOf('1개 예약 등록하기'))
  })

  it('결정 전 항목이 없어 일괄 승인이 없어도 예약 등록 버튼은 혼자 보인다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} execution={{ approvedCount: 1, readyCount: 1 }} items={[items[2]]} decisions={[SUBMIT]} />)
    expect(out).not.toContain('개 승인하기')
    expect(out).toContain('1개 예약 등록하기')
  })

  it('실패한 항목의 사유는 결정 기록에서 가장 최근 fail을 모아 행에 보인다', () => {
    const failed = makeItem({ id: 'x', position: 5, status: 'failed' })
    const decisions: OpsDecisionRecord[] = [
      { ...SUBMIT, id: 'f2', itemId: 'x', action: 'fail', reason: '두 번째 사유', createdAt: '2026-10-02T02:00:00Z' },
      { ...SUBMIT, id: 'f1', itemId: 'x', action: 'fail', reason: '첫 사유', createdAt: '2026-10-02T01:00:00Z' },
      SUBMIT,
    ]
    const out = flat(<OpsDecisionWorkspace {...props} items={[...items, failed]} decisions={decisions} />)
    expect(out).toContain('두 번째 사유')
    expect(out).not.toContain('첫 사유')
  })

  it('선택한 검토중 항목 아래에 [반려하기]·[수정하기]·[승인하기]가 있다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} items={items} decisions={[SUBMIT]} />)
    for (const label of ['반려하기', '수정하기', '승인하기']) expect(out).toContain(`>${label}<`)
  })

  describe('상세 카드 아래 줄 — 예약됨 항목은 공개 전 취소(티켓 20261002_1649)', () => {
    const scheduled = makeItem({ id: 's1', position: 3, status: 'scheduled', original: { user_experience: '예약된 경험' } })
    const live = makeItem({ id: 'l1', position: 4, status: 'live', original: { user_experience: '게재 중인 경험' } })
    const withScheduled = [...items, scheduled, live]

    it('예약됨 항목을 고르면 안내와 [공개 전 취소하기]가 나오고 [반려하기]·[수정하기]·[승인하기]는 없다', () => {
      nav.search = 'item=s1'
      const out = flat(<OpsDecisionWorkspace {...props} items={withScheduled} decisions={[SUBMIT]} />)
      expect(out).toContain('예약된 항목이에요. 공개 시각 전에는 취소할 수 있어요.')
      expect(out).toContain('>공개 전 취소하기<')
      for (const label of ['반려하기', '수정하기', '승인하기']) expect(out).not.toContain(`>${label}<`)
      // 확인창은 처음에 닫혀 있다(열 때 미리 보기 요청을 보낸다)
      expect(out).not.toContain('이 항목을 공개 전에 취소할까요?')
    })

    it('검토중 항목을 고르면 지금처럼 [반려하기]·[수정하기]·[승인하기]이고 취소 버튼은 없다', () => {
      nav.search = 'item=a'
      const out = flat(<OpsDecisionWorkspace {...props} items={withScheduled} decisions={[SUBMIT]} />)
      for (const label of ['반려하기', '수정하기', '승인하기']) expect(out).toContain(`>${label}<`)
      expect(out).not.toContain('공개 전 취소하기')
      expect(out).not.toContain('예약된 항목이에요')
    })

    it('승인됨 항목은 지금처럼 안내 글만 나오고 취소·지금 종료 버튼은 없다', () => {
      nav.search = 'item=c'
      const approved = flat(<OpsDecisionWorkspace {...props} items={withScheduled} decisions={[SUBMIT]} />)
      expect(approved).toContain('승인한 항목은 여기서 고칠 수 없어요')
      expect(approved).not.toContain('공개 전 취소하기')
      expect(approved).not.toContain('지금 종료하기')
    })
  })

  describe('상세 카드 아래 줄 — 게재중 항목은 지금 종료(티켓 20261006_1038)', () => {
    const live = makeItem({ id: 'l1', position: 4, status: 'live', original: { user_experience: '게재 중인 경험' } })
    const liveDrop = makeItem({ id: 'l2', position: 5, status: 'live', kind: 'drop_schedule', original: { user_experience: '놓인 드랍' } })
    const ended = makeItem({ id: 'e1', position: 6, status: 'ended', original: { user_experience: '끝난 경험' } })
    const all = [...items, live, liveDrop, ended]

    it('게재중 카드·미션·JAM! 배지·컬렉션·레시피는 안내와 [지금 종료하기]가 나오고 반려·수정·승인·취소 버튼은 없다', () => {
      for (const kind of ['home_feed_card', 'mission', 'jam_badge', 'collection_launch', 'recipe']) {
        nav.search = 'item=k1'
        const out = flat(<OpsDecisionWorkspace {...props} items={[...items, makeItem({ id: 'k1', position: 7, status: 'live', kind })]} decisions={[SUBMIT]} />)
        expect(out, kind).toContain('게재 중인 항목이에요. 지금 종료하면 유저 화면에서 바로 내려가요.')
        expect(out, kind).toContain('>지금 종료하기<')
        for (const label of ['반려하기', '수정하기', '승인하기', '공개 전 취소하기']) expect(out, `${kind} ${label}`).not.toContain(`>${label}<`)
        // 확인창은 처음에 닫혀 있다(열 때 미리 보기 요청을 보낸다)
        expect(out, kind).not.toContain('이 항목을 지금 종료할까요?')
      }
    })

    it('지금 종료가 없는 종류(드랍 예약)는 게재중이어도 지금처럼 기본 안내 글만 나온다', () => {
      nav.search = 'item=l2'
      const out = flat(<OpsDecisionWorkspace {...props} items={all} decisions={[SUBMIT]} />)
      expect(out).toContain('이 항목은 이미 다음 단계에 있어서 여기서 결정하거나 고칠 수 없어요')
      expect(out).not.toContain('지금 종료하기')
    })

    it('종료한 항목은 「종료한 항목은 여기서 고칠 수 없어요」 안내만 나오고 버튼은 없다', () => {
      nav.search = 'item=e1'
      const out = flat(<OpsDecisionWorkspace {...props} items={all} decisions={[SUBMIT]} />)
      expect(out).toContain('종료한 항목은 여기서 고칠 수 없어요')
      expect(out).not.toContain('지금 종료하기')
      expect(out).not.toContain('이 항목은 이미 다음 단계에 있어서')
    })

    it('검토중 항목에는 지금 종료 줄이 없다', () => {
      nav.search = 'item=a'
      const out = flat(<OpsDecisionWorkspace {...props} items={all} decisions={[SUBMIT]} />)
      expect(out).not.toContain('지금 종료하기')
      expect(out).not.toContain('게재 중인 항목이에요')
    })
  })

  it('검토중 항목이 없으면 승인 버튼·전체 선택·체크박스가 없고 안내 글만 나온다', () => {
    const out = flat(<OpsDecisionWorkspace {...props} items={[items[2]]} decisions={[SUBMIT]} />)
    expect(out).not.toContain('전체 선택')
    expect(out).not.toContain('role="checkbox"')
    expect(out).not.toContain('개 승인하기')
    expect(out).toContain('승인한 항목은 여기서 고칠 수 없어요')
  })

  it('「마지막 수정 되돌리기」는 되돌릴 수정이 남은 검토중 항목에만 있다', () => {
    const edit: OpsDecisionRecord = {
      ...SUBMIT,
      id: 'e1',
      itemId: 'a',
      action: 'edit',
      diff: [{ path: 'copy.title', before: 'a', after: 'b' }],
      createdAt: '2026-10-01T01:00:00Z',
    }
    const revert: OpsDecisionRecord = { ...edit, id: 'r1', action: 'revert', createdAt: '2026-10-01T02:00:00Z' }
    const withEdit = flat(<OpsDecisionWorkspace {...props} items={items} decisions={[SUBMIT, edit]} />)
    expect(withEdit).toContain('마지막 수정 되돌리기')
    const reverted = flat(<OpsDecisionWorkspace {...props} items={items} decisions={[SUBMIT, edit, revert]} />)
    expect(reverted).not.toContain('마지막 수정 되돌리기')
    const noEdit = flat(<OpsDecisionWorkspace {...props} items={items} decisions={[SUBMIT]} />)
    expect(noEdit).not.toContain('마지막 수정 되돌리기')
  })
})

describe('OpsSampleDeleteMenu', () => {
  it('「...」 메뉴 버튼만 그리고 확인창은 처음에 닫혀 있다', () => {
    const out = flat(<OpsSampleDeleteMenu bundleId="b" itemCount={3} />)
    expect(out).toContain('aria-label="기획 메뉴"')
    expect(out).not.toContain('시험 묶음 지우기')
    expect(out).not.toContain('확인 문구')
  })
})
