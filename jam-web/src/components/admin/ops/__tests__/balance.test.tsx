/**
 * 밸런스 경고 화면 부품의 초기 렌더 (티켓 20260930_1459 조각 A, 채원 확정 설계)
 *
 * 저장소에 jsdom·testing-library가 없어(`render.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다:
 * 수준 칩이 아이콘과 글자로 나오는지, 임시값 칩이 임시값 규칙의 줄에만 붙는지, 경고 블록·묶음 알림이 `role="region"`인지, 행 칩·5번째 탭 숫자·
 * 묶음 알림 건수가 같은 줄에서 나와 서로 맞는지, 알림 순서, 평가 실패·반려 항목·편집 중 표시. 클릭은 브라우저 동작이라 다루지 않는다.
 * 규칙 판정 자체는 `lib/admin/opsInbox/balance/__tests__`가 본다.
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

import { OpsBalanceBundleNotice, OpsBalanceItemWarnings, OpsBalanceLine } from '../OpsBalanceWarnings'
import { OpsBundleWorkspace } from '../OpsBundleWorkspace'
import { OpsItemDetail } from '../OpsItemDetail'
import { OpsItemList } from '../OpsItemList'
import { OpsStatusBadge } from '../OpsStatusBadge'
import { evaluateBundleBalance, type BalanceWarning } from '@/lib/admin/opsInbox/balance/evaluate'
import {
  buildBalanceView,
  itemBalanceInfoOf,
  type BalanceLine,
  type OpsBundleBalance,
} from '@/lib/admin/opsInbox/balance/view'
import { NOW, makeRules, makeState, openBooks } from '@/lib/admin/opsInbox/balance/__tests__/fixtures'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')

function warning(overrides: Partial<BalanceWarning> = {}): BalanceWarning {
  return {
    ruleKey: 'point_reward_max',
    level: 'warn',
    itemId: 'a',
    message: '이 미션이 주는 포인트가 80 포인트예요. 미션은 50 포인트까지가 기준이에요.',
    measured: 80,
    limit: 50,
    provisional: false,
    ...overrides,
  }
}

const line = (kind: BalanceLine['kind'], overrides: Partial<BalanceWarning> = {}): BalanceLine => ({
  kind,
  warning: warning({ level: kind === 'warn' ? 'warn' : 'info', ...overrides }),
})

function makeItem(overrides: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'k1',
    kind: 'mission',
    patternNo: null,
    startsAt: null,
    endsAt: null,
    status: 'reviewing',
    original: { user_experience: '미션을 깨요' },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  nav.search = ''
})

describe('OpsStatusBadge — 밸런스 칩', () => {
  it('주의는 경고 색 + 저울 아이콘 + 「밸런스 주의 N」, 참고는 중립 색 + 같은 아이콘 + 「밸런스 참고 N」', () => {
    const warn = flat(<OpsStatusBadge type="balance" level="warn" count={2} />)
    expect(warn).toContain('밸런스 주의 2')
    expect(warn).toContain('border-amber-300')
    expect(warn).toContain('aria-hidden="true"')
    const info = flat(<OpsStatusBadge type="balance" level="info" count={1} />)
    expect(info).toContain('밸런스 참고 1')
    expect(info).not.toContain('border-amber-300')
  })
})

describe('OpsBalanceLine', () => {
  it('수준 칩은 글자와 아이콘이다: 주의 · 참고 · 점검 못 함(점선 테두리)', () => {
    expect(flat(<OpsBalanceLine line={line('warn')} />)).toMatch(/>주의</)
    expect(flat(<OpsBalanceLine line={line('info')} />)).toMatch(/>참고</)
    const unreadable = flat(<OpsBalanceLine line={line('unreadable')} />)
    expect(unreadable).toMatch(/>점검 못 함</)
    expect(unreadable).toContain('border-dashed')
    expect(unreadable.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(1)
  })

  it('임시값 규칙의 줄에만 「임시값·실측 전」 칩이 붙고 문장 괄호로는 쓰지 않는다', () => {
    const provisional = flat(<OpsBalanceLine line={line('warn', { provisional: true })} />)
    expect(provisional).toContain('임시값·실측 전')
    expect(provisional).not.toContain('(임시값')
    expect(flat(<OpsBalanceLine line={line('warn', { provisional: false })} />)).not.toContain('임시값·실측 전')
  })

  it('「시험」 칩은 showSampleChip일 때만 단다', () => {
    expect(flat(<OpsBalanceLine line={line('warn')} />)).not.toContain('시험')
    expect(flat(<OpsBalanceLine line={line('warn')} showSampleChip />)).toContain('시험')
  })

  it('문장은 React 텍스트 노드로만 그린다(HTML로 해석하지 않는다)', () => {
    const out = flat(<OpsBalanceLine line={line('warn', { message: '<img src=x onerror=alert(1)> 포인트' })} />)
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt; 포인트')
    expect(out).not.toContain('<img')
  })

  it('좁은 폭에서 가로로 넘치지 않는다: 칩은 감싸고 문장은 줄을 바꾼다', () => {
    const out = flat(<OpsBalanceLine line={line('warn')} />)
    expect(out).toContain('flex-wrap')
    expect(out).toContain('break-words')
  })
})

describe('OpsBalanceItemWarnings — 항목 상세 블록', () => {
  it('region 구역이고 경고 알림(role="alert")이 아니다. 제목·줄·승인 가능 안내가 있다', () => {
    const out = flat(<OpsBalanceItemWarnings lines={[line('warn')]} />)
    expect(out).toContain('role="region"')
    expect(out).toContain('aria-label="밸런스 경고"')
    expect(out).not.toContain('role="alert"')
    expect(out).toContain('밸런스 경고</h5>')
    expect(out).toContain('이 미션이 주는 포인트가 80 포인트예요.')
    expect(out).toContain('경고가 있어도 승인할 수 있어요.')
  })

  it('줄이 없으면 아무것도 그리지 않는다', () => {
    expect(flat(<OpsBalanceItemWarnings lines={[]} />)).toBe('')
  })

  it('주의가 있으면 경고 색, 참고·점검 못 함만 있으면 기본 색이다', () => {
    expect(flat(<OpsBalanceItemWarnings lines={[line('warn')]} />)).toContain('border-amber-300')
    const calm = flat(<OpsBalanceItemWarnings lines={[line('info'), line('unreadable')]} />)
    expect(calm).not.toContain('border-amber-300')
  })

  it('편집 중이면 「고치는 중이에요」 안내가 더해진다', () => {
    expect(flat(<OpsBalanceItemWarnings lines={[line('warn')]} />)).not.toContain('고치는 중이에요')
    expect(flat(<OpsBalanceItemWarnings lines={[line('warn')]} editing />)).toContain('고치는 중이에요. 저장하면 밸런스를 다시 확인해요')
  })

  it('「밸런스 규칙 보기」는 설정 화면이 생기기 전에는 숨기고, 켜면 새 탭 링크다', () => {
    expect(flat(<OpsBalanceItemWarnings lines={[line('warn')]} />)).not.toContain('밸런스 규칙 보기')
    const out = flat(<OpsBalanceItemWarnings lines={[line('warn')]} showRuleLink />)
    expect(out).toContain('밸런스 규칙 보기')
    expect(out).toContain('href="/admin/ops-settings#rule-point_reward_max"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
})

describe('OpsBalanceBundleNotice — 묶음 알림', () => {
  const bundleLine = (n: number): BalanceLine => line('warn', { itemId: null, ruleKey: 'weekly_new_collections_max', message: `묶음 문장 ${n}` })

  function viewOf(warnings: BalanceWarning[], unreadable: BalanceWarning[] = []) {
    return buildBalanceView({ status: 'ok', warnings, unreadable, checkedRuleCountByItem: {}, openCollectionsNow: 30 })
  }

  it('결과가 없으면 아무것도 그리지 않는다', () => {
    expect(flat(<OpsBalanceBundleNotice view={buildBalanceView(undefined)} />)).toBe('')
  })

  it('경고가 하나도 없으면 아무것도 그리지 않는다', () => {
    expect(flat(<OpsBalanceBundleNotice view={viewOf([])} />)).toBe('')
  })

  it('제목·부제의 건수는 항목 줄과 묶음 줄을 모두 센다(주의 · 참고)', () => {
    const view = viewOf(
      [warning({ itemId: 'a' }), warning({ itemId: null }), warning({ itemId: 'b', level: 'info' })],
      [warning({ itemId: 'c', level: 'info' })]
    )
    const out = flat(<OpsBalanceBundleNotice view={view} />)
    expect(out).toContain('밸런스 경고 4건이 있어요')
    expect(out).toContain('주의 2건 · 참고 2건. 경고가 있어도 승인할 수 있어요.')
    expect(out).toContain('role="region"')
    expect(out).toContain('aria-label="밸런스 경고"')
    expect(out).not.toContain('role="alert"')
  })

  it('주의가 있으면 경고 색, 참고뿐이면 기본 색이다', () => {
    expect(flat(<OpsBalanceBundleNotice view={viewOf([warning()])} />)).toContain('border-amber-300')
    expect(flat(<OpsBalanceBundleNotice view={viewOf([warning({ level: 'info' })])} />)).not.toContain('border-amber-300')
  })

  it('시험 묶음이면 「다른 묶음의 경고 계산에 들어가지 않아요」 안내가 붙고, 줄마다 「시험」 칩은 달지 않는다', () => {
    const view = viewOf([warning({ itemId: null })])
    expect(flat(<OpsBalanceBundleNotice view={view} />)).not.toContain('시험 묶음이에요')
    const out = flat(<OpsBalanceBundleNotice view={view} isSample />)
    expect(out).toContain('시험 묶음이에요. 이 묶음의 항목은 다른 묶음의 경고 계산에 들어가지 않아요.')
    expect(out).not.toContain('>시험<')
  })

  it('묶음 줄은 5건까지 보이고 나머지는 「나머지 N건 더 보기」다', () => {
    const view = viewOf(Array.from({ length: 7 }, (_, n) => bundleLine(n + 1).warning))
    const out = flat(<OpsBalanceBundleNotice view={view} />)
    for (const n of [1, 2, 3, 4, 5]) expect(out).toContain(`묶음 문장 ${n}`)
    expect(out).not.toContain('묶음 문장 6')
    expect(out).toContain('나머지 2건 더 보기')
  })

  it('「경고 있는 항목만 보기」는 항목 줄이 있고 이동 함수가 있을 때만 보인다', () => {
    const withItems = viewOf([warning({ itemId: 'a' })])
    expect(flat(<OpsBalanceBundleNotice view={withItems} onShowItems={() => {}} />)).toContain('경고 있는 항목만 보기')
    expect(flat(<OpsBalanceBundleNotice view={withItems} />)).not.toContain('경고 있는 항목만 보기')
    const bundleOnly = viewOf([warning({ itemId: null })])
    expect(flat(<OpsBalanceBundleNotice view={bundleOnly} onShowItems={() => {}} />)).not.toContain('경고 있는 항목만 보기')
  })

  it('평가 실패는 경고 색 알림 한 줄이다(승인은 할 수 있다)', () => {
    const out = flat(<OpsBalanceBundleNotice view={buildBalanceView({ status: 'failed' })} />)
    expect(out).toContain('밸런스를 확인하지 못했어요. 새로 고치면 다시 확인해요. 승인은 할 수 있어요.')
    expect(out).toContain('border-amber-300')
    expect(out).toContain('role="region"')
  })
})

// ── 평가 결과 → 화면 한 벌 ───────────────────────────────────────────────────────────────────────

describe('샘플 묶음: 행 칩 · 탭 숫자 · 묶음 알림 · 상세 블록이 서로 맞는다', () => {
  const props = { bundleId: 'bundle-1', bundleFormatErrors: [] as string[], decisions: [] }

  const launchA = makeItem({
    id: 'A',
    position: 0,
    kind: 'collection_launch',
    startsAt: '2026-10-12T00:00:00.000Z',
    endsAt: '2026-12-31T00:00:00.000Z',
    original: {
      user_experience: '새 컬렉션이 열려요',
      starts_at: '2026-10-12T09:00:00+09:00',
      ends_at: '2026-12-31T09:00:00+09:00',
      resource: { reward_points: 25 },
    },
  })
  const launchB = makeItem({
    id: 'B',
    position: 1,
    kind: 'collection_launch',
    startsAt: '2026-10-15T00:00:00.000Z',
    endsAt: '2026-12-31T00:00:00.000Z',
    original: { user_experience: '두 번째 컬렉션', starts_at: '2026-10-15T09:00:00+09:00', ends_at: '2026-12-31T09:00:00+09:00' },
  })
  const heavyMission = makeItem({ id: 'C', position: 2, kind: 'mission', original: { user_experience: '미션이에요', resource: { reward_points: 80 } } })
  const calmRecipe = makeItem({ id: 'D', position: 3, kind: 'recipe', original: { user_experience: '레시피예요', resource: { reward_points: 10 } } })
  const items = [launchA, launchB, heavyMission, calmRecipe]

  function balanceOf(list: OpsItemRecord[]): OpsBundleBalance {
    const evaluation = evaluateBundleBalance(
      list.map((item) => ({ ...item, approvedAt: null })),
      makeRules(),
      makeState({ books: { ok: true, data: openBooks(30) } }),
      NOW
    )
    return { status: 'ok', ...evaluation, openCollectionsNow: 30 }
  }

  it('평가 결과가 예상한 줄로 나뉜다(R1·R2·R4·R5가 각각 걸린다)', () => {
    const balance = balanceOf(items)
    if (balance.status !== 'ok') throw new Error('평가가 성공해야 해요')
    const byItem = (id: string) => balance.warnings.filter((w) => w.itemId === id).map((w) => w.ruleKey)
    expect(byItem('A')).toEqual(['open_collections_max', 'launch_lead_days_min', 'point_reward_max'])
    expect(byItem('B')).toEqual(['open_collections_max', 'launch_lead_days_min'])
    expect(byItem('C')).toEqual(['point_reward_max'])
    expect(byItem('D')).toEqual([])
    expect(balance.warnings.filter((w) => w.itemId === null).map((w) => w.ruleKey)).toEqual(['weekly_new_collections_max'])
    expect(balance.unreadable.map((u) => [u.itemId, u.ruleKey])).toEqual([['B', 'point_reward_max']])
  })

  it('행 칩 · 5번째 탭 숫자 · 묶음 알림 건수가 같은 줄에서 센 값이다', () => {
    const out = flat(<OpsBundleWorkspace {...props} items={items} balance={balanceOf(items)} />)
    // 행 칩(항목마다 하나, 주의가 있으면 주의 개수)
    expect(out).toContain('밸런스 주의 3') // A: R1·R4·R5
    expect(out).toContain('밸런스 주의 2') // B: R1·R4 (점검 못 함 1은 참고라 칩에 섞지 않는다)
    expect(out).toContain('밸런스 주의 1') // C: R5
    expect(out.match(/밸런스 (주의|참고) \d/g)).toHaveLength(3) // D는 칩이 없다
    // 5번째 탭: 항목 줄이 있는 항목 수(A·B·C). 묶음 줄(R2)은 세지 않는다
    expect(out).toMatch(/밸런스 경고<span[^>]*>3<\/span>/)
    // 묶음 알림: 항목 줄 + 묶음 줄 = 주의 7(3+2+1+묶음 1) · 참고 1(점검 못 함)
    expect(out).toContain('밸런스 경고 8건이 있어요')
    expect(out).toContain('주의 7건 · 참고 1건. 경고가 있어도 승인할 수 있어요.')
    // 묶음 줄(R2)은 알림 안에 문장으로 있다
    expect(out).toContain('이번 주(10/12~10/18)에 새 컬렉션을 2개 열어요(10/12, 10/15). 한 주에 1개까지가 기준이에요.')
  })

  it('탭은 5개이고 「경고 있는 항목만 보기」 버튼이 있다', () => {
    const out = flat(<OpsBundleWorkspace {...props} items={items} balance={balanceOf(items)} />)
    for (const label of ['전체', '결정할 것', '형식 오류', '멈춘 것', '밸런스 경고']) expect(out).toContain(label)
    expect(out).toContain('경고 있는 항목만 보기')
  })

  it('알림 순서: 형식 오류 요약 → 밸런스 알림 → 공개 연결 전 안내', () => {
    const out = flat(
      <OpsBundleWorkspace
        {...props}
        bundleFormatErrors={['week: 틀려요.']}
        items={items}
        balance={balanceOf(items)}
        notices={() => <p>공개 연결 전 안내</p>}
      />
    )
    const format = out.indexOf('형식 오류')
    const balance = out.indexOf('밸런스 경고 8건이 있어요')
    const publish = out.indexOf('공개 연결 전 안내')
    expect(format).toBeGreaterThan(-1)
    expect(balance).toBeGreaterThan(format)
    expect(publish).toBeGreaterThan(balance)
  })

  it('선택한 항목의 상세에 경고 블록(주의·임시값 칩)과 「툴 점검」 줄이 나온다', () => {
    nav.search = 'item=A'
    const out = flat(<OpsBundleWorkspace {...props} items={items} balance={balanceOf(items)} />)
    expect(out).toContain('이 컬렉션이 열리는 10/12(월) 09:00에 열려 있을 컬렉션이 31개예요. 동시에 6개까지가 기준이에요.')
    expect(out).toContain('공개까지 10일 남았어요. 최소 28일은 필요해요.') // 10/1 12:00 → 10/12 09:00은 10일 21시간
    expect(out).toContain('임시값·실측 전') // R1은 임시값, R4는 확정값
    expect(out).toContain('켜 둔 규칙 7개를 확인했고 주의 3건, 참고 0건이 있어요')
    expect(out).toContain('지금 열린 컬렉션은 30개예요')
    expect(out).toContain('툴 점검')
  })

  it('임시값 칩은 임시값 규칙의 줄에만 있다: R4(확정값)만 걸린 항목에는 없다', () => {
    const solo = makeItem({
      id: 'S',
      kind: 'collection_launch',
      startsAt: '2026-10-12T00:00:00.000Z',
      endsAt: '2026-12-31T00:00:00.000Z',
      original: { starts_at: '2026-10-12T09:00:00+09:00', ends_at: '2026-12-31T09:00:00+09:00', resource: { reward_points: 5 } },
    })
    const balance = evaluateBundleBalance([{ ...solo, approvedAt: null }], makeRules(), makeState({ books: { ok: true, data: openBooks(0) } }), NOW)
    const view = buildBalanceView({ status: 'ok', ...balance, openCollectionsNow: 0 })
    const out = flat(<OpsBalanceItemWarnings lines={view.linesByItem.S} />)
    expect(out).toContain('공개까지 10일 남았어요')
    expect(out).not.toContain('임시값·실측 전')
  })

  it('공개 시각을 고쳐 경고가 풀리면 행 칩·탭 숫자·알림·블록이 함께 사라진다', () => {
    const fixed = items.map((item) => ({ ...item }))
    // A·B를 먼 미래로 옮기고 포인트를 낮춘다(수정본 우선)
    fixed[0] = { ...launchA, startsAt: '2027-02-01T00:00:00.000Z', edited: { starts_at: '2027-02-01T09:00:00+09:00', resource: { reward_points: 10 } } }
    fixed[1] = { ...launchB, startsAt: '2027-04-01T00:00:00.000Z', edited: { starts_at: '2027-04-01T09:00:00+09:00' } }
    fixed[2] = { ...heavyMission, edited: { resource: { reward_points: 20 } } }
    const rules = makeRules({ open_collections_max: { enabled: false } })
    const evaluation = evaluateBundleBalance(
      fixed.map((item) => ({ ...item, approvedAt: null })),
      rules,
      makeState({ books: { ok: true, data: openBooks(30) } }),
      NOW
    )
    // B는 포인트 칸이 없어 R5가 점검 못 함으로 남는다(참고) — 주의 칩과 경고 알림은 사라진다
    const balance: OpsBundleBalance = { status: 'ok', ...evaluation, openCollectionsNow: 30 }
    const out = flat(<OpsBundleWorkspace {...props} items={fixed} balance={balance} />)
    expect(out).not.toContain('밸런스 주의')
    expect(out).toContain('밸런스 참고 1')
    expect(out).toMatch(/밸런스 경고<span[^>]*>1<\/span>/)
    expect(out).toContain('밸런스 경고 1건이 있어요')
    expect(out).toContain('주의 0건 · 참고 1건')
  })

  it('점검 못 함만 있는 항목은 「점검 못 함」 줄과 참고 칩이 뜨고 「넘는 것이 없어요」로 보이지 않는다', () => {
    nav.search = 'item=B'
    const only = [launchB]
    const evaluation = evaluateBundleBalance(
      only.map((item) => ({ ...item, approvedAt: null })),
      makeRules({ launch_lead_days_min: { enabled: false }, open_collections_max: { enabled: false } }),
      makeState(),
      NOW
    )
    const out = flat(<OpsBundleWorkspace {...props} items={only} balance={{ status: 'ok', ...evaluation, openCollectionsNow: 0 }} />)
    expect(out).toContain('밸런스 참고 1')
    expect(out).toContain('점검 못 함')
    expect(out).toContain('포인트가 없어서 항목별 포인트를 확인하지 못했어요')
    expect(out).not.toContain('넘는 것이 없어요')
    expect(out).toMatch(/켜 둔 규칙 \d개를 확인했고 주의 0건, 참고 1건이 있어요/)
  })

  it('규칙을 끄면 그 규칙의 줄·칩·건수가 없고 「켜 둔 규칙 N개」가 줄어든다', () => {
    nav.search = 'item=A'
    const rules = makeRules({ open_collections_max: { enabled: false } })
    const evaluation = evaluateBundleBalance(
      items.map((item) => ({ ...item, approvedAt: null })),
      rules,
      makeState({ books: { ok: true, data: openBooks(30) } }),
      NOW
    )
    const out = flat(<OpsBundleWorkspace {...props} items={items} balance={{ status: 'ok', ...evaluation, openCollectionsNow: 30 }} />)
    expect(out).not.toContain('열려 있을 컬렉션이')
    expect(out).toContain('켜 둔 규칙 6개를 확인했고 주의 2건, 참고 0건이 있어요')
    expect(out).toContain('밸런스 주의 2') // A: R4·R5
  })

  it('시험 묶음이면 알림에 안내가 붙는다', () => {
    const out = flat(<OpsBundleWorkspace {...props} items={items} balance={balanceOf(items)} isSample />)
    expect(out).toContain('시험 묶음이에요. 이 묶음의 항목은 다른 묶음의 경고 계산에 들어가지 않아요.')
  })
})

describe('평가 실패 · 반려한 항목 · 편집 중', () => {
  const props = { bundleId: 'bundle-1', bundleFormatErrors: [] as string[], decisions: [] }

  it('평가 실패: 기획 상세는 그대로 열리고 알림이 뜬다. 칩은 없고 5번째 탭은 0, 툴 점검은 「확인하지 못했어요」', () => {
    const items = [makeItem({ id: 'a', status: 'reviewing' })]
    const out = flat(
      <OpsBundleWorkspace
        {...props}
        items={items}
        balance={{ status: 'failed' }}
        detailFooter={() => <span>승인·반려 버튼 자리</span>}
      />
    )
    expect(out).toContain('밸런스를 확인하지 못했어요. 새로 고치면 다시 확인해요. 승인은 할 수 있어요.')
    expect(out).toContain('미션을 깨요') // 상세가 열려 있다
    expect(out).toContain('승인·반려 버튼 자리')
    expect(out).not.toContain('밸런스 주의')
    expect(out).not.toContain('밸런스 참고')
    expect(out).toMatch(/밸런스 경고<span[^>]*>0<\/span>/)
    expect(out).toContain('확인하지 못했어요')
    expect(out).toContain('툴 점검')
  })

  it('반려한 항목은 칩이 없고 ⑤에 「반려한 항목은 밸런스를 확인하지 않아요」가 나온다', () => {
    const rejected = makeItem({ id: 'r', status: 'rejected', kind: 'mission', original: { user_experience: '반려된 미션', resource: { reward_points: 999 } } })
    const evaluation = evaluateBundleBalance([{ ...rejected, approvedAt: null }], makeRules(), makeState(), NOW)
    const balance: OpsBundleBalance = { status: 'ok', ...evaluation, openCollectionsNow: 0 }
    const out = flat(<OpsBundleWorkspace {...props} items={[rejected]} balance={balance} />)
    expect(out).not.toContain('밸런스 주의')
    expect(out).not.toContain('밸런스 참고')
    expect(out).toContain('반려한 항목은 밸런스를 확인하지 않아요')
    expect(out).not.toContain('밸런스 경고 1건')
  })

  it('밸런스 결과를 넘기지 않으면 밸런스 표시가 없다(툴 점검 줄도 없다)', () => {
    const out = flat(<OpsBundleWorkspace {...props} items={[makeItem()]} />)
    expect(out).not.toContain('툴 점검')
    expect(out).not.toContain('밸런스 주의')
    expect(out).not.toContain('aria-label="밸런스 경고"') // 제출 원본 접힘 상자도 region이라 밸런스 구역 이름으로 가린다
  })

  it('편집 중(detailEdit 결과가 있음)이면 경고 블록에 「고치는 중이에요」 안내가 붙는다', () => {
    const item = makeItem({ id: 'a' })
    const info = itemBalanceInfoOf(
      buildBalanceView({
        status: 'ok',
        warnings: [warning({ itemId: 'a' })],
        unreadable: [],
        checkedRuleCountByItem: { a: 3 },
        openCollectionsNow: null,
      }),
      'a'
    )
    const base = { item, items: [item], decisions: [], onSelectItem: () => {}, balance: info }
    expect(flat(<OpsItemDetail {...base} />)).not.toContain('고치는 중이에요')
    expect(flat(<OpsItemDetail {...base} detailEdit={() => <div>편집 양식</div>} />)).toContain(
      '고치는 중이에요. 저장하면 밸런스를 다시 확인해요'
    )
  })

  it('⑤ 「에이전트가 적은 밸런스 판정」은 이름이 바뀌었고 툴 점검과 따로 보인다', () => {
    const item = makeItem({ id: 'a', original: { user_experience: '미션', balance_check: { verdict: 'ok' } } })
    const info = itemBalanceInfoOf(
      buildBalanceView({ status: 'ok', warnings: [], unreadable: [], checkedRuleCountByItem: { a: 3 }, openCollectionsNow: null }),
      'a'
    )
    const out = flat(<OpsItemDetail item={item} items={[item]} decisions={[]} onSelectItem={() => {}} balance={info} />)
    expect(out).toContain('에이전트가 적은 밸런스 판정')
    expect(out).not.toMatch(/>밸런스 판정</)
    expect(out).toContain('켜 둔 규칙 3개를 확인했고 넘는 것이 없어요')
  })

  it('적용되는 켜 둔 규칙이 없으면 그렇게 말한다', () => {
    const item = makeItem({ id: 'a', kind: 'home_feed_card' })
    const info = itemBalanceInfoOf(
      buildBalanceView({ status: 'ok', warnings: [], unreadable: [], checkedRuleCountByItem: { a: 0 }, openCollectionsNow: null }),
      'a'
    )
    const out = flat(<OpsItemDetail item={item} items={[item]} decisions={[]} onSelectItem={() => {}} balance={info} />)
    expect(out).toContain('이 항목에 적용되는 켜 둔 규칙이 없어요')
  })
})

describe('OpsItemList — 행 칩', () => {
  it('줄이 있는 행에만 칩이 붙고, 줄이 없으면 칩이 없다', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b', position: 1 })]
    const out = flat(<OpsItemList items={items} selectedId={null} onSelect={() => {}} balanceLinesByItem={{ a: [line('warn'), line('unreadable')] }} />)
    expect(out.match(/밸런스 (주의|참고) \d/g)).toEqual(['밸런스 주의 1'])
  })
})
