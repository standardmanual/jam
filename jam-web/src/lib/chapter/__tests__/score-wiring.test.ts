/**
 * 챕터 점수 연결 종합 시험 (티켓 20261019_1315 3회, 계획 20번, 운영 로직 12.2절)
 *
 * 1회(잼·캡슐·잠긴 열기·드랍·픽업), 2a·2b회(배지 받기), 3회(컬렉션·믹스·미션)가 호출 지점마다 개별 시험을 갖고 있다. 이 시험은 그 위에서
 * **호출 지점들이 서로 다른 키를 쓰고, 같은 일에 한 번씩만 부르는가**(키 충돌과 이중 호출 없음)를 한곳에서 고정한다.
 *
 * 구성
 *  1) 호출 지점 목록(소스 검색) — `chapter_add_score`를 부르는 곳이 `score.ts` 하나이고, 점수 함수를 부르는 파일·횟수가 아래 목록과 같다.
 *     활동 종류 12종은 각각 한 모듈만 만든다(같은 종류를 두 모듈이 세면 이중 가산 위험). 단 등급 올리기는 «믹스 성공»을 새 UUID 원천 id로 따로 센다(`SHARED_KIND_SCORE_SITES`).
 *     시스템 드랍 배치는 챕터 점수를 가져오지 않는다.
 *     목록이 어긋나면 이 시험이 깨진다 — 호출 지점을 더하거나 옮긴 사람이 키 충돌·이중 호출을 한 번 더 살피게 하려는 장치다.
 *  2) DB 모사 — 마이그레이션 221 `chapter_add_score`의 규칙(점수표 초기값, (종류, 원천) 전역 유일, 다른 유저의 키와 겹치면 예외, 활동한 날이 속한 주(월~일)의
 *     상한, 미래 날짜 거절)을 그대로 옮긴 가짜 DB 위에서 **실제 연결 함수**를 돌린다.
 *     - 8종 활동(12종 활동 종류)을 같은 일로 두 번 보내도 한 번만 세어진다 / 서로 다른 일은 키가 겹치지 않는다
 *     - 제외 규칙 종합(발급 지점들이 쓰는 자연 발급 트리거는 세고, 제외 대상은 DB에 기록이 남지 않는다)
 *     - 모은 잼은 정산이 점수를 부르지 않는다 — 어떤 정산·재정산·점수 장애에서도 점수 줄이 생기지 않는다
 *     - 점수 RPC가 실패해도(오류·예외·계약 밖 응답) 본 동작의 결과는 같고, 같은 원천 id로 다시 보내면 한 번만 세어진다
 *
 * **모은 잼(`jam_earned`)은 더 세지 않는다**(티켓 20261028_1733 3회): 잼 정산은 챕터 점수를 부르지 않고, 챕터는 캡슐이 가득 찬 횟수로 오른다. 점수표에는 종류가 남아 있어
 * 12종 목록은 그대로이지만 세는 모듈이 없다(`STOPPED_SCORE_KINDS`). 캡슐 열기는 옛 경로(`counted` 아님)만 세고, 나머지 다섯 곳은 잼 지급 전환(U5) 전까지 그대로다.
 *
 * 지점별 세부(호출 인자·순서·응답 불변)는 각 지점의 시험이 고정한다. 공용 DB와 실제 RPC는 부르지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/score-wiring.test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())

// 점수 실패 기록(logEngineDecision)이 실제 service 클라이언트를 만들지 않게 막는다
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import { settleActivities, type JamSettleTarget } from '@/lib/jam/settlement'
import {
  BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS,
  awardBadgeReceiveOccurrenceScores,
  awardBadgeReceiveScore,
  type BadgeReceiveBadge,
} from '../badgeReceive'
import { awardCollectionCompleteScore, awardSlotCollectionScore } from '../collection'
import { CHAPTER_SCORE_KINDS } from '../kinds'
import { awardMixSuccessScore } from '../mix'
import { awardChapterScore } from '../score'

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

/** `awardChapterScore(…, { kind: '…' })`의 리터럴 활동 종류 */
function literalKindOf(file: string): string | null {
  const match = SOURCES.get(file)?.match(/awardChapterScore\([\s\S]{0,300}?kind:\s*'([a-z_]+)'/)
  return match ? match[1] : null
}

/** 활동 종류를 직접 적어 `awardChapterScore`를 부르는 지점. 컬렉션 완성은 등급에 따라 종류가 갈려 `collection.ts`가 변환 함수로 정한다 */
const DIRECT_SCORE_SITES: Record<string, string> = {
  'app/api/drops/route.ts': 'drop',
  'app/api/drops/[dropId]/pickup/route.ts': 'pickup',
  'lib/capsule/open.ts': 'capsule_open',
  'lib/inventory/lockedItemFill.ts': 'locked_item_badge_open',
  'lib/missions/checker.ts': 'mission_complete',
  'lib/chapter/badgeReceive.ts': 'badge_receive',
  'lib/chapter/mix.ts': 'mix_success',
}

/**
 * 점수표에는 있지만 더는 세는 모듈이 없는 종류 (티켓 20261028_1733 3회). «모은 잼»은 정산이 아니라 캡슐 횟수가 챕터를 올린다.
 * 점수표의 행과 DB 함수는 그대로 둔다(프로덕션 main이 옛 경로를 쓴다) — 12종 목록에서 빼지 않는다.
 */
const STOPPED_SCORE_KINDS = ['jam_earned']

/**
 * 다른 모듈이 이미 세는 종류를 같은 점수표 항목으로 한 번 더 세는 지점 (티켓 20261022_2119 2회).
 * 등급 올리기(`lib/combine/tierUp.ts`)는 레시피 성공 기록이 없어 «믹스 성공»(`mix_success`)을 시도마다 새로 만든 UUID를 원천 id로 센다.
 * 믹스는 성공 기록 행의 id를 원천 id로 쓰므로 두 원천 id가 겹치지 않아 이중 가산이 아니다. «종류마다 한 모듈» 검사에서는 뺀다.
 */
const SHARED_KIND_SCORE_SITES: Record<string, string> = {
  'lib/combine/tierUp.ts': 'mix_success',
}

describe('호출 지점 목록 — 소스 검색', () => {
  it('chapter_add_score RPC를 부르는 곳은 score.ts 하나다 (점수 가산의 유일한 경로)', () => {
    const files = [...SOURCES].filter(([, source]) => /rpc\(\s*['"]chapter_add_score['"]/.test(source)).map(([file]) => file)
    expect(files).toEqual(['lib/chapter/score.ts'])
  })

  it('awardChapterScore를 부르는 파일과 횟수가 목록과 같다 — 파일마다 한 번, 컬렉션 완성은 collection.ts 한 곳', () => {
    expect(callSites('awardChapterScore')).toEqual({
      ...Object.fromEntries(Object.keys({ ...DIRECT_SCORE_SITES, ...SHARED_KIND_SCORE_SITES }).map((file) => [file, 1])),
      'lib/chapter/collection.ts': 1,
    })
  })

  it('직접 부르는 지점은 자기 활동 종류를 리터럴로 적고, 활동 종류 12종은 각각 한 모듈만 만든다', () => {
    for (const [file, kind] of Object.entries({ ...DIRECT_SCORE_SITES, ...SHARED_KIND_SCORE_SITES })) {
      expect(literalKindOf(file), file).toBe(kind)
    }
    const direct = Object.values(DIRECT_SCORE_SITES)
    // 직접 적은 7종은 서로 다른 모듈의 것이다(같은 종류를 두 파일이 세지 않는다)
    expect(new Set(direct).size).toBe(direct.length)
    // 나머지 4종(컬렉션 완성 등급별)은 변환 함수를 쓰는 collection.ts 하나가 만든다
    const collectionKinds = CHAPTER_SCORE_KINDS.filter((kind) => kind.startsWith('collection_complete_'))
    expect(collectionKinds).toHaveLength(4)
    expect(Object.keys(callSites('collectionCompleteKind')).sort()).toEqual(['lib/chapter/collection.ts'])
    // 직접 적은 종류 ∪ 컬렉션 종류 ∪ 멈춘 종류 = 활동 종류 12종
    expect([...direct, ...collectionKinds, ...STOPPED_SCORE_KINDS].sort()).toEqual([...CHAPTER_SCORE_KINDS].sort())
  })

  it('잼 정산은 챕터 점수를 가져오지 않는다 — 모은 잼(jam_earned)을 세는 코드가 없다', () => {
    expect(SOURCES.get('lib/jam/settlement.ts')).not.toMatch(/@\/lib\/chapter|awardChapterScore|chapter_add_score/)
    for (const kind of STOPPED_SCORE_KINDS) {
      const writers = [...SOURCES].filter(([file, source]) => file !== 'lib/chapter/kinds.ts' && new RegExp(`['"]${kind}['"]`).test(source)).map(([file]) => file)
      expect(writers, kind).toEqual([])
    }
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

  it('시스템 드랍(앰비언트 배치)은 챕터 점수를 가져오지 않는다 — 드랍 점수는 유저 드랍 라우트에만 있다', () => {
    const ambient = [...SOURCES].filter(([file]) => file.startsWith('lib/ambient-drop/'))
    expect(ambient.length).toBeGreaterThan(0)
    for (const [file, source] of ambient) expect(source, file).not.toContain('@/lib/chapter')
  })
})

// ---------------------------------------------------------------------------------------------
// 2) DB 모사 — 마이그레이션 221 chapter_add_score의 규칙

const migration = readFileSync(path.resolve(SRC, '../supabase/migrations/221_chapters.sql'), 'utf8')

interface ScoreRule {
  perUnit: number
  weeklyCap: number | null
  overCapRatio: number
}

/** 221의 점수표 초기값을 그대로 읽는다 — 점수 값을 이 시험이 따로 정하지 않는다 */
function seededRules(): Map<string, ScoreRule> {
  const start = migration.indexOf('INSERT INTO public.chapter_score_rules')
  expect(start, '221에서 점수 규칙 초기값을 찾지 못했다').toBeGreaterThanOrEqual(0)
  const block = migration.slice(start, migration.indexOf('ON CONFLICT', start))
  const rules = new Map<string, ScoreRule>()
  for (const m of block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*,\s*(NULL|\d+)\s*,\s*([0-9.]+)\s*\)/g)) {
    rules.set(m[1], { perUnit: Number(m[2]), weeklyCap: m[3] === 'NULL' ? null : Number(m[3]), overCapRatio: Number(m[4]) })
  }
  return rules
}

const RULES = seededRules()

/** 활동한 날이 속한 주(월~일)의 월요일 — `date_trunc('week', …)` */
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

interface ScoreEvent {
  userId: string
  kind: string
  sourceId: string
  occurredOn: string
  raw: number
  counted: number
}

type FailureMode = 'none' | 'rpc_error' | 'throws' | 'garbage'

interface World {
  /** 오늘(KST). 미래 날짜 거절 기준 */
  today: string
  events: ScoreEvent[]
  /** DB가 낸 예외 메시지 — 정상 경로에서는 비어 있어야 한다 */
  dbErrors: string[]
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
    today: '2026-10-21',
    events: [],
    dbErrors: [],
    suspended: new Set(),
    activityIds: {},
    jamLines: new Map(),
    completions: new Set(),
    failure: 'none',
  }
}

/** 마이그레이션 221 `chapter_add_score`를 옮긴 것(챕터 승급은 이 시험의 관심 밖이라 current_chapter는 null) */
function chapterAddScore(world: World, a: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  const fail = (message: string) => {
    world.dbErrors.push(message)
    return { data: null, error: { message } }
  }
  const userId = a.p_user_id as string
  const kind = a.p_activity_kind as string
  const sourceId = a.p_source_id as string
  const amount = a.p_amount as number
  if (!Number.isInteger(amount) || amount <= 0) return fail('amount는 1 이상이어야 합니다')
  if (!sourceId) return fail('source_id가 필요합니다')
  const rule = RULES.get(kind)
  if (!rule) return fail(`알 수 없는 활동 종류 ${kind}`)
  const occurredOn = (a.p_occurred_on as string | undefined) ?? world.today
  if (occurredOn > world.today) return fail(`활동한 날이 미래입니다 (${occurredOn})`)

  const existing = world.events.find((e) => e.kind === kind && e.sourceId === sourceId)
  if (existing) {
    if (existing.userId !== userId) return fail('이 (활동 종류, 원천)은 다른 유저의 점수로 이미 기록되어 있습니다')
    return { data: [{ score_added: existing.counted, current_chapter: null, reached_chapters: [] }], error: null }
  }

  const raw = Math.floor(amount * rule.perUnit)
  let counted: number
  if (rule.weeklyCap === null) {
    counted = raw
  } else {
    const start = weekStart(occurredOn)
    const end = new Date(`${start}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() + 7)
    const endDay = end.toISOString().slice(0, 10)
    const prior = world.events
      .filter((e) => e.userId === userId && e.kind === kind && e.occurredOn >= start && e.occurredOn < endDay)
      .reduce((sum, e) => sum + e.raw, 0)
    const room = Math.max(rule.weeklyCap - prior, 0)
    const within = Math.min(raw, room)
    counted = within + Math.floor((raw - within) * rule.overCapRatio)
  }
  world.events.push({ userId, kind, sourceId, occurredOn, raw, counted })
  return { data: [{ score_added: counted, current_chapter: null, reached_chapters: [] }], error: null }
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
      if (name !== 'chapter_add_score') throw new Error(`예상하지 못한 RPC: ${name}`)
      if (world.failure === 'throws') throw new Error('점수 RPC 네트워크 끊김')
      if (world.failure === 'rpc_error') return { data: null, error: { message: '점수 RPC 장애' } }
      if (world.failure === 'garbage') return { data: { unexpected: true }, error: null }
      return chapterAddScore(world, args)
    },
  } as unknown as SupabaseClient
}

// ---------------------------------------------------------------------------------------------
// 공통 입력

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const USER_A = uuid(1)
const USER_B = uuid(2)
const ACT_1 = uuid(101)
const OPEN_1 = uuid(201)
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

const rowsOf = (kind: string, sourceId?: string) => world.events.filter((e) => e.kind === kind && (sourceId === undefined || e.sourceId === sourceId))
const totalOf = (userId: string) => world.events.filter((e) => e.userId === userId).reduce((sum, e) => sum + e.counted, 0)

describe('DB 모사가 221과 같다', () => {
  it('점수표 초기값 12종을 읽는다 (모은 잼만 주 300점·절반)', () => {
    expect([...RULES.keys()].sort()).toEqual([...CHAPTER_SCORE_KINDS].sort())
    expect(RULES.get('jam_earned')).toEqual({ perUnit: 1, weeklyCap: 300, overCapRatio: 0.5 })
    expect(RULES.get('capsule_open')?.perUnit).toBe(20)
    expect(RULES.get('collection_complete_mystic')?.perUnit).toBe(800)
  })

  it('활동한 날이 속한 주는 월요일에 시작한다', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12') // 일요일
    expect(weekStart('2026-10-19')).toBe('2026-10-19') // 월요일
    expect(weekStart('2026-10-21')).toBe('2026-10-19')
  })
})

// ---------------------------------------------------------------------------------------------
// 8종 활동 — 같은 일은 한 번, 다른 일은 키가 겹치지 않는다

/** 7종 활동(세는 활동 종류 11종)을 한 번씩 보낸다. 각 지점이 쓰는 키 규칙을 그대로 따른다 */
async function sendEveryActivityOnce() {
  // 캡슐 열기·잠긴 아이템 배지 열기 — 열기 기록 id·개체 id
  await awardChapterScore(client, { userId: USER_A, kind: 'capsule_open', sourceId: OPEN_1 })
  await awardChapterScore(client, { userId: USER_A, kind: 'locked_item_badge_open', sourceId: ITEM_1 })
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
  await awardChapterScore(client, { userId: USER_A, kind: 'mission_complete', sourceId: COMPLETION_1 })
  // 드랍(놓은 사람)과 픽업(줍는 다른 사람) — 같은 드랍 id, 활동 종류가 다르다
  await awardChapterScore(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })
  await awardChapterScore(client, { userId: USER_B, kind: 'pickup', sourceId: DROP_1 })
}

/**
 * 한 번씩 보냈을 때의 기대: 15줄(캡슐 1, 잠긴 열기 1, 배지 받기 4, 컬렉션 5, 믹스 1, 미션 1, 드랍 1, 픽업 1), 세는 활동 종류 11종 모두(모은 잼은 세지 않는다).
 * 합계는 221 점수표 × 단위: A = 캡슐 20 + 잠긴 열기 10 + 배지 받기 40 + 컬렉션 1600 + 믹스 20 + 미션 50 + 드랍 5 = 1745, B = 픽업 5
 */
const EXPECTED_ROWS = 15
const COUNTED_KINDS = CHAPTER_SCORE_KINDS.filter((kind) => !STOPPED_SCORE_KINDS.includes(kind))
const EXPECTED_TOTAL_A = 20 + 10 + (10 + 10 + 20) + (100 + 200 + 400 + 800 + 100) + 20 + 50 + 5
const EXPECTED_TOTAL_B = 5

describe('7종 활동 — 같은 일을 두 번 보내도 한 번만 센다', () => {
  it('한 번씩 보내면 일마다 한 줄이 쌓이고 세는 11종 활동 종류를 모두 쓴다', async () => {
    await sendEveryActivityOnce()

    expect(world.dbErrors).toEqual([])
    expect(logMock).not.toHaveBeenCalled()
    expect(world.events).toHaveLength(EXPECTED_ROWS)
    expect(new Set(world.events.map((e) => e.kind))).toEqual(new Set(COUNTED_KINDS))
    expect(totalOf(USER_A)).toBe(EXPECTED_TOTAL_A)
    expect(totalOf(USER_B)).toBe(EXPECTED_TOTAL_B)
  })

  it('같은 일을 한 번 더 보내면 줄도 합계도 그대로다 (재동기화·재시도·재장착)', async () => {
    await sendEveryActivityOnce()
    const snapshot = JSON.stringify(world.events)

    await sendEveryActivityOnce()

    expect(world.dbErrors).toEqual([])
    expect(world.events).toHaveLength(EXPECTED_ROWS)
    expect(JSON.stringify(world.events)).toBe(snapshot)
    expect(totalOf(USER_A)).toBe(EXPECTED_TOTAL_A)
    expect(totalOf(USER_B)).toBe(EXPECTED_TOTAL_B)
  })

  it('여러 번 동시에 보내도 한 번만 센다', async () => {
    await Promise.all([sendEveryActivityOnce(), sendEveryActivityOnce(), sendEveryActivityOnce()])

    expect(world.dbErrors).toEqual([])
    expect(world.events).toHaveLength(EXPECTED_ROWS)
    expect(totalOf(USER_A)).toBe(EXPECTED_TOTAL_A)
  })
})

describe('키 충돌 없음 — 호출 지점들이 서로 다른 키를 쓴다', () => {
  it('같은 드랍의 드랍과 픽업은 원천 id가 같아도 활동 종류가 달라 두 줄이다', async () => {
    await awardChapterScore(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })
    await awardChapterScore(client, { userId: USER_B, kind: 'pickup', sourceId: DROP_1 })

    expect(world.dbErrors).toEqual([])
    expect(rowsOf('drop', DROP_1)).toHaveLength(1)
    expect(rowsOf('pickup', DROP_1)).toHaveLength(1)
  })

  it('유저·배지·회차·컬렉션·등급 조합마다 키가 다르다 — 다른 유저의 키와 겹쳐 DB가 예외를 내는 일이 없다', async () => {
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

    expect(world.dbErrors).toEqual([])
    expect(logMock).not.toHaveBeenCalled()
    expect(world.events).toHaveLength(expected)
    expect(new Set(world.events.map((e) => `${e.kind}:${e.sourceId}`)).size).toBe(expected)
  })

  it('옛 컬렉션이 센 common과 등급형으로 바뀐 뒤의 common은 같은 키다 — 같은 완성을 두 번 세지 않는다 (사용자 결정 4)', async () => {
    // 1) 등급형을 켜기 전 — 장착 전엔 완성 기록이 없었고 장착 후에 생겼다
    world.completions.add(`${USER_A}:${BOOK_3}`)
    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: false, completedTier: null, completedBefore: false })
    expect(totalOf(USER_A)).toBe(100)

    // 2) 같은 컬렉션이 등급형으로 바뀐 뒤 common 등급 완성
    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: true, completedTier: 'common', completedBefore: null })
    // 3) 동기화 보정이 같은 완성을 common으로 다시 보냄
    await awardCollectionCompleteScore(client, { userId: USER_A, itemBookId: BOOK_3, tier: 'common' })

    expect(world.dbErrors).toEqual([])
    expect(rowsOf('collection_complete_common')).toHaveLength(1)
    expect(totalOf(USER_A)).toBe(100)

    // 새 등급(rare)은 새 완성이라 따로 센다
    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: true, completedTier: 'rare', completedBefore: null })
    expect(totalOf(USER_A)).toBe(300)
  })

  it('이미 완성한 유저의 옛 컬렉션 재장착은 소급 가산하지 않는다', async () => {
    world.completions.add(`${USER_A}:${BOOK_3}`)

    await awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_3, tierMode: false, completedTier: null, completedBefore: true })

    expect(world.events).toHaveLength(0)
  })

  it('반복형의 첫 획득 키와 회차 키는 구분된다 — 첫 획득 하나 + 회차마다 하나', async () => {
    const repeatable = badge(uuid(821))
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: repeatable, origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: repeatable, origin: NATURAL, occurrenceActivityId: 101 })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: repeatable, origin: NATURAL, occurrenceActivityId: 102 })

    expect(world.dbErrors).toEqual([])
    expect(rowsOf('badge_receive')).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------------------------
// 제외 규칙 종합

describe('제외 규칙 종합 — DB에 기록이 남는가', () => {
  const MISSION_ID = uuid(901)
  const BOOK_ID = uuid(902)

  /** 발급 지점들이 실제로 쓰는 자연 발급 트리거 이름 */
  const NATURAL_TRIGGERS = ['strava_sync', 'onboarding_quest', `mission_reward:${MISSION_ID}`, `itembook_complete:${BOOK_ID}`]

  it.each(NATURAL_TRIGGERS)('자연 발급 트리거(%s)는 센다', async (triggeredBy) => {
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(831)), origin: { triggeredBy } })
    expect(rowsOf('badge_receive')).toHaveLength(1)
  })

  it('체크인 배지는 센다 — 두 번째 이후는 호출 지점(isFirstEarn)이 부르지 않고, 혹시 불러도 (유저, 배지) 키라 한 번뿐이다', async () => {
    const checkin: BadgeReceiveBadge = { id: uuid(832), type: 'checkin' }
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: checkin, origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: checkin, origin: NATURAL })
    expect(rowsOf('badge_receive')).toHaveLength(1)
  })

  it('같은 배지를 초기화나 삭제 뒤 다시 받아도 점수는 다시 들어가지 않는다 (사용자 결정 2)', async () => {
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(833)), origin: NATURAL })
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(833)), origin: NATURAL })
    expect(rowsOf('badge_receive')).toHaveLength(1)
    expect(totalOf(USER_A)).toBe(10)
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

    expect(rowsOf('badge_receive', undefined).length > 0).toBe(counted)
    expect(world.dbErrors).toEqual([])
  })

  it('이용 정지 중인 유저(정지된 드랍 주인이 받는 배지)는 세지 않고 풀리면 다시 센다', async () => {
    world.suspended.add(USER_A)
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(861)), origin: NATURAL })
    expect(world.events).toHaveLength(0)

    world.suspended.delete(USER_A)
    await awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(861)), origin: NATURAL })
    expect(rowsOf('badge_receive')).toHaveLength(1)
  })

  it('제외 조건 키는 팔로워·팔로잉·챕터 도달 셋이다 (포인트를 가리키는 조건 키는 지금 하나도 없다)', () => {
    expect([...BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS].sort()).toEqual(['chapter_reached', 'follower_count', 'following_count'])
  })
})

// ---------------------------------------------------------------------------------------------
// 모은 잼 — 정산은 챕터 점수를 세지 않는다

describe('모은 잼 — 정산은 챕터 점수를 세지 않는다 (티켓 20261028_1733 3회)', () => {
  async function settle(targets: JamSettleTarget[]) {
    for (const t of targets) world.activityIds[t.stravaId] = uuid(1000 + t.stravaId)
    return settleActivities(client, USER_A, targets, DEFAULT_JAM_POLICY, NOW)
  }

  it('잼은 원장에 들어가지만 점수 줄은 생기지 않는다 — 주 300점 상한을 넘는 양이어도 마찬가지다', async () => {
    const result = await settle([walking(1, '2026-10-19T01:00:00Z', 250), walking(2, '2026-10-20T01:00:00Z', 100)])

    expect(result.total).toBe(350)
    expect(world.jamLines.size).toBe(2)
    expect(world.events).toHaveLength(0)
    expect(world.dbErrors).toEqual([])
    expect(logMock).not.toHaveBeenCalled()
  })

  it('같은 활동을 다시 정산해도 점수 줄은 없다 (재동기화)', async () => {
    const targets = [walking(1, '2026-10-19T01:00:00Z', 250), walking(2, '2026-10-20T01:00:00Z', 100)]
    await settle(targets)
    await settle(targets)

    expect(world.jamLines.size).toBe(2)
    expect(world.events).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------------------------
// 점수 실패는 본 동작을 막지 않는다

describe('점수 실패 — 본 동작의 결과는 그대로이고 같은 원천 id로 다시 보내면 한 번만 센다', () => {
  const FAILURES: FailureMode[] = ['rpc_error', 'throws', 'garbage']

  it.each(FAILURES)('점수 RPC가 %s여도 잼 정산 결과(항목·합계)는 정상일 때와 같고 점수 RPC는 아예 부르지 않는다', async (mode) => {
    const targets = [walking(1, '2026-10-19T01:00:00Z', 250), walking(2, '2026-10-20T01:00:00Z', 100)]

    const healthyWorld = newWorld()
    healthyWorld.activityIds = { 1: uuid(1101), 2: uuid(1102) }
    const healthy = await settleActivities(fakeClient(healthyWorld), USER_A, targets, DEFAULT_JAM_POLICY, NOW)

    world.activityIds = { 1: uuid(1101), 2: uuid(1102) }
    world.failure = mode
    const failing = await settleActivities(client, USER_A, targets, DEFAULT_JAM_POLICY, NOW)

    expect(failing).toEqual(healthy)
    expect(world.events).toHaveLength(0)
    // 점수 RPC를 부르지 않으므로 실패 기록도 없다
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each(FAILURES)('점수 RPC가 %s여도 모든 점수 함수가 던지지 않고 실패를 돌려준다', async (mode) => {
    world.failure = mode
    world.completions.add(`${USER_A}:${BOOK_2}`)

    await expect(awardChapterScore(client, { userId: USER_A, kind: 'capsule_open', sourceId: OPEN_1 })).resolves.toEqual({ ok: false })
    await expect(awardBadgeReceiveScore(client, { userId: USER_A, badge: badge(uuid(871)), origin: NATURAL })).resolves.toEqual({ status: 'failed' })
    await expect(
      awardBadgeReceiveOccurrenceScores(client, { userId: USER_A, badge: badge(uuid(872)), origin: NATURAL, activityIds: [101, 102] })
    ).resolves.toEqual({ scored: 0, failed: 2 })
    await expect(awardCollectionCompleteScore(client, { userId: USER_A, itemBookId: BOOK_1, tier: 'rare' })).resolves.toEqual({ ok: false })
    await expect(
      awardSlotCollectionScore(client, { userId: USER_A, itemBookId: BOOK_2, tierMode: false, completedTier: null, completedBefore: false })
    ).resolves.toBeUndefined()
    await expect(awardMixSuccessScore(client, USER_A, { id: MIX_1, is_recipe_first: true })).resolves.toBeUndefined()

    expect(world.events).toHaveLength(0)
  })

  it.each(FAILURES)('점수 RPC가 %s였다가 복구되면 같은 원천 id로 다시 보내 한 번만 센다', async (mode) => {
    world.failure = mode
    await sendEveryActivityOnce()
    expect(world.events).toHaveLength(0)

    world.failure = 'none'
    await sendEveryActivityOnce()
    await sendEveryActivityOnce()

    expect(world.dbErrors).toEqual([])
    expect(world.events).toHaveLength(EXPECTED_ROWS)
    expect(totalOf(USER_A)).toBe(EXPECTED_TOTAL_A)
  })

  it('실패 기록 자체가 거부돼도 점수 함수는 던지지 않는다', async () => {
    world.failure = 'rpc_error'
    logMock.mockRejectedValue(new Error('기록 장애'))

    await expect(awardChapterScore(client, { userId: USER_A, kind: 'drop', sourceId: DROP_1 })).resolves.toEqual({ ok: false })
    await expect(awardMixSuccessScore(client, USER_A, { id: 'not-a-uuid', is_recipe_first: true })).resolves.toBeUndefined()
  })
})
