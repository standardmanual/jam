/**
 * lib/capsule/sync-auto-fill — 동기화 안의 캡슐 자동 채움 단계 (티켓 20261028_1733 3회)
 *
 * 고정하는 것:
 * - 자동 채움은 열기마다의 챕터 배지 판정을 건너뛰라는 옵션(`skipRiseBadgeEvaluation`)을 켜서 부른다(동기화 끝 판정이 이어서 읽는다).
 * - 열린 캡슐이 있으면 `capsule_unseen_results`에 한 동기화당 한 건, `payload.events`가 열린 순서 그대로다. 열린 게 없으면 한 건도 남기지 않는다
 *   (같은 동기화를 다시 보내면 지갑이 비어 열린 게 없다).
 * - 기록이 실패(오류·예외)해도 던지지 않고 `unseenRecorded: false`로 알린다. 자동 채움이 실패(`stopped: 'error'`)해도 던지지 않고, 그때까지 열린 것은 기록한다.
 * - 동기화(`lib/strava/sync.ts`) 연결(소스 검색): 정산 직후 한 번 부르고, 열린 것이 있을 때만 끝 판정에 캡슐 열기 지표를 더한다.
 * - 캡슐 소식(티켓 20261028_1734 3회): 보류가 1에서 2가 된 동기화(`blockedNow`)는 `capsule_jam_blocked` 한 건만 보내고 단계 알림은 보내지 않는다. 아니면 DB가 돌려준 단계(`alerts`)마다
 *   `capsule_nearly_full`을 묶음 키 없이 보낸다. 둘 다 없으면 아무것도 보내지 않는다. 발송이 실패(null·예외)해도 던지지 않고 동기화를 막지 않는다. 받는 사람은 본인뿐이다.
 * - 챕터 오름(`chapterRose`): 열기 없이 보류만 생긴 동기화의 오름도 참이다(새 활동이 없는 경로가 `chapter_reached`를 끝 판정에 더한다).
 * 공용 DB는 호출하지 않는다 — 가짜 자동 채움과 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/sync-auto-fill.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const autoFillMock = vi.hoisted(() => vi.fn())
vi.mock('../auto-fill', () => ({ runCapsuleAutoFill: (...args: unknown[]) => autoFillMock(...args) }))
const createNotificationMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/notifications', () => ({ createNotification: (...args: unknown[]) => createNotificationMock(...args) }))

import { buildCapsuleUnseenPayload, notifyCapsuleAlerts, recordUnseenCapsuleResult, runSyncCapsuleAutoFill } from '../sync-auto-fill'
import type { CountedCapsuleOpenPayload } from '../open'

const opened = (n: number, extra: Partial<CountedCapsuleOpenPayload> = {}): CountedCapsuleOpenPayload => ({
  openId: `open-${n}`,
  items: [],
  next: { required: 145, filled: 0 },
  chapterNo: 1,
  reachedChapters: [],
  chapterCount: n,
  ...extra,
})

const fillResult = (opens: CountedCapsuleOpenPayload[], extra: Record<string, unknown> = {}) => ({
  filledAmount: 0,
  opens,
  holds: [],
  forfeitedTotal: 0,
  alerts: [],
  blockedNow: false,
  reachedChapters: [],
  rounds: opens.length + 1,
  stopped: 'wallet_empty',
  ...extra,
})

/** `capsule_unseen_results.insert`만 받는 가짜 */
function fakeClient(result: { error?: { message: string } | null; throws?: boolean } = {}) {
  const rows: unknown[] = []
  const insert = vi.fn(async (row: unknown) => {
    rows.push(row)
    if (result.throws) throw new Error('network')
    return { error: result.error ?? null }
  })
  const from = vi.fn((table: string) => {
    if (table !== 'capsule_unseen_results') throw new Error(`예상하지 못한 테이블 ${table}`)
    return { insert }
  })
  return { client: { from } as unknown as SupabaseClient, insert, from }
}

