/**
 * 서비스 활동 잼 연결 종합 시험 (티켓 20261028_1735 3회 — 최종 형태. 이전: 챕터 점수 연결 종합 시험, 티켓 20261019_1315 3회, 운영 로직 12.2절)
 *
 * 서비스 활동 7종(잠긴 아이템 배지 열기·배지 받기·믹스 성공·미션 완료·컬렉션 완성·드랍·픽업)은 모두 `awardServiceJam`(`lib/jam/serviceActivity.ts`)으로
 * `jam_apply_service_activity`를 부른다. 옛 점수 장부(`awardChapterScore` → `chapter_add_score`)는 쓰기를 멈췄고 코드(`score.ts`)도 걷었다(티켓 20261028_1742 2회, DB 함수·표 삭제는 3회).
 * 이 시험은 호출 지점들이 서로 다른 키를 쓰고, 같은 일에 한 번씩만 부르는가(키 충돌과 이중 호출 없음)를 한곳에서 고정한다.
 *
 * 구성
 *  1) 호출 지점 목록(소스 검색)
 *     - `chapter_add_score`를 부르는 파일과 `awardChapterScore`를 부르는 곳은 없다(옛 캡슐 열기의 비집계 경로는 티켓 20261028_1742 1회, 점수 모듈은 2회에서 걷었다).
 *       `openCapsule`을 부르는 곳은 동기화 자동 채움 하나이고 RPC는 `capsule_open_counted`뿐이다.
 *     - `awardServiceJam`을 부르는 파일·횟수와 서비스 활동 종류 리터럴이 목록과 같다. 서비스 활동 종류 7종이 모두 어딘가에서 불린다. 배지 받기는 공용 함수 한 곳
 *       (`badgeReceive.ts`)과 그 공용 함수를 부르는 발급 지점 6곳 구조를 유지한다.
 *     - **드랍·픽업은 호출이 남아 있되 규칙값이 0이라 잼이 없다**: 마이그레이션 300 시드가 `drop`·`pickup`을 0으로 두고, DB 함수는 `rule_zero`로 돌려줘 지급도 캡슐 채움도 없다.
 *       밸런스 설정에서 값을 올리면 켜지고 하루·주간 상한이 막는다(반복 파밍 시험은 303 드라이런과 `serviceActivity.test.ts`의 몫이다). 호출을 남긴 것은 값만 올리면 켜지게 하려는 것이다.
 *     목록이 어긋나면 이 시험이 깨진다 — 호출 지점을 더하거나 옮긴 사람이 키 충돌·이중 호출을 한 번 더 살피게 하려는 장치다.
 *  2) DB 모사 — `jam_apply_service_activity`(303)의 규칙(유저별 이벤트 키 유일, 재전송은 기존 양, 규칙값 0은 지급 없음)을 최소한으로 옮긴 가짜 DB 위에서
 *     **실제 연결 함수**를 돌린다. 규칙값은 마이그레이션 300 시드를 읽는다. 하루·주간 상한과 이용 정지 중 지급 없음은 DB 쪽 시험(303 드라이런)과 `serviceActivity.test.ts`의 몫이다.
 *     - 서비스 활동 7종을 같은 일로 두 번 보내도 한 번만 지급된다 / 서로 다른 일은 키가 겹치지 않는다
 *     - 제외 규칙 종합(발급 지점들이 쓰는 자연 발급 트리거는 주고, 제외 대상은 DB에 기록이 남지 않는다)
 *     - 모은 잼은 정산이 점수·서비스 활동 잼을 부르지 않는다
 *     - 지급 RPC가 실패해도(오류·예외·계약 밖 응답) 본 동작의 결과는 같고, 같은 원천 id로 다시 보내면 한 번만 지급된다
 *     - 옛 점수 장부 쓰기는 어떤 경로에서도 일어나지 않는다(`chapter_add_score` 호출 0회)
 *
 * 지점별 세부(호출 인자·순서·응답 불변)는 각 지점의 시험이 고정한다. 지급 즉시 채움은 `lib/jam/__tests__/serviceActivity.test.ts`와 `lib/inventory/__tests__/lockedItemFill.test.ts`가 고정한다.
 * 공용 DB와 실제 RPC는 부르지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/score-wiring.test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())

// 지급 실패 기록(logEngineDecision)이 실제 service 클라이언트를 만들지 않게 막는다
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
// 지급 뒤 즉시 채움은 `lib/jam/__tests__/serviceActivity.test.ts`가 고정한다
vi.mock('@/lib/capsule/sync-auto-fill', () => ({
  runSyncCapsuleAutoFill: async () => ({ autoFill: {}, opened: false, chapterRose: false, unseenRecorded: true }),
}))

import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import { SERVICE_JAM_KINDS, awardServiceJam } from '@/lib/jam/serviceActivity'
import { settleActivities, type JamSettleTarget } from '@/lib/jam/settlement'
import {
  BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS,
  awardBadgeReceiveOccurrenceScores,
  awardBadgeReceiveScore,
  type BadgeReceiveBadge,
} from '../badgeReceive'
import { awardCollectionCompleteScore, awardSlotCollectionScore } from '../collection'
import { awardMixSuccessScore } from '../mix'

// ---------------------------------------------------------------------------------------------
// 1) 호출 지점 목록 (소스 검색)

const SRC = path.resolve(__dirname, '../../..')
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|generated)\./.test(name)) {
      out.push(full)
    }
  }
  return out
}

/** 주석을 지운다 — 설명 글 속의 함수 이름이 호출로 세어지지 않게 한다 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const SOURCES = new Map(walk(SRC).map((file) => [rel(file), stripComments(readFileSync(file, 'utf8'))]))

/** 함수 호출(정의 제외)이 있는 파일 → 횟수 */
function callSites(name: string): Record<string, number> {
  const re = new RegExp(`(?<!function\\s)\\b${name}\\(`, 'g')
  const found: Record<string, number> = {}
  for (const [file, source] of SOURCES) {
    const count = (source.match(re) ?? []).length
    if (count > 0) found[file] = count
  }
  return found
}

