/**
 * 예약 등록 사전 점검 (티켓 20261002_1122, PRD §8.2). 가정 1~6은 티켓 「착수 전에 정한 것」 번호다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { RESOURCE_KEY_BY_KIND, asRegisterChecksClient, type ExecuteServiceClient } from '../handlers'
import { EXECUTE_LEAD_MS, PRECHECK_MESSAGES, precheckBundle } from '../precheck'
import { EXECUTE_HANDLERS } from '../registry'
import { FULL_REGISTRY, LATER, NOW, fakeRegistry, makeItem } from './fixtures'

const MINUTE = 60_000
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()
const run = (items: ReturnType<typeof makeItem>[], handlers = FULL_REGISTRY) => precheckBundle(items, { now: NOW, handlers })

describe('핸들러 레지스트리', () => {
  it('지금 레지스트리는 home_feed_card(티켓 20261002_1255)·mission(티켓 20261002_1944)·recipe(티켓 20261002_2221)·drop_schedule(티켓 20261002_2306) 넷이다', () => {
    expect(Object.keys(EXECUTE_HANDLERS)).toEqual(['home_feed_card', 'mission', 'recipe', 'drop_schedule'])
    expect(EXECUTE_HANDLERS.home_feed_card).toMatchObject({ kind: 'home_feed_card', resourceKey: RESOURCE_KEY_BY_KIND.home_feed_card, idFirst: true })
    expect(EXECUTE_HANDLERS.mission).toMatchObject({ kind: 'mission', resourceKey: RESOURCE_KEY_BY_KIND.mission, idFirst: true })
    expect(EXECUTE_HANDLERS.recipe).toMatchObject({ kind: 'recipe', resourceKey: RESOURCE_KEY_BY_KIND.recipe, idFirst: true })
    expect(EXECUTE_HANDLERS.drop_schedule).toMatchObject({ kind: 'drop_schedule', resourceKey: RESOURCE_KEY_BY_KIND.drop_schedule, idFirst: true })
  })

  it('카드·미션·레시피·드랍은 예약할 수 있고 JAM! 배지·컬렉션 같은 나머지 종류는 여전히 「아직 연결하지 않은 종류」로 막힌다', () => {
    const result = precheckBundle(
      [
        makeItem({ key: 'card', kind: 'home_feed_card' }),
        makeItem({ key: 'mission', kind: 'mission' }),
        makeItem({ key: 'recipe', kind: 'recipe' }),
        makeItem({ key: 'drop', kind: 'drop_schedule' }),
        makeItem({ key: 'badge', kind: 'jam_badge' }),
      ],
      { now: NOW }
    )
    expect(result.ready).toEqual(['card', 'mission', 'recipe', 'drop'])
    expect(result.blocked).toEqual([{ id: 'badge', reasons: [PRECHECK_MESSAGES.noHandler] }])
  })

  it('빈 레지스트리를 넘기면 모든 승인 항목이 「아직 연결하지 않은 종류」로 막힌다', () => {
    const result = precheckBundle([makeItem({ key: 'card', kind: 'home_feed_card' }), makeItem({ key: 'mission', kind: 'mission' })], { now: NOW, handlers: {} })
    expect(result.ready).toEqual([])
    expect(result.blocked).toEqual([
      { id: 'card', reasons: [PRECHECK_MESSAGES.noHandler] },
      { id: 'mission', reasons: [PRECHECK_MESSAGES.noHandler] },
    ])
  })

  it('핸들러가 붙은 종류만 예약할 수 있고, 같은 그룹의 다른 승인 항목도 함께 막힌다', () => {
    const items = [makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }), makeItem({ key: 'mission', kind: 'mission' }), makeItem({ key: 'solo', kind: 'recipe' })]
    const result = run(items, fakeRegistry(['mission', 'recipe']))
    expect(result.ready).toEqual(['solo'])
    expect(result.blocked).toEqual([
      { id: 'card', reasons: [PRECHECK_MESSAGES.noHandler] },
      { id: 'mission', reasons: [PRECHECK_MESSAGES.groupBlocked] },
    ])
  })

  it('종류가 비었거나 객체 기본 속성 이름이어도 핸들러가 있는 것으로 읽지 않는다', () => {
    const result = run([makeItem({ key: 'a', kind: null }), makeItem({ key: 'b', kind: 'constructor' })])
    expect(result.blocked.map((entry) => entry.reasons)).toEqual([[PRECHECK_MESSAGES.noHandler], [PRECHECK_MESSAGES.noHandler]])
  })

  it('asRegisterChecksClient는 같은 클라이언트를 좁혀 돌려준다', () => {
    const service = { from: () => ({}) } as unknown as ExecuteServiceClient
    expect(asRegisterChecksClient(service)).toBe(service)
  })
})

describe('네 분류와 대상', () => {
  it('승인됨만 나눈다. 다른 상태는 어디에도 들어가지 않는다', () => {
    const items = ['arrived', 'reviewing', 'preparing', 'scheduled', 'live', 'ended', 'rejected', 'cancelled', 'failed'].map((status) => makeItem({ status }))
    const result = run([makeItem({ key: 'only' }), ...items])
    expect(result.ready).toEqual(['only'])
    expect(result.waiting).toEqual([])
    expect(result.blocked).toEqual([])
    expect(result.failClose).toEqual([])
  })

  it('가정 1: 형식 오류가 남은 승인 항목도 형식 오류 열만으로 막지 않는다', () => {
    const result = run([makeItem({ key: 'a', formatErrors: ['items[0].resource: 객체여야 해요.'] })])
    expect(result.ready).toEqual(['a'])
  })

  it('가정 2: pattern_proposal 승인 항목은 excluded로 따로 돌려주고 N에 세지 않는다', () => {
    const result = run([makeItem({ key: 'p', kind: 'pattern_proposal', startsAt: null }), makeItem({ key: 'm' })])
    expect(result.excluded).toEqual(['p'])
    expect(result.ready).toEqual(['m'])
    expect(result.blocked).toEqual([])
  })

  it('결과 목록은 제출 순서다', () => {
    const result = run([makeItem({ key: 'b', position: 2 }), makeItem({ key: 'a', position: 1 }), makeItem({ key: 'c', position: 3, startsAt: null })])
    expect(result.ready).toEqual(['a', 'b'])
    expect(result.blocked.map((entry) => entry.id)).toEqual(['c'])
  })
})

describe('공개 시각', () => {
  const blockedReasons = (item: ReturnType<typeof makeItem>) => run([item]).blocked[0]?.reasons

  it('공개 시각이 없으면 막는다', () => {
    expect(blockedReasons(makeItem({ startsAt: null }))).toEqual([PRECHECK_MESSAGES.startMissing])
  })

  it('항목 값이 비었으면 행 칸을 읽고, 값이 있는데 시간대 없는 ISO가 아니면 읽을 수 없어 막는다', () => {
    expect(run([makeItem({ key: 'a', startsAt: LATER, original: { starts_at: '' } })]).ready).toEqual(['a'])
    expect(blockedReasons(makeItem({ startsAt: LATER, original: { starts_at: '내일 오후' } }))).toEqual([PRECHECK_MESSAGES.startInvalid])
    expect(blockedReasons(makeItem({ startsAt: LATER, original: { starts_at: '2026-10-10T09:00:00' } }))).toEqual([PRECHECK_MESSAGES.startInvalid])
  })

  it('수정본의 공개 시각을 먼저 읽는다', () => {
    const edited = { starts_at: at(-MINUTE) }
    expect(blockedReasons(makeItem({ startsAt: LATER, edited }))).toEqual([PRECHECK_MESSAGES.startPassed])
  })

  it('지난 시각과 지금과 같은 시각은 막는다', () => {
    expect(blockedReasons(makeItem({ startsAt: at(-1) }))).toEqual([PRECHECK_MESSAGES.startPassed])
    expect(blockedReasons(makeItem({ startsAt: at(0) }))).toEqual([PRECHECK_MESSAGES.startPassed])
  })

  it('가정 5 · G6 경계: 정확히 10분 남아도 막고, 1밀리초라도 더 남으면 예약할 수 있다', () => {
    expect(EXECUTE_LEAD_MS).toBe(10 * MINUTE)
    // 정확히 10분 남은 경우에도 맞는 문장이다(「10분도 남지 않았어요」는 10분 정각에 틀린다).
    expect(PRECHECK_MESSAGES.startTooSoon).toBe('공개 시각까지 10분보다 많이 남아야 해요')
    expect(blockedReasons(makeItem({ startsAt: at(EXECUTE_LEAD_MS - 1) }))).toEqual([PRECHECK_MESSAGES.startTooSoon])
    expect(blockedReasons(makeItem({ startsAt: at(EXECUTE_LEAD_MS) }))).toEqual([PRECHECK_MESSAGES.startTooSoon])
    expect(run([makeItem({ key: 'ok', startsAt: at(EXECUTE_LEAD_MS + 1) })]).ready).toEqual(['ok'])
  })
})

describe('그룹 전파', () => {
  it('못 하는 항목이 하나 있으면 같은 그룹의 승인 항목도 모두 막힌다. 다른 그룹은 그대로다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', startsAt: at(5 * MINUTE) }),
      makeItem({ key: 'other', kind: 'mission' }),
    ])
    expect(result.blocked).toEqual([
      { id: 'card', reasons: [PRECHECK_MESSAGES.groupBlocked] },
      { id: 'mission', reasons: [PRECHECK_MESSAGES.startTooSoon] },
    ])
    expect(result.ready).toEqual(['other'])
  })

  it('가정 3: item_key가 겹치거나 없는 키·자기 자신을 가리키면 그 그룹 전체가 「연결을 읽을 수 없어요」로 막힌다', () => {
    const dup = run([
      makeItem({ id: 'x1', key: 'x', kind: 'home_feed_card' }),
      makeItem({ id: 'x2', key: 'x', kind: 'mission' }),
      makeItem({ key: 'pointer', kind: 'jam_badge', links: ['x'] }),
    ])
    expect(dup.blocked.map((entry) => [entry.id, entry.reasons])).toEqual([
      ['x1', [PRECHECK_MESSAGES.linkUnreadable]],
      ['x2', [PRECHECK_MESSAGES.linkUnreadable]],
      ['pointer', [PRECHECK_MESSAGES.linkUnreadable]],
    ])

    const missing = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission', 'nowhere'] }),
      makeItem({ key: 'mission', kind: 'mission' }),
    ])
    expect(missing.ready).toEqual([])
    expect(missing.blocked.map((entry) => [entry.id, entry.reasons])).toEqual([
      ['card', [PRECHECK_MESSAGES.linkUnreadable]],
      ['mission', [PRECHECK_MESSAGES.linkUnreadable]],
    ])
  })

  it('연결 칸 충돌 셋: 단일 칸에 대상 둘 이상 · resource의 같은 칸과 함께 · 드랍이 아이템 직접 선택인데 컬렉션을 가리킴', () => {
    const multiple = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['m1', 'm2'] }),
      makeItem({ key: 'm1', kind: 'mission' }),
      makeItem({ key: 'm2', kind: 'mission' }),
    ])
    expect(multiple.blocked[0]).toMatchObject({ id: 'card', reasons: ['연결된 미션이 둘 이상이라 홈피드 카드 하나에 담을 수 없어요'] })
    expect(multiple.blocked.slice(1).map((entry) => entry.reasons)).toEqual([[PRECHECK_MESSAGES.groupBlocked], [PRECHECK_MESSAGES.groupBlocked]])

    const own = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'], resource: { mission_id: 'existing' } }),
      makeItem({ key: 'mission', kind: 'mission' }),
    ])
    expect(own.blocked[0].reasons).toEqual(['이미 값이 들어 있는 칸이라 연결된 미션 항목으로 채울 수 없어요'])
    expect(own.blocked[1].reasons).toEqual([PRECHECK_MESSAGES.groupBlocked])

    const direct = run([
      makeItem({ key: 'drop', kind: 'drop_schedule', links: ['collection'], resource: { badge_ids: ['b-0'] } }),
      makeItem({ key: 'collection', kind: 'collection_launch' }),
    ])
    expect(direct.blocked[0].reasons).toEqual(['아이템을 직접 고른 드랍은 컬렉션과 연결할 수 없어요'])
  })
})

describe('기다리는 중 · G4', () => {
  const group = (undecided: string) => [
    makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
    makeItem({ key: 'mission', kind: 'mission', status: undecided, links: ['badge'] }),
    makeItem({ key: 'badge', kind: 'jam_badge' }),
  ]

  it('그룹 안에 결정 전(도착·검토중) 항목이 있으면 같은 그룹의 승인 항목은 모두 기다린다', () => {
    for (const status of ['arrived', 'reviewing']) {
      const result = run(group(status))
      expect(result.waiting).toEqual(['card', 'badge'])
      expect(result.ready).toEqual([])
    }
  })

  it('결정 전 항목이 다른 그룹에 있으면 영향이 없다', () => {
    const result = run([makeItem({ key: 'solo', kind: 'mission' }), makeItem({ key: 'other', kind: 'mission', status: 'reviewing' })])
    expect(result.ready).toEqual(['solo'])
  })

  it('못 하는 이유가 있으면 기다리는 중보다 못 하는 항목으로 나눈다', () => {
    const items = group('reviewing')
    items[2] = makeItem({ key: 'badge', kind: 'jam_badge', startsAt: null })
    const result = run(items)
    expect(result.waiting).toEqual([])
    expect(result.blocked.map((entry) => entry.id)).toEqual(['card', 'badge'])
  })
})

describe('실패로 닫을 항목 · 가정 4', () => {
  it('반려·취소·실패한 연결 대상을 가리키는 승인 항목은 실패로 닫는다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', status: 'rejected' }),
    ])
    expect(result.failClose).toEqual([{ id: 'card', reason: '연결된 미션이 반려됐어요' }])
    expect(result.ready).toEqual([])
  })

  it('다른 항목을 거쳐 가리키는 항목도 실패로 닫는다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', links: ['badge'] }),
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'cancelled' }),
    ])
    expect(result.failClose).toEqual([
      { id: 'card', reason: '연결된 항목을 거쳐 이어진 JAM! 배지가 취소됐어요' },
      { id: 'mission', reason: '연결된 JAM! 배지가 취소됐어요' },
    ])
  })

  it('멈춘 항목이 가리키기만 하는 항목은 실패가 아니라 그대로 예약한다(반려된 카드가 여는 미션)', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', status: 'rejected', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission' }),
    ])
    expect(result.ready).toEqual(['mission'])
    expect(result.failClose).toEqual([])
  })

  it('실패로 닫는 항목이 있어도 같은 그룹의 나머지 항목은 예약할 수 있다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission', 'badge'] }),
      makeItem({ key: 'mission', kind: 'mission', status: 'failed' }),
      makeItem({ key: 'badge', kind: 'jam_badge' }),
    ])
    expect(result.failClose.map((entry) => entry.id)).toEqual(['card'])
    expect(result.ready).toEqual(['badge'])
  })

  it('가정 6: 한 항목이 여러 분류에 걸리면 실패로 닫을 항목 > 못 하는 항목 > 기다리는 중이다', () => {
    // 실패로 닫을 항목 + 못 하는 이유(공개 시각 지남): 못 하는 항목이 아니라 실패로 닫는다.
    const withBlock = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'], startsAt: at(-MINUTE) }),
      makeItem({ key: 'mission', kind: 'mission', status: 'rejected' }),
    ])
    expect(withBlock.failClose).toEqual([{ id: 'card', reason: '연결된 미션이 반려됐어요' }])
    expect(withBlock.blocked).toEqual([])

    // 실패로 닫을 항목 + 그룹에 결정 전 항목: 기다리는 중이 아니라 실패로 닫는다.
    const withUndecided = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission', 'badge'] }),
      makeItem({ key: 'mission', kind: 'mission', status: 'rejected' }),
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'reviewing' }),
    ])
    expect(withUndecided.failClose.map((entry) => entry.id)).toEqual(['card'])
    expect(withUndecided.waiting).toEqual([])

    // 못 하는 항목 + 결정 전 항목: 못 하는 항목이다(기존 순서 그대로).
    const blockedFirst = run([
      makeItem({ key: 'a', kind: 'mission', links: ['b'], startsAt: null }),
      makeItem({ key: 'b', kind: 'jam_badge', status: 'reviewing' }),
    ])
    expect(blockedFirst.blocked.map((entry) => entry.id)).toEqual(['a'])
    expect(blockedFirst.waiting).toEqual([])
  })

  it('실패로 닫을 항목이 혼자 갖는 못 하는 이유는 같은 그룹의 다른 항목을 막지 않는다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission', 'badge'], startsAt: at(-MINUTE) }),
      makeItem({ key: 'mission', kind: 'mission', status: 'failed' }),
      makeItem({ key: 'badge', kind: 'jam_badge' }),
    ])
    expect(result.failClose.map((entry) => entry.id)).toEqual(['card'])
    expect(result.blocked).toEqual([])
    expect(result.ready).toEqual(['badge'])
  })
})

describe('경고 · 가정 6', () => {
  it('그룹 안 공개 시각이 서로 달라도 막지 않고 경고만 한다(카드가 미션보다 먼저가 아닌 경우)', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'], startsAt: at(120 * MINUTE) }),
      makeItem({ key: 'mission', kind: 'mission', startsAt: at(60 * MINUTE) }),
    ])
    expect(result.ready).toEqual(['card', 'mission'])
    expect(result.warnings).toEqual([{ itemIds: ['card', 'mission'], message: PRECHECK_MESSAGES.startsDiffer }])
  })

  it('공개 시각이 같거나 그룹이 다르면 경고가 없다', () => {
    expect(run([makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }), makeItem({ key: 'mission' })]).warnings).toEqual([])
    expect(run([makeItem({ key: 'a', startsAt: at(60 * MINUTE) }), makeItem({ key: 'b', startsAt: at(120 * MINUTE) })]).warnings).toEqual([])
  })

  it('이미 게재 중·종료된 항목은 공개 시각 비교에서 뺀다. 결정 전·승인됨·예약된 항목은 비교한다', () => {
    const group = (status: string, createdResource: Record<string, unknown>) => [
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'], startsAt: at(60 * MINUTE) }),
      makeItem({ key: 'mission', kind: 'mission', status, startsAt: at(120 * MINUTE), createdResource: createdResource as never }),
    ]
    for (const status of ['live', 'ended']) {
      expect(run(group(status, { mission_id: 'mission-uuid' })).warnings, status).toEqual([])
    }
    expect(run(group('scheduled', { mission_id: 'mission-uuid' })).warnings).toEqual([{ itemIds: ['card', 'mission'], message: PRECHECK_MESSAGES.startsDiffer }])
    const undecided = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'], startsAt: at(60 * MINUTE) }),
      makeItem({ key: 'mission', kind: 'mission', status: 'reviewing', startsAt: at(120 * MINUTE) }),
    ])
    expect(undecided.warnings).toEqual([{ itemIds: ['card', 'mission'], message: PRECHECK_MESSAGES.startsDiffer }])
  })

  it('같은 그룹에 이미 예약된 항목은 실행 대상이 아니고 연결 대상으로만 쓴다(만든 ID는 created_resource에서 읽는다)', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', status: 'scheduled', createdResource: { mission_id: 'mission-uuid' } }),
    ])
    expect(result.ready).toEqual(['card'])
    expect(result.groups[0].executeIds).toEqual(['card'])
    expect(result.groups[0].linkPlan.card).toEqual([{ field: 'mission_id', mode: 'single', targetItemIds: ['mission'] }])
  })

  it('이미 처리된 대상에서 만든 ID를 읽을 수 없으면 칸을 채울 수 없어 막는다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', status: 'live', createdResource: { sample: true } }),
    ])
    expect(result.ready).toEqual([])
    expect(result.blocked).toEqual([{ id: 'card', reasons: [PRECHECK_MESSAGES.targetResourceMissing] }])
  })
})

describe('카드가 여는 미션보다 먼저 공개되면 막는다 (티켓 20261002_1944, 사용자 결정 2026-10-02)', () => {
  const card = (startsAt: string, extra: Partial<Parameters<typeof makeItem>[0]> = {}) =>
    makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'], startsAt, ...extra })
  const mission = (startsAt: string, extra: Partial<Parameters<typeof makeItem>[0]> = {}) => makeItem({ key: 'mission', kind: 'mission', startsAt, ...extra })

  it('카드가 미션보다 이르면 카드는 못 하는 항목이고, 같은 그룹의 나머지 승인 항목은 「연결된 항목을 예약할 수 없어요」로 막힌다', () => {
    const result = run([card(at(60 * MINUTE)), mission(at(120 * MINUTE))])
    expect(result.ready).toEqual([])
    expect(result.blocked).toEqual([
      { id: 'card', reasons: [PRECHECK_MESSAGES.cardBeforeMission] },
      { id: 'mission', reasons: [PRECHECK_MESSAGES.groupBlocked] },
    ])
    expect(PRECHECK_MESSAGES.cardBeforeMission).toBe('카드가 여는 미션보다 먼저 공개돼요')
  })

  it('같은 시각이거나 카드가 더 늦으면 통과다(1밀리초 이르면 막는다)', () => {
    expect(run([card(at(60 * MINUTE)), mission(at(60 * MINUTE))]).ready).toEqual(['card', 'mission'])
    expect(run([card(at(120 * MINUTE)), mission(at(60 * MINUTE))]).ready).toEqual(['card', 'mission'])
    const justBefore = run([card(at(60 * MINUTE - 1)), mission(at(60 * MINUTE))])
    expect(justBefore.blocked[0]).toEqual({ id: 'card', reasons: [PRECHECK_MESSAGES.cardBeforeMission] })
  })

  it('대상 미션이 이미 예약된 항목이면 그 항목의 공개 시각과 견준다', () => {
    const scheduled = (startsAt: string) => mission(startsAt, { status: 'scheduled', createdResource: { mission_id: 'mission-uuid' } })
    const early = run([card(at(60 * MINUTE)), scheduled(at(120 * MINUTE))])
    expect(early.ready).toEqual([])
    expect(early.blocked).toEqual([{ id: 'card', reasons: [PRECHECK_MESSAGES.cardBeforeMission] }])
    expect(run([card(at(180 * MINUTE)), scheduled(at(120 * MINUTE))]).ready).toEqual(['card'])
  })

  it('대상 미션이 이미 게재 중이거나 종료됐으면 견주지 않는다', () => {
    for (const status of ['live', 'ended']) {
      const result = run([card(at(60 * MINUTE)), mission(at(120 * MINUTE), { status, createdResource: { mission_id: 'mission-uuid' } })])
      expect(result.ready, status).toEqual(['card'])
      expect(result.blocked, status).toEqual([])
    }
  })

  it('대상 미션이 결정 전이어도 견준다. 막는 이유가 기다리는 중보다 앞선다', () => {
    const result = run([card(at(60 * MINUTE)), mission(at(120 * MINUTE), { status: 'reviewing' })])
    expect(result.waiting).toEqual([])
    expect(result.blocked).toEqual([{ id: 'card', reasons: [PRECHECK_MESSAGES.cardBeforeMission] }])
  })

  it('카드나 미션의 공개 시각을 읽을 수 없으면 견주지 않는다(그 항목이 따로 이유를 갖는다)', () => {
    const noCardStart = run([card(at(0), { startsAt: null }), mission(at(120 * MINUTE))])
    expect(noCardStart.blocked[0]).toEqual({ id: 'card', reasons: [PRECHECK_MESSAGES.startMissing] })
    const noMissionStart = run([card(at(60 * MINUTE)), mission(at(0), { startsAt: null })])
    expect(noMissionStart.blocked).toEqual([
      { id: 'card', reasons: [PRECHECK_MESSAGES.groupBlocked] },
      { id: 'mission', reasons: [PRECHECK_MESSAGES.startMissing] },
    ])
  })

  it('카드가 미션 ID를 직접 갖고 있어 연결로 채우지 않으면 견주지 않는다', () => {
    const result = run([card(at(60 * MINUTE), { resource: { mission_id: 'direct-mission-uuid' } }), mission(at(120 * MINUTE))])
    expect(result.blocked[0]).toEqual({ id: 'card', reasons: ['이미 값이 들어 있는 칸이라 연결된 미션 항목으로 채울 수 없어요'] })
  })

  it('미션과 이어지지 않은 카드·배지를 가리키는 카드는 이 규칙의 대상이 아니다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['badge'], startsAt: at(60 * MINUTE) }),
      makeItem({ key: 'badge', kind: 'jam_badge', startsAt: at(120 * MINUTE) }),
    ])
    expect(result.ready).toEqual(['card', 'badge'])
  })
})

describe('같은 기획 안에서 기간이 겹치는 같은 제목의 미션은 뒤 항목을 막는다 (티켓 20261002_1944, 사용자 결정 2026-10-02)', () => {
  const REASON = PRECHECK_MESSAGES.missionTitleOverlap
  /** 검사를 통과하는 미션 항목. 제목·기간·제출 순서를 고른다. */
  const mission = (key: string, title: string, over: Partial<Parameters<typeof makeItem>[0]> = {}) =>
    makeItem({
      key,
      kind: 'mission',
      original: { copy: { title, description: '설명' } },
      resource: { mission_type: 'distance', condition_json: { distance_km: 30 } },
      ...over,
    })

  it('같은 제목이고 기간이 겹치면 제출 순서가 뒤(position이 큰 쪽)인 미션이 못 하는 항목이다', () => {
    const result = run([mission('a', '주말 러닝', { position: 1 }), mission('b', '주말 러닝', { position: 2 })])
    expect(result.ready).toEqual(['a'])
    expect(result.blocked).toEqual([{ id: 'b', reasons: [REASON] }])
    expect(REASON).toBe('같은 기획 안에 기간이 겹치는 같은 제목의 미션이 있어요')
  })

  it('입력 배열 순서가 아니라 position으로 뒤 항목을 정한다', () => {
    const result = run([mission('late', '주말 러닝', { position: 9 }), mission('early', '주말 러닝', { position: 2 })])
    expect(result.ready).toEqual(['early'])
    expect(result.blocked).toEqual([{ id: 'late', reasons: [REASON] }])
  })

  it('제목이 다르면(글자 그대로 견준다) 통과한다', () => {
    expect(run([mission('a', '주말 러닝'), mission('b', '주말 러닝 ')]).ready).toEqual(['a', 'b'])
    expect(run([mission('a', '주말 러닝'), mission('b', '평일 러닝')]).ready).toEqual(['a', 'b'])
  })

  it('기간이 겹치지 않으면 통과한다: 한쪽의 종료와 다른 쪽의 공개가 같은 경계는 겹치지 않고, 1밀리초 겹치면 막는다', () => {
    const first = { startsAt: at(60 * MINUTE), endsAt: at(120 * MINUTE) }
    const touching = run([mission('a', '주말 러닝', first), mission('b', '주말 러닝', { startsAt: at(120 * MINUTE) })])
    expect(touching.ready).toEqual(['a', 'b'])
    const overlapping = run([mission('a', '주말 러닝', first), mission('b', '주말 러닝', { startsAt: at(120 * MINUTE - 1) })])
    expect(overlapping.blocked).toEqual([{ id: 'b', reasons: [REASON] }])
  })

  it('종료가 없으면 끝없음이라 뒤에 열리는 같은 제목과 겹친다', () => {
    const result = run([mission('a', '주말 러닝', { startsAt: at(60 * MINUTE) }), mission('b', '주말 러닝', { startsAt: at(600 * MINUTE) })])
    expect(result.blocked).toEqual([{ id: 'b', reasons: [REASON] }])
  })

  it('세 개가 같은 제목·겹치는 기간이면 첫 항목만 남고 나머지는 막힌다', () => {
    const result = run([mission('a', 'm'), mission('b', 'm'), mission('c', 'm')])
    expect(result.ready).toEqual(['a'])
    expect(result.blocked.map((entry) => entry.id)).toEqual(['b', 'c'])
  })

  it('막힌 미션과 이어진 그룹의 나머지 승인 항목은 「연결된 항목을 예약할 수 없어요」로 막힌다', () => {
    const result = run([
      mission('a', '주말 러닝', { position: 1 }),
      mission('b', '주말 러닝', { position: 2, links: ['card'] }),
      makeItem({ key: 'card', kind: 'home_feed_card', position: 3, links: ['b'] }),
    ])
    expect(result.ready).toEqual(['a'])
    expect(result.blocked).toEqual([
      { id: 'b', reasons: [REASON] },
      { id: 'card', reasons: [PRECHECK_MESSAGES.groupBlocked] },
    ])
  })

  it('이번에 예약할 미션끼리만 견준다: 이미 예약된 미션은 실행 때 DB 검사가 본다', () => {
    const scheduled = mission('old', '주말 러닝', { status: 'scheduled', createdResource: { mission_id: 'mission-uuid' } })
    expect(run([scheduled, mission('new', '주말 러닝')]).ready).toEqual(['new'])
  })

  it('형식 오류로 변환되지 않는 미션과 실패로 닫을 미션은 견주지 않는다', () => {
    const noDescription = mission('bad', '주말 러닝', { position: 1, original: { copy: { title: '주말 러닝' } } })
    expect(run([noDescription, mission('b', '주말 러닝', { position: 2 })]).ready).toEqual(['bad', 'b'])

    const closing = run([
      mission('a', '주말 러닝', { position: 1, links: ['badge'] }),
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'rejected', position: 2 }),
      mission('b', '주말 러닝', { position: 3 }),
    ])
    expect(closing.failClose.map((entry) => entry.id)).toEqual(['a'])
    expect(closing.ready).toEqual(['b'])
  })

  it('다른 이유로 막힌 항목에는 이유가 이어 붙는다', () => {
    const result = run([mission('a', 'm', { position: 1 }), mission('b', 'm', { position: 2, startsAt: at(MINUTE) })])
    expect(result.blocked).toEqual([{ id: 'b', reasons: [PRECHECK_MESSAGES.startTooSoon, REASON] }])
  })
})