beforeEach(() => {
  autoFillMock.mockReset()
  createNotificationMock.mockReset()
  createNotificationMock.mockResolvedValue({ id: 'n-1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('buildCapsuleUnseenPayload', () => {
  it('열린 순서 그대로 이벤트를 만들고 챕터 횟수·오름을 담는다', () => {
    const payload = buildCapsuleUnseenPayload([opened(1), opened(2, { chapterNo: 3, reachedChapters: [4], chapterCount: 0 })])

    expect(payload.version).toBe(1)
    expect(payload.events.map((e) => e.openId)).toEqual(['open-1', 'open-2'])
    expect(payload.events[1]).toMatchObject({ chapterNo: 3, reachedChapters: [4], chapterCount: 0, next: { required: 145, filled: 0 } })
  })
})

describe('recordUnseenCapsuleResult', () => {
  it('열린 캡슐이 있으면 한 건을 남긴다 — user_id와 payload', async () => {
    const { client, insert } = fakeClient()

    const ok = await recordUnseenCapsuleResult(client, USER_ID, [opened(1), opened(2), opened(3)])

    expect(ok).toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
    const row = insert.mock.calls[0][0] as { user_id: string; payload: { events: { openId: string }[] } }
    expect(row.user_id).toBe(USER_ID)
    expect(row.payload.events.map((e) => e.openId)).toEqual(['open-1', 'open-2', 'open-3'])
  })

  it('열린 캡슐이 없으면 아무것도 쓰지 않는다', async () => {
    const { client, from } = fakeClient()

    await expect(recordUnseenCapsuleResult(client, USER_ID, [])).resolves.toBe(true)

    expect(from).not.toHaveBeenCalled()
  })

  it('DB 오류·예외에도 던지지 않고 false를 돌려준다', async () => {
    await expect(recordUnseenCapsuleResult(fakeClient({ error: { message: 'boom' } }).client, USER_ID, [opened(1)])).resolves.toBe(false)
    await expect(recordUnseenCapsuleResult(fakeClient({ throws: true }).client, USER_ID, [opened(1)])).resolves.toBe(false)
  })
})

describe('runSyncCapsuleAutoFill', () => {
  it('챕터 배지 판정 생략 옵션을 켜서 자동 채움을 부르고, 열린 것이 있으면 한 건을 남긴다', async () => {
    autoFillMock.mockResolvedValue(fillResult([opened(1), opened(2)]))
    const { client, insert } = fakeClient()

    const result = await runSyncCapsuleAutoFill(client, USER_ID)

    expect(autoFillMock).toHaveBeenCalledWith(client, USER_ID, expect.objectContaining({ skipRiseBadgeEvaluation: true }))
    expect(insert).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ opened: true, unseenRecorded: true })
    expect(result.autoFill.opens).toHaveLength(2)
  })

  it('같은 동기화를 다시 보내 열린 게 없으면 기록도 없다(opened false)', async () => {
    autoFillMock.mockResolvedValue(fillResult([]))
    const { client, insert } = fakeClient()

    const result = await runSyncCapsuleAutoFill(client, USER_ID)

    expect(insert).not.toHaveBeenCalled()
    expect(result).toMatchObject({ opened: false, unseenRecorded: true })
  })

  it('자동 채움이 중간에 실패해도 던지지 않고 그때까지 열린 것은 기록한다', async () => {
    autoFillMock.mockResolvedValue(fillResult([opened(1)], { stopped: 'error', error: new Error('중간 실패') }))
    const { client, insert } = fakeClient()

    const result = await runSyncCapsuleAutoFill(client, USER_ID)

    expect(insert).toHaveBeenCalledTimes(1)
    expect(result.autoFill.stopped).toBe('error')
    expect(result.opened).toBe(true)
  })

  it('기록이 실패해도 던지지 않고 unseenRecorded가 false다', async () => {
    autoFillMock.mockResolvedValue(fillResult([opened(1)]))

    const result = await runSyncCapsuleAutoFill(fakeClient({ error: { message: 'boom' } }).client, USER_ID)

    expect(result).toMatchObject({ opened: true, unseenRecorded: false })
  })
})

