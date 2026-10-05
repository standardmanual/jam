/**
 * 예약 등록 화면의 순수 함수 (티켓 20261002_1648, 운영툴 PRD §8.2)
 *
 * 지키는 것:
 * - 사전 점검 응답 → 요약창 구역(예약할 항목은 공개 시각 순·연결 묶음은 한 덩어리, 기다리는·못 하는·실패로 닫을 항목, 경고)
 * - 주 버튼: 예약할 항목이 있으면 「N개 예약 등록하기」, 없고 실패로 닫을 항목만 있으면 「실패로 닫기」, 둘 다 없으면 꺼진다
 * - 실행 응답 → 토스트 문장(성공·일부 실패·실패로만 닫음·건너뜀·결정 기록 실패)
 * - 항목별 가장 최근 `fail` 사유, 「아직 연결하지 않은 종류」 안내 문장
 * - 공개 전 취소 확인창(티켓 20261002_1649, §8.7): 미리 보기 응답 → 함께 취소될 항목·막는 항목·주 버튼 문구, 마지막 줄(시험 묶음은 다르다), 결과 토스트, 화면을 새로 읽을 실패
 * - JAM! 배지 소급 미리 세기(티켓 20261005_1607 ⑨-b): 응답 방어 읽기, 줄 문구(센 값·0명·포인트 0·세 가지 구분·형식 오류·실패), 표본·일부 유저 실패 안내, 요청 여부를 정하는 예약할 JAM! 배지 ID
 * - 이 파일은 레지스트리·사전 점검 모듈을 값으로 가져오지 않는다(클라이언트가 가져온다). 문장이 사전 점검과 어긋나지 않는지는 여기서만 맞춰 본다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRECHECK_MESSAGES } from '../execute/precheck'
import {
  CANCEL_DECISION_LOG_FAILED,
  EXECUTE_BADGE_PREVIEW_FAILED,
  EXECUTE_BADGE_PREVIEW_LOADING,
  EXECUTE_BADGE_PREVIEW_TITLE,
  EXECUTE_DECISION_LOG_FAILED,
  EXECUTE_WAITING_REASON,
  badgePreviewLines,
  buildCancelPreview,
  buildExecuteSummary,
  cancelAlsoTitle,
  cancelBlockersTitle,
  cancelButtonLabel,
  cancelIrreversibleNotice,
  cancelNeedsRefresh,
  cancelToast,
  executeButtonLabel,
  executeToast,
  itemDisplayName,
  latestFailReasons,
  readBadgePreview,
  readExecuteResult,
  readPrecheck,
  readyJamBadgeIds,
  unconnectedKindsNotice,
  type BadgePreviewView,
  type PrecheckView,
  type SummarySource,
} from '../executeView'

function src(id: string, overrides: Partial<SummarySource> = {}): SummarySource {
  return {
    id,
    position: Number(id.replace(/\D/g, '')) || 0,
    kind: 'home_feed_card',
    startsAt: '2026-10-05T00:00:00Z',
    original: { user_experience: `${id}를 만나요` },
    edited: null,
    ...overrides,
  }
}

function precheck(overrides: Partial<PrecheckView> = {}): PrecheckView {
  return { ready: [], waiting: [], blocked: [], failClose: [], groups: [], warnings: [], ...overrides }
}

describe('문장 — 사전 점검과 어긋나지 않는다', () => {
  it('「기다리는 항목」의 이유는 사전 점검 문장과 같다', () => {
    expect(EXECUTE_WAITING_REASON).toBe(PRECHECK_MESSAGES.waiting)
  })

  it('executeView.ts는 레지스트리·핸들러·사전 점검 모듈과 서버 조회 모듈을 값으로 가져오지 않는다(타입 import만 허용)', () => {
    const code = readFileSync(join(process.cwd(), 'src/lib/admin/opsInbox/executeView.ts'), 'utf8')
    const statements = code.match(/^import\s[\s\S]*?\sfrom\s+'[^']+'/gm) ?? []
    expect(statements.length).toBeGreaterThan(0)
    const valuePaths = statements
      .filter((statement) => !/^import\s+type\b/.test(statement))
      .map((statement) => /'([^']+)'$/.exec(statement)?.[1] ?? '')
    expect(valuePaths.filter((path) => /opsInbox\/execute\/|opsInbox\/query$/.test(path))).toEqual([])
    // 타입 import는 있다(이 검사가 빈 껍데기가 아니다)
    expect(statements.some((statement) => /^import\s+type\b/.test(statement) && /opsInbox\/query'$/.test(statement))).toBe(true)
  })
})

describe('executeButtonLabel', () => {
  it('예약할 항목이 있으면 「N개 예약 등록하기」, 0이면 「예약 등록하기」다', () => {
    expect(executeButtonLabel(3)).toBe('3개 예약 등록하기')
    expect(executeButtonLabel(1)).toBe('1개 예약 등록하기')
    expect(executeButtonLabel(0)).toBe('예약 등록하기')
  })
})

describe('unconnectedKindsNotice', () => {
  it('연결하지 않은 종류 이름을 ·로 이어 안내한다', () => {
    expect(unconnectedKindsNotice(['mission', 'drop_schedule'])).toBe(
      '미션·드랍 일정 항목은 아직 예약 등록을 연결하지 않았어요. 승인해도 예약되지 않아요.'
    )
    expect(unconnectedKindsNotice(['recipe'])).toBe('믹스 레시피 항목은 아직 예약 등록을 연결하지 않았어요. 승인해도 예약되지 않아요.')
  })

  it('없으면 null이다(알림 줄을 그리지 않는다)', () => {
    expect(unconnectedKindsNotice([])).toBeNull()
  })
})

describe('itemDisplayName', () => {
  it('목록 행과 같은 표시다: 종류 · 공개 시각(KST) 시작 · 유저가 겪는 것', () => {
    expect(itemDisplayName(src('a1', { startsAt: '2026-10-05T00:00:00Z' }))).toBe('홈피드 카드 · 10/5(월) 09:00 시작 · a1를 만나요')
  })

  it('공개 시각이 없으면 시각을 빼고, 유저가 겪는 것은 24자까지 줄인다', () => {
    const long = '가'.repeat(30)
    expect(itemDisplayName(src('a1', { kind: 'mission', startsAt: null, original: { user_experience: long } }))).toBe(`미션 · ${'가'.repeat(24)}…`)
    expect(itemDisplayName(src('a1', { startsAt: null, original: {} }))).toBe('홈피드 카드')
  })
})

describe('readPrecheck', () => {
  it('사전 점검 응답에서 요약창이 쓰는 칸만 읽고, 모양이 틀린 칸은 버린다', () => {
    const view = readPrecheck({
      ok: true,
      dryRun: true,
      ready: ['a', 3, 'b'],
      waiting: ['w'],
      blocked: [{ id: 'x', reasons: ['이유 하나', 5] }, { reasons: ['id 없음'] }, 'oops'],
      failClose: [{ id: 'f', reason: '연결된 미션이 반려됐어요' }, { id: 'g' }],
      groups: [{ itemIds: ['a', 'b'], executeIds: ['a', 'b'], linkPlan: {} }, null],
      warnings: [{ itemIds: ['a', 'b'], message: '경고' }, { itemIds: [] }],
      excluded: ['p'],
    })
    expect(view).toEqual({
      ready: ['a', 'b'],
      waiting: ['w'],
      blocked: [{ id: 'x', reasons: ['이유 하나'] }],
      failClose: [{ id: 'f', reason: '연결된 미션이 반려됐어요' }],
      groups: [{ executeIds: ['a', 'b'] }],
      warnings: [{ itemIds: ['a', 'b'], message: '경고' }],
    })
  })

  it('빈 객체여도 모든 칸이 빈 목록이다', () => {
    expect(readPrecheck({})).toEqual(precheck())
  })
})

describe('buildExecuteSummary — 구역', () => {
  const items = [
    src('a1', { startsAt: '2026-10-07T00:00:00Z' }),
    src('a2', { startsAt: '2026-10-05T00:00:00Z', kind: 'mission' }),
    src('a3', { startsAt: '2026-10-06T00:00:00Z' }),
    src('a4', { startsAt: null }),
    src('a5', { startsAt: '2026-10-05T00:00:00Z' }),
    src('a6'),
    src('a7'),
    src('a8'),
  ]

  it('예약할 항목은 공개 시각 순이고 공개 시각이 없으면 맨 끝이다', () => {
    const summary = buildExecuteSummary(precheck({ ready: ['a1', 'a2', 'a3', 'a4'] }), items, false)
    expect(summary.readyCount).toBe(4)
    const order = summary.ready.map((entry) => (entry.type === 'single' ? entry.item.id : 'group'))
    expect(order).toEqual(['a2', 'a3', 'a1', 'a4'])
    expect(summary.requestIds).toEqual(['a2', 'a3', 'a1', 'a4'])
  })

  it('공개 시각이 같으면 제출 순서다', () => {
    const summary = buildExecuteSummary(precheck({ ready: ['a5', 'a2'] }), items, false)
    expect(summary.requestIds).toEqual(['a2', 'a5'])
  })

  it('연결 그룹의 예약할 항목이 둘 이상이면 한 덩어리로 묶고 안은 생성 순서이며, 덩어리는 가장 이른 공개 시각 자리에 놓인다', () => {
    const summary = buildExecuteSummary(
      precheck({ ready: ['a1', 'a2', 'a3'], groups: [{ executeIds: ['a1', 'a3'] }, { executeIds: ['a2'] }] }),
      items,
      false
    )
    expect(summary.ready.map((entry) => entry.type)).toEqual(['single', 'group'])
    expect(summary.ready[0]).toMatchObject({ type: 'single', item: { id: 'a2' } })
    const group = summary.ready[1]
    expect(group.type === 'group' && group.items.map((item) => item.id)).toEqual(['a1', 'a3'])
    expect(summary.requestIds).toEqual(['a2', 'a1', 'a3'])
  })

  it('그룹에 있어도 예약할 항목이 아닌 것은 덩어리에 넣지 않고, 그룹에 없는 예약할 항목은 따로 둔다', () => {
    const summary = buildExecuteSummary(
      precheck({ ready: ['a1', 'a3'], groups: [{ executeIds: ['a1', 'a2'] }] }),
      items,
      false
    )
    expect(summary.ready.map((entry) => entry.type)).toEqual(['single', 'single'])
    expect(summary.requestIds).toEqual(['a3', 'a1'])
  })

  it('기다리는·못 하는·실패로 닫을 항목과 경고를 이름과 함께 담는다', () => {
    const summary = buildExecuteSummary(
      precheck({
        waiting: ['a6'],
        blocked: [{ id: 'a7', reasons: ['공개 시각이 이미 지났어요', '아직 연결하지 않은 종류예요'] }],
        failClose: [{ id: 'a8', reason: '연결된 미션이 반려됐어요' }],
        warnings: [{ itemIds: ['a1', 'a2'], message: '연결된 항목의 공개 시각이 서로 달라요' }],
      }),
      items,
      false
    )
    expect(summary.waiting).toEqual([{ id: 'a6', name: itemDisplayName(items[5]) }])
    expect(summary.blocked).toEqual([{ id: 'a7', name: itemDisplayName(items[6]), reasons: ['공개 시각이 이미 지났어요', '아직 연결하지 않은 종류예요'] }])
    expect(summary.failClose).toEqual([{ id: 'a8', name: itemDisplayName(items[7]), reason: '연결된 미션이 반려됐어요' }])
    expect(summary.warnings).toEqual([{ message: '연결된 항목의 공개 시각이 서로 달라요', names: [itemDisplayName(items[0]), itemDisplayName(items[1])] }])
  })

  it('화면에 없는 항목 ID는 이름이 「항목」이다', () => {
    const summary = buildExecuteSummary(precheck({ waiting: ['zzz'] }), items, false)
    expect(summary.waiting).toEqual([{ id: 'zzz', name: '항목' }])
  })

  it('시험 묶음 표시를 그대로 싣는다', () => {
    expect(buildExecuteSummary(precheck(), items, true).isSample).toBe(true)
    expect(buildExecuteSummary(precheck(), items, false).isSample).toBe(false)
  })
})

describe('buildExecuteSummary — 주 버튼', () => {
  const items = [src('a1'), src('a2')]

  it('예약할 항목이 있으면 「N개 예약 등록하기」이고 요청은 예약할 항목이다(실패로 닫을 항목이 함께 있어도)', () => {
    const summary = buildExecuteSummary(precheck({ ready: ['a1'], failClose: [{ id: 'a2', reason: '이유' }] }), items, false)
    expect(summary).toMatchObject({ action: 'schedule', confirmLabel: '1개 예약 등록하기', pendingLabel: '예약 등록하는 중', requestIds: ['a1'] })
  })

  it('예약할 항목이 없고 실패로 닫을 항목이 있으면 「실패로 닫기」이고 요청은 실패로 닫을 항목이다', () => {
    const summary = buildExecuteSummary(precheck({ failClose: [{ id: 'a2', reason: '이유' }] }), items, false)
    expect(summary).toMatchObject({ action: 'close', confirmLabel: '실패로 닫기', pendingLabel: '실패로 닫는 중', requestIds: ['a2'] })
  })

  it('둘 다 없으면 꺼진다(할 일 없음)', () => {
    const summary = buildExecuteSummary(precheck({ waiting: ['a1'], blocked: [{ id: 'a2', reasons: ['이유'] }] }), items, false)
    expect(summary).toMatchObject({ action: 'none', confirmLabel: '예약 등록하기', requestIds: [] })
  })
})

describe('JAM! 배지 소급 미리 세기 — 응답 읽기', () => {
  const response = (overrides: Record<string, unknown> = {}) => ({
    ok: true,
    badgePreview: {
      totalUsers: 1200,
      evaluatedUsers: 500,
      sampled: true,
      failedUsers: 3,
      lines: [
        { itemId: 'b1', status: 'counted', userCount: 480, points: 4800 },
        { itemId: 'b2', status: 'collectionReward' },
      ],
      ...overrides,
    },
  })

  it('응답에서 요약창이 쓰는 칸을 읽는다', () => {
    expect(readBadgePreview(response())).toEqual({
      totalUsers: 1200,
      evaluatedUsers: 500,
      sampled: true,
      failedUsers: 3,
      lines: [
        { itemId: 'b1', status: 'counted', userCount: 480, points: 4800 },
        { itemId: 'b2', status: 'collectionReward' },
      ],
    })
  })

  it('표본 표시가 true가 아니면 표본이 아니다', () => {
    expect(readBadgePreview(response({ sampled: 'true' }))?.sampled).toBe(false)
    expect(readBadgePreview(response({ sampled: undefined }))?.sampled).toBe(false)
  })

  it('읽을 수 없는 모양이면 null이다(구역은 「미리 세지 못했어요」)', () => {
    expect(readBadgePreview({})).toBeNull()
    expect(readBadgePreview({ badgePreview: null })).toBeNull()
    expect(readBadgePreview({ badgePreview: [] })).toBeNull()
    expect(readBadgePreview(response({ lines: 'x' }))).toBeNull()
    expect(readBadgePreview(response({ lines: undefined }))).toBeNull()
    for (const key of ['totalUsers', 'evaluatedUsers', 'failedUsers']) {
      for (const bad of [-1, 1.5, '3', null, undefined, Number.NaN]) {
        expect(readBadgePreview(response({ [key]: bad })), `${key}=${String(bad)}`).toBeNull()
      }
    }
  })

  it('줄은 모양을 믿지 않는다: 항목 ID가 없으면 버리고, 모르는 상태나 값이 틀린 센 줄은 「세지 못함」이다', () => {
    const view = readBadgePreview(
      response({
        lines: [
          { status: 'counted', userCount: 1, points: 1 },
          'oops',
          { itemId: 'b1', status: 'surprise' },
          { itemId: 'b2', status: 'counted', userCount: -1, points: 0 },
          { itemId: 'b3', status: 'counted', userCount: 2 },
          { itemId: 'b4', status: 'counted', userCount: '2', points: 20 },
          { itemId: 'b5', status: 'counted', userCount: 0, points: 0 },
          { itemId: 'b6', status: 'notCountable', userCount: 99 },
        ],
      })
    )
    expect(view?.lines).toEqual([
      { itemId: 'b1', status: 'failed' },
      { itemId: 'b2', status: 'failed' },
      { itemId: 'b3', status: 'failed' },
      { itemId: 'b4', status: 'failed' },
      { itemId: 'b5', status: 'counted', userCount: 0, points: 0 },
      { itemId: 'b6', status: 'notCountable' },
    ])
  })
})

describe('JAM! 배지 소급 미리 세기 — 구역 문구', () => {
  const view = (overrides: Partial<BadgePreviewView> = {}): BadgePreviewView => ({
    totalUsers: 40,
    evaluatedUsers: 40,
    sampled: false,
    failedUsers: 0,
    lines: [],
    ...overrides,
  })
  const items = [src('b1', { kind: 'jam_badge', startsAt: '2026-10-10T00:00:00Z', original: { user_experience: '첫 믹스 배지' } }), src('b2', { kind: 'jam_badge', startsAt: null, original: {} })]
  const textOf = (line: BadgePreviewView['lines'][number]) => badgePreviewLines(view({ lines: [line] }), items).lines[0].text

  it('구역 제목·세는 중·실패 문장은 고정 용어(획득·포인트)를 쓰고 「P」로 줄이지 않는다', () => {
    expect(EXECUTE_BADGE_PREVIEW_TITLE).toBe('공개되면 바로 획득하는 유저')
    expect(EXECUTE_BADGE_PREVIEW_LOADING).toBe('미리 세는 중이에요')
    expect(EXECUTE_BADGE_PREVIEW_FAILED).toBe('미리 세지 못했어요')
  })

  it('센 값은 「공개되면 약 N명에게 P포인트」이고 큰 숫자는 천 단위로 끊는다', () => {
    expect(textOf({ itemId: 'b1', status: 'counted', userCount: 12, points: 120 })).toBe('공개되면 약 12명에게 120포인트')
    expect(textOf({ itemId: 'b1', status: 'counted', userCount: 1234, points: 12340 })).toBe('공개되면 약 1,234명에게 12,340포인트')
  })

  it('배지 포인트가 0이면 「공개되면 약 N명이 획득해요」다', () => {
    expect(textOf({ itemId: 'b1', status: 'counted', userCount: 3, points: 0 })).toBe('공개되면 약 3명이 획득해요')
  })

  it('0명이면 「공개돼도 바로 획득하는 유저는 없어요」다', () => {
    expect(textOf({ itemId: 'b1', status: 'counted', userCount: 0, points: 0 })).toBe('공개돼도 바로 획득하는 유저는 없어요')
  })

  it('컬렉션 완성 보상·미션 보상·미리 세지 않는 조건·형식 오류·세지 못함이 서로 다른 문장이다', () => {
    const texts = (['collectionReward', 'missionReward', 'notCountable', 'formatInvalid', 'failed'] as const).map((status) => textOf({ itemId: 'b1', status }))
    expect(texts).toEqual([
      '컬렉션을 완성하면 획득해요',
      '미션 보상으로 획득해요',
      '이 조건은 미리 세지 않아요',
      '형식이 맞지 않아 세지 않았어요',
      '미리 세지 못했어요',
    ])
    expect(new Set(texts).size).toBe(5)
  })

  it('줄 이름은 예약할 항목과 같은 표시이고, 화면이 모르는 항목은 「항목」이다. 순서는 응답 그대로다', () => {
    const lines = badgePreviewLines(
      view({
        lines: [
          { itemId: 'b2', status: 'notCountable' },
          { itemId: 'b1', status: 'counted', userCount: 1, points: 10 },
          { itemId: 'zz', status: 'failed' },
        ],
      }),
      items
    ).lines
    expect(lines.map((line) => line.id)).toEqual(['b2', 'b1', 'zz'])
    expect(lines[1].name).toBe('JAM! 배지 · 10/10(토) 09:00 시작 · 첫 믹스 배지')
    expect(lines[0].name).toBe('JAM! 배지')
    expect(lines[2].name).toBe('항목')
  })

  it('표본으로 추정했으면 「유저 M명 중 K명을 세어 추정했어요」 안내가 붙는다', () => {
    const { notes } = badgePreviewLines(view({ totalUsers: 1200, evaluatedUsers: 500, sampled: true, lines: [{ itemId: 'b1', status: 'counted', userCount: 480, points: 4800 }] }), items)
    expect(notes).toEqual(['유저 1,200명 중 500명을 세어 추정했어요'])
  })

  it('세다가 오류가 난 유저가 있으면 「N명은 세지 못해 빼고 셌어요」 안내가 붙는다. 표본과 함께면 둘 다다', () => {
    const counted = { itemId: 'b1', status: 'counted', userCount: 5, points: 50 } as const
    expect(badgePreviewLines(view({ failedUsers: 2, lines: [counted] }), items).notes).toEqual(['2명은 세지 못해 빼고 셌어요'])
    expect(badgePreviewLines(view({ totalUsers: 100, evaluatedUsers: 54, sampled: true, failedUsers: 6, lines: [counted] }), items).notes).toEqual([
      '유저 100명 중 54명을 세어 추정했어요',
      '6명은 세지 못해 빼고 셌어요',
    ])
  })

  it('다 셌고 오류도 없으면 안내가 없다. 센 줄이 없으면 표본이어도 안내가 없다', () => {
    expect(badgePreviewLines(view({ lines: [{ itemId: 'b1', status: 'counted', userCount: 5, points: 50 }] }), items).notes).toEqual([])
    expect(badgePreviewLines(view({ totalUsers: 1200, evaluatedUsers: 500, sampled: true, failedUsers: 4, lines: [{ itemId: 'b1', status: 'collectionReward' }] }), items).notes).toEqual([])
    expect(badgePreviewLines(view({ lines: [{ itemId: 'b1', status: 'failed' }], sampled: true, failedUsers: 4 }), items).notes).toEqual([])
  })

  it('센 유저 수나 전체 유저 수가 0이면 「0명 중」 같은 안내를 만들지 않는다', () => {
    const counted = { itemId: 'b1', status: 'counted', userCount: 0, points: 0 } as const
    expect(badgePreviewLines(view({ totalUsers: 0, evaluatedUsers: 0, sampled: true, lines: [counted] }), items).notes).toEqual([])
  })
})

describe('readyJamBadgeIds — 배지 미리 세기를 요청할지', () => {
  const items = [
    src('b1', { kind: 'jam_badge' }),
    src('b2', { kind: 'jam_badge' }),
    src('b3', { kind: 'jam_badge' }),
    src('b4', { kind: 'jam_badge' }),
    src('c1', { kind: 'home_feed_card' }),
    src('m1', { kind: 'mission' }),
  ]

  it('예약할 항목 가운데 JAM! 배지만 사전 점검의 순서대로 돌려준다', () => {
    expect(readyJamBadgeIds(precheck({ ready: ['c1', 'b2', 'm1', 'b1'] }), items)).toEqual(['b2', 'b1'])
  })

  it('기다리는 중·못 하는 항목·실패로 닫을 항목인 배지는 세지 않는다', () => {
    const view = precheck({ ready: ['c1'], waiting: ['b1'], blocked: [{ id: 'b2', reasons: ['공개 시각이 없어요'] }], failClose: [{ id: 'b3', reason: '이유' }] })
    expect(readyJamBadgeIds(view, items)).toEqual([])
  })

  it('예약할 JAM! 배지가 없으면 비어 있다(요청을 보내지 않는다). 화면이 모르는 항목도 뺀다', () => {
    expect(readyJamBadgeIds(precheck(), items)).toEqual([])
    expect(readyJamBadgeIds(precheck({ ready: ['c1', 'm1'] }), items)).toEqual([])
    expect(readyJamBadgeIds(precheck({ ready: ['unknown'] }), items)).toEqual([])
  })
})

describe('executeToast', () => {
  const base = { scheduled: 0, failed: 0, skipped: 0, decisionLogFailed: false }

  it('예약만 했으면 「N개를 예약 등록했어요」', () => {
    expect(executeToast({ ...base, scheduled: 3 })).toEqual({ level: 'success', message: '3개를 예약 등록했어요', logWarning: null })
  })

  it('실패가 있으면 「N개를 예약 등록했고 M개는 실패했어요」', () => {
    expect(executeToast({ ...base, scheduled: 3, failed: 2 })).toMatchObject({ level: 'warning', message: '3개를 예약 등록했고 2개는 실패했어요' })
  })

  it('예약 없이 닫기만 했으면 「M개를 실패로 닫았어요」', () => {
    expect(executeToast({ ...base, failed: 2 })).toMatchObject({ level: 'warning', message: '2개를 실패로 닫았어요' })
  })

  it('건너뛴 항목이 있으면 「K개는 그사이 바뀌어 건너뛰었어요」를 덧붙인다', () => {
    expect(executeToast({ ...base, scheduled: 3, skipped: 1 })).toMatchObject({
      level: 'warning',
      message: '3개를 예약 등록했어요. 1개는 그사이 바뀌어 건너뛰었어요',
    })
    expect(executeToast({ ...base, scheduled: 3, failed: 1, skipped: 2 }).message).toBe(
      '3개를 예약 등록했고 1개는 실패했어요. 2개는 그사이 바뀌어 건너뛰었어요'
    )
    expect(executeToast({ ...base, failed: 1, skipped: 2 }).message).toBe('1개를 실패로 닫았어요. 2개는 그사이 바뀌어 건너뛰었어요')
  })

  it('결정 기록을 남기지 못했으면 경고 문장을 따로 돌려준다(예약 문장은 그대로)', () => {
    const toast = executeToast({ ...base, scheduled: 2, decisionLogFailed: true })
    expect(toast.message).toBe('2개를 예약 등록했어요')
    expect(toast.level).toBe('success')
    expect(toast.logWarning).toBe('결정 기록을 남기지 못했어요. 예약은 그대로예요.')
    expect(toast.logWarning).toBe(EXECUTE_DECISION_LOG_FAILED)
  })

  it('아무것도 없는 응답도 문장이 나온다', () => {
    expect(executeToast(base).message).toBe('예약 등록한 항목이 없어요')
  })
})

describe('readExecuteResult', () => {
  it('실행 응답에서 개수만 읽는다', () => {
    expect(
      readExecuteResult({
        ok: true,
        scheduled: ['a', 'b'],
        failed: [{ id: 'c', reason: '이유' }],
        skipped: [{ id: 'd', reason: '이유' }, { id: 'e', reason: '이유' }],
        excludedCount: 4,
        decisionLogFailed: true,
      })
    ).toEqual({ scheduled: 2, failed: 1, skipped: 2, decisionLogFailed: true })
  })

  it('칸이 없거나 모양이 틀리면 0이고 decisionLogFailed는 true일 때만 true다', () => {
    expect(readExecuteResult({})).toEqual({ scheduled: 0, failed: 0, skipped: 0, decisionLogFailed: false })
    expect(readExecuteResult({ scheduled: 3, failed: 'x', decisionLogFailed: 'true' })).toEqual({
      scheduled: 0,
      failed: 0,
      skipped: 0,
      decisionLogFailed: false,
    })
  })
})

describe('latestFailReasons', () => {
  const decision = (itemId: string | null, action: string, reason: string | null) => ({ itemId, action, reason })

  it('항목마다 가장 최근(처음 만난) fail 사유를 남긴다 — 결정 기록은 최신순이다', () => {
    const reasons = latestFailReasons([
      decision('a', 'fail', '두 번째 실패'),
      decision('a', 'fail', '첫 번째 실패'),
      decision('b', 'fail', '연결된 미션이 반려됐어요'),
    ])
    expect(reasons).toEqual({ a: '두 번째 실패', b: '연결된 미션이 반려됐어요' })
  })

  it('fail이 아닌 기록·항목 없는 기록·사유가 빈 기록은 건너뛴다', () => {
    const reasons = latestFailReasons([
      decision('a', 'approve', null),
      decision(null, 'fail', '묶음 전체 기록'),
      decision('b', 'fail', '   '),
      decision('c', 'fail', null),
      decision('b', 'fail', '앞선 사유'),
      decision('d', 'cancel', '취소 사유'),
    ])
    expect(reasons).toEqual({ b: '앞선 사유' })
  })

  it('앞뒤 공백을 뗀다', () => {
    expect(latestFailReasons([decision('a', 'fail', '  이유  ')])).toEqual({ a: '이유' })
  })

  it('기록이 없으면 빈 객체다', () => {
    expect(latestFailReasons([])).toEqual({})
  })
})

describe('buildCancelPreview — 미리 보기 응답 읽기', () => {
  const items = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]
  const lineOf = (item: { id: string }) => `줄 ${item.id}`
  const preview = (data: Record<string, unknown>) => buildCancelPreview(data, 'a1', items, lineOf)

  it('함께 취소될 항목은 cancelIds에서 이 항목을 뺀 것이고 제출 순서를 지킨다', () => {
    const view = preview({ ok: true, dryRun: true, cancelIds: ['a2', 'a1', 'a3'], blockers: [] })
    expect(view.also).toEqual([
      { id: 'a2', line: '줄 a2' },
      { id: 'a3', line: '줄 a3' },
    ])
    expect(view.blockers).toEqual([])
    expect(view.canConfirm).toBe(true)
  })

  it('이 항목뿐이면 함께 취소될 항목이 없고 주 버튼은 「공개 전 취소하기」다', () => {
    const view = preview({ cancelIds: ['a1'], blockers: [] })
    expect(view.also).toEqual([])
    expect(view.confirmLabel).toBe('공개 전 취소하기')
  })

  it('함께 취소될 항목이 있으면 주 버튼은 「N개 공개 전 취소하기」이고 N은 이 항목을 포함한다', () => {
    expect(preview({ cancelIds: ['a1', 'a2'] }).confirmLabel).toBe('2개 공개 전 취소하기')
    expect(preview({ cancelIds: ['a1', 'a2', 'a3'] }).confirmLabel).toBe('3개 공개 전 취소하기')
    expect(cancelButtonLabel(0)).toBe('공개 전 취소하기')
    expect(cancelButtonLabel(2)).toBe('3개 공개 전 취소하기')
  })

  it('막는 항목은 한 줄 요약과 서버 이유를 싣고 확인할 수 없게 한다', () => {
    const reason = '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.'
    const view = preview({ cancelIds: ['a1'], blockers: [{ id: 'a3', reason }] })
    expect(view.blockers).toEqual([{ id: 'a3', line: '줄 a3', reason }])
    expect(view.canConfirm).toBe(false)
  })

  it('화면에 없는 ID는 「항목」으로 보인다', () => {
    const view = preview({ cancelIds: ['a1', 'zz'], blockers: [{ id: 'yy', reason: '이유' }] })
    expect(view.also).toEqual([{ id: 'zz', line: '항목' }])
    expect(view.blockers).toEqual([{ id: 'yy', line: '항목', reason: '이유' }])
  })

  it('응답 모양을 믿지 않는다: 칸이 없거나 틀리면 비어 있고, 이유가 문자열이 아니면 빈 이유다', () => {
    expect(preview({})).toMatchObject({ also: [], blockers: [], canConfirm: true })
    expect(preview({ cancelIds: 'a2', blockers: 'x' })).toMatchObject({ also: [], blockers: [] })
    expect(preview({ cancelIds: [1, null, 'a2'], blockers: [null, { id: 3 }, { id: 'a3', reason: 5 }] })).toMatchObject({
      also: [{ id: 'a2', line: '줄 a2' }],
      blockers: [{ id: 'a3', line: '줄 a3', reason: '' }],
    })
  })
})

describe('공개 전 취소 확인창 문장', () => {
  it('구역 제목에 개수가 붙는다', () => {
    expect(cancelAlsoTitle(2)).toBe('함께 취소될 항목 2개')
    expect(cancelBlockersTitle(1)).toBe('취소를 막는 항목 1개')
  })

  it('마지막 줄은 되돌릴 수 없다는 것과 자원이 지워진다는 것을 알리고, 시험 묶음은 지울 자원이 없다고 알린다', () => {
    expect(cancelIrreversibleNotice(false)).toBe('공개 전 취소는 되돌릴 수 없어요. 예약해 둔 자원도 지워져요.')
    expect(cancelIrreversibleNotice(true)).toBe('공개 전 취소는 되돌릴 수 없어요. 시험 묶음이라 지울 자원은 없어요.')
    expect(cancelIrreversibleNotice(true)).not.toContain('예약해 둔 자원도 지워져요')
  })
})

describe('cancelToast', () => {
  it('1개면 「공개 전에 취소했어요」', () => {
    expect(cancelToast({ ok: true, cancelled: ['a1'], missing: [] })).toEqual({ message: '공개 전에 취소했어요', logWarning: null })
  })

  it('2개 이상이면 「N개를 공개 전에 취소했어요」', () => {
    expect(cancelToast({ ok: true, cancelled: ['a2', 'a1'], missing: [] }).message).toBe('2개를 공개 전에 취소했어요')
    expect(cancelToast({ ok: true, cancelled: ['a3', 'a2', 'a1'], missing: [] }).message).toBe('3개를 공개 전에 취소했어요')
  })

  it('결정 기록을 남기지 못했으면 경고 문장을 따로 돌려준다(취소 문장은 그대로)', () => {
    const toast = cancelToast({ ok: true, cancelled: ['a1'], missing: [], decisionLogFailed: true })
    expect(toast.message).toBe('공개 전에 취소했어요')
    expect(toast.logWarning).toBe('결정 기록을 남기지 못했어요. 취소는 그대로예요.')
    expect(toast.logWarning).toBe(CANCEL_DECISION_LOG_FAILED)
  })

  it('decisionLogFailed는 true일 때만 경고이고, 칸이 없는 응답도 1개 문장이 나온다', () => {
    expect(cancelToast({ cancelled: ['a1'], decisionLogFailed: 'yes' }).logWarning).toBeNull()
    expect(cancelToast({}).message).toBe('공개 전에 취소했어요')
  })
})

describe('cancelNeedsRefresh', () => {
  it('409는 화면을 새로 읽는다(그사이 바뀌었다)', () => {
    expect(cancelNeedsRefresh(409, { error: '예약됨 항목만 취소할 수 있어요' })).toBe(true)
  })

  it('500에 cancelled가 있으면(일부만 취소) 새로 읽고, 그 밖의 500·오류는 읽지 않는다', () => {
    expect(cancelNeedsRefresh(500, { error: '일부만 취소했어요', cancelled: ['a2'] })).toBe(true)
    expect(cancelNeedsRefresh(500, { error: '항목 상태를 바꾸지 못했어요', cancelled: [] })).toBe(true)
    expect(cancelNeedsRefresh(500, { error: '취소하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })).toBe(false)
    expect(cancelNeedsRefresh(0, {})).toBe(false)
    expect(cancelNeedsRefresh(400, {})).toBe(false)
    expect(cancelNeedsRefresh(404, {})).toBe(false)
  })
})
