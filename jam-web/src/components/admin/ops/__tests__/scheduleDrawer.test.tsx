/**
 * 일정표 항목·날짜 서랍의 초기 렌더 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 서랍)
 *
 * 저장소에 jsdom·testing-library가 없어(`render.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다. 서랍이 항목 데이터를 받는 요청은 브라우저 동작이라
 * 받는 중·실패·완료는 상태 없는 `ItemDrawerView`에 결과를 직접 넣어 그린다(요청 자체는 `scheduleItemClient.test.ts`, API는 라우트 테스트가 지킨다). 클릭·포커스 이동은 카리나가 실렌더로 본다.
 *
 * 지키는 것:
 * - 항목 서랍: 머리 「서랍 · {종류} 「{제목}」」·칩 줄(상태·시험)·받은 기획함 상세와 같은 상세 카드·상태별 고정 줄(검토중 반려·수정·승인 / 예약됨 공개 전 취소 / 게재중 지금 종료)
 * - 승인됨은 「예약 등록은 기획 상세에서 해요」 + [기획 상세로 가기 →], 새로 도착은 「기획 상세를 열면 검토중으로 바뀌어요」 + 같은 링크(가정 2: 서랍은 도착 → 검토중 전환을 요청하지 않는다)
 * - 받는 중은 스켈레톤, 없는 항목은 「찾을 수 없는 항목이에요」, 조회 실패는 서랍 안 안내 + [새로 고치기] — 모두 서랍 틀 안이다. 딤·`fixed`가 없다
 * - 결정·수정은 S3와 같은 부품(`OpsItemFooter`·`OpsItemEditForm`)과 같은 결정 요청(`decisionClient`)을 쓰고 항목 자기 묶음의 `bundleId`를 넘긴다(구조)
 * - 옛 카드·미션(운영 묶음에 없음): 요약 + [카드 상세 열기]·[미션 상세 열기], 결정 줄 없음. 주간 데이터에 없으면 「찾을 수 없는 항목이에요」
 * - 날짜 서랍: 「10월 7일(화)」·신호 N건(신호 줄)·항목 목록(대표 표시)·대표 카드. 검사 범위 밖·못 읽음 안내(「이상 없음」 없음)
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import type { OpsDecisionRecord, OpsItemRecord } from '@/lib/admin/opsInbox/query'
import type { ScheduleItemDetail } from '@/lib/admin/opsSchedule/itemDetail'
import type { OpsSignalResult } from '@/lib/admin/opsSignals/catalog'
import type { DaySignals } from '@/lib/admin/opsSchedule/signalDays'
import type { ScheduleDay, ScheduleItem, ScheduleMissionBar, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

import {
  ItemDrawerView,
  OpsScheduleDrawer,
  SCHEDULE_APPROVED_NOTICE,
  SCHEDULE_ARRIVED_NOTICE,
  SCHEDULE_ITEM_LOAD_FAILED_DESCRIPTION,
  SCHEDULE_ITEM_LOAD_FAILED_TITLE,
  SCHEDULE_ITEM_NOT_FOUND_TITLE,
  SCHEDULE_ITEM_RETRY_LABEL,
  SCHEDULE_LEGACY_CARD_LINK_LABEL,
  SCHEDULE_LEGACY_MISSION_LINK_LABEL,
  SCHEDULE_PLAN_LINK_LABEL,
} from '../OpsScheduleDrawer'
import { OpsScheduleDayDrawer, SCHEDULE_DAY_MISSING_TEXT } from '../OpsScheduleDayDrawer'
import {
  DAY_EMPTY_TEXT,
  DAY_ITEMS_PARTIAL_TEXT,
  DAY_REPRESENTATIVE_NONE_TEXT,
  DAY_REPRESENTATIVE_UNREAD_TEXT,
  DAY_SIGNAL_NONE_TEXT,
  DAY_SIGNAL_UNCHECKED_TEXT,
  DAY_SIGNAL_UNREAD_TEXT,
} from '@/lib/admin/opsSchedule/drawerView'

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>).replace(/<!-- -->/g, '')
const noop = () => {}

const BUNDLE_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '3f2a9c1e-0000-4000-8000-0000000000a1'
const CARD_ID = '3f2a9c1e-0000-4000-8000-0000000000c1'
const MISSION_ID = '3f2a9c1e-0000-4000-8000-0000000000d1'

function makeItem(over: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id: ITEM_ID,
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: 'P-07',
    startsAt: '2026-10-06T09:00:00+09:00',
    endsAt: '2026-10-07T09:00:00+09:00',
    status: 'reviewing',
    original: {
      user_experience: '비 오는 월요일 아침, 홈에서 카드를 만나요',
      copy: { title: '우산 챙겨 달리기' },
      colors: { background: '#1a2b3c' },
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

function makeDetail(over: Partial<OpsItemRecord> = {}, detailOver: Partial<ScheduleItemDetail> = {}): ScheduleItemDetail {
  const item = makeItem(over)
  return {
    itemId: item.id,
    bundleId: BUNDLE_ID,
    isSample: false,
    items: [item],
    decisions: [SUBMIT],
    balance: { status: 'ok', openCollectionsNow: null, warnings: [], unreadable: [], checkedRuleCountByItem: {} },
    previewNames: { badges: {}, pois: {}, collections: {}, categories: {} },
    ...detailOver,
  }
}

function itemView(outcome: Parameters<typeof ItemDrawerView>[0]['outcome'], extra: Partial<Parameters<typeof ItemDrawerView>[0]> = {}) {
  return html(<ItemDrawerView outcome={outcome} includeSample={false} onClose={noop} onOpenItem={noop} onRefresh={noop} onRetry={noop} {...extra} />)
}

const ok = (over: Partial<OpsItemRecord> = {}, detailOver: Partial<ScheduleItemDetail> = {}) => ({ kind: 'ok' as const, detail: makeDetail(over, detailOver) })

describe('항목 서랍 — 받는 중·없음·실패(서랍 안에서만)', () => {
  it('받는 중에는 서랍 틀과 스켈레톤이다', () => {
    const out = itemView(null)
    expect(out).toContain('aria-label="서랍"')
    expect(out).toContain('서랍 닫기')
    expect(out).toContain('role="status" aria-label="불러오는 중"')
    expect(out).not.toContain('승인하기')
  })

  it('없는 항목은 「찾을 수 없는 항목이에요」다', () => {
    const out = itemView({ kind: 'notFound' })
    expect(out).toContain(SCHEDULE_ITEM_NOT_FOUND_TITLE)
    expect(out).toContain('서랍 닫기')
    expect(out).not.toContain('불러오는 중')
    expect(out).not.toContain('새로 고치기')
  })

  it('조회 실패는 현상·원인·해결 안내와 [새로 고치기]이고 서랍을 닫을 수 있다', () => {
    const out = itemView({ kind: 'error' })
    expect(out).toContain(SCHEDULE_ITEM_LOAD_FAILED_TITLE)
    expect(out).toContain(SCHEDULE_ITEM_LOAD_FAILED_DESCRIPTION)
    expect(out).toContain(`>${SCHEDULE_ITEM_RETRY_LABEL}</button>`)
    expect(out).toContain('서랍 닫기')
  })

  it('딤과 fixed 배치가 없다(서랍은 달력 옆의 인라인 틀이다)', () => {
    for (const outcome of [null, { kind: 'notFound' as const }, { kind: 'error' as const }, ok()]) {
      const out = itemView(outcome)
      expect(out).not.toContain('bg-black/80')
      expect(out).not.toMatch(/class="[^"]*\bfixed\b/)
    }
  })
})

describe('항목 서랍 — 운영 항목', () => {
  it('머리는 「서랍 · 종류 「제목」」이고 칩 줄·상세 카드가 있다', () => {
    const out = itemView(ok())
    expect(out).toContain('aria-label="서랍 · 홈피드 카드 「우산 챙겨 달리기」"')
    expect(out).toContain('서랍 · 홈피드 카드 「우산 챙겨 달리기」</h2>')
    expect(out).toContain('검토중')
    // 받은 기획함 상세와 같은 카드(유저가 겪는 것·내용)
    expect(out).toContain('비 오는 월요일 아침')
    expect(out).toContain('유저가 겪는 것')
  })

  it('상세 위에 카드 미리보기(기기 폭 전환)가 있다', () => {
    const out = itemView(ok())
    expect(out).toContain('기기 폭')
    expect(out.indexOf('기기 폭')).toBeLessThan(out.indexOf('유저가 겪는 것'))
  })

  it('시험 묶음의 항목이면 칩 줄에 시험 칩이 붙는다', () => {
    expect(itemView(ok({}, { isSample: true }))).toContain('시험</span>')
    expect(itemView(ok({}, { isSample: false }))).not.toContain('시험</span>')
  })

  it('검토중이면 반려하기·수정하기가 있고 개별 승인 버튼은 없다(승인은 기획 상세의 「N건 승인하고 예약」, 티켓 20261026_2031)', () => {
    const out = itemView(ok({ status: 'reviewing' }))
    expect(out).toContain('반려하기')
    expect(out).toContain('수정하기')
    expect(out).not.toContain('승인하기')
  })

  it('승인됨은 「예약 등록은 기획 상세에서 해요」와 [기획 상세로 가기 →]이고 결정 버튼이 없다', () => {
    const out = itemView(ok({ status: 'approved' }))
    expect(out).toContain(SCHEDULE_APPROVED_NOTICE)
    expect(out).toContain(SCHEDULE_PLAN_LINK_LABEL)
    expect(out).toContain(`href="/admin/ops-inbox/${BUNDLE_ID}?item=${ITEM_ID}"`)
    expect(out).not.toContain('승인하기')
    expect(out).not.toContain('반려하기')
  })

  it('승인됨·이미지 없음·image_spec이 있으면 푸터 밖에 [이미지 만들기]가 있고, 시험 묶음이면 없다(티켓 1032)', () => {
    const original = { ...(makeItem().original as Record<string, unknown>), image_spec: { preset_id: 'p1', bg: '#111111', end: '#222222' } }
    const out = itemView(ok({ status: 'approved', original }))
    expect(out).toContain('이미지 만들기')
    expect(out).toContain(SCHEDULE_APPROVED_NOTICE)
    expect(out.indexOf('이미지 만들기')).toBeLessThan(out.indexOf('유저가 겪는 것'))
    expect(itemView(ok({ status: 'approved', original }, { isSample: true }))).not.toContain('이미지 만들기')
    expect(itemView(ok({ status: 'reviewing', original }))).not.toContain('이미지 만들기')
  })

  it('기획 상세 링크는 시험 묶음 포함을 잃지 않는다', () => {
    const out = itemView(ok({ status: 'approved' }), { includeSample: true })
    expect(out).toContain(`href="/admin/ops-inbox/${BUNDLE_ID}?item=${ITEM_ID}&amp;sample=1"`)
  })

  it('새로 도착한 항목은 「기획 상세를 열면 검토중으로 바뀌어요」와 같은 링크이고 S3의 새로 고침 안내가 아니다(가정 2)', () => {
    const out = itemView(ok({ status: 'arrived' }))
    expect(out).toContain(SCHEDULE_ARRIVED_NOTICE)
    expect(out).toContain(`href="/admin/ops-inbox/${BUNDLE_ID}?item=${ITEM_ID}"`)
    expect(out).not.toContain('화면을 새로 고치면')
    expect(out).not.toContain('승인하기')
  })

  it('예약됨은 공개 전 취소하기, 게재중(종료가 있는 종류)은 지금 종료하기다', () => {
    const scheduled = itemView(ok({ status: 'scheduled' }))
    expect(scheduled).toContain('공개 전 취소하기')
    expect(scheduled).not.toContain('승인하기')
    const live = itemView(ok({ status: 'live', kind: 'mission' }))
    expect(live).toContain('지금 종료하기')
    expect(live).not.toContain('승인하기')
  })

  it('반려·취소·실패·종료 항목도 열리고 결정 줄 자리에는 안내 글뿐이다', () => {
    const rejected = itemView(ok({ status: 'rejected' }))
    expect(rejected).toContain('반려한 항목은 여기서 고칠 수 없어요')
    expect(rejected).not.toContain('승인하기')
    expect(itemView(ok({ status: 'failed' }))).toContain('실패한 항목은 여기서 고칠 수 없어요')
    expect(itemView(ok({ status: 'cancelled' }))).toContain('취소한 항목은 여기서 고칠 수 없어요')
  })

  it('「연결」은 같은 묶음의 다른 항목을 누르는 버튼이다(서랍은 그 항목으로 옮겨 간다)', () => {
    const other = makeItem({ id: '3f2a9c1e-0000-4000-8000-0000000000a2', position: 1, itemKey: 'mission-1', kind: 'mission', original: { user_experience: '이어지는 미션' } })
    const detail = makeDetail({ original: { user_experience: '비 오는 월요일 아침', copy: { title: '우산 챙겨 달리기' }, links: ['mission-1'] } })
    detail.items = [...detail.items, other]
    const out = itemView({ kind: 'ok', detail })
    expect(out).toMatch(/<button[^>]*>미션 · 이어지는 미션<\/button>/)
    // 묶음에 없는 연결은 눌리지 않는다
    const missing = makeDetail({ original: { copy: { title: '우산 챙겨 달리기' }, links: ['nothing'] } })
    expect(itemView({ kind: 'ok', detail: missing })).toContain('찾을 수 없는 연결이에요')
  })
})

describe('항목 서랍 — S3와 같은 결정 부품·같은 결정 요청·항목 자기 묶음의 bundleId(구조)', () => {
  const SRC = join(process.cwd(), 'src')
  const read = (file: string) => readFileSync(join(SRC, file), 'utf8')
  const code = (file: string) =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

  it('서랍은 결정 줄·편집 양식·결과 처리를 S3와 같은 부품에서 가져온다', () => {
    const drawer = code('components/admin/ops/OpsScheduleDrawer.tsx')
    expect(drawer).toMatch(/import\s*\{[^}]*\bOpsItemFooter\b[^}]*\buseOpsItemResultHandlers\b[^}]*\}\s*from\s*'\.\/OpsItemFooter'/)
    expect(drawer).toMatch(/import\s*\{\s*OpsItemEditForm\s*\}\s*from\s*'\.\/OpsItemEditForm'/)
    expect(code('components/admin/ops/OpsDecisionWorkspace.tsx')).toMatch(/from\s*'\.\/OpsItemFooter'/)
  })

  it('서랍은 결정 요청을 직접 만들지 않는다(fetch·postDecision 없음) — 결정 요청은 decisionClient 한 곳이다', () => {
    const drawer = code('components/admin/ops/OpsScheduleDrawer.tsx')
    expect(drawer).not.toMatch(/\bpostDecision\b|\bpostOpsJson\b|\/decisions/)
    // 항목 데이터를 받는 요청만 따로 있다(읽기 전용 GET)
    expect(code('components/admin/ops/scheduleItemClient.ts')).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/)
    expect(code('components/admin/ops/decisionClient.ts')).toContain('/api/admin/ops-inbox/${bundleId}/decisions')
  })

  it('결정 줄·편집 양식·결과 처리 모두 항목 자기 묶음의 bundleId(`detail.bundleId`)를 받는다', () => {
    const drawer = code('components/admin/ops/OpsScheduleDrawer.tsx')
    expect(drawer).toMatch(/useOpsItemResultHandlers\(\{\s*bundleId:\s*detail\.bundleId/)
    expect(drawer.match(/bundleId=\{detail\.bundleId\}/g)).toHaveLength(3) // OpsColorPairPicker, OpsItemEditForm, OpsItemFooter
    expect(drawer).toContain('bundleId: detail.bundleId,') // 얇은 컨텍스트
  })

  it('결정 줄 부품이 승인·반려·수정·되돌리기를 항목 묶음으로 보낸다(postDecision(bundleId, …))', () => {
    expect(code('components/admin/ops/OpsItemActions.tsx')).toMatch(/postDecision\(bundleId,\s*request\)/)
    expect(code('components/admin/ops/OpsItemEditForm.tsx')).toMatch(/postDecision\(bundleId,/)
    expect(code('components/admin/ops/OpsItemFooter.tsx')).toMatch(/postDecision\(bundleId,\s*\{\s*action:\s*'revert'/)
  })

  it('서랍은 얇은 컨텍스트에서 편집 초안과 편집 시작만 실제로 쓴다(묶음 단위 일은 하지 않는다)', () => {
    const drawer = code('components/admin/ops/OpsScheduleDrawer.tsx')
    expect(drawer).not.toMatch(/OpsBulkApprove|OpsExecuteBundle|bulk_approve|\/execute/)
  })
})

describe('옛 카드·미션 서랍(운영 묶음에 없음)', () => {
  function legacyItem(over: Partial<ScheduleItem>): ScheduleItem {
    return {
      id: 'card-x',
      origin: 'card',
      drawerKey: `card:${CARD_ID}`,
      kind: 'home_feed_card',
      title: '옛 카드 제목',
      time: 'T03',
      status: null,
      isSample: false,
      dim: false,
      href: `/admin/today/${CARD_ID}?date=2026-10-06`,
      note: '노출 3 · 열람 1',
      ...over,
    }
  }
  function weekWith(items: ScheduleItem[], missionBars: ScheduleMissionBar[] = []): ScheduleWeek {
    return {
      weekStart: '2026-10-05',
      weekEnd: '2026-10-11',
      days: [
        {
          date: '2026-10-06',
          weekdayLabel: '화',
          dateLabel: '10월 6일',
          isToday: false,
          items,
          longActiveCount: 0,
          longInactiveCount: 0,
          automation: [],
          signals: null,
          representative: null,
        },
      ],
      missionBars,
      openEndedMissionCount: 0,
      contentCount: items.length,
    }
  }
  const drawer = (key: string, week: ScheduleWeek) => html(<OpsScheduleDrawer itemKey={key} week={week} includeSample={false} onClose={noop} onOpenItem={noop} />)

  it('옛 카드는 요약과 [카드 상세 열기]이고 결정 줄이 없다', () => {
    const out = drawer(`card:${CARD_ID}`, weekWith([legacyItem({ dim: true })]))
    expect(out).toContain('서랍 · 홈피드 카드 「옛 카드 제목」</h2>')
    expect(out).toContain('옛 카드 제목')
    expect(out).toContain('T03')
    expect(out).toContain('노출 3 · 열람 1')
    expect(out).toContain('비활성')
    expect(out).toContain(`href="/admin/today/${CARD_ID}?date=2026-10-06"`)
    expect(out).toContain(SCHEDULE_LEGACY_CARD_LINK_LABEL)
    for (const label of ['승인하기', '반려하기', '수정하기', '공개 전 취소하기', '지금 종료하기']) expect(out).not.toContain(label)
  })

  it('옛 미션은 [미션 상세 열기]이고 미션 막대에서도 찾는다', () => {
    const bar: ScheduleMissionBar = {
      id: `mission-${MISSION_ID}`,
      title: '기간 미션',
      startCol: 0,
      endCol: 1,
      startsThisWeek: true,
      endsThisWeek: true,
      isGate: false,
      status: null,
      isSample: false,
      drawerKey: `mission:${MISSION_ID}`,
      href: `/admin/missions/${MISSION_ID}`,
    }
    const out = drawer(`mission:${MISSION_ID}`, weekWith([], [bar]))
    expect(out).toContain('서랍 · 미션 「기간 미션」</h2>')
    expect(out).toContain(`href="/admin/missions/${MISSION_ID}"`)
    expect(out).toContain(SCHEDULE_LEGACY_MISSION_LINK_LABEL)
  })

  it('이 주 데이터에 없는 옛 카드는 「찾을 수 없는 항목이에요」다(링크 없음)', () => {
    const out = drawer(`card:${CARD_ID}`, weekWith([]))
    expect(out).toContain(SCHEDULE_ITEM_NOT_FOUND_TITLE)
    expect(out).not.toContain(SCHEDULE_LEGACY_CARD_LINK_LABEL)
  })

  it('운영 항목 키는 받는 중으로 시작한다(요청은 브라우저에서)', () => {
    const out = drawer(ITEM_ID, weekWith([]))
    expect(out).toContain('aria-label="불러오는 중"')
  })

  it('제목의 HTML은 글자로만 그린다', () => {
    const out = drawer(`card:${CARD_ID}`, weekWith([legacyItem({ title: '<img src=x onerror=alert(1)>' })]))
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})

describe('날짜 서랍', () => {
  function signalResult(over: Partial<OpsSignalResult> = {}): OpsSignalResult {
    return { message: '예약 시각이 지났는데 공개되지 않았어요', date: '2026-10-07', bundleId: BUNDLE_ID, itemId: ITEM_ID, isSample: false, onsetAt: null, ...over }
  }
  function daySignals(over: Partial<DaySignals> = {}): DaySignals {
    return { checked: true, topLevel: null, count: 0, lines: [], ...over }
  }
  function opsItem(over: Partial<ScheduleItem> = {}): ScheduleItem {
    return {
      id: `ops-${ITEM_ID}-2026-10-07`,
      origin: 'ops',
      drawerKey: ITEM_ID,
      kind: 'home_feed_card',
      title: '우산 챙겨 달리기',
      time: '09:30',
      status: 'scheduled',
      isSample: false,
      dim: false,
      href: null,
      note: null,
      ...over,
    }
  }
  function day(over: Partial<ScheduleDay> = {}): ScheduleDay {
    return {
      date: '2026-10-07',
      weekdayLabel: '수',
      dateLabel: '10월 7일',
      isToday: false,
      items: [],
      longActiveCount: 0,
      longInactiveCount: 0,
      automation: [],
      signals: daySignals(),
      representative: null,
      ...over,
    }
  }
  const view = (days: ScheduleDay[], extra: Partial<Parameters<typeof OpsScheduleDayDrawer>[0]> = {}) =>
    html(<OpsScheduleDayDrawer date="2026-10-07" days={days} sourceErrors={{}} includeSample={false} onClose={noop} onOpenItem={noop} {...extra} />)

  it('머리는 「서랍 · 10월 7일(수)」처럼 그 날짜와 요일이다', () => {
    const out = view([day()])
    expect(out).toContain('aria-label="서랍 · 10월 7일(수)"')
    expect(out).toContain('서랍 닫기')
    expect(out).not.toContain('bg-black/80')
    expect(out).not.toMatch(/class="[^"]*\bfixed\b/)
  })

  it('신호가 떴으면 「신호 N건」과 신호 줄(수준 칩·이름·문장·그날·이동 링크)이 나온다', () => {
    const signals = daySignals({
      topLevel: 'stop',
      count: 2,
      lines: [
        { signalKey: 'missed_schedule' as never, name: '예약 누락', level: 'stop', result: signalResult() },
        { signalKey: 'overlap' as never, name: '겹침', level: 'info', result: signalResult({ message: '같은 시각에 카드가 겹쳐요', itemId: null, bundleId: null }) },
      ],
    })
    const out = view([day({ signals })])
    expect(out).toContain('신호 2건')
    expect(out).toContain('예약 누락')
    expect(out).toContain('예약 시각이 지났는데 공개되지 않았어요')
    expect(out).toContain('중단')
    expect(out).toContain('겹침')
    expect(out).toContain(`href="/admin/ops-inbox/${BUNDLE_ID}?item=${ITEM_ID}"`)
    // 범위 안이고 줄이 있으면 안내 글이 없다
    for (const notice of [DAY_SIGNAL_NONE_TEXT, DAY_SIGNAL_UNCHECKED_TEXT, DAY_SIGNAL_UNREAD_TEXT]) expect(out).not.toContain(notice)
  })

  it('신호 문장은 글자로만 그린다', () => {
    const signals = daySignals({
      topLevel: 'warn',
      count: 1,
      lines: [{ signalKey: 'overlap' as never, name: '겹침', level: 'warn', result: signalResult({ message: '<b onmouseover=x>굵게</b>' }) }],
    })
    const out = view([day({ signals })])
    expect(out).not.toContain('<b ')
    expect(out).toContain('&lt;b onmouseover=x&gt;')
  })

  it('검사 범위 밖 날짜는 「확인하는 기간이 아니에요」이고 「이상 없음」은 없다', () => {
    const out = view([day({ signals: daySignals({ checked: false }) })])
    expect(out).toContain(DAY_SIGNAL_UNCHECKED_TEXT)
    expect(out).not.toContain('이상 없')
  })

  it('범위 안에서 뜬 신호가 없으면 「뜬 신호가 없어요」, 못 읽었으면 신호가 없다는 뜻이 아니라고 알린다', () => {
    expect(view([day()])).toContain(DAY_SIGNAL_NONE_TEXT)
    expect(view([day({ signals: null })])).toContain(DAY_SIGNAL_UNREAD_TEXT)
  })

  it('항목 목록은 눌러 항목 서랍을 여는 버튼이고 대표 카드에 「대표」 표시가 붙는다', () => {
    const out = view([day({ items: [opsItem()], representative: { title: '우산 챙겨 달리기', drawerKey: ITEM_ID } })])
    expect(out).toContain('항목 1개')
    expect(out).toMatch(/<button[^>]*>[\s\S]*우산 챙겨 달리기[\s\S]*<\/button>/)
    expect(out).toContain('09:30')
    expect(out).toContain('예약됨')
    expect(out).toContain('>대표</span>')
    expect(out).toContain('aria-label="대표 카드"')
  })

  it('항목이 없으면 「이 날짜에는 올라온 항목이 없어요」, 못 읽은 재료가 있으면 빠졌을 수 있다고 알린다', () => {
    expect(view([day()])).toContain(DAY_EMPTY_TEXT)
    expect(view([day()], { sourceErrors: { cards: '실패' } })).toContain(DAY_ITEMS_PARTIAL_TEXT)
    expect(view([day()])).not.toContain(DAY_ITEMS_PARTIAL_TEXT)
  })

  it('대표 카드가 없으면 안내, 카드를 못 읽었으면 없다고 단정하지 않는다', () => {
    expect(view([day()])).toContain(DAY_REPRESENTATIVE_NONE_TEXT)
    const unread = view([day()], { sourceErrors: { cards: '실패' } })
    expect(unread).toContain(DAY_REPRESENTATIVE_UNREAD_TEXT)
    expect(unread).not.toContain(DAY_REPRESENTATIVE_NONE_TEXT)
  })

  it('대표 카드가 목록에 없는 카드(장기 카드)면 제목만 보이고 눌리지 않는다', () => {
    const out = view([day({ items: [], representative: { title: '장기 대표', drawerKey: `card:${CARD_ID}` } })])
    expect(out).toContain('장기 대표')
    expect(out).not.toMatch(/<button[^>]*>[^<]*<span[^>]*>장기 대표/)
  })

  it('이 주에 없는 날짜는 안내 글이다', () => {
    const out = view([day({ date: '2026-10-08' })])
    expect(out).toContain(SCHEDULE_DAY_MISSING_TEXT)
    expect(out).toContain('서랍 닫기')
  })

  it('시험 묶음 항목에는 시험 칩이 붙는다', () => {
    expect(view([day({ items: [opsItem({ isSample: true })] })])).toContain('시험</span>')
  })
})