describe('notifyCapsuleAlerts — 캡슐 소식 (티켓 20261028_1734 3회)', () => {
  it('보류가 1에서 2가 된 동기화(blockedNow)는 capsule_jam_blocked 한 건만 보내고 단계 알림은 보내지 않는다', async () => {
    const sent = await notifyCapsuleAlerts(USER_ID, { blockedNow: true, alerts: [70, 80] })

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith({ userId: USER_ID, type: 'capsule_jam_blocked', payload: {} })
    expect(sent).toEqual({ jamBlocked: true, nearlyFullStages: [] })
  })

  it('blockedNow가 아니면 alerts의 단계마다 capsule_nearly_full을 보낸다 — 단계가 payload.stage에 실린다', async () => {
    const sent = await notifyCapsuleAlerts(USER_ID, { blockedNow: false, alerts: [70, 90] })

    expect(createNotificationMock).toHaveBeenCalledTimes(2)
    expect(createNotificationMock).toHaveBeenNthCalledWith(1, { userId: USER_ID, type: 'capsule_nearly_full', payload: { stage: 70 } })
    expect(createNotificationMock).toHaveBeenNthCalledWith(2, { userId: USER_ID, type: 'capsule_nearly_full', payload: { stage: 90 } })
    expect(sent).toEqual({ jamBlocked: false, nearlyFullStages: [70, 90] })
  })

  it('묶음 키를 넘기지 않는다 — 중복 방지는 DB(alert_stage, 1→2 전환)가 하므로 매번 새 행이다', async () => {
    await notifyCapsuleAlerts(USER_ID, { blockedNow: false, alerts: [80] })
    await notifyCapsuleAlerts(USER_ID, { blockedNow: true, alerts: [] })

    for (const [input] of createNotificationMock.mock.calls) {
      expect(input).not.toHaveProperty('groupKey')
      expect(input).not.toHaveProperty('mode')
    }
  })

  it('단계 하나는 소식 한 건이다 — 건너뛰어 가장 높은 단계 하나만 온 경우도 한 건', async () => {
    await notifyCapsuleAlerts(USER_ID, { blockedNow: false, alerts: [80] })
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('blockedNow도 alerts도 없으면 아무것도 보내지 않는다', async () => {
    const sent = await notifyCapsuleAlerts(USER_ID, { blockedNow: false, alerts: [] })

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(sent).toEqual({ jamBlocked: false, nearlyFullStages: [] })
  })

  it('70·80·90이 아닌 단계는 보내지 않는다', async () => {
    await notifyCapsuleAlerts(USER_ID, { blockedNow: false, alerts: [50, 100, 70] })

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ payload: { stage: 70 } }))
  })

  it('createNotification이 null을 돌려줘도(발송 실패) 던지지 않고, 성공한 것만 센다', async () => {
    createNotificationMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'n-2' })

    const sent = await notifyCapsuleAlerts(USER_ID, { blockedNow: false, alerts: [70, 80] })

    expect(sent).toEqual({ jamBlocked: false, nearlyFullStages: [80] })
    expect(console.error).toHaveBeenCalled()
  })

  it('createNotification이 던져도 삼킨다', async () => {
    createNotificationMock.mockRejectedValue(new Error('rpc 장애'))

    await expect(notifyCapsuleAlerts(USER_ID, { blockedNow: true, alerts: [] })).resolves.toEqual({ jamBlocked: false, nearlyFullStages: [] })
  })
})