describe('그룹 결과 · 생성 순서와 linkedIds 계획', () => {
  it('그룹마다 생성 순서와 만들 항목, 채울 칸 계획을 싣는다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission', 'badge'] }),
      makeItem({ key: 'mission', kind: 'mission', links: ['badge'] }),
      makeItem({ key: 'badge', kind: 'jam_badge' }),
      makeItem({ key: 'solo', kind: 'recipe' }),
    ])
    expect(result.ready).toEqual(['card', 'mission', 'badge', 'solo'])
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].itemIds).toEqual(['badge', 'mission', 'card'])
    expect(result.groups[0].executeIds).toEqual(['badge', 'mission', 'card'])
    expect(result.groups[0].linkPlan).toEqual({
      card: [
        { field: 'mission_id', mode: 'single', targetItemIds: ['mission'] },
        { field: 'badge_ids', mode: 'append', targetItemIds: ['badge'] },
      ],
      mission: [{ field: 'reward_badge_ids', mode: 'append', targetItemIds: ['badge'] }],
    })
    expect(result.groups[1]).toEqual({ itemIds: ['solo'], executeIds: ['solo'], linkPlan: {} })
  })

  it('막히거나 기다리는 그룹은 만들 항목이 없다', () => {
    const result = run([makeItem({ key: 'a', kind: 'mission', links: ['b'] }), makeItem({ key: 'b', kind: 'mission', status: 'reviewing' })])
    expect(result.groups).toEqual([{ itemIds: ['a', 'b'], executeIds: [], linkPlan: {} }])
  })
})

