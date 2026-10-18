/**
 * 어드민 앰비언트 드랍 「날짜 예약」 구역의 초기 렌더 (티켓 20261001_2154)
 *
 * jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다:
 * 목록 9행(8상태 + DB scheduled·파생 missed)의 버튼 열림 행렬·라벨·결과 문장, 미리 확인 안내, 등록 폼 첫 화면,
 * 최근 실행 이력의 「예약」 표시와 구역 위치.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ambient-drop',
  useSearchParams: () => new URLSearchParams(),
}))

import ScheduleList from '../ScheduleList'
import ScheduleForm, { SchedulePreviewNotice } from '../ScheduleForm'
import AmbientDropForm from '../AmbientDropForm'
import { DEFAULT_AMBIENT_DROP_CONFIG } from '@/lib/ambient-drop/config'
import {
  SCHEDULE_STATE_LABEL,
  type AmbientDropSchedulePreview,
  type AmbientDropScheduleListItem,
  type AmbientDropScheduleNames,
} from '@/lib/ambient-drop/scheduleView'
import type { AmbientDropScheduleState } from '@/lib/ambient-drop/scheduleSpec'
import type { AmbientDropScheduleStatus } from '@/types/database'

const NOW_ISO = '2026-10-01T03:00:00.000Z'

const names: AmbientDropScheduleNames = {
  pois: { p1: '성수 카페', p2: '서울숲', p3: '뚝섬 한강공원' },
  badges: { b1: '커피콩' },
  collections: { c1: '가을 컬렉션' },
}

function item(
  id: string,
  state: AmbientDropScheduleState,
  status: AmbientDropScheduleStatus,
  overrides: Partial<AmbientDropScheduleListItem> = {}
): AmbientDropScheduleListItem {
  return {
    id,
    title: `예약-${id}`,
    scheduledAt: '2026-10-05T00:00:00.000Z',
    status,
    state,
    poiMode: 'list',
    poiIds: ['p1', 'p2', 'p3'],
    poiCategory: null,
    perPoiCount: 2,
    totalCount: null,
    itemMode: 'items',
    badgeIds: ['b1'],
    collectionIds: [],
    createdBy: 'admin@jam.test',
    createdAt: '2026-10-01T00:00:00.000Z',
    finishedAt: null,
    canceledAt: null,
    outcome: null,
    ...overrides,
  }
}

const noop = () => {}

function renderList(items: AmbientDropScheduleListItem[]) {
  return renderToStaticMarkup(
    <ScheduleList items={items} names={names} categories={[{ slug: 'cafe', label: '카페' }]} onCancel={noop} onReschedule={noop} busyId={null} />
  )
}

/** 행 하나의 HTML 조각 */
function rowOf(html: string, id: string): string {
  const start = html.indexOf(`data-schedule-id="${id}"`)
  expect(start).toBeGreaterThan(-1)
  const end = html.indexOf('</tr>', start)
  return html.slice(start, end)
}

/** 「시각 수정」「취소」 버튼의 disabled 여부 */
function buttonsDisabled(row: string): { reschedule: boolean; cancel: boolean } {
  const buttons = [...row.matchAll(/<button[^>]*>[^<]*<\/button>/g)].map((m) => m[0])
  const find = (label: string) => buttons.find((b) => b.endsWith(`>${label}</button>`)) as string
  return { reschedule: /disabled=""/.test(find('시각 수정')), cancel: /disabled=""/.test(find('취소')) }
}