describe('runSyncCapsuleAutoFill — 소식과 챕터 오름', () => {
  it('자동 채움 결과의 blockedNow·alerts로 본인에게 소식을 보낸다', async () => {
    autoFillMock.mockResolvedValue(fillResult([], { blockedNow: true, alerts: [70] }))

    await runSyncCapsuleAutoFill(fakeClient().client, USER_ID)

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, type: 'capsule_jam_blocked' }))
  })

  it('같은 동기화를 다시 보내 alerts·blockedNow가 비면 소식도 없다 — 단계 중복은 DB가 막는다', async () => {
    autoFillMock.mockResolvedValue(fillResult([], { blockedNow: false, alerts: [] }))

    await runSyncCapsuleAutoFill(fakeClient().client, USER_ID)

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('소식 발송이 실패해도 던지지 않고 동기화 결과와 보지 않은 결과 기록은 그대로다', async () => {
    createNotificationMock.mockRejectedValue(new Error('rpc 장애'))
    autoFillMock.mockResolvedValue(fillResult([opened(1)], { alerts: [90] }))
    const { client, insert } = fakeClient()

    const result = await runSyncCapsuleAutoFill(client, USER_ID)

    expect(insert).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ opened: true, unseenRecorded: true })
  })

  it('chapterRose: 오른 챕터가 있으면 참이고, 열기 없이 보류만 생긴 오름도 참이다', async () => {
    autoFillMock.mockResolvedValue(fillResult([], { reachedChapters: [3], holds: [{ slot: 1, pendingCount: 1, blockedNow: false, chapterNo: 2 }] }))

    const result = await runSyncCapsuleAutoFill(fakeClient().client, USER_ID)

    expect(result).toMatchObject({ opened: false, chapterRose: true })
  })

  it('chapterRose: 오른 챕터가 없으면 거짓이다', async () => {
    autoFillMock.mockResolvedValue(fillResult([opened(1)]))

    const result = await runSyncCapsuleAutoFill(fakeClient().client, USER_ID)

    expect(result).toMatchObject({ opened: true, chapterRose: false })
  })
})

describe('runSyncCapsuleAutoFill — 재진입으로 건너뛴 호출 (busy, 티켓 20261028_1735 2회)', () => {
  it('안쪽 호출이 건너뛰었다(busy)는 사실은 기록도 소식도 만들지 않고, 열림·오름도 없다', async () => {
    autoFillMock.mockResolvedValue(fillResult([], { stopped: 'busy', rounds: 0 }))
    const { client, insert } = fakeClient()

    const result = await runSyncCapsuleAutoFill(client, USER_ID)

    expect(insert).not.toHaveBeenCalled()
    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ opened: false, chapterRose: false, unseenRecorded: true })
  })
})

describe('동기화 연결 (소스 검색)', () => {
  const source = readFileSync(path.resolve(__dirname, '../../strava/sync.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('runSyncCapsuleAutoFill을 두 곳에서 부른다: 새 활동이 없는 이른 반환 경로와, 잼 정산(settleActivities) 뒤 아이템 배지 발급(issueSyncItemBadges) 앞', () => {
    expect(source.match(/runSyncCapsuleAutoFill\(/g)).toHaveLength(2)
    const settle = source.indexOf('await settleActivities(')
    const fill = source.lastIndexOf('await runSyncCapsuleAutoFill(')
    const issue = source.indexOf('await issueSyncItemBadges(')
    expect(settle).toBeGreaterThan(-1)
    expect(fill).toBeGreaterThan(settle)
    expect(issue).toBeGreaterThan(fill)
  })

  it('열린 캡슐이 있을 때만 끝 판정에 jamTriggersForCapsuleOpen()을 더한다', () => {
    expect(source).toMatch(/capsuleStep\.opened\s*\?\s*\[\.\.\.JAM_SYNC_TRIGGERS,\s*\.\.\.jamTriggersForCapsuleOpen\(\)\]\s*:\s*JAM_SYNC_TRIGGERS/)
  })

  it('새 활동이 없는 이른 반환 경로도 자동 채움을 돌리고, 열렸거나 챕터가 올랐으면 챕터 오름을, 열렸으면 캡슐 열기 지표를 함께 판정한다', () => {
    const start = source.indexOf('async function evaluateWithoutNewActivities(')
    const end = source.indexOf('export async function processFetchedActivities(')
    const idle = source.slice(start, end)
    expect(idle).toContain('await runSyncCapsuleAutoFill(')
    // 챕터 오름은 열기 없이 보류만 생겨도 판정한다(`chapterRose`). 캡슐 열기 지표는 열렸을 때만 더한다
    expect(idle).toMatch(/capsuleStep\.opened\s*\|\|\s*capsuleStep\.chapterRose\s*\?\s*\(\['chapter_reached'\] as const\)\s*:\s*\[\]/)
    expect(idle).toMatch(/capsuleStep\.opened\s*\?\s*jamTriggersForCapsuleOpen\(\)\s*:\s*\[\]/)
  })
})