/** `awardServiceJam(…, { kind: '…' })`의 리터럴 서비스 활동 종류 */
function literalServiceKindOf(file: string): string | null {
  const match = SOURCES.get(file)?.match(/awardServiceJam\([\s\S]{0,300}?kind:\s*'([a-z_]+)'/)
  return match ? match[1] : null
}

/**
 * 서비스 활동 잼(`awardServiceJam`) 호출 지점 → 서비스 활동 종류. 파일마다 한 번이다.
 * 컬렉션 완성은 등급에 따라 점수 종류가 갈렸지만 서비스 활동 종류는 `collection_complete` 하나이고, 등급 올리기(`tierUp.ts`)는 «믹스 성공»(`combine_success`)을 새 UUID 원천 id로 따로 지급한다.
 * 배지 받기는 `badgeReceive.ts`의 공용 함수 한 곳에서만 부른다(발급 지점 6곳은 그 공용 함수를 부른다 — 아래 «발급 지점» 시험).
 */
const SERVICE_JAM_SITES: Record<string, string> = {
  'app/api/drops/route.ts': 'drop',
  'app/api/drops/[dropId]/pickup/route.ts': 'pickup',
  'lib/chapter/badgeReceive.ts': 'badge_earned',
  'lib/chapter/collection.ts': 'collection_complete',
  'lib/chapter/mix.ts': 'combine_success',
  'lib/combine/tierUp.ts': 'combine_success',
  'lib/inventory/lockedItemFill.ts': 'locked_unlock',
  'lib/missions/checker.ts': 'mission_complete',
}

/** 마이그레이션 300 `service_jam_rules` 시드의 종류별 고정값 — 값을 이 시험이 따로 정하지 않는다 */
function seededServiceAmounts(): Record<string, number> {
  const migration = readFileSync(path.resolve(SRC, '../supabase/migrations/300_capsule_auto_fill_expand.sql'), 'utf8')
  const start = migration.indexOf('INSERT INTO public.service_jam_rules')
  expect(start, '300에서 서비스 활동 규칙 시드를 찾지 못했다').toBeGreaterThanOrEqual(0)
  const block = migration.slice(start, migration.indexOf('ON CONFLICT', start))
  const amounts: Record<string, number> = {}
  for (const m of block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*\)/g)) amounts[m[1]] = Number(m[2])
  return amounts
}

const SEEDED_SERVICE_AMOUNTS = seededServiceAmounts()

