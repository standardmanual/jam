/**
 * 밸런스 설정 변경 이력 읽기·쓰기 (티켓 20261022_1132 1회) — 가짜 표(`fakeDb.ts`)로 지키는 것:
 * - 이력 한 줄 쓰기: 구역 키·칸 목록·메모·확률 반영 표시·바꾼 어드민이 그대로 들어가고, 쓰기 오류는 던지지 않고 결과로 돌려준다
 * - 최근 N건 읽기: 구역 키로 거르고 최신순이며 건수 상한을 지킨다
 * - **바꾼 사람은 표시 이름(username)만** 나온다 — 읽기 결과 어디에도 어드민 ID·이메일이 없다. 어드민이 지워졌거나(changed_by NULL) 이름이 없으면 `null`
 * - 모양이 틀린 `changes` 줄은 버린다. 이력 조회·이름 조회 오류는 던진다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listBalanceHistory, parseChanges, writeBalanceHistory } from '../history'
import { createFakeDb, type FakeDb } from './fakeDb'

const ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADMIN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let db: FakeDb

function historyRow(overrides: Record<string, unknown>) {
  return {
    id: 'h-1',
    section_key: 'jam',
    changes: [{ field: 'intensity_light', from: 1, to: 2 }],
    note: null,
    affects_disclosure: false,
    changed_by: ADMIN_A,
    created_at: '2026-10-22T01:00:00.000+00:00',
    ...overrides,
  }
}

beforeEach(() => {
  db = createFakeDb({
    users: [
      { id: ADMIN_A, username: 'karina', email: 'karina@example.com' },
      { id: ADMIN_B, username: null, email: 'b@example.com' },
    ],
    balance_setting_changes: [],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('writeBalanceHistory', () => {
  it('한 줄을 쓴다', async () => {
    const res = await writeBalanceHistory(db.client, {
      sectionKey: 'jam',
      changes: [{ field: 'intensity_hard', from: 3, to: 4 }],
      note: '이벤트',
      affectsDisclosure: false,
      actor: ADMIN_A,
    })
    expect(res).toEqual({ ok: true })
    expect(db.tables.balance_setting_changes).toEqual([
      expect.objectContaining({
        section_key: 'jam',
        changes: [{ field: 'intensity_hard', from: 3, to: 4 }],
        note: '이벤트',
        affects_disclosure: false,
        changed_by: ADMIN_A,
      }),
    ])
  })

  it('쓰기 오류는 던지지 않고 실패로 돌려준다', async () => {
    db.writeErrors.balance_setting_changes = 'boom'
    const res = await writeBalanceHistory(db.client, { sectionKey: 'jam', changes: [], note: null, affectsDisclosure: false, actor: ADMIN_A })
    expect(res).toEqual({ ok: false, message: 'boom' })
  })
})

describe('listBalanceHistory', () => {
  it('구역 키로 거르고 최신순으로 건수 상한만큼 돌려준다', async () => {
    db.tables.balance_setting_changes = [
      historyRow({ id: 'old', created_at: '2026-10-20T01:00:00.000+00:00' }),
      historyRow({ id: 'other-section', section_key: 'sync', created_at: '2026-10-23T01:00:00.000+00:00' }),
      historyRow({ id: 'new', created_at: '2026-10-22T05:00:00.000+00:00' }),
      historyRow({ id: 'mid', created_at: '2026-10-21T01:00:00.000+00:00' }),
    ]
    const entries = await listBalanceHistory(db.client, 'jam', 2)
    expect(entries.map((entry) => entry.id)).toEqual(['new', 'mid'])
  })

  it('바꾼 사람은 표시 이름만 나오고 어드민 ID·이메일은 어디에도 없다', async () => {
    db.tables.balance_setting_changes = [historyRow({ id: 'a', note: '메모', affects_disclosure: true })]
    const entries = await listBalanceHistory(db.client, 'jam')
    expect(entries).toEqual([
      {
        id: 'a',
        sectionKey: 'jam',
        changes: [{ field: 'intensity_light', from: 1, to: 2 }],
        note: '메모',
        affectsDisclosure: true,
        changedByName: 'karina',
        createdAt: '2026-10-22T01:00:00.000+00:00',
      },
    ])
    const text = JSON.stringify(entries)
    expect(text).not.toContain(ADMIN_A)
    expect(text).not.toContain('example.com')
    expect(Object.keys(entries[0])).not.toContain('changedBy')
  })

  it('어드민이 지워졌거나(changed_by NULL) 이름이 없으면 이름은 null이다', async () => {
    db.tables.balance_setting_changes = [
      historyRow({ id: 'gone', changed_by: null, created_at: '2026-10-22T03:00:00.000+00:00' }),
      historyRow({ id: 'nameless', changed_by: ADMIN_B, created_at: '2026-10-22T02:00:00.000+00:00' }),
    ]
    const entries = await listBalanceHistory(db.client, 'jam')
    expect(entries.map((entry) => entry.changedByName)).toEqual([null, null])
  })

  it('이력이 없으면 이름을 읽지 않고 빈 목록이다', async () => {
    expect(await listBalanceHistory(db.client, 'jam')).toEqual([])
    expect(db.calls).toEqual(['balance_setting_changes.select'])
  })

  it('이력 조회·이름 조회 오류는 던진다', async () => {
    db.readErrors.balance_setting_changes = 'boom'
    await expect(listBalanceHistory(db.client, 'jam')).rejects.toThrow('변경 이력 조회 실패')

    db.readErrors.balance_setting_changes = undefined
    db.tables.balance_setting_changes = [historyRow({ id: 'a' })]
    db.readErrors.users = 'boom'
    await expect(listBalanceHistory(db.client, 'jam')).rejects.toThrow('이름 조회 실패')
  })
})

describe('parseChanges', () => {
  it('읽을 수 있는 줄만 남긴다', () => {
    expect(
      parseChanges([
        { field: 'a', from: 1, to: 2 },
        { field: 'b', from: '1', to: 2 },
        { field: 'c', from: 1 },
        'text',
        null,
        [1, 2],
        { field: 'd', from: 0, to: 0.5 },
      ])
    ).toEqual([
      { field: 'a', from: 1, to: 2 },
      { field: 'd', from: 0, to: 0.5 },
    ])
  })

  it('배열이 아니면 빈 목록이다', () => {
    expect(parseChanges({ field: 'a' })).toEqual([])
    expect(parseChanges(null)).toEqual([])
  })
})
