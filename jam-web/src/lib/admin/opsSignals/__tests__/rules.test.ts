/**
 * 「13종 조건 표」 (티켓 20261001_1155)
 *
 * 신호 11종은 각자의 조건 값에서 뜨고 조건 직전 값에서는 뜨지 않는다. 밸런스 경고·획득 경로가 막힌 컬렉션 2종은 어떤 재료를 줘도
 * 「아직 확인하지 않아요」(`not_built`)다. 실행 실패·예약 누락은 아직 실제 데이터가 없어(받은 기획함의 상태가 「승인됨」까지만 생긴다)
 * 시험 데이터의 상태·시각으로 검증한다. 모든 시험은 2026-10-01(목) 12:00 KST를 지금으로 한다 — 검사 범위는 그날부터 일요일까지다.
 *
 * 기준 구성(`healthyCards`)은 모든 날짜에 카드가 3장씩 있어 어떤 신호도 걸리지 않는다. 각 줄은 기준 구성에서 한 가지만 바꾼다.
 */
import { describe, expect, it } from 'vitest'
import type { Json } from '@/types/database.generated'
import { OPS_SIGNAL_CATALOG, type OpsSignalKey, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import { ACTION_METRIC_KEYS, ACTION_METRIC_MIN_KEYS, type ActionCounts, type ActionMetricKey } from '@/lib/admin/opsSignals/actionSpike'
import type { SignalBundleItemInput, SignalCardInput } from '@/lib/admin/opsSignals/composition'
import {
  computeOpsSignals,
  type ComputeOpsSignalsInput,
  type ComputeOpsSignalsOptions,
} from '@/lib/admin/opsSignals/compute'
import { DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES } from '@/lib/admin/opsSignals/thresholds'
import {
  HEALTHY_FROM,
  HEALTHY_TO,
  NOW,
  cardOriginal,
  dayEnd,
  dayStart,
  healthyCards,
  kst,
  makeBundle,
  makeDayCard,
  makeItem,
} from './fixtures'

// ── 입력 만들기 ──────────────────────────────────────────────────────────────────────────────────

function quietActions(over: Partial<ActionCounts> = {}): ActionCounts {
  const counts = {} as ActionCounts
  for (const metric of ACTION_METRIC_KEYS) counts[metric] = { recent: 0, baselineWeeklyAverage: 0 }
  return { ...counts, ...over }
}

interface Scenario {
  input?: Partial<ComputeOpsSignalsInput>
  options?: Partial<ComputeOpsSignalsOptions>
}

function run(scenario: Scenario = {}) {
  const input: ComputeOpsSignalsInput = {
    cards: healthyCards(HEALTHY_FROM, HEALTHY_TO),
    missions: [],
    bundles: [],
    actions: quietActions(),
    ...scenario.input,
  }
  return computeOpsSignals(input, { now: NOW, ...scenario.options })
}

function outcome(scenario: Scenario, key: OpsSignalKey): OpsSignalOutcome {
  return run(scenario).signals.find((signal) => signal.key === key) as OpsSignalOutcome
}

const base = () => healthyCards(HEALTHY_FROM, HEALTHY_TO)

/** 그날의 기준 카드를 바꾼다. */
function mapDay(cards: SignalCardInput[], date: string, change: (card: SignalCardInput) => SignalCardInput): SignalCardInput[] {
  return cards.map((card) => (card.startsAt === dayStart(date) ? change(card) : card))
}

/** 그날의 기준 카드에서 일부를 뺀다. */
function dropDay(cards: SignalCardInput[], date: string, drop: (card: SignalCardInput) => boolean): SignalCardInput[] {
  return cards.filter((card) => !(card.startsAt === dayStart(date) && drop(card)))
}

/** 날짜별 대표 카드(sortOrder 0)의 모양을 정한다. */
function withRepShapes(cards: SignalCardInput[], shapes: Record<string, SignalCardInput['shape']>): SignalCardInput[] {
  return cards.map((card) =>
    card.sortOrder === 0 && shapes[card.startsAt.slice(0, 10)] ? { ...card, shape: shapes[card.startsAt.slice(0, 10)] } : card
  )
}

/** 상태·시각만 중요한 항목(날짜 구성에 들어가지 않는 드랍 일정 종류). */
function statusItem(over: Partial<SignalBundleItemInput> = {}): SignalBundleItemInput {
  return makeItem({ kind: 'drop_schedule', startsAt: null, endsAt: null, original: {}, ...over })
}

/** 그날 하루 걸치는 운영 묶음 홈피드 카드 항목. */
function homeItem(date: string, original: Record<string, Json> = {}, over: Partial<SignalBundleItemInput> = {}) {
  return makeItem({ startsAt: dayStart(date), endsAt: dayEnd(date), original: cardOriginal(original), ...over })
}

const TRIBE_ID = '3f2b8d6e-5a7c-4e1d-9b2a-0c4d8e6f1a23'
const NO_IMAGE = { resource: { sort_order: 9 } }

// ── 13종 조건 표 ─────────────────────────────────────────────────────────────────────────────────

interface Row {
  key: OpsSignalKey
  condition: string
  raised: () => Scenario
  clear: () => Scenario
}

const ROUTINE_START = { routineCheckStartsAt: '2026-09-29T00:00:00+09:00' }

const ROWS: Row[] = [
  // ── 실행 실패 (A2): 최근 7일 안에 「실패」로 바뀐 항목
  {
    key: 'execution_failed',
    condition: '실패로 바뀐 지 정확히 7일(경계 포함)',
    raised: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'failed', updatedAt: kst('2026-09-24', '12:00') })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'failed', updatedAt: kst('2026-09-24', '11:59') })])] } }),
  },
  {
    key: 'execution_failed',
    condition: '실패 상태 항목(실패가 아닌 항목은 안 뜬다)',
    raised: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'failed' })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'rejected' })])] } }),
  },
  // ── 예약 누락 (가정 19): 예약됨·준비중 항목의 공개 시각 + 30분
  {
    key: 'missed_schedule',
    condition: '예약됨 항목의 공개 시각 + 30분(경계 포함)',
    raised: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'scheduled', startsAt: kst('2026-10-01', '11:30') })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'scheduled', startsAt: kst('2026-10-01', '11:31') })])] } }),
  },
  {
    key: 'missed_schedule',
    condition: '준비중 항목도 본다',
    raised: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'preparing', startsAt: kst('2026-10-01', '08:00') })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'live', startsAt: kst('2026-10-01', '08:00') })])] } }),
  },
  {
    key: 'missed_schedule',
    condition: '승인됨 항목은 뺀다(1500 연결 전에는 멈춰 있는 것이 정상)',
    raised: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'scheduled', startsAt: kst('2026-09-30', '09:00') })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'approved', startsAt: kst('2026-09-30', '09:00') })])] } }),
  },
  // ── 루틴 실패 (A1): 마감 시각까지 새 묶음 없음
  {
    key: 'routine_failed',
    condition: '주간 루틴 마감(화요일 12:00) 정각까지 묶음이 없다',
    raised: () => ({
      options: { now: new Date('2026-09-29T12:00:00+09:00'), thresholds: ROUTINE_START },
    }),
    clear: () => ({
      options: { now: new Date('2026-09-29T11:59:00+09:00'), thresholds: ROUTINE_START },
    }),
  },
  {
    key: 'routine_failed',
    condition: '마감 뒤에 화요일 0시 이후 받은 실제 묶음이 있다',
    raised: () => ({
      input: {
        bundles: [makeBundle([statusItem({ status: 'arrived' })], { receivedAt: kst('2026-09-28', '23:59') })],
      },
      options: { thresholds: { ...ROUTINE_START, monthlyRoutineDay: 1, monthlyRoutineDeadlineHour: 99 } },
    }),
    clear: () => ({
      input: {
        bundles: [makeBundle([statusItem({ status: 'arrived' })], { receivedAt: kst('2026-09-29', '00:00') })],
      },
      options: { thresholds: { ...ROUTINE_START, monthlyRoutineDay: 1, monthlyRoutineDeadlineHour: 99 } },
    }),
  },
  {
    key: 'routine_failed',
    condition: '월간 루틴 마감(1일 12:00)까지 「패턴 제안」 묶음이 없다',
    raised: () => ({
      input: {
        bundles: [makeBundle([statusItem({ status: 'arrived' })], { receivedAt: kst('2026-09-29', '09:00') })],
      },
      options: { thresholds: ROUTINE_START },
    }),
    clear: () => ({
      input: {
        bundles: [
          makeBundle([statusItem({ status: 'arrived' })], { receivedAt: kst('2026-09-29', '09:00') }),
          makeBundle([statusItem({ status: 'arrived', kind: 'pattern_proposal' })], { receivedAt: kst('2026-10-01', '00:00') }),
        ],
      },
      options: { thresholds: ROUTINE_START },
    }),
  },
  // ── 형식 오류 (A4): 끝나지 않은 묶음의 형식 오류
  {
    key: 'format_error',
    condition: '끝나지 않은 묶음에 형식 오류 문장이 하나 이상',
    raised: () => ({
      input: { bundles: [makeBundle([statusItem({ status: 'arrived' })], { formatErrors: ['items[0].kind: 종류가 틀렸어요.'] })] },
    }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'arrived' })], { formatErrors: [] })] } }),
  },
  {
    key: 'format_error',
    condition: '항목에만 오류가 있어도 본다',
    raised: () => ({
      input: { bundles: [makeBundle([statusItem({ status: 'reviewing', formatErrors: ['items[0].starts_at: 시각이 틀렸어요.'] })])] },
    }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'reviewing', formatErrors: [] })])] } }),
  },
  {
    key: 'format_error',
    condition: '끝난 묶음(전부 종료·반려)은 보지 않는다',
    raised: () => ({
      input: { bundles: [makeBundle([statusItem({ status: 'approved' })], { formatErrors: ['items[0].kind: 틀렸어요.'] })] },
    }),
    clear: () => ({
      input: { bundles: [makeBundle([statusItem({ status: 'ended' })], { formatErrors: ['items[0].kind: 틀렸어요.'] })] },
    }),
  },
  // ── 비어 있는 컨텐츠 (A5·A8)
  {
    key: 'empty_content',
    condition: '게재 카드가 3장보다 적은 날(2장)',
    raised: () => ({ input: { cards: dropDay(base(), '2026-10-02', (card) => card.sortOrder === 2) } }),
    clear: () => ({ input: { cards: base() } }),
  },
  {
    key: 'empty_content',
    condition: '게재 카드가 5장보다 많은 날(6장)',
    raised: () => ({
      input: {
        cards: [
          ...base(),
          ...[3, 4, 5].map((n) => makeDayCard('2026-10-02', { sortOrder: n, shape: 'brief', exposureTags: ['strava_stale_14d'] })),
        ],
      },
    }),
    clear: () => ({
      input: {
        cards: [
          ...base(),
          ...[3, 4].map((n) => makeDayCard('2026-10-02', { sortOrder: n, shape: 'brief', exposureTags: ['strava_stale_14d'] })),
        ],
      },
    }),
  },
  {
    key: 'empty_content',
    condition: '「색 대기」 카드',
    raised: () => ({ input: { bundles: [makeBundle([homeItem('2026-10-02', { color_pending: true })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([homeItem('2026-10-02', { color_pending: false })])] } }),
  },
  {
    key: 'empty_content',
    condition: '문안이 빈 운영 묶음 카드(copy에 글자가 없다)',
    raised: () => ({ input: { bundles: [makeBundle([homeItem('2026-10-02', { copy: { title: ' ', body: '' } })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([homeItem('2026-10-02', { copy: { title: '문안' } })])] } }),
  },
  {
    key: 'empty_content',
    condition: '제목이 빈 실제 카드',
    raised: () => ({ input: { cards: [...base(), makeDayCard('2026-10-02', { sortOrder: 3, shape: 'brief', title: '  ', exposureTags: ['x'] })] } }),
    clear: () => ({ input: { cards: [...base(), makeDayCard('2026-10-02', { sortOrder: 3, shape: 'brief', title: '제목', exposureTags: ['x'] })] } }),
  },
  {
    key: 'empty_content',
    condition: '모양이 저장된 실제 카드가 이미지 모양인데 커버가 없다',
    raised: () => ({ input: { cards: [...base(), makeDayCard('2026-10-02', { sortOrder: 3, shape: 'hero', hasCover: false, exposureTags: ['x'] })] } }),
    clear: () => ({ input: { cards: [...base(), makeDayCard('2026-10-02', { sortOrder: 3, shape: 'hero', hasCover: true, exposureTags: ['x'] })] } }),
  },
  {
    key: 'empty_content',
    condition: '예약·게재 중인 운영 묶음 카드가 이미지 모양인데 이미지가 없다(승인 전은 「이미지 제작 필요」 표시뿐)',
    raised: () => ({ input: { bundles: [makeBundle([homeItem('2026-10-02', NO_IMAGE, { status: 'scheduled' })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([homeItem('2026-10-02', NO_IMAGE, { status: 'approved' })])] } }),
  },
  {
    key: 'empty_content',
    condition: '전원 대상 카드가 없는 날',
    raised: () => ({ input: { cards: mapDay(base(), '2026-10-02', (card) => ({ ...card, exposureTags: ['new_user'] })) } }),
    clear: () => ({ input: { cards: mapDay(base(), '2026-10-02', (card) => (card.sortOrder === 0 ? card : { ...card, exposureTags: ['new_user'] })) } }),
  },
  {
    key: 'empty_content',
    condition: '이미지가 없는 모양(brief)이 대표 카드인 날',
    raised: () => ({ input: { cards: withRepShapes(base(), { '2026-10-02': 'brief' }) } }),
    clear: () => ({ input: { cards: withRepShapes(base(), { '2026-10-02': 'poster' }) } }),
  },
  // ── 새 컨텐츠가 없는 날: 그날 새로 게재를 시작하는 홈피드 카드 0장
  {
    key: 'no_new_content',
    condition: '그날 시작하는 카드가 0장(기간이 걸친 카드만 있다)',
    raised: () => ({
      input: {
        cards: [
          ...dropDay(base(), '2026-10-02', () => true),
          makeDayCard('2026-10-02', { startsAt: dayStart('2026-09-30'), endsAt: dayEnd('2026-10-04') }),
        ],
      },
    }),
    clear: () => ({
      input: {
        cards: [
          ...dropDay(base(), '2026-10-02', (card) => card.sortOrder !== 0),
          makeDayCard('2026-10-02', { startsAt: dayStart('2026-09-30'), endsAt: dayEnd('2026-10-04'), sortOrder: 5 }),
        ],
      },
    }),
  },
  // ── 승인 마감 임박 (A3): 결정 전 항목의 공개 시각이 48시간 안
  {
    key: 'approval_deadline',
    condition: '공개 시각이 지금부터 정확히 48시간 뒤(경계 포함)',
    raised: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'arrived', startsAt: kst('2026-10-03', '12:00') })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'arrived', startsAt: kst('2026-10-03', '12:01') })])] } }),
  },
  {
    key: 'approval_deadline',
    condition: '공개 시각이 이미 지났는데 검토중이다',
    raised: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'reviewing', startsAt: kst('2026-09-30', '09:00') })])] } }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'approved', startsAt: kst('2026-09-30', '09:00') })])] } }),
  },
  // ── 에이전트가 뺀 항목 (A4)
  {
    key: 'excluded_items',
    condition: '끝나지 않은 묶음에 뺀 항목이 있다',
    raised: () => ({
      input: {
        bundles: [
          makeBundle([statusItem({ status: 'arrived' })], {
            raw: { excluded_items: [{ reason: '세계관 검수에서 중단이 나왔어요.', stage: 'world_review' }] },
          }),
        ],
      },
    }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'arrived' })], { raw: { excluded_items: [] } })] } }),
  },
  {
    key: 'excluded_items',
    condition: '뺀 항목 목록을 읽을 수 없다(「모름」)',
    raised: () => ({
      input: { bundles: [makeBundle([statusItem({ status: 'arrived' })], { raw: { excluded_items: '이상한 값' } })] },
    }),
    clear: () => ({ input: { bundles: [makeBundle([statusItem({ status: 'arrived' })], { raw: {} })] } }),
  },
  {
    key: 'excluded_items',
    condition: '끝난 묶음의 뺀 항목은 보지 않는다',
    raised: () => ({
      input: { bundles: [makeBundle([statusItem({ status: 'live' })], { raw: { excluded_items: [{ reason: '사유' }] } })] },
    }),
    clear: () => ({
      input: { bundles: [makeBundle([statusItem({ status: 'ended' })], { raw: { excluded_items: [{ reason: '사유' }] } })] },
    }),
  },
  // ── 겹침 (A6·A7)
  {
    key: 'overlap',
    condition: '이미지가 있는 모양의 카드가 3장',
    raised: () => ({
      input: { cards: [...base(), ...[3, 4].map((n) => makeDayCard('2026-10-02', { sortOrder: n, shape: 'hero', exposureTags: ['x'] }))] },
    }),
    clear: () => ({
      input: { cards: [...base(), makeDayCard('2026-10-02', { sortOrder: 3, shape: 'hero', exposureTags: ['x'] })] },
    }),
  },
  {
    key: 'overlap',
    condition: '모양을 아는 카드 가운데 이미지가 없는 모양이 0장',
    raised: () => ({ input: { cards: dropDay(base(), '2026-10-02', (card) => card.sortOrder !== 0) } }),
    clear: () => ({ input: { cards: dropDay(base(), '2026-10-02', (card) => card.sortOrder === 2) } }),
  },
  {
    key: 'overlap',
    condition: '신규 유저에게 보이는 카드가 4장(3장 초과)',
    raised: () => ({
      input: { cards: [...base(), ...[3, 4].map((n) => makeDayCard('2026-10-02', { sortOrder: n, shape: 'brief', exposureTags: ['new_user'] }))] },
    }),
    clear: () => ({
      input: { cards: [...base(), makeDayCard('2026-10-02', { sortOrder: 3, shape: 'brief', exposureTags: ['new_user'] })] },
    }),
  },
  {
    key: 'overlap',
    condition: '시간대 태그(time_*)도 신규 유저에게 보이는 카드로 센다',
    raised: () => ({
      input: { cards: [...base(), ...[3, 4].map((n) => makeDayCard('2026-10-02', { sortOrder: n, shape: 'brief', exposureTags: ['time_morning'] }))] },
    }),
    clear: () => ({
      input: { cards: [...base(), ...[3, 4].map((n) => makeDayCard('2026-10-02', { sortOrder: n, shape: 'brief', exposureTags: ['weather_rain'] }))] },
    }),
  },
  {
    key: 'overlap',
    condition: '그날 시작하는 운영 묶음 항목 두 건이 같은 패턴',
    raised: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
          ]),
        ],
      },
    }),
    clear: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P2' }),
          ]),
        ],
      },
    }),
  },
  {
    key: 'overlap',
    condition: '그날 시작하는 운영 묶음 항목 두 건이 같은 트라이브',
    raised: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'], tribe_id: TRIBE_ID }),
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'], tribe_id: TRIBE_ID }),
          ]),
        ],
      },
    }),
    clear: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'], tribe_id: TRIBE_ID }),
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }),
          ]),
        ],
      },
    }),
  },
  {
    key: 'overlap',
    condition: '같은 패턴이라도 하나가 전날부터 이어지는 항목이면 겹치지 않는다(그날 시작하는 항목끼리만 본다)',
    raised: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
          ]),
        ],
      },
    }),
    clear: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
            homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1', startsAt: kst('2026-10-01', '09:00') }),
          ]),
        ],
      },
    }),
  },
  // ── 단조로운 흐름
  {
    key: 'monotony',
    condition: '같은 모양이 3일 연속 대표 카드',
    raised: () => ({ input: { cards: withRepShapes(base(), { '2026-10-01': 'hero', '2026-10-02': 'hero', '2026-10-03': 'hero' }) } }),
    clear: () => ({ input: { cards: withRepShapes(base(), { '2026-10-01': 'hero', '2026-10-02': 'hero', '2026-10-03': 'poster' }) } }),
  },
  {
    key: 'monotony',
    condition: '3일이 이어지지 않으면(하루 건너뜀) 연속이 아니다',
    raised: () => ({ input: { cards: withRepShapes(base(), { '2026-10-01': 'poster', '2026-10-02': 'poster', '2026-10-03': 'poster' }) } }),
    clear: () => ({
      input: {
        cards: withRepShapes(
          dropDay(base(), '2026-10-02', (card) => card.exposureTags.includes('all')),
          { '2026-10-01': 'poster', '2026-10-03': 'poster', '2026-10-04': 'poster' }
        ),
      },
    }),
  },
  {
    key: 'monotony',
    condition: '최근 7일 대표 카드에서 같은 패턴이 3번',
    raised: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-01', { shape: 'poster', resource: { sort_order: -1, cover_image_url: 'x' } }, { patternNo: 'P7' }),
            homeItem('2026-10-02', { shape: 'hero', resource: { sort_order: -1, cover_image_url: 'x' } }, { patternNo: 'P7' }),
            homeItem('2026-10-03', { shape: 'poster', resource: { sort_order: -1, cover_image_url: 'x' } }, { patternNo: 'P7' }),
          ]),
        ],
      },
    }),
    clear: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-01', { shape: 'poster', resource: { sort_order: -1, cover_image_url: 'x' } }, { patternNo: 'P7' }),
            homeItem('2026-10-02', { shape: 'hero', resource: { sort_order: -1, cover_image_url: 'x' } }, { patternNo: 'P7' }),
          ]),
        ],
      },
    }),
  },
  {
    key: 'monotony',
    condition: '최근 7일 대표 카드에서 같은 트라이브가 3번',
    raised: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-01', { shape: 'poster', tribe_id: TRIBE_ID, resource: { sort_order: -1, cover_image_url: 'x' } }),
            homeItem('2026-10-02', { shape: 'hero', tribe_id: TRIBE_ID, resource: { sort_order: -1, cover_image_url: 'x' } }),
            homeItem('2026-10-03', { shape: 'poster', tribe_id: TRIBE_ID, resource: { sort_order: -1, cover_image_url: 'x' } }),
          ]),
        ],
      },
    }),
    clear: () => ({
      input: {
        bundles: [
          makeBundle([
            homeItem('2026-10-01', { shape: 'poster', tribe_id: TRIBE_ID, resource: { sort_order: -1, cover_image_url: 'x' } }),
            homeItem('2026-10-02', { shape: 'hero', tribe_id: TRIBE_ID, resource: { sort_order: -1, cover_image_url: 'x' } }),
          ]),
        ],
      },
    }),
  },
]

