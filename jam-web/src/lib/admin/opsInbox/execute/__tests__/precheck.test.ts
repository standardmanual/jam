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
  it('지금 레지스트리는 home_feed_card 하나뿐이다(티켓 20261002_1255)', () => {
    expect(Object.keys(EXECUTE_HANDLERS)).toEqual(['home_feed_card'])
    expect(EXECUTE_HANDLERS.home_feed_card).toMatchObject({ kind: 'home_feed_card', resourceKey: RESOURCE_KEY_BY_KIND.home_feed_card, idFirst: true })
  })

  it('카드는 예약할 수 있고 미션은 여전히 「아직 연결하지 않은 종류」로 막힌다', () => {
    const result = precheckBundle([makeItem({ key: 'card', kind: 'home_feed_card' }), makeItem({ key: 'mission', kind: 'mission' })], { now: NOW })
    expect(result.ready).toEqual(['card'])
    expect(result.blocked).toEqual([{ id: 'mission', reasons: [PRECHECK_MESSAGES.noHandler] }])
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
  it('그룹 안 공개 시각이 서로 달라도 막지 않고 경고만 한다', () => {
    const result = run([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'], startsAt: at(60 * MINUTE) }),
      makeItem({ key: 'mission', kind: 'mission', startsAt: at(120 * MINUTE) }),
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
  // 실행 `run.ts`(티켓 20261002_1123)와 공개 전 취소 `cancel.ts`(티켓 20261002_1256)는 서버 전용이라 이 계약에서 뺀다. 순수 모듈 다섯만 본다.
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.ts') && name !== 'run.ts' && name !== 'cancel.ts')

  it('순수 모듈 다섯 개가 있다', () => {
    expect(files.sort()).toEqual(['groups.ts', 'handlers.ts', 'homeFeedCard.ts', 'precheck.ts', 'registry.ts'])
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