describe('호출 지점 목록 — 소스 검색', () => {
  it('chapter_add_score RPC를 부르는 곳은 없다 (옛 점수 장부의 코드를 걷었다)', () => {
    const files = [...SOURCES].filter(([, source]) => /rpc\(\s*['"]chapter_add_score['"]/.test(source)).map(([file]) => file)
    expect(files).toEqual([])
    expect(SOURCES.has('lib/chapter/score.ts')).toBe(false)
  })

  it('awardChapterScore를 부르는 곳은 없고, 서비스 활동 호출 지점은 점수 모듈을 가져오지 않는다', () => {
    expect(callSites('awardChapterScore')).toEqual({})
    for (const file of Object.keys(SERVICE_JAM_SITES)) {
      expect(SOURCES.get(file), file).not.toMatch(/awardChapterScore|@\/lib\/chapter\/score/)
    }
    const importers = [...SOURCES].filter(([, source]) => /@\/lib\/chapter\/score['"]/.test(source)).map(([file]) => file)
    expect(importers).toEqual([])
  })

  it('openCapsule을 부르는 곳은 동기화 자동 채움 하나뿐이고, 열기 RPC는 capsule_open_counted 하나다 — 옛 capsule_open은 어디서도 부르지 않는다', () => {
    expect(callSites('openCapsule')).toEqual({ 'lib/capsule/auto-fill.ts': 1 })
    const oldOpen = [...SOURCES].filter(([, source]) => /rpc\(\s*['"]capsule_open['"]/.test(source)).map(([file]) => file)
    expect(oldOpen).toEqual([])
    expect(SOURCES.get('lib/capsule/open.ts')).toMatch(/rpcName = 'capsule_open_counted'/)
  })

  it('awardServiceJam을 부르는 파일과 횟수가 목록과 같다 — 파일마다 한 번이고, 자기 서비스 활동 종류를 리터럴로 적는다', () => {
    expect(callSites('awardServiceJam')).toEqual(Object.fromEntries(Object.keys(SERVICE_JAM_SITES).map((file) => [file, 1])))
    for (const [file, kind] of Object.entries(SERVICE_JAM_SITES)) {
      expect(literalServiceKindOf(file), file).toBe(kind)
    }
  })

  it('서비스 활동 종류 7종은 모두 어딘가에서 불린다 — 둘 이상인 것은 믹스 성공(믹스 기록과 등급 올리기)뿐이다', () => {
    const used = Object.values(SERVICE_JAM_SITES)
    expect(new Set(used)).toEqual(new Set(SERVICE_JAM_KINDS))
    const counts = new Map<string, number>()
    for (const kind of used) counts.set(kind, (counts.get(kind) ?? 0) + 1)
    expect([...counts].filter(([, n]) => n > 1)).toEqual([['combine_success', 2]])
  })

  it('드랍·픽업은 호출이 남아 있지만 규칙값 시드가 0이라 잼이 없다 (밸런스에서 값을 올리면 켜진다)', () => {
    expect(Object.values(SERVICE_JAM_SITES)).toEqual(expect.arrayContaining(['drop', 'pickup']))
    expect(SEEDED_SERVICE_AMOUNTS.drop).toBe(0)
    expect(SEEDED_SERVICE_AMOUNTS.pickup).toBe(0)
    // 나머지 다섯 종은 0보다 크다
    for (const kind of SERVICE_JAM_KINDS.filter((k) => k !== 'drop' && k !== 'pickup')) expect(SEEDED_SERVICE_AMOUNTS[kind], kind).toBeGreaterThan(0)
  })

  it('멈춘 종류를 쓰는 코드가 없다 — 잼 정산은 점수·서비스 활동 잼을 가져오지 않고 jam_earned를 적은 파일이 없다', () => {
    expect(SOURCES.get('lib/jam/settlement.ts')).not.toMatch(/@\/lib\/chapter|awardChapterScore|chapter_add_score|awardServiceJam/)
    const writers = [...SOURCES].filter(([file, source]) => file !== 'lib/chapter/kinds.ts' && /['"]jam_earned['"]/.test(source)).map(([file]) => file)
    expect(writers).toEqual([])
  })

  it('배지 받기는 발급 지점 6곳이 공용 함수를 한 번씩 부르고, 엔진의 회차 점수는 두 경로(이미 가진 반복형·미보유 반복형의 첫 발급)에서만 부른다', () => {
    expect(callSites('awardBadgeReceiveScore')).toEqual({
      'lib/badge-engine/index.ts': 1,
      'lib/badge-engine/usageBadges.ts': 1,
      'lib/chapter/badgeReceive.ts': 1, // 회차 함수 안의 내부 호출
      'lib/itembook/checker.ts': 1,
      'lib/missions/rewards.ts': 1,
      'lib/onboarding-quest/completion.ts': 1,
      'lib/strava/sync.ts': 1,
    })
    expect(callSites('awardBadgeReceiveOccurrenceScores')).toEqual({ 'lib/badge-engine/index.ts': 2 })
  })

  it('컬렉션 완성은 장착 라우트(awardSlotCollectionScore)와 동기화 보정(awardCollectionCompleteScore) 두 지점뿐이고, 믹스는 성공 기록 한 곳이다', () => {
    expect(callSites('awardSlotCollectionScore')).toEqual({ 'app/api/itembooks/[id]/slot/route.ts': 1 })
    expect(callSites('awardCollectionCompleteScore')).toEqual({
      'lib/chapter/collection.ts': 2, // awardSlotCollectionScore 안의 내부 호출(등급형·옛 컬렉션)
      'lib/itembook/checker.ts': 1,
    })
    expect(callSites('awardMixSuccessScore')).toEqual({ 'lib/combine/index.ts': 1 })
  })

  it('시스템 드랍(앰비언트 배치)은 잼을 주지 않는다 — 드랍·픽업 호출은 유저 드랍 라우트와 줍기 라우트에만 있다', () => {
    const ambient = [...SOURCES].filter(([file]) => file.startsWith('lib/ambient-drop/'))
    expect(ambient.length).toBeGreaterThan(0)
    for (const [file, source] of ambient) expect(source, file).not.toMatch(/@\/lib\/chapter|@\/lib\/jam\/serviceActivity/)
  })
})

// ---------------------------------------------------------------------------------------------
// 2) DB 모사 — 마이그레이션 303 jam_apply_service_activity의 규칙

/** 서비스 활동 잼 지급 한 줄 — 가짜 DB의 `jam_apply_service_activity` 모사 */
interface ServiceEvent {
  userId: string
  kind: string
  eventKey: string
  granted: number
}

type FailureMode = 'none' | 'rpc_error' | 'throws' | 'garbage'

interface World {
  /** 서비스 활동 잼 지급 줄 — (유저, 이벤트 키)가 유일하다 */
  serviceEvents: ServiceEvent[]
  /** 종류별 규칙값 — 마이그레이션 300 시드로 시작하고 시험이 올릴 수 있다(밸런스 설정 모사) */
  amounts: Record<string, number>
  /** 옛 점수 장부(`chapter_add_score`)를 부른 횟수 — 어떤 경로에서도 0이어야 한다 */
  chapterScoreCalls: number
  suspended: Set<string>
  /** strava_id → strava_activities.id */
  activityIds: Record<number, string>
  /** 활동 id → 원장에 기록된 잼 */
  jamLines: Map<string, number>
  /** `${userId}:${itemBookId}` — 완성 기록 */
  completions: Set<string>
  failure: FailureMode
}

function newWorld(): World {
  return {
    serviceEvents: [],
    amounts: { ...SEEDED_SERVICE_AMOUNTS },
    chapterScoreCalls: 0,
    suspended: new Set(),
    activityIds: {},
    jamLines: new Map(),
    completions: new Set(),
    failure: 'none',
  }
}

/** `jam_apply_service_activity`를 최소한으로 옮긴 것 — 같은 (유저, 이벤트 키)는 새로 쓰지 않고 `duplicate`와 기존 양을 돌려주고, 규칙값 0은 `rule_zero`다 */
function jamApplyServiceActivity(world: World, a: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  const userId = a.p_user_id as string
  const kind = a.p_kind as string
  const eventKey = a.p_event_key as string
  if (!(kind in world.amounts) || !eventKey) return { data: { ok: false, error: 'invalid_input' }, error: null }
  const existing = world.serviceEvents.find((e) => e.userId === userId && e.eventKey === eventKey)
  if (existing) return { data: { ok: true, granted: existing.granted, duplicate: true }, error: null }
  const granted = world.amounts[kind]
  if (granted === 0) return { data: { ok: true, granted: 0, reason: 'rule_zero' }, error: null }
  world.serviceEvents.push({ userId, kind, eventKey, granted })
  return { data: { ok: true, granted, ruleAmount: granted, capped: false, duplicate: false }, error: null }
}

function fakeClient(world: World): SupabaseClient {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (column: string, value: unknown) => {
        filters[column] = value
        return chain
      }
      chain.is = () => chain
      chain.in = async (_column: string, values: unknown[]) => {
        if (table !== 'strava_activities') throw new Error(`예상하지 못한 in 조회: ${table}`)
        return {
          data: values.filter((v) => world.activityIds[v as number]).map((v) => ({ id: world.activityIds[v as number], strava_id: v })),
          error: null,
        }
      }
      chain.maybeSingle = async () => {
        if (table === 'user_suspensions') {
          const suspended = world.suspended.has(filters.user_id as string)
          return { data: suspended ? { id: 'suspension-1', reason: '운영 정책 위반', suspended_at: '2026-10-01T00:00:00Z' } : null, error: null }
        }
        if (table === 'user_item_book_completions') {
          const done = world.completions.has(`${filters.user_id as string}:${filters.item_book_id as string}`)
          return { data: done ? { item_book_id: filters.item_book_id } : null, error: null }
        }
        throw new Error(`예상하지 못한 maybeSingle 조회: ${table}`)
      }
      return chain
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'jam_apply') {
        const activityId = args.p_source_activity_id as string
        const known = world.jamLines.get(activityId)
        if (known === undefined) world.jamLines.set(activityId, args.p_amount as number)
        return { data: { amount: known ?? (args.p_amount as number), source_activity_id: activityId }, error: null }
      }
      if (name === 'chapter_add_score') {
        // 옛 점수 장부는 더는 쓰지 않는다 — 불리면 센다(시험이 0회를 확인한다)
        world.chapterScoreCalls += 1
        return { data: null, error: { message: '옛 점수 장부는 더는 쓰지 않는다' } }
      }
      if (name !== 'jam_apply_service_activity') throw new Error(`예상하지 못한 RPC: ${name}`)
      if (world.failure === 'throws') throw new Error('지급 RPC 네트워크 끊김')
      if (world.failure === 'rpc_error') return { data: null, error: { message: '지급 RPC 장애' } }
      if (world.failure === 'garbage') return { data: { unexpected: true }, error: null }
      return jamApplyServiceActivity(world, args)
    },
  } as unknown as SupabaseClient
}

// ---------------------------------------------------------------------------------------------
// 공통 입력

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const USER_A = uuid(1)
const USER_B = uuid(2)
const ITEM_1 = uuid(301)
const MIX_1 = uuid(401)
const COMPLETION_1 = uuid(501)
const DROP_1 = uuid(601)
const BOOK_1 = uuid(701)
const BOOK_2 = uuid(702)
const BOOK_3 = uuid(703)

const NOW = new Date('2026-10-21T03:00:00Z') // 수요일 KST 12:00

function badge(id: string, extra: Partial<BadgeReceiveBadge> = {}): BadgeReceiveBadge {
  return { id, type: 'activity', is_hidden: false, condition_json: { total_count: 3 }, ...extra }
}

/** 걷기(가벼움 ×1)는 움직인 분이 곧 잼이다 */
function walking(stravaId: number, startDate: string, jam: number): JamSettleTarget {
  return { stravaId, startDate, movingTimeSec: jam * 60, jamActivityType: 'walking', sportType: 'Walk', type: 'Walk' }
}

const NATURAL = { triggeredBy: 'strava_sync' }

let world: World
let client: SupabaseClient

beforeEach(() => {
  world = newWorld()
  client = fakeClient(world)
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const serviceRows = (kind: string) => world.serviceEvents.filter((e) => e.kind === kind)
const serviceTotalOf = (userId: string) => world.serviceEvents.filter((e) => e.userId === userId).reduce((sum, e) => sum + e.granted, 0)

describe('DB 모사가 300 시드와 같다', () => {
  it('규칙값 시드 7종을 읽는다 (드랍·픽업만 0)', () => {
    expect(Object.keys(SEEDED_SERVICE_AMOUNTS).sort()).toEqual([...SERVICE_JAM_KINDS].sort())
    expect(SEEDED_SERVICE_AMOUNTS).toEqual({
      locked_unlock: 5,
      badge_earned: 5,
      combine_success: 5,
      mission_complete: 20,
      collection_complete: 30,
      drop: 0,
      pickup: 0,
    })
  })
})

// ---------------------------------------------------------------------------------------------
// 7종 활동 — 같은 일은 한 번, 다른 일은 키가 겹치지 않는다

/** 서비스 활동 7종을 한 번씩 보낸다. 각 지점이 쓰는 키 규칙을 그대로 따른다 */
async function sendEveryActivityOnce() {
  // 잠긴 아이템 배지 열기 — 개체 id
  await awardServiceJam(client, { userId: USER_A, kind: 'locked_unlock', sourceId: ITEM_1 })
  // 배지 받기 — 첫 획득, 레벨형의 다른 레벨(다른 배지), 반복형의 새 회차 둘
  await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(801)), origin: NATURAL })
  await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(802)), origin: NATURAL })
  await awardBadgeReceiveOccurrenceScores(client, { userId: USER_A, badge: badge(uuid(803)), origin: NATURAL, activityIds: [101, 102] })
  // 컬렉션 완성 — 등급 4종, 그리고 옛 컬렉션(장착 후 완성 기록이 생김)
  for (const tier of ['common', 'rare', 'epic', 'mystic']) {
    await awardCollectionCompleteScore(client, { userId: USER_A, itemBookId: BOOK_1, tier })
  }
  world.completions.add(`${USER_A}:${BOOK_2}`)
  await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_2, tierMode: false, completedTier: null, completedBefore: false })
  // 믹스 성공 — 성공 기록 RPC가 돌려준 성공 행 id
  await awardMixSuccessScore(client, USER_A, { id: MIX_1, is_recipe_first: false })
  // 미션 완료 — 완료 기록 id
  await awardServiceJam(client, { userId: USER_A, kind: 'mission_complete', sourceId: COMPLETION_1 })
  // 드랍(놓은 사람)과 픽업(줍는 다른 사람) — 같은 드랍 id, 서비스 활동 종류가 다르다. 규칙값 0이라 호출은 하되 잼은 없다
  await awardServiceJam(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })
  await awardServiceJam(client, { userId: USER_B, kind: 'pickup', sourceId: DROP_1 })
}

