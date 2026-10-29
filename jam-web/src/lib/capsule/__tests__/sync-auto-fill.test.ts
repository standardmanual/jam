/**
 * lib/capsule/sync-auto-fill — 동기화 안의 캡슐 자동 채움 단계 (티켓 20261028_1733 3회)
 *
 * 고정하는 것:
 * - 자동 채움은 열기마다의 챕터 배지 판정을 건너뛰라는 옵션(`skipRiseBadgeEvaluation`)을 켜서 부른다(동기화 끝 판정이 이어서 읽는다).
 * - 열린 캡슐이 있으면 `capsule_unseen_results`에 한 동기화당 한 건, `payload.events`가 열린 순서 그대로다. 열린 게 없으면 한 건도 남기지 않는다
 *   (같은 동기화를 다시 보내면 지갑이 비어 열린 게 없다).
 * - 기록이 실패(오류·예외)해도 던지지 않고 `unseenRecorded: false`로 알린다. 자동 채움이 실패(`stopped: 'error'`)해도 던지지 않고, 그때까지 열린 것은 기록한다.
 * - 동기화(`lib/strava/sync.ts`) 연결(소스 검색): 정산 직후 한 번 부르고, 열린 것이 있을 때만 끝 판정에 캡슐 열기 지표를 더한다.
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

import { buildCapsuleUnseenPayload, recordUnseenCapsuleResult, runSyncCapsuleAutoFill } from '../sync-auto-fill'
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

describe('동기화 연결 (소스 검색)', () => {
  const source = readFileSync(path.resolve(__dirname, '../../strava/sync.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('runSyncCapsuleAutoFill을 한 번만 부르고, 잼 정산(settleActivities) 뒤 아이템 배지 발급(issueSyncItemBadges) 앞이다', () => {
    expect(source.match(/runSyncCapsuleAutoFill\(/g)).toHaveLength(1)
    const settle = source.indexOf('await settleActivities(')
    const fill = source.indexOf('await runSyncCapsuleAutoFill(')
    const issue = source.indexOf('await issueSyncItemBadges(')
    expect(settle).toBeGreaterThan(-1)
    expect(fill).toBeGreaterThan(settle)
    expect(issue).toBeGreaterThan(fill)
  })

  it('열린 캡슐이 있을 때만 끝 판정에 jamTriggersForCapsuleOpen()을 더한다', () => {
    expect(source).toMatch(/capsuleStep\.opened\s*\?\s*\[\.\.\.JAM_SYNC_TRIGGERS,\s*\.\.\.jamTriggersForCapsuleOpen\(\)\]\s*:\s*JAM_SYNC_TRIGGERS/)
  })
})
