/**
 * 항목 결정 줄 공용 부품과 상태 잔상 (티켓 20261006_1537 ③-b)
 *
 * `OpsDecisionWorkspace`에서 빼낸 푸터 분기(`OpsItemFooter`)와 1.2초 잔상 계산(`changedStatusKeys`)을 고정한다. 저장소에 jsdom·testing-library가 없어
 * 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 본다. 토스트·요청 흐름은 브라우저 동작이라 여기서 다루지 않는다(결정 API는 기존 `decisions` 테스트가 지킨다).
 *
 * 지키는 것:
 * - 분기: 검토중은 반려·수정·승인, 예약됨은 공개 전 취소, 게재중이고 종료가 있는 종류는 지금 종료, 게재중이어도 종료가 없는 종류는 안내 글만
 * - `statusNotice`가 글을 돌려주면 결정 줄 대신 그 글이다(없거나 null이면 분기가 그린다)
 * - 잔상: 이전에 있던 키의 상태가 달라진 것만 센다(새로 나타난 키는 아니다)
 * - 서랍 틀: 제목(`title`)은 기본 「서랍」이고, 제목 글자는 포커스를 받을 수 있다(`tabindex="-1"`). 딤이 없다. 글자를 적는 칸 안에서 누른 Esc는 서랍을 닫지 않는다(수정 초안 보호)
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import type { OpsWorkspaceContext } from '../OpsBundleWorkspace'
import { OpsDrawerFrame, isTextEntryTarget } from '../OpsDrawerFrame'
import { OpsItemFooter, type OpsItemResultHandlers } from '../OpsItemFooter'
import { FLASH_MS, changedStatusKeys } from '../useStatusFlash'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>).replace(/<!-- -->/g, '')

function makeItem(overrides: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: '2026-10-05T09:00:00+09:00',
    endsAt: null,
    status: 'reviewing',
    original: { user_experience: '비 오는 월요일 아침', copy: { title: '우산 챙겨 달리기' } },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const handlers: OpsItemResultHandlers = {
  refresh: vi.fn(),
  revert: vi.fn(async () => {}),
  handleSaved: vi.fn(),
  handleDecided: vi.fn(),
  handleCancelled: vi.fn(),
  handleEnded: vi.fn(),
  handleItemEnded: vi.fn(),
  startItemImage: vi.fn(),
}

function footer(item: OpsItemRecord, extra: Partial<Parameters<typeof OpsItemFooter>[0]> = {}) {
  const ctx: OpsWorkspaceContext = {
    bundleId: 'bundle-1',
    items: [item],
    selectedItem: item,
    draft: null,
    setDraft: vi.fn(),
    selectItem: vi.fn(),
  }
  return html(<OpsItemFooter bundleId="bundle-1" item={item} ctx={ctx} isSample={false} handlers={handlers} {...extra} />)
}

describe('OpsItemFooter — 상태별 분기', () => {
  it('검토중이면 반려하기·수정하기·승인하기가 나온다', () => {
    const out = footer(makeItem({ status: 'reviewing' }))
    expect(out).toContain('반려하기')
    expect(out).toContain('수정하기')
    expect(out).toContain('승인하기')
  })

  it('예약됨이면 공개 전 취소하기만 나오고 승인·반려는 없다', () => {
    const out = footer(makeItem({ status: 'scheduled' }))
    expect(out).toContain('공개 전 취소하기')
    expect(out).not.toContain('승인하기')
    expect(out).not.toContain('반려하기')
  })

  it('게재중이고 지금 종료가 있는 종류면 지금 종료하기가 나온다', () => {
    const out = footer(makeItem({ status: 'live', kind: 'mission' }))
    expect(out).toContain('지금 종료하기')
    expect(out).not.toContain('승인하기')
  })

  it('게재중이어도 지금 종료가 없는 종류는 안내 글뿐이다', () => {
    const out = footer(makeItem({ status: 'live', kind: 'pattern_proposal' }))
    expect(out).not.toContain('지금 종료하기')
    expect(out).not.toContain('승인하기')
    expect(out).toContain('이 항목은 이미 다음 단계에 있어서 여기서 결정하거나 고칠 수 없어요')
  })

  it('statusNotice가 글을 돌려주면 결정 줄 대신 그 글이고, null이면 분기가 그린다', () => {
    const notice = (item: OpsItemRecord) => (item.status === 'approved' ? <p>안내 글</p> : null)
    const approved = footer(makeItem({ status: 'approved' }), { statusNotice: notice })
    expect(approved).toContain('안내 글')
    expect(approved).not.toContain('승인한 항목은 여기서 고칠 수 없어요')
    const reviewing = footer(makeItem({ status: 'reviewing' }), { statusNotice: notice })
    expect(reviewing).toContain('승인하기')
    expect(reviewing).not.toContain('안내 글')
  })

  it('statusNotice가 없으면 승인됨 항목은 기존 안내 글이다(S3 그대로)', () => {
    expect(footer(makeItem({ status: 'approved' }))).toContain('승인한 항목은 여기서 고칠 수 없어요')
  })
})

describe('changedStatusKeys — 잔상 대상', () => {
  it('이전에 있던 키의 상태가 달라진 것만 센다', () => {
    expect(changedStatusKeys({ a: 'reviewing', b: 'scheduled' }, { a: 'approved', b: 'scheduled' })).toEqual(['a'])
  })

  it('새로 나타난 키와 사라진 키는 바뀐 것이 아니다', () => {
    expect(changedStatusKeys({ a: 'reviewing' }, { a: 'reviewing', b: 'approved' })).toEqual([])
    expect(changedStatusKeys({ a: 'reviewing', b: 'approved' }, { a: 'reviewing' })).toEqual([])
  })

  it('잔상은 1.2초다', () => {
    expect(FLASH_MS).toBe(1200)
  })
})

describe('OpsDrawerFrame — 제목 칸', () => {
  it('제목을 주지 않으면 「서랍」이고 비어 있으면 S3의 안내 글이 나온다', () => {
    const out = html(<OpsDrawerFrame onClose={() => {}} />)
    expect(out).toContain('aria-label="서랍"')
    expect(out).toMatch(/<h2[^>]*>서랍<\/h2>/)
    expect(out).toContain('서랍은 곧 열려요')
    expect(out).toContain('서랍 닫기')
  })

  it('제목을 주면 머리 글자와 영역 이름이 그 제목이고, 제목 글자는 포커스를 받을 수 있다', () => {
    const out = html(
      <OpsDrawerFrame onClose={() => {}} title="서랍 · 홈피드 카드 「우산」">
        <p>안쪽</p>
      </OpsDrawerFrame>
    )
    expect(out).toContain('aria-label="서랍 · 홈피드 카드 「우산」"')
    expect(out).toMatch(/<h2[^>]*tabindex="-1"[^>]*>서랍 · 홈피드 카드 「우산」<\/h2>/)
    expect(out).toContain('안쪽')
    expect(out).not.toContain('서랍은 곧 열려요')
    expect(out).not.toContain('bg-black/80')
  })
})

describe('isTextEntryTarget — 글자를 적는 칸 안의 Esc는 서랍을 닫지 않는다', () => {
  it('입력·여러 줄 입력·선택·편집 가능한 영역을 가까운 조상까지 찾아보고, 찾으면 참이다', () => {
    const asked: string[] = []
    const inside = {
      closest: (selector: string) => {
        asked.push(selector)
        return {}
      },
    }
    expect(isTextEntryTarget(inside)).toBe(true)
    for (const kind of ['input', 'textarea', 'select', '[contenteditable]']) expect(asked[0], kind).toContain(kind)
    // contenteditable="false"는 글자를 적는 칸이 아니다
    expect(asked[0]).toContain(':not([contenteditable="false"])')
  })

  it('찾지 못하거나 요소가 아니면 거짓이다(버튼·문서 등)', () => {
    expect(isTextEntryTarget({ closest: () => null })).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)
    expect(isTextEntryTarget(undefined)).toBe(false)
    expect(isTextEntryTarget({ nodeType: 9 })).toBe(false)
  })
})
