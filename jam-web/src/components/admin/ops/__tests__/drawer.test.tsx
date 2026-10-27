/**
 * 항목 서랍의 구조 (티켓 20261026_2024 2회차, 어드민 상황판 PRD §6.3)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다. 접힘은 실제 접힘(`ui/accordion`)을
 * 쓴다 — 닫힌 접힘 안쪽은 서버 렌더에 나오지 않는 것이 「기본 접힘」의 증거다. 클릭 동작(체크 변경·이동)은 순수 함수 시험
 * (`opsBoard/__tests__/drawerView.test.ts`)이 지킨다.
 *
 * 지키는 것: 위에서 아래 순서(머리 → 왜 이 기획? → 핵심 값 → 검수 결과 → 접힘 셋), 접힘 셋과 「검수 자세히」는 기본 접힘, 이유 칩 전부와 메모 두 줄 제한·출처 번호,
 * 이유가 없으면 안내 한 줄, 새 필드가 없는 옛 항목도 깨지지 않음, 검수 결과 두 줄(점+글자·시각), 검토중이 아닌 항목·패턴 제안·콜백이 없는 쓰임의 결정 줄은 그대로,
 * 검토중 일반 항목은 주 줄 빼기·고치기·이대로 두기와 그 아래 보조 줄 반려하기.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import type { OpsDecisionRecord, OpsItemRecord, OpsRoutineStageRecord } from '@/lib/admin/opsInbox/query'
import type { ItemBalanceInfo } from '@/lib/admin/opsInbox/balance/view'
import type { OpsWorkspaceContext } from '../OpsBundleWorkspace'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

import { OpsItemDetail } from '../OpsItemDetail'
import { OpsItemActions } from '../OpsItemActions'

const flat = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>).replace(/<!-- -->/g, '')

function makeItem(over: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: '2026-12-30T09:00:00+09:00',
    endsAt: '2026-12-30T10:00:00+09:00',
    status: 'reviewing',
    original: {
      user_experience: '비 오는 월요일 아침, 홈에서 카드를 만나요',
      copy: { title: '우산 챙겨 달리기' },
      exposure_tags: ['all'],
      shape: 'hero',
      highlight: true,
      rationale: [
        { kind: 'trend', label: '비 오는 날 러닝', note: '비 오는 날 러닝 검색이 늘었어요', source_id: 3 },
        { kind: 'season', label: '장마철' },
        { kind: 'weather', label: '월요일 비', note: '내일 비 예보가 있어요' },
      ],
      world_review: { world_related: true, winter_reviewed: true, reason: '비 오는 날 이야기예요' },
    },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...over,
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

const stages: OpsRoutineStageRecord[] = [
  { agent: '윈터', stage: 'world_review', startedAt: null, endedAt: '2026-10-20T09:40:00+09:00', inCount: null, outCount: null, excludedCount: null },
  { agent: '혜린', stage: 'balance_check', startedAt: null, endedAt: '2026-10-20T09:55:00+09:00', inCount: null, outCount: null, excludedCount: null },
]

const cleanBalance: ItemBalanceInfo = { failed: false, lines: [], checkedRuleCount: 5, openCollectionsNow: null }

const base = { items: [makeItem()], decisions: [SUBMIT], onSelectItem: () => {} }

describe('항목 서랍 — 구조와 순서', () => {
  it('위에서 아래로 머리 → 왜 이 기획? → 유저가 겪는 것 → 핵심 값 → 검수 결과 → 접힘 셋 순서다', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} stages={stages} balance={cleanBalance} />)
    const order = ['홈피드 카드', '왜 이 기획?', '유저가 겪는 것', '핵심 값', '검수 결과', '내용 전체', '제출 원본 보기', '결정 기록']
    const at = order.map((text) => out.indexOf(text))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('접힘 셋과 「검수 자세히」는 기본 접힘이다: 머리글만 나오고 안쪽은 나오지 않는다', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} stages={stages} balance={cleanBalance} decisions={[{ ...SUBMIT, itemId: 'item-1' }]} />)
    for (const title of ['내용 전체', '제출 원본 보기', '결정 기록', '검수 자세히']) expect(out).toContain(title)
    expect(out.match(/data-state="open"/g)).toBeNull()
    expect(out).not.toContain('<pre')
    expect(out).not.toContain('우산 챙겨 달리기')
    expect(out).not.toContain('에이전트(윤진)가 제출했어요')
    expect(out).not.toContain('윈터 검수 끝났어요')
    expect(out).not.toContain('툴 점검')
  })

  it('머리: 「핵심」 표시와 이 항목의 이유 칩이 전부(3개) 나온다', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} />)
    const head = out.slice(0, out.indexOf('왜 이 기획?'))
    expect(head).toContain('>핵심<')
    expect(head.match(/data-rationale-kind=/g)).toHaveLength(3)
    expect(head).not.toContain('+1')
    expect(flat(<OpsItemDetail item={makeItem({ original: { user_experience: '경험' } })} {...base} />)).not.toContain('>핵심<')
  })

  it('수정본이 있으면 수정본의 이유와 핵심 표시를 읽는다', () => {
    const edited = { highlight: false, rationale: [{ kind: 'signal', label: '수정한 이유' }] }
    const out = flat(<OpsItemDetail item={makeItem({ edited })} {...base} />)
    expect(out).toContain('수정한 이유')
    expect(out).not.toContain('비 오는 날 러닝')
    expect(out).not.toContain('>핵심<')
  })
})

describe('항목 서랍 — 왜 이 기획?', () => {
  it('이유마다 한 줄이다: 칩, 메모(두 줄 제한), 트렌드의 「출처 N」', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} />)
    const section = out.slice(out.indexOf('aria-label="왜 이 기획?"'), out.indexOf('유저가 겪는 것'))
    expect(section.match(/<li /g)).toHaveLength(3)
    expect(section).toContain('비 오는 날 러닝 검색이 늘었어요')
    expect(section).toContain('line-clamp-2')
    expect(section).toContain('출처 3')
    // 출처는 트렌드에만, 메모가 없는 이유는 칩만 있다
    expect(section.match(/출처/g)).toHaveLength(1)
    expect(section).toContain('장마철')
  })

  it('이유가 없으면 「적힌 이유가 없어요」 한 줄이다(새 필드가 없는 옛 항목도 깨지지 않는다)', () => {
    const out = flat(<OpsItemDetail item={makeItem({ original: { user_experience: '옛 항목이에요' } })} {...base} />)
    expect(out).toContain('적힌 이유가 없어요')
    expect(out).not.toContain('data-rationale-kind')
  })

  it('종류·값이 모두 이상한 항목도 죽지 않는다', () => {
    const out = flat(<OpsItemDetail item={makeItem({ kind: null, original: 5, startsAt: null, endsAt: null })} {...base} />)
    expect(out).toContain('적힌 이유가 없어요')
    expect(out).toContain('읽을 수 있는 핵심 값이 없어요')
    expect(out).toContain('검수 기록 없음')
    expect(out).toContain('점검 기록 없음')
  })
})

describe('항목 서랍 — 핵심 값', () => {
  it('공개 기간은 한 줄(같은 날이면 끝 시각만)이고 대상·모양이 한 칸에 한 줄이다', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} />)
    const section = out.slice(out.indexOf('aria-label="핵심 값"'), out.indexOf('aria-label="검수 결과"'))
    expect(section).toContain('<dl')
    expect(section).toContain('12/30(수) 09:00 ~ 10:00')
    expect(section).toContain('>대상<')
    expect(section).toContain('>all<')
    expect(section).toContain('>모양<')
    expect(section).toContain('>hero<')
    // 이 종류에 없는 칸의 줄은 그리지 않는다
    expect(section).not.toContain('>조건<')
    expect(section).not.toContain('>보상<')
  })

  it('편집 모드이면 「유저가 겪는 것」·「핵심 값」·「내용 전체」 자리를 편집 화면이 대신한다', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} detailEdit={() => <p>편집 모드예요</p>} />)
    expect(out).toContain('편집 모드예요')
    for (const title of ['유저가 겪는 것', '핵심 값', '내용 전체']) expect(out).not.toContain(title)
    // 왜 이 기획?·검수 결과·제출 원본·결정 기록은 편집 중에도 보인다
    for (const title of ['왜 이 기획?', '검수 결과', '제출 원본 보기', '결정 기록']) expect(out).toContain(title)
  })
})

describe('항목 서랍 — 검수 결과', () => {
  it('윈터와 혜린 두 줄: 이름·역할, 상태 글자(점은 장식), 근거, 단계 기록의 시각', () => {
    const out = flat(<OpsItemDetail item={makeItem()} {...base} stages={stages} balance={cleanBalance} />)
    const section = out.slice(out.indexOf('aria-label="검수 결과"'), out.indexOf('검수 자세히'))
    expect(section).toContain('윈터 · 세계관 검수')
    expect(section).toContain('혜린 · 밸런스 점검')
    expect(section.match(/통과/g)).toHaveLength(2)
    expect(section).toContain('비 오는 날 이야기예요')
    expect(section).toContain('10/20(화) 09:40')
    expect(section).toContain('10/20(화) 09:55')
    // 점은 장식이다
    expect(section.match(/aria-hidden="true" class="inline-block size-2/g)).toHaveLength(2)
  })

  it('확인 필요: 윈터는 검수 전, 혜린은 주의 줄이 있을 때', () => {
    const warn = { kind: 'warn', warning: { message: '포인트가 기준을 넘어요' } } as unknown as ItemBalanceInfo['lines'][number]
    const item = makeItem({ original: { world_review: { world_related: true, winter_reviewed: false, reason: '검수 전이에요' } } })
    const out = flat(<OpsItemDetail item={item} {...base} stages={stages} balance={{ ...cleanBalance, lines: [warn] }} />)
    const section = out.slice(out.indexOf('aria-label="검수 결과"'), out.indexOf('검수 자세히'))
    expect(section.match(/확인 필요/g)).toHaveLength(2)
    expect(section).toContain('검수 전이에요')
    expect(section).toContain('포인트가 기준을 넘어요')
  })

  it('단계 기록이 없으면 시각을 쓰지 않고, 평가 결과가 없거나 실패했으면 「점검 기록 없음」이다', () => {
    const noStages = flat(<OpsItemDetail item={makeItem()} {...base} balance={cleanBalance} />)
    const section = noStages.slice(noStages.indexOf('aria-label="검수 결과"'), noStages.indexOf('검수 자세히'))
    expect(section).not.toContain('tabular-nums text-muted-foreground">10/')
    expect(section).not.toMatch(/\d+\/\d+\([월화수목금토일]\) \d{2}:\d{2}/)
    expect(flat(<OpsItemDetail item={makeItem()} {...base} stages={stages} />)).toContain('점검 기록 없음')
    expect(flat(<OpsItemDetail item={makeItem()} {...base} stages={stages} balance={{ ...cleanBalance, failed: true }} />)).toContain('점검 기록 없음')
  })
})

function makeCtx(over: Partial<OpsWorkspaceContext> = {}): OpsWorkspaceContext {
  return { bundleId: 'bundle-1', items: [], selectedItem: null, draft: null, setDraft: vi.fn(), selectItem: vi.fn(), ...over }
}

const actions = (item: OpsItemRecord, extra: Partial<Parameters<typeof OpsItemActions>[0]> = {}) =>
  flat(<OpsItemActions bundleId="bundle-1" item={item} ctx={makeCtx()} onDecided={vi.fn()} onConflict={vi.fn()} {...extra} />)

describe('항목 서랍 — 결정 줄 (OpsItemActions)', () => {
  const callbacks = { onExclude: vi.fn(), onKeep: vi.fn() }

  it('검토중 일반 항목: 주 줄 [빼기][고치기][이대로 두기], 그 아래 보조 줄 [반려하기]', () => {
    const out = actions(makeItem(), callbacks)
    for (const label of ['빼기', '고치기', '이대로 두기', '반려하기']) expect(out).toContain(`>${label}<`)
    expect(out).not.toContain('>수정하기<')
    expect(out).not.toContain('>승인하기<')
    expect(out.indexOf('>이대로 두기<')).toBeLessThan(out.indexOf('>반려하기<'))
  })

  it('패턴 제안은 지금과 같다: [반려하기][수정하기][패턴 사전에 넣기]', () => {
    const out = actions(makeItem({ kind: 'pattern_proposal' }), callbacks)
    for (const label of ['반려하기', '수정하기', '패턴 사전에 넣기']) expect(out).toContain(`>${label}<`)
    for (const label of ['빼기', '고치기', '이대로 두기']) expect(out).not.toContain(`>${label}<`)
  })

  it('두 콜백이 없는 쓰임(일정표 서랍 등)은 지금과 같다: [반려하기][수정하기]', () => {
    const out = actions(makeItem())
    for (const label of ['반려하기', '수정하기']) expect(out).toContain(`>${label}<`)
    for (const label of ['빼기', '고치기', '이대로 두기']) expect(out).not.toContain(`>${label}<`)
    // 한쪽 콜백만 있으면 서랍 결정 줄이 아니다
    expect(actions(makeItem(), { onExclude: vi.fn() })).toContain('>수정하기<')
  })

  it('검토중이 아닌 항목은 버튼 대신 안내 글만 둔다', () => {
    const out = actions(makeItem({ status: 'approved' }), callbacks)
    expect(out).toContain('승인한 항목은 여기서 고칠 수 없어요')
    for (const label of ['빼기', '고치기', '이대로 두기', '반려하기']) expect(out).not.toContain(`>${label}<`)
  })

  it('수정 중인 항목은 모든 결정 버튼이 비활성이고 안내가 붙는다', () => {
    const item = makeItem()
    const out = actions(item, { ...callbacks, ctx: makeCtx({ draft: { itemId: item.id, values: {}, baseUpdatedAt: item.updatedAt } as OpsWorkspaceContext['draft'] }) })
    const tag = (label: string) => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
    for (const label of ['빼기', '고치기', '이대로 두기', '반려하기']) expect(tag(label)).toMatch(/\sdisabled(=|\s|>)/)
    expect(out).toContain('수정 중이에요')
  })
})