describe('ScheduleList', () => {
  const rows: [string, AmbientDropScheduleState, AmbientDropScheduleStatus, { reschedule: boolean; cancel: boolean }][] = [
    ['r-scheduled', 'scheduled', 'scheduled', { reschedule: false, cancel: false }],
    ['r-running', 'running', 'running', { reschedule: true, cancel: true }],
    ['r-stalled', 'stalled', 'running', { reschedule: true, cancel: true }],
    ['r-done', 'done', 'done', { reschedule: true, cancel: true }],
    ['r-skipped', 'skipped', 'skipped', { reschedule: true, cancel: true }],
    ['r-failed', 'failed', 'failed', { reschedule: true, cancel: true }],
    ['r-canceled', 'canceled', 'canceled', { reschedule: true, cancel: true }],
    // DB는 scheduled인데 3시간이 지나 놓침으로 읽히는 예약: 취소만 열린다
    ['r-missed', 'missed', 'scheduled', { reschedule: true, cancel: false }],
    ['r-missed-db', 'missed', 'missed', { reschedule: true, cancel: true }],
  ]

  const html = renderList(
    rows.map(([id, state, status]) =>
      item(id, state, status, {
        outcome:
          state === 'done'
            ? { requested: 6, spawned: 5, failed: 1, reason: null, failureKind: null, overlappedPoiCount: 2, excludedSummary: null }
            : state === 'skipped'
              ? { requested: 6, spawned: 0, failed: 0, reason: 'no_eligible_poi', failureKind: null, overlappedPoiCount: 0, excludedSummary: null }
              : state === 'failed'
                ? { requested: 6, spawned: 0, failed: 6, reason: 'insert_failed', failureKind: 'insert', overlappedPoiCount: 0, excludedSummary: null }
                : null,
      })
    )
  )

  it.each(rows)('%s: 시각 수정·취소 버튼 닫힘 여부가 규칙대로다', (id, _state, _status, expected) => {
    expect(buttonsDisabled(rowOf(html, id))).toEqual(expected)
  })

  it('상태 라벨 8개가 모두 보인다', () => {
    for (const label of Object.values(SCHEDULE_STATE_LABEL)) expect(html).toContain(label)
  })

  it('결과 문장: 완료는 드랍 수·겹침, 건너뜀·실패는 오류 원문 없이 사유 문장', () => {
    expect(rowOf(html, 'r-done')).toContain('5개를 드랍했어요(요청 6개).')
    expect(rowOf(html, 'r-done')).toContain('이미 드랍이 있던 장소 2곳에 겹쳐 드랍했어요.')
    expect(rowOf(html, 'r-skipped')).toContain('실행 시각에 드랍할 수 있는 장소가 없었어요')
    expect(rowOf(html, 'r-failed')).toContain('장소에 드랍을 만드는 중 오류가 났어요')
    expect(rowOf(html, 'r-missed')).toContain('3시간이 지나도록 실행되지 않았어요')
  })

  it('막힌 버튼에는 이유가 title로 달리고, 열린 버튼에는 없다', () => {
    expect(rowOf(html, 'r-done')).toContain('title="이미 실행된 예약이에요.')
    expect(rowOf(html, 'r-running')).toContain('title="드랍하는 중인 예약이라 바꿀 수 없어요."')
    expect(rowOf(html, 'r-scheduled')).not.toContain('title=')
  })

  it('장소·아이템은 이름 2개까지 보이고 나머지는 「외 N」이다', () => {
    const row = rowOf(html, 'r-scheduled')
    expect(row).toContain('성수 카페, 서울숲 외 1곳')
    expect(row).toContain('커피콩')
    expect(row).toContain('2026.10.05 09:00')
  })

  it('종류+개수·컬렉션 예약은 종류 라벨 × 총 개수, 컬렉션 이름으로 보인다', () => {
    const out = renderList([
      item('x', 'scheduled', 'scheduled', {
        poiMode: 'category',
        poiIds: [],
        poiCategory: 'cafe',
        perPoiCount: null,
        totalCount: 10,
        itemMode: 'collections',
        badgeIds: [],
        collectionIds: ['c1'],
      }),
    ])
    expect(out).toContain('카페 × 총 10개')
    expect(out).toContain('컬렉션 가을 컬렉션')
  })

  it('예약이 없으면 안내 문장을 보인다', () => {
    expect(renderList([])).toContain('등록한 날짜 예약이 아직 없어요.')
  })
})

describe('SchedulePreviewNotice', () => {
  const base: AmbientDropSchedulePreview = {
    scheduledAt: '2026-10-05T00:00:00.000Z',
    requested: 4,
    poiMode: 'list',
    eligiblePoiCount: 2,
    overlappedPoiCount: 0,
    overlapNotice: null,
    candidateBadgeCount: 1,
    problem: null,
  }

  it('미리 확인이 없으면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<SchedulePreviewNotice preview={null} />)).toBe('')
  })

  it('장소 직접 + 겹침이면 「이미 드랍이 있는 장소 N곳(겹쳐서 놓여요)」를 보인다', () => {
    const out = renderToStaticMarkup(<SchedulePreviewNotice preview={{ ...base, overlappedPoiCount: 2 }} />)
    expect(out).toContain('이미 드랍이 있는 장소 2곳(겹쳐서 놓여요)')
  })

  it('종류+개수 모드는 흩어 드랍하는 안내를 보인다', () => {
    const out = renderToStaticMarkup(<SchedulePreviewNotice preview={{ ...base, poiMode: 'category', eligiblePoiCount: 7 }} />)
    expect(out).toContain('운영 중인 장소 7곳에 흩어 드랍해요. 한도를 넘는 장소는 건너뛰고, 자리가 모자라면 있는 만큼만 드랍해요.')
  })

  it('problem이면 빨간 경고로 그 문장을 보인다', () => {
    const out = renderToStaticMarkup(<SchedulePreviewNotice preview={{ ...base, problem: '예정 시각에 놓을 수 없는 대상이 있어요(운영이 끝난 장소 1건).' }} />)
    expect(out).toContain('text-red-600')
    expect(out).toContain('운영이 끝난 장소 1건')
  })

  it('입력이 바뀌어 낡았으면 흐리게 하고 다시 확인하라고 알린다', () => {
    const out = renderToStaticMarkup(<SchedulePreviewNotice preview={base} stale />)
    expect(out).toContain('opacity-50')
    expect(out).toContain('입력이 바뀌었어요. 다시 확인해 주세요.')
    expect(renderToStaticMarkup(<SchedulePreviewNotice preview={base} />)).not.toContain('입력이 바뀌었어요')
  })
})

