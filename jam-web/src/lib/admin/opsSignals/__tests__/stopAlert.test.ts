/**
 * 중단 신호 매시 점검 (티켓 20261001_1154)
 *
 * 신호 계산은 진짜 규칙(`computeOpsSignals`)으로 하고 조회(`loadOpsSignals`)와 슬랙 게시(`postOpsSlack`)만 가짜로 바꾼다. 지키는 것:
 * - 한 시간 창은 (끝 − 60분, 끝]이고 끝은 정시 + 5분 슬롯이다. 호출이 몇 분 늦어도 이웃한 창이 겹치거나 비지 않는다
 * - 창 안에서 새로 걸린 예약 누락·루틴 실패는 한 번 알리고, 창 밖이거나 이미 지난 창에서 걸린 것은 알리지 않는다
 * - 시험 묶음·실행 실패·「아직 확인하지 않아요」(`not_started`)는 알리지 않는다
 * - S7에서 바꾼 `missedScheduleMinutes`가 시작 시각에 반영된다
 * - 한 회차에 글은 한 건이다. 슬랙 값이 없으면 던지지 않고 건너뛰며 로그를 남긴다
 * - 묶음을 읽지 못하면 글을 올리지 않고 `load_failed`다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsSignals/__tests__/stopAlert.test.ts
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { OpsSignalOutcome, OpsSignalResult } from '@/lib/admin/opsSignals/catalog'
import { makeSignalResult } from '@/lib/admin/opsSignals/catalog'
import type { SignalBundleInput, SignalBundleItemInput } from '@/lib/admin/opsSignals/composition'
import { computeOpsSignals } from '@/lib/admin/opsSignals/compute'
import type { OpsSignalThresholdValues } from '@/lib/admin/opsSignals/thresholds'
import { kst, makeBundle, makeItem } from './fixtures'

const h = vi.hoisted(() => ({
  bundles: [] as SignalBundleInput[] | null,
  thresholds: {} as Partial<OpsSignalThresholdValues>,
  load: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/admin/opsSignals/load', () => ({ loadOpsSignals: (...args: unknown[]) => h.load(...args) }))
vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: (...args: unknown[]) => h.post(...args) }
})

const { STOP_CHECK_SLOT_MINUTE, hourlyWindow, pickNewStopResults, runStopSignalCheck } = await import('../stopAlert')

const ROUTINE_START = { routineCheckStartsAt: '2026-09-29T00:00:00+09:00' }
/** 주간 루틴 구간(화요일 0시) 전에 받은 묶음이라 루틴이 낸 묶음으로 세지 않는다. */
const BEFORE_TUESDAY = kst('2026-09-28', '10:00')

/** 상태·시각만 중요한 항목(날짜 구성에 들어가지 않는 드랍 일정 종류). */
function statusItem(over: Partial<SignalBundleItemInput> = {}): SignalBundleItemInput {
  return makeItem({ kind: 'drop_schedule', startsAt: null, endsAt: null, original: {}, ...over })
}

/** 공개 시각이 `time`(2026-10-01, KST)인 「예약됨」 항목. 예약 누락은 공개 시각 + 30분(기본)에 걸린다. */
function scheduledAt(time: string, over: Partial<SignalBundleItemInput> = {}): SignalBundleItemInput {
  return statusItem({ status: 'scheduled', startsAt: kst('2026-10-01', time), ...over })
}

/** 오늘(2026-10-01) 시각을 KST로 적은 `Date`. */
const at = (time: string) => new Date(kst('2026-10-01', time))