/**
 * 한 번씩 보냈을 때의 기대 (규칙값은 300 시드)
 *  - 지급 12줄: 잠긴 열기 1, 배지 받기 4, 컬렉션 완성 5, 믹스 1, 미션 1. 드랍·픽업은 규칙값 0이라 줄이 없다
 *  - 합계 A = 잠긴 열기 5 + 배지 5×4 + 컬렉션 30×5 + 믹스 5 + 미션 20 = 200, B = 0
 */
const EXPECTED_SERVICE_ROWS = 1 + 4 + 5 + 1 + 1
const EXPECTED_SERVICE_KINDS = ['locked_unlock', 'badge_earned', 'collection_complete', 'combine_success', 'mission_complete']
const EXPECTED_SERVICE_TOTAL_A =
  SEEDED_SERVICE_AMOUNTS.locked_unlock +
  SEEDED_SERVICE_AMOUNTS.badge_earned * 4 +
  SEEDED_SERVICE_AMOUNTS.collection_complete * 5 +
  SEEDED_SERVICE_AMOUNTS.combine_success +
  SEEDED_SERVICE_AMOUNTS.mission_complete

describe('7종 활동 — 같은 일을 두 번 보내도 한 번만 지급한다', () => {
  it('한 번씩 보내면 일마다 한 줄이 쌓이고, 드랍·픽업은 규칙값 0이라 줄이 없다', async () => {
    await sendEveryActivityOnce()

    expect(logMock).not.toHaveBeenCalled()
    expect(world.chapterScoreCalls).toBe(0)
    expect(world.serviceEvents).toHaveLength(EXPECTED_SERVICE_ROWS)
    expect(new Set(world.serviceEvents.map((e) => e.kind))).toEqual(new Set(EXPECTED_SERVICE_KINDS))
    expect(serviceTotalOf(USER_A)).toBe(EXPECTED_SERVICE_TOTAL_A)
    expect(EXPECTED_SERVICE_TOTAL_A).toBe(200)
    expect(serviceTotalOf(USER_B)).toBe(0)
    expect(serviceRows('drop')).toHaveLength(0)
    expect(serviceRows('pickup')).toHaveLength(0)
  })

  it('같은 일을 한 번 더 보내면 줄도 합계도 그대로다 (재동기화·재시도·재장착)', async () => {
    await sendEveryActivityOnce()
    const snapshot = JSON.stringify(world.serviceEvents)

    await sendEveryActivityOnce()

    expect(world.serviceEvents).toHaveLength(EXPECTED_SERVICE_ROWS)
    expect(JSON.stringify(world.serviceEvents)).toBe(snapshot)
    expect(serviceTotalOf(USER_A)).toBe(EXPECTED_SERVICE_TOTAL_A)
    expect(world.chapterScoreCalls).toBe(0)
  })

  it('여러 번 동시에 보내도 한 번만 지급한다', async () => {
    await Promise.all([sendEveryActivityOnce(), sendEveryActivityOnce(), sendEveryActivityOnce()])

    expect(world.serviceEvents).toHaveLength(EXPECTED_SERVICE_ROWS)
    expect(serviceTotalOf(USER_A)).toBe(EXPECTED_SERVICE_TOTAL_A)
    expect(world.chapterScoreCalls).toBe(0)
  })
})