describe('모듈 계약 — DB와 서버 전용 코드를 값으로 가져오지 않는다', () => {
  const dir = path.join(__dirname, '..')
  // 실행 `run.ts`(티켓 20261002_1123)·공개 전 취소 `cancel.ts`(티켓 20261002_1256)·상태 맞추기 `reconcile.ts`(티켓 20261002_1813)는 서버 전용이라 이 계약에서 뺀다. 순수 모듈 여덟만 본다.
  const SERVER_ONLY = ['run.ts', 'cancel.ts', 'reconcile.ts']
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.ts') && !SERVER_ONLY.includes(name))

  it('순수 모듈 여덟 개가 있다', () => {
    expect(files.sort()).toEqual(['dropSchedule.ts', 'groups.ts', 'handlers.ts', 'homeFeedCard.ts', 'mission.ts', 'precheck.ts', 'recipe.ts', 'registry.ts'])
  })

  it.each(files)('%s는 node: 모듈과 Supabase·서버 모듈의 값 import가 없다', (name) => {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    const valueImports = [...source.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1])
    for (const specifier of valueImports) {
      expect(specifier.startsWith('node:'), `${name}: ${specifier}`).toBe(false)
      expect(specifier.startsWith('@supabase/'), `${name}: ${specifier}`).toBe(false)
      expect(specifier.startsWith('@/lib/supabase/'), `${name}: ${specifier}`).toBe(false)
    }
  })
})