beforeEach(() => {
  h.bundles = []
  h.thresholds = {}
  h.load.mockReset().mockImplementation(async (options: { now: Date; includeSample?: boolean }) => ({
    ...computeOpsSignals(
      { cards: [], missions: [], bundles: h.bundles, actions: null },
      { now: options.now, includeSample: options.includeSample, thresholds: h.thresholds }
    ),
    sourceErrors: {},
  }))
  h.post.mockReset().mockResolvedValue({ ok: true })
  vi.spyOn(console, 'warn').mockImplementation(() => {}).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('hourlyWindow — 끝은 정시 + 5분 슬롯이고 창은 (끝 − 60분, 끝]이다', () => {
  const endOf = (time: string) => new Date(hourlyWindow(at(time)).endMs).toISOString()
  const utc = (hhmm: string) => `2026-10-01T${hhmm}:00.000Z`

  it('슬롯 시각(정시 + 5분) 그대로 도는 호출은 그 슬롯이 끝이다', () => {
    expect(STOP_CHECK_SLOT_MINUTE).toBe(5)
    expect(endOf('12:05')).toBe(utc('03:05'))
  })

  it('호출이 7분 늦어도(12:12) 같은 창이다. 정시 직후(13:00)도 앞 슬롯이 끝이다', () => {
    expect(endOf('12:12')).toBe(endOf('12:05'))
    expect(endOf('12:59')).toBe(endOf('12:05'))
    expect(endOf('13:00')).toBe(endOf('12:05'))
  })

  it('슬롯보다 이르면(12:04) 한 시간 앞 슬롯이 끝이다', () => {
    expect(endOf('12:04')).toBe(endOf('11:05'))
  })

  it('이웃한 두 창이 겹치지도 비지도 않는다', () => {
    const a = hourlyWindow(at('12:05'))
    const b = hourlyWindow(at('13:05'))
    expect(a.endMs).toBe(b.startMs)
    expect(a.endMs - a.startMs).toBe(3600_000)
  })

  it('UTC 정시가 아니어도 분 단위로 맞는다(KST는 UTC + 9시간이라 같은 슬롯이다)', () => {
    const window = hourlyWindow(new Date('2026-10-01T03:06:30.000Z'))
    expect(new Date(window.endMs).toISOString()).toBe('2026-10-01T03:05:00.000Z')
    expect(new Date(window.startMs).toISOString()).toBe('2026-10-01T02:05:00.000Z')
  })
})

describe('창 경계 — 예약 누락의 시작 시각은 공개 시각 + 30분이다', () => {
  // 12:05에 도는 점검의 창은 (11:05, 12:05]다.
  const check = async (items: SignalBundleItemInput[], when = at('12:05')) => {
    h.bundles = [makeBundle(items)]
    return runStopSignalCheck({ now: when })
  }

  it('창 안에서 새로 걸린 것은 한 번 알린다', async () => {
    const result = await check([scheduledAt('11:00')]) // 시작 11:30
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 1, routineFailed: 0 }, post: 'sent' })
    expect(h.post).toHaveBeenCalledTimes(1)
    expect(h.post.mock.calls[0][0]).toBe('alert')
    expect(h.post.mock.calls[0][1]).toContain('중단 신호가 새로 걸렸어요 · 예약 누락 1건')
  })

  it('시작 시각이 창 시작과 같으면(11:05) 알리지 않는다 — 앞 창이 이미 알렸다', async () => {
    const result = await check([scheduledAt('10:35')]) // 시작 11:05
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
  })

  it('시작 시각이 창 시작 바로 뒤(11:06)면 알린다', async () => {
    const result = await check([scheduledAt('10:36')])
    expect(result).toMatchObject({ ok: true, counts: { missedSchedule: 1 }, post: 'sent' })
  })

  it('시작 시각이 창 끝과 같으면(12:05) 알린다', async () => {
    const result = await check([scheduledAt('11:35')])
    expect(result).toMatchObject({ ok: true, counts: { missedSchedule: 1 }, post: 'sent' })
  })

  it('이미 지난 창에서 걸린 것은 알리지 않는다(10시에 걸린 것은 그때 알렸다)', async () => {
    const result = await check([scheduledAt('09:30')])
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
  })

  it('아직 걸리지 않은 것(시작 시각이 지금보다 뒤)은 알리지 않는다', async () => {
    const result = await check([scheduledAt('11:50')]) // 시작 12:20
    expect(result).toMatchObject({ counts: { missedSchedule: 0 }, post: 'none' })
  })

  it('걸린 것이 없으면 글을 올리지 않는다', async () => {
    const result = await check([])
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
  })

  it('호출이 7분 늦어도(12:12) 같은 창이라 한 번만 알리고, 그 사이에 걸린 것은 다음 창이 맡는다', async () => {
    const items = [scheduledAt('11:00'), scheduledAt('11:38')] // 시작 11:30(창 안), 12:08(12:05 이후)
    const late = await check(items, at('12:12'))
    expect(late).toMatchObject({ counts: { missedSchedule: 1 }, post: 'sent' })
    expect(h.post.mock.calls[0][1]).toContain('예약 누락 1건')

    h.post.mockClear()
    const next = await check(items, at('13:05'))
    expect(next).toMatchObject({ counts: { missedSchedule: 1 }, post: 'sent' }) // 12:08에 걸린 것만(11:30에 걸린 것은 앞 창이 알렸다)
  })

  it('S7에서 바꾼 예약 누락 기준 분이 시작 시각에 반영된다', async () => {
    // 11:05에 도는 점검의 창은 (10:05, 11:05]다. 공개 시각 10:40의 시작은 기본(30분)이면 11:10, 10분으로 바꿨으면 10:50이다.
    h.bundles = [makeBundle([scheduledAt('10:40')])]
    const byDefault = await runStopSignalCheck({ now: at('11:05') })
    expect(byDefault).toMatchObject({ counts: { missedSchedule: 0 }, post: 'none' })

    h.thresholds = { missedScheduleMinutes: 10 }
    const changed = await runStopSignalCheck({ now: at('11:05') })
    expect(changed).toMatchObject({ counts: { missedSchedule: 1 }, post: 'sent' })
  })

  it('「준비중」 항목도 걸리면 알린다. 이미 게재중인 항목은 안 걸린다', async () => {
    const result = await check([scheduledAt('11:00', { status: 'preparing' }), scheduledAt('11:00', { status: 'live' })])
    expect(result).toMatchObject({ counts: { missedSchedule: 1 }, post: 'sent' })
  })
})