describe('키 충돌 없음 — 호출 지점들이 서로 다른 키를 쓴다', () => {
  it('같은 드랍의 드랍과 픽업은 원천 id가 같아도 서비스 활동 종류가 달라 키가 겹치지 않는다 (값을 올렸을 때)', async () => {
    world.amounts.drop = 5
    world.amounts.pickup = 5

    await awardServiceJam(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })
    await awardServiceJam(client, { userId: USER_B, kind: 'pickup', sourceId: DROP_1 })
    // 같은 사람이 같은 드랍을 드랍하고 줍는 경우(자기 픽업은 라우트가 제외하지만) 키는 겹치지 않는다
    await awardServiceJam(client, { userId: USER_A, kind: 'pickup', sourceId: DROP_1 })

    expect(serviceRows('drop')).toHaveLength(1)
    expect(serviceRows('pickup')).toHaveLength(2)
    expect(new Set(world.serviceEvents.filter((e) => e.userId === USER_A).map((e) => e.eventKey))).toEqual(new Set([`drop:${DROP_1}`, `pickup:${DROP_1}`]))
  })

  it('값이 0인 드랍·픽업은 호출해도 지급이 없고 실패도 아니다 (rule_zero)', async () => {
    await expect(awardServiceJam(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })).resolves.toEqual({ ok: true, granted: 0, duplicate: false, capped: false })
    await expect(awardServiceJam(client, { userId: USER_B, kind: 'pickup', sourceId: DROP_1 })).resolves.toEqual({ ok: true, granted: 0, duplicate: false, capped: false })

    expect(world.serviceEvents).toHaveLength(0)
    expect(logMock).not.toHaveBeenCalled()
  })

  it('유저·배지·회차·컬렉션·등급 조합마다 키가 다르다 — 다른 유저의 키와 겹치는 일이 없다', async () => {
    const users = [USER_A, USER_B]
    const badges = [uuid(811), uuid(812), uuid(813)]
    const books = [BOOK_1, BOOK_2, BOOK_3]
    const tiers = ['common', 'rare', 'epic', 'mystic']
    const activities = [101, 102, 103]
    let expected = 0

    for (const userId of users) {
      for (const badgeId of badges) {
        await awardBadgeReceiveScore(client, { userId, badge: badge(badgeId), origin: NATURAL })
        await awardBadgeReceiveOccurrenceScores(client, { userId, badge: badge(badgeId), origin: NATURAL, activityIds: activities })
        expected += 1 + activities.length
      }
      for (const itemBookId of books) {
        for (const tier of tiers) {
          await awardCollectionCompleteScore(client, { userId, itemBookId, tier })
          expected += 1
        }
      }
    }

    expect(logMock).not.toHaveBeenCalled()
    expect(world.chapterScoreCalls).toBe(0)
    expect(world.serviceEvents).toHaveLength(expected)
    expect(new Set(world.serviceEvents.map((e) => `${e.userId}:${e.eventKey}`)).size).toBe(expected)
  })

  it('옛 컬렉션이 지급한 common과 등급형으로 바뀐 뒤의 common은 같은 키다 — 같은 완성을 두 번 지급하지 않는다 (사용자 결정 4)', async () => {
    // 1) 등급형을 켜기 전 — 장착 전엔 완성 기록이 없었고 장착 후에 생겼다
    world.completions.add(`${USER_A}:${BOOK_3}`)
    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: false, completedTier: null, completedBefore: false })
    expect(serviceTotalOf(USER_A)).toBe(30)

    // 2) 같은 컬렉션이 등급형으로 바뀐 뒤 common 등급 완성
    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: true, completedTier: 'common', completedBefore: null })
    // 3) 동기화 보정이 같은 완성을 common으로 다시 보냄
    await awardCollectionCompleteScore(client, { userId: USER_A, itemBookId: BOOK_3, tier: 'common' })

    expect(serviceRows('collection_complete')).toHaveLength(1)
    expect(serviceTotalOf(USER_A)).toBe(30)

    // 새 등급(rare)은 새 완성이라 따로 지급한다 — 등급이 달라도 서비스 활동 종류는 collection_complete 하나다
    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: true, completedTier: 'rare', completedBefore: null })
    expect(serviceRows('collection_complete')).toHaveLength(2)
    expect(serviceTotalOf(USER_A)).toBe(60)
  })

  it('이미 완성한 유저의 옛 컬렉션 재장착은 소급 지급하지 않는다', async () => {
    world.completions.add(`${USER_A}:${BOOK_3}`)

    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: false, completedTier: null, completedBefore: true })

    expect(world.serviceEvents).toHaveLength(0)
  })

  it('반복형의 첫 획득 키와 회차 키는 구분된다 — 첫 획득 하나 + 회차마다 하나', async () => {
    const repeatable = badge(uuid(821))
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: repeatable, origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: repeatable, origin: NATURAL, occurrenceActivityId: 101 })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: repeatable, origin: NATURAL, occurrenceActivityId: 102 })

    expect(serviceRows('badge_earned')).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------------------------