// 행동 횟수 급증(A10): 지표마다 최소 건수 경계와 배수 경계
const MIN_COUNT_ROWS: Row[] = ACTION_METRIC_KEYS.map((metric: ActionMetricKey) => {
  const min = DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES[ACTION_METRIC_MIN_KEYS[metric]]
  return {
    key: 'action_spike',
    condition: `${metric}: 최소 건수(${min}건) — 평소가 0건이어도 최소 건수에 닿으면 뜬다`,
    raised: () => ({ input: { actions: quietActions({ [metric]: { recent: min, baselineWeeklyAverage: 0 } }) } }),
    clear: () => ({ input: { actions: quietActions({ [metric]: { recent: min - 1, baselineWeeklyAverage: 0 } }) } }),
  }
})

const SPIKE_ROWS: Row[] = [
  ...MIN_COUNT_ROWS,
  {
    key: 'action_spike',
    condition: '픽업: 직전 주평균 15건 × 2배 = 30건(경계 포함)',
    raised: () => ({ input: { actions: quietActions({ pickup: { recent: 30, baselineWeeklyAverage: 15 } }) } }),
    clear: () => ({ input: { actions: quietActions({ pickup: { recent: 29, baselineWeeklyAverage: 15 } }) } }),
  },
  {
    key: 'action_spike',
    condition: '배수에 닿아도 최소 건수에 못 미치면 안 뜬다(믹스 시도 4건, 평소 주 1건)',
    raised: () => ({ input: { actions: quietActions({ mix_attempt: { recent: 5, baselineWeeklyAverage: 1 } }) } }),
    clear: () => ({ input: { actions: quietActions({ mix_attempt: { recent: 4, baselineWeeklyAverage: 1 } }) } }),
  },
]