describe('루틴 실패 — 시작 시각은 마감 시각이다', () => {
  // 주간 마감은 화요일(2026-09-29) 12:00이다.
  const tuesday = (time: string) => new Date(kst('2026-09-29', time))

  it('마감이 창 안에 있으면 한 번 알리고, 다음 창에서는 다시 알리지 않는다', async () => {
    h.thresholds = ROUTINE_START
    const first = await runStopSignalCheck({ now: tuesday('12:05') }) // 창 (11:05, 12:05]
    expect(first).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 1 }, post: 'sent' })
    expect(h.post.mock.calls[0][1]).toContain('루틴 실패 1건')

    h.post.mockClear()
    const second = await runStopSignalCheck({ now: tuesday('13:05') }) // 창 (12:05, 13:05]
    expect(second).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
  })

  it('마감 전에는 알리지 않는다', async () => {
    h.thresholds = ROUTINE_START
    const result = await runStopSignalCheck({ now: tuesday('11:05') })
    expect(result).toMatchObject({ counts: { routineFailed: 0 }, post: 'none' })
  })

  it('점검 시작 시각이 정해지기 전(`not_started`)은 알리지 않고 실패도 아니다', async () => {
    h.thresholds = {}
    const result = await runStopSignalCheck({ now: tuesday('12:05') })
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
  })
})