// 제외 규칙 종합

describe('제외 규칙 종합 — DB에 기록이 남는가', () => {
  const MISSION_ID = uuid(901)
  const BOOK_ID = uuid(902)

  /** 발급 지점들이 실제로 쓰는 자연 발급 트리거 이름 */
  const NATURAL_TRIGGERS = ['strava_sync', 'onboarding_quest', `mission_reward:${MISSION_ID}`, `itembook_complete:${BOOK_ID}`]

  it.each(NATURAL_TRIGGERS)('자연 발급 트리거(%s)는 지급한다', async (triggeredBy) => {
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(831)), origin: { triggeredBy } })
    expect(serviceRows('badge_earned')).toHaveLength(1)
  })

  it('체크인 배지는 지급한다 — 두 번째 이후는 호출 지점(isFirstEarn)이 부르지 않고, 혹시 불러도 (유저, 배지) 키라 한 번뿐이다', async () => {
    const checkin: BadgeReceiveBadge = { id: uuid(832), type: 'checkin' }
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: checkin, origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: checkin, origin: NATURAL })
    expect(serviceRows('badge_earned')).toHaveLength(1)
  })

  it('같은 배지를 초기화나 삭제 뒤 다시 받아도 잼은 다시 들어가지 않는다 (사용자 결정 2)', async () => {
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(833)), origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(833)), origin: NATURAL })
    expect(serviceRows('badge_earned')).toHaveLength(1)
    expect(serviceTotalOf(USER_A)).toBe(5)
  })

  const EXCLUDED: [string, BadgeReceiveBadge, { triggeredBy: string; dryRun?: boolean }, boolean][] = [
    ['아이템 배지', badge(uuid(841), { type: 'item' }), NATURAL, false],
    ['숨김 배지', badge(uuid(842), { is_hidden: true }), NATURAL, false],
    ['팔로워 조건 배지', badge(uuid(843), { condition_json: { follower_count: 10 } }), NATURAL, false],
    ['팔로잉 조건 배지', badge(uuid(844), { condition_json: { following_count: 10 } }), NATURAL, false],
    ['챕터 조건 배지', badge(uuid(845), { condition_json: { chapter_reached: 3 } }), NATURAL, false],
    ['카탈로그 재평가 배치', badge(uuid(846)), { triggeredBy: 'catalog_reevaluation' }, false],
    ['카탈로그 재평가 배치(접두 형태)', badge(uuid(847)), { triggeredBy: 'catalog_reevaluation:usage_metric:x' }, false],
    ['어드민 시뮬레이터', badge(uuid(848)), { triggeredBy: 'admin_simulate' }, false],
    ['어드민 테스트', badge(uuid(849)), { triggeredBy: 'admin_test' }, false],
    ['어드민 진단(dryRun)', badge(uuid(850)), { triggeredBy: 'admin_diagnosis', dryRun: true }, false],
    ['잼 조건 배지(포인트가 아니라 제외하지 않는다)', badge(uuid(851), { condition_json: { jam_total_earned: 100 } }), NATURAL, true],
  ]

  it.each(EXCLUDED)('%s', async (_label, target, origin, counted) => {
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: target, origin })
    await awardBadgeReceiveOccurrenceScores(client, { userId: USER_A, badge: target, origin, activityIds: [101] })

    expect(serviceRows('badge_earned').length > 0).toBe(counted)
  })

  it('이용 정지 중인 유저(정지된 드랍 주인이 받는 배지)는 받지 못하고 풀리면 다시 받는다', async () => {
    world.suspended.add(USER_A)
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(861)), origin: NATURAL })
    expect(world.serviceEvents).toHaveLength(0)

    world.suspended.delete(USER_A)
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(861)), origin: NATURAL })
    expect(serviceRows('badge_earned')).toHaveLength(1)
  })

  it('제외 조건 키는 팔로워·팔로잉·챕터 도달 셋이다 (포인트를 가리키는 조건 키는 지금 하나도 없다)', () => {
    expect([...BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS].sort()).toEqual(['chapter_reached', 'follower_count', 'following_count'])
  })
})