describe('13종 조건 표 — 11종은 조건 값에서 뜨고 조건 직전 값에서는 뜨지 않는다', () => {
  for (const row of [...ROWS, ...SPIKE_ROWS]) {
    it(`${row.key} — ${row.condition}: 조건 값에서 뜬다`, () => {
      const result = outcome(row.raised(), row.key)
      expect(result.state, JSON.stringify(result.results)).toBe('raised')
      expect(result.results.length).toBeGreaterThan(0)
      expect(result.uncheckedReason).toBeNull()
    })

    it(`${row.key} — ${row.condition}: 직전 값에서는 안 뜬다`, () => {
      const result = outcome(row.clear(), row.key)
      expect(result.state, JSON.stringify(result.results)).toBe('clear')
      expect(result.results).toEqual([])
    })
  }

  it('기준 구성에서는 확인한 신호가 모두 안 뜬다(루틴 실패는 점검 전이라 확인 안 함)', () => {
    const result = run()
    const states = Object.fromEntries(result.signals.map((signal) => [signal.key, signal.state]))
    expect(states).toEqual({
      execution_failed: 'clear',
      missed_schedule: 'clear',
      routine_failed: 'unchecked',
      format_error: 'clear',
      empty_content: 'clear',
      no_new_content: 'clear',
      approval_deadline: 'clear',
      balance_warning: 'unchecked',
      excluded_items: 'clear',
      overlap: 'clear',
      monotony: 'clear',
      blocked_collection: 'unchecked',
      action_spike: 'clear',
    })
  })
})

