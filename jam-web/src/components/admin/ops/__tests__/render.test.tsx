/**
 * 받은 기획함 화면 부품의 초기 렌더 (티켓 20260930_1817)
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
import type { OpsDecisionRecord, OpsItemRecord } from '@/lib/admin/opsInbox/query'

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)

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

  it('표시줄·탭 4개(개수)·목록·상세·미리보기 빈 틀을 그린다', () => {
    const items = [
      makeItem({ id: 'a', status: 'reviewing' }),
      makeItem({ id: 'b', position: 1, status: 'rejected', formatErrors: ['x: 틀려요.'] }),
    ]
    const out = html(<OpsBundleWorkspace {...props} items={items} />)
    expect(out).toContain('전체')
    expect(out).toContain('결정할 것')
    expect(out).toContain('멈춘 것')
    expect(out).toContain('미리보기는 곧 열려요')
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
        detailFooter={() => <span>푸터 슬롯</span>}
      />
    )
    for (const text of ['바 슬롯', '행 슬롯', '알림 슬롯', '푸터 슬롯']) expect(filled).toContain(text)
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