// ---------------------------------------------------------------------------------------------
// 모은 잼 — 정산은 점수도 서비스 활동 잼도 부르지 않는다

describe('모은 잼 — 정산은 점수도 서비스 활동 잼도 부르지 않는다 (티켓 20261028_1733 3회)', () => {
  async function settle(targets: JamSettleTarget[]) {
    for (const t of targets) world.activityIds[t.stravaId] = uuid(1000 + t.stravaId)
    return settleActivities(client, USER_A, targets, DEFAULT_JAM_POLICY, NOW)
  }

  it('잼은 원장에 들어가지만 점수·서비스 활동 잼 줄은 생기지 않는다 — 주 300점 상한을 넘는 양이어도 마찬가지다', async () => {
    const result = await settle([walking(1, '2026-10-19T01:00:00Z', 250), walking(2, '2026-10-20T01:00:00Z', 100)])

    expect(result.total).toBe(350)
    expect(world.jamLines.size).toBe(2)
    expect(world.serviceEvents).toHaveLength(0)
    expect(world.chapterScoreCalls).toBe(0)
    expect(logMock).not.toHaveBeenCalled()
  })

  it('같은 활동을 다시 정산해도 점수·서비스 활동 잼 줄은 없다 (재동기화)', async () => {
    const targets = [walking(1, '2026-10-19T01:00:00Z', 250), walking(2, '2026-10-20T01:00:00Z', 100)]
    await settle(targets)
    await settle(targets)

    expect(world.jamLines.size).toBe(2)
    expect(world.serviceEvents).toHaveLength(0)
    expect(world.chapterScoreCalls).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------
// 지급 실패는 본 동작을 막지 않는다

describe('지급 실패 — 본 동작의 결과는 그대로이고 같은 원천 id로 다시 보내면 한 번만 지급한다', () => {
  const FAILURES: FailureMode[] = ['rpc_error', 'throws', 'garbage']

  it.each(FAILURES)('지급 RPC가 %s여도 잼 정산 결과(항목·합계)는 정상일 때와 같고 지급 RPC는 아예 부르지 않는다', async (mode) => {
    const targets = [walking(1, '2026-10-19T01:00:00Z', 250), walking(2, '2026-10-20T01:00:00Z', 100)]

    const healthyWorld = newWorld()
    healthyWorld.activityIds = { 1: uuid(1101), 2: uuid(1102) }
    const healthy = await settleActivities(fakeClient(healthyWorld), USER_A, targets, DEFAULT_JAM_POLICY, NOW)

    world.activityIds = { 1: uuid(1101), 2: uuid(1102) }
    world.failure = mode
    const failing = await settleActivities(client, USER_A, targets, DEFAULT_JAM_POLICY, NOW)

    expect(failing).toEqual(healthy)
    expect(world.serviceEvents).toHaveLength(0)
    // 지급 RPC를 부르지 않으므로 실패 기록도 없다
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each(FAILURES)('지급 RPC가 %s여도 모든 지급 함수가 던지지 않고 실패를 돌려준다', async (mode) => {
    world.failure = mode
    world.completions.add(`${USER_A}:${BOOK_2}`)

    await expect(awardServiceJam(client, { userId: USER_A, kind: 'mission_complete', sourceId: COMPLETION_1 })).resolves.toEqual({ ok: false })
    await expect(awardServiceJam(client, { userId: USER_A, kind: 'locked_unlock', sourceId: ITEM_1 })).resolves.toEqual({ ok: false })
    await expect(awardServiceJam(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })).resolves.toEqual({ ok: false })
    await expect(awardServiceJam(client, { userId: USER_B, kind: 'pickup', sourceId: DROP_1 })).resolves.toEqual({ ok: false })
    await expect(awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(871)), origin: NATURAL })).resolves.toEqual({ status: 'failed' })
    await expect(
      awardBadgeReceiveOccurrenceScores(client, { userId: USER_A, badge: badge(uuid(872)), origin: NATURAL, activityIds: [101, 102] })
    ).resolves.toEqual({ scored: 0, failed: 2 })
    await expect(awardCollectionCompleteScore(client, { userId: USER_A, itemBookId: BOOK_1, tier: 'rare' })).resolves.toEqual({ ok: false })
    await expect(
      awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_2, tierMode: false, completedTier: null, completedBefore: false })
    ).resolves.toBeUndefined()
    await expect(awardMixSuccessScore(client, USER_A, { id: MIX_1, is_recipe_first: true })).resolves.toBeUndefined()

    expect(world.serviceEvents).toHaveLength(0)
    expect(world.chapterScoreCalls).toBe(0)
  })

  it.each(FAILURES)('지급 RPC가 %s였다가 복구되면 같은 원천 id로 다시 보내 한 번만 지급한다', async (mode) => {
    world.failure = mode
    await sendEveryActivityOnce()
    expect(world.serviceEvents).toHaveLength(0)

    world.failure = 'none'
    await sendEveryActivityOnce()
    await sendEveryActivityOnce()

    expect(world.serviceEvents).toHaveLength(EXPECTED_SERVICE_ROWS)
    expect(serviceTotalOf(USER_A)).toBe(EXPECTED_SERVICE_TOTAL_A)
    expect(world.chapterScoreCalls).toBe(0)
  })

  it('실패 기록 자체가 거부돼도 지급 함수는 던지지 않는다', async () => {
    world.failure = 'rpc_error'
    logMock.mockRejectedValue(new Error('기록 장애'))

    await expect(awardServiceJam(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })).resolves.toEqual({ ok: false })
    await expect(awardMixSuccessScore(client, USER_A, { id: 'not-a-uuid', is_recipe_first: true })).resolves.toBeUndefined()
  })
})