describe('13종 조건 표 — 밸런스 경고·획득 경로가 막힌 컬렉션 2종은 「아직 확인하지 않아요」다', () => {
  it('어떤 재료를 줘도 계산 규칙 없음(not_built)이고 결과가 없다', () => {
    const scenarios: Scenario[] = [
      {},
      { input: { bundles: [makeBundle([statusItem({ status: 'failed' })])] } },
      { input: { cards: null, bundles: null, actions: null } },
      { options: { includeSample: true } },
    ]
    for (const scenario of scenarios) {
      for (const key of ['balance_warning', 'blocked_collection'] as const) {
        const result = outcome(scenario, key)
        expect(result.state).toBe('unchecked')
        expect(result.uncheckedReason).toBe('not_built')
        expect(result.results).toEqual([])
      }
    }
  })

  it('수준은 둘 다 주의·참고로 이름표대로다', () => {
    const levels = Object.fromEntries(run().signals.map((signal) => [signal.key, signal.level]))
    expect(levels.balance_warning).toBe('warn')
    expect(levels.blocked_collection).toBe('info')
  })
})

describe('루틴 실패 — 점검 시작 전', () => {
  it('점검 시작 시각이 없으면(기준값 기본) 「아직 확인하지 않아요」(not_started)다', () => {
    const result = outcome({}, 'routine_failed')
    expect(result.state).toBe('unchecked')
    expect(result.uncheckedReason).toBe('not_started')
  })

  it('점검 시작 시각이 아직 오지 않았어도 not_started다', () => {
    const result = outcome({ options: { thresholds: { routineCheckStartsAt: '2026-10-13T00:00:00+09:00' } } }, 'routine_failed')
    expect(result.state).toBe('unchecked')
    expect(result.uncheckedReason).toBe('not_started')
  })

  it('시작 시각보다 먼저 끝난 구간은 보지 않는다(월요일에 시작했는데 지난 화요일 마감을 탓하지 않는다)', () => {
    const result = outcome(
      { options: { now: new Date('2026-10-01T12:00:00+09:00'), thresholds: { routineCheckStartsAt: '2026-09-30T00:00:00+09:00' } } },
      'routine_failed'
    )
    // 이번 주 화요일 0시(9/29)는 시작(9/30)보다 앞이라 주간은 보지 않고, 이번 달 1일 0시(10/1)는 시작 뒤라 월간만 본다.
    expect(result.state).toBe('raised')
    expect(result.results.map((entry) => entry.message)).toEqual(['월간 루틴이 1일 12시까지 기획안을 내지 못했어요.'])
  })

  it('시험 묶음은 루틴이 낸 묶음으로 세지 않는다(시험 묶음 포함 스위치를 켜도)', () => {
    const sample = makeBundle([statusItem({ status: 'arrived' })], { isSample: true, receivedAt: kst('2026-09-29', '09:00') })
    const result = outcome(
      {
        input: { bundles: [sample] },
        options: {
          includeSample: true,
          now: new Date('2026-09-29T13:00:00+09:00'),
          thresholds: { routineCheckStartsAt: '2026-09-29T00:00:00+09:00' },
        },
      },
      'routine_failed'
    )
    expect(result.state).toBe('raised')
    expect(result.results[0].message).toBe('주간 루틴이 화요일 12시까지 기획안을 내지 못했어요.')
  })

  it('주간 묶음은 「패턴 제안」이 아닌 항목이 있어야 하고 월간 묶음은 「패턴 제안」 항목이 있어야 한다', () => {
    const onlyProposal = makeBundle([statusItem({ status: 'arrived', kind: 'pattern_proposal' })], { receivedAt: kst('2026-09-29', '09:00') })
    const weekly = outcome(
      {
        input: { bundles: [onlyProposal] },
        options: { now: new Date('2026-09-29T13:00:00+09:00'), thresholds: { routineCheckStartsAt: '2026-09-29T00:00:00+09:00' } },
      },
      'routine_failed'
    )
    expect(weekly.results.map((entry) => entry.message)).toEqual(['주간 루틴이 화요일 12시까지 기획안을 내지 못했어요.'])
  })
})