describe('알리지 않는 것', () => {
  it('시험 묶음은 알리지 않는다', async () => {
    h.bundles = [makeBundle([scheduledAt('11:00')], { isSample: true })]
    const result = await runStopSignalCheck({ now: at('12:05') })
    expect(result).toMatchObject({ counts: { missedSchedule: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
    expect(h.load).toHaveBeenCalledWith(expect.objectContaining({ includeSample: false }))
  })

  it('시험 묶음 표식이 붙은 결과는 계산이 넘겨도 한 번 더 거른다', () => {
    const sample = makeSignalResult('시험 묶음의 결과', { isSample: true, onsetAt: '2026-10-01T03:00:00.000Z' })
    const real = makeSignalResult('실제 결과', { onsetAt: '2026-10-01T03:00:00.000Z' })
    const signals: OpsSignalOutcome[] = [
      { key: 'missed_schedule', name: '예약 누락', level: 'stop', state: 'raised', uncheckedReason: null, results: [sample, real] },
    ]
    const picked = pickNewStopResults(signals, hourlyWindow(new Date('2026-10-01T03:05:00.000Z')))
    expect(picked.map((entry) => entry.results.map((result) => result.message))).toEqual([['실제 결과']])
  })

  it('실행 실패는 알리지 않는다(상태 맞추기와 예약 등록이 따로 알린다)', async () => {
    h.bundles = [makeBundle([statusItem({ status: 'failed', updatedAt: kst('2026-10-01', '11:30') })])]
    const result = await runStopSignalCheck({ now: at('12:05') })
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
  })

  it('실행 실패가 중단 수준이어도 고르는 함수가 뺀다', () => {
    const failed: OpsSignalResult = makeSignalResult('실행 실패', { onsetAt: '2026-10-01T03:00:00.000Z' })
    const signals: OpsSignalOutcome[] = [
      { key: 'execution_failed', name: '실행 실패', level: 'stop', state: 'raised', uncheckedReason: null, results: [failed] },
    ]
    expect(pickNewStopResults(signals, hourlyWindow(new Date('2026-10-01T03:05:00.000Z')))).toEqual([])
  })

  it('중단이 아닌 수준(주의·참고)과 시작 시각이 없는 결과는 고르지 않는다', () => {
    const inWindow = makeSignalResult('주의 결과', { onsetAt: '2026-10-01T03:00:00.000Z' })
    const noOnset = makeSignalResult('시작 시각이 없는 결과')
    const signals: OpsSignalOutcome[] = [
      { key: 'format_error', name: '형식 오류', level: 'warn', state: 'raised', uncheckedReason: null, results: [inWindow] },
      { key: 'routine_failed', name: '루틴 실패', level: 'stop', state: 'raised', uncheckedReason: null, results: [noOnset] },
    ]
    expect(pickNewStopResults(signals, hourlyWindow(new Date('2026-10-01T03:05:00.000Z')))).toEqual([])
  })
})

describe('회차당 한 건', () => {
  it('걸린 것이 여럿이어도(예약 누락 3건과 루틴 실패 1건) 글은 한 건이다', async () => {
    h.thresholds = ROUTINE_START
    h.bundles = [
      makeBundle(
        [
          scheduledAt('11:00', { startsAt: kst('2026-09-29', '11:20') }),
          scheduledAt('11:00', { startsAt: kst('2026-09-29', '11:25') }),
          scheduledAt('11:00', { startsAt: kst('2026-09-29', '11:30') }),
        ],
        { receivedAt: BEFORE_TUESDAY }
      ),
    ]
    // 화요일 12:35에 도는 점검의 창은 (11:35, 12:35]다. 예약 누락은 공개 시각 + 30분 = 11:50~12:00, 루틴 실패는 12:00이다.
    const result = await runStopSignalCheck({ now: new Date(kst('2026-09-29', '12:35')) })
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 3, routineFailed: 1 }, post: 'sent' })
    expect(h.post).toHaveBeenCalledTimes(1)
    expect(h.post.mock.calls[0][1]).toContain('예약 누락 3건, 루틴 실패 1건')
  })

  it('예약 누락 알림을 건너뛰라고 하면(상태 맞추기 실패) 루틴 실패만 알린다', async () => {
    h.thresholds = ROUTINE_START
    h.bundles = [makeBundle([scheduledAt('11:00', { startsAt: kst('2026-09-29', '11:20') })], { receivedAt: BEFORE_TUESDAY })]
    const result = await runStopSignalCheck({ now: new Date(kst('2026-09-29', '12:35')), skipMissedSchedule: true })
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 1 }, post: 'sent' })
    expect(h.post.mock.calls[0][1]).toContain('루틴 실패 1건')
    expect(h.post.mock.calls[0][1]).not.toContain('예약 누락')
  })

  it('건너뛰라고 해도 걸린 것이 예약 누락뿐이면 글을 올리지 않는다', async () => {
    h.bundles = [makeBundle([scheduledAt('11:00')])]
    const result = await runStopSignalCheck({ now: at('12:05'), skipMissedSchedule: true })
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 0, routineFailed: 0 }, post: 'none' })
    expect(h.post).not.toHaveBeenCalled()
  })
})

describe('슬랙과 조회가 안 될 때', () => {
  it('슬랙 값이 없으면(not_configured) 던지지 않고 건너뛰며 로그를 남긴다', async () => {
    h.bundles = [makeBundle([scheduledAt('11:00')])]
    h.post.mockResolvedValue({ ok: false, error: 'not_configured' })
    const result = await runStopSignalCheck({ now: at('12:05') })
    expect(result).toEqual({ ok: true, counts: { missedSchedule: 1, routineFailed: 0 }, post: 'not_configured' })
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('슬랙이 오류로 답하면 slack_failed이고 오류 이름만 로그에 남긴다', async () => {
    h.bundles = [makeBundle([scheduledAt('11:00')])]
    h.post.mockResolvedValue({ ok: false, error: 'http_503' })
    const result = await runStopSignalCheck({ now: at('12:05') })
    expect(result).toEqual({ ok: false, error: 'slack_failed', counts: { missedSchedule: 1, routineFailed: 0 } })
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain('http_503')
  })

  it('묶음을 읽지 못하면(load_failed) 글을 올리지 않고 로그만 남긴다', async () => {
    h.bundles = null
    const result = await runStopSignalCheck({ now: at('12:05') })
    expect(result).toEqual({ ok: false, error: 'load_failed', counts: { missedSchedule: 0, routineFailed: 0 } })
    expect(h.post).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('신호 계산이 던져도 던지지 않고 load_failed다', async () => {
    h.load.mockRejectedValue(new Error('db down'))
    const result = await runStopSignalCheck({ now: at('12:05') })
    expect(result).toMatchObject({ ok: false, error: 'load_failed' })
    expect(h.post).not.toHaveBeenCalled()
  })
})