describe('ScheduleForm 첫 렌더', () => {
  const books = [
    { id: 'live', name: '노출 중 컬렉션', valid_from: null, valid_until: null },
    { id: 'pre', name: '곧 공개 컬렉션', valid_from: '2026-10-10T00:00:00.000Z', valid_until: null },
    { id: 'end', name: '끝난 컬렉션', valid_from: null, valid_until: '2026-09-30T00:00:00.000Z' },
  ]
  const form = (
    <ScheduleForm nowIso={NOW_ISO} categories={[{ slug: 'cafe', label: '카페' }]} books={books} tribes={[]} onRegistered={noop} />
  )

  it('시각·두 탭·합계 줄이 보이고 등록 버튼은 막혀 있다', () => {
    const out = renderToStaticMarkup(form)
    expect(out).toContain('장소 직접 선택')
    expect(out).toContain('장소 종류+개수')
    expect(out).toContain('아이템 직접 선택')
    expect(out).toContain('컬렉션 선택')
    expect(out).toContain('한 예약 최대 100개')
    expect(out).toContain('min="2026-10-01"')
    const register = out.match(/<button[^>]*>예약 등록<\/button>/)?.[0] ?? ''
    expect(out).toContain('날짜 지정')
    expect(out).toContain('>지금<')
    // 「지금 드랍」 버튼은 「지금」 탭을 고른 뒤에만 나온다
    expect(out).not.toMatch(/<button[^>]*>지금 드랍<\/button>/)
    expect(register).toContain('disabled=""')
    const preview = out.match(/<button[^>]*>확인하기<\/button>/)?.[0] ?? ''
    expect(preview).toContain('disabled=""')
  })

  it('첫 화면에는 장소 직접 모드의 칸만 있고 종류+개수 칸은 본문에 없다', () => {
    const out = renderToStaticMarkup(form)
    expect(out).toContain('장소당 개수')
    expect(out).not.toContain('총 개수')
  })
})

describe('AmbientDropForm 이력·구역 위치', () => {
  const history = [
    {
      id: 'h1',
      created_at: '2026-10-01T00:00:00.000Z',
      payload: { trigger: 'scheduled', requested: 4, spawned: 3, overlappedPoiCount: 1 },
    },
    { id: 'h2', created_at: '2026-10-01T00:00:00.000Z', payload: { trigger: 'cron', spawned: 2 } },
  ]

  const out = renderToStaticMarkup(
    <AmbientDropForm
      initial={DEFAULT_AMBIENT_DROP_CONFIG}
      categories={[]}
      books={[]}
      history={history}
      initialBlocked={false}
      scheduleSection={<section data-testid="slot">슬롯 자리</section>}
    />
  )

  it('이력의 예약 실행은 [예약] 요청·드랍·겹침 줄로 보인다', () => {
    expect(out).toContain('[예약] 요청 4개 · 드랍 3개 · 겹친 장소 1곳')
    expect(out).toContain('[자동]')
  })

  it('날짜 예약 구역은 즉시 배포 뒤, 최근 실행 이력 앞에 놓인다', () => {
    const immediate = out.indexOf('즉시 배포</h2>')
    const slot = out.indexOf('슬롯 자리')
    const historyAt = out.indexOf('최근 실행 이력')
    expect(immediate).toBeGreaterThan(-1)
    expect(slot).toBeGreaterThan(immediate)
    expect(historyAt).toBeGreaterThan(slot)
  })

  it('배포 트리거 안내가 세 갈래를 설명한다', () => {
    expect(out).toContain('배포는 세 갈래예요')
    expect(out).toContain('날짜 예약')
  })
})