describe('신호 결과의 모양', () => {
  it('실행 실패 결과에는 날짜·묶음 ID·항목 ID가 실리고 시험 표식은 꺼져 있다', () => {
    const item = statusItem({ status: 'failed', updatedAt: kst('2026-09-30', '10:00') })
    const bundle = makeBundle([item])
    const result = outcome({ input: { bundles: [bundle] } }, 'execution_failed')
    expect(result.results).toEqual([
      {
        message: '드랍 일정 「' + item.itemKey + '」의 실행이 9/30(수) 10:00에 실패했어요.',
        date: '2026-09-30',
        bundleId: bundle.id,
        itemId: item.id,
        isSample: false,
      },
    ])
  })

  it('새 컨텐츠가 없는 날의 문장은 쉬운 해요체다', () => {
    const result = outcome(
      {
        input: {
          cards: [
            ...dropDay(base(), '2026-10-02', () => true),
            makeDayCard('2026-10-02', { startsAt: dayStart('2026-09-30'), endsAt: dayEnd('2026-10-04') }),
          ],
        },
      },
      'no_new_content'
    )
    expect(result.results.map((entry) => [entry.date, entry.message])).toEqual([
      ['2026-10-02', '10월 2일(금)에 새로 올라가는 카드가 없어요.'],
    ])
  })

  it('승인 마감 임박은 지난 항목에 「공개 시각이 지났는데」라고 말한다', () => {
    const result = outcome(
      { input: { bundles: [makeBundle([statusItem({ status: 'arrived', startsAt: kst('2026-09-30', '09:00') })])] } },
      'approval_deadline'
    )
    expect(result.results[0].message).toContain('공개 시각(9/30(수) 09:00)이 지났는데 아직 승인되지 않았어요.')
  })

  it('에이전트가 뺀 항목은 단계와 사유를 보이고, 읽을 수 없으면 읽지 못했다고 말한다', () => {
    const matched = statusItem({ status: 'arrived', itemKey: 'card-7' })
    const listed = makeBundle([matched], {
      raw: { excluded_items: [{ reason: '  세계관 검수에서 걸렸어요  ', item_key: 'card-7', stage: 'world_review' }] },
    })
    const unreadable = makeBundle([statusItem({ status: 'arrived' })], { week: '2026-W41', raw: null })
    const result = outcome({ input: { bundles: [listed, unreadable] } }, 'excluded_items')
    expect(result.results[0]).toMatchObject({
      message: '세계관 검수에서 에이전트가 항목을 뺐어요 (항목 card-7). 사유: 세계관 검수에서 걸렸어요',
      bundleId: listed.id,
      itemId: matched.id,
    })
    expect(result.results[1].message).toBe('2026-W41 묶음의 뺀 항목 목록을 읽지 못했어요.')
  })

  it('겹침 문장에 패턴과 건수가 들어간다', () => {
    const result = outcome(
      {
        input: {
          bundles: [
            makeBundle([
              homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
              homeItem('2026-10-02', { shape: 'brief', exposure_tags: ['x'] }, { patternNo: 'P1' }),
            ]),
          ],
        },
      },
      'overlap'
    )
    expect(result.results.map((entry) => entry.message)).toEqual(['10월 2일(금)에 같은 패턴(P1)의 항목이 2건 겹쳐요.'])
  })

  it('단조로운 흐름은 같은 값을 한 번만 알린다(검사 날짜가 여러 날이어도)', () => {
    const result = outcome(
      { input: { cards: withRepShapes(base(), { '2026-10-01': 'hero', '2026-10-02': 'hero', '2026-10-03': 'hero', '2026-10-04': 'hero' }) } },
      'monotony'
    )
    expect(result.results.map((entry) => entry.message)).toEqual([
      '같은 모양(hero)이 4일 연속 대표 카드예요. (10월 1일(목)~10월 4일(일))',
    ])
    // 날짜는 연속이 3일째가 되는 검사 날짜다(10/1·10/2·10/3 → 10/3).
    expect(result.results[0].date).toBe('2026-10-03')
  })

  it('행동 횟수 급증 문장은 건수와 평소 대비 배수를 말한다', () => {
    const result = outcome({ input: { actions: quietActions({ pickup: { recent: 60, baselineWeeklyAverage: 20 } }) } }, 'action_spike')
    expect(result.results.map((entry) => entry.message)).toEqual(['픽업: 최근 7일 60건으로, 직전 4주 평균(주 20건)의 3배예요.'])
    expect(result.results[0].date).toBeNull()
  })

  it('결과는 날짜 순이고 날짜가 없는 결과는 뒤에 온다', () => {
    const result = outcome(
      { input: { cards: dropDay(dropDay(base(), '2026-10-03', (card) => card.sortOrder === 2), '2026-10-02', (card) => card.sortOrder === 2) } },
      'empty_content'
    )
    expect(result.results.map((entry) => entry.date)).toEqual(['2026-10-02', '2026-10-03'])
  })
})

describe('이름표 순서', () => {
  it('신호 13종이 늘 같은 순서로 나온다', () => {
    expect(run().signals.map((signal) => signal.key)).toEqual(OPS_SIGNAL_CATALOG.map((definition) => definition.key))
  })
})
