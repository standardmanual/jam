/**
 * 트라이브 변경에 따른 미션 참가 취소 소식 (티켓 20261019_1313, 운영 로직 13.2절)
 *
 * `mission_cancel_for_tribe_change`가 돌려준 목록으로 소식 한 행을 만드는지, 그 행이 알림함 문구와 이동 위치로 그대로
 * 읽히는지(만드는 쪽과 읽는 쪽이 같은 payload 모양을 쓰는지) 본다. 호출 연결은 묶음 6이라 부르는 곳 시험은 없다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/missions/participation-cancel.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createNotificationMock = vi.hoisted(() => vi.fn(async () => null))
vi.mock('@/lib/notifications', () => ({ createNotification: createNotificationMock }))

import { notifyMissionParticipationCancelled } from './participation-cancel'
import { notificationPlainText, type NotificationView } from '@/lib/notifications/message'
import { notificationTarget } from '@/lib/notifications/href'

type Call = {
  userId: string
  type: string
  payload: { missions: { mission_id: string; title: string }[] }
  groupKey: string
  mode: string
}

function lastCall(): Call {
  const calls = createNotificationMock.mock.calls as unknown as [Call][]
  return calls[calls.length - 1][0]
}

/** 만든 행을 알림함이 읽는 모양으로 옮긴다 */
function viewOf(call: Call): NotificationView {
  return {
    id: 'n1',
    type: call.type as NotificationView['type'],
    payload: call.payload,
    actorCount: 1,
    actor: null,
    actor2: null,
    me: { id: 'user-1', username: '시현', avatarUrl: null },
    updatedAt: '2026-10-19T00:00:00.000Z',
    warning: false,
  }
}

beforeEach(() => {
  createNotificationMock.mockClear()
  vi.useFakeTimers()
  // KST 2026-10-19 09:00
  vi.setSystemTime(new Date('2026-10-19T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('notifyMissionParticipationCancelled', () => {
  it('미션 1개면 소식 한 행을 만든다 — 한 번만 만드는 키(once), 미션 id와 이름이 payload에 실린다', async () => {
    await notifyMissionParticipationCancelled('user-1', [{ id: 'm1', title: '한강 100km' }])

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(lastCall()).toEqual({
      userId: 'user-1',
      type: 'mission_participation_cancelled',
      payload: { missions: [{ mission_id: 'm1', title: '한강 100km' }] },
      groupKey: 'mission_participation_cancelled:m1:2026-10-19',
      mode: 'once',
    })
  })

  it('미션이 여러 개여도 소식은 한 행이다 — 목록 전체가 한 payload에 실린다', async () => {
    await notifyMissionParticipationCancelled('user-1', [
      { id: 'm1', title: '한강 100km' },
      { id: 'm2', title: '남산 오르기' },
      { id: 'm3', title: '주말 러닝' },
    ])

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    const call = lastCall()
    expect(call.payload.missions.map((m) => m.mission_id)).toEqual(['m1', 'm2', 'm3'])
    expect(call.groupKey).toMatch(/^mission_participation_cancelled:group:2026-10-19:[0-9a-f]{16}$/)
    expect(call.mode).toBe('once')
  })

  it('같은 미션 묶음이면 순서가 달라도 같은 키다 — 재호출해도 once가 막는다', async () => {
    await notifyMissionParticipationCancelled('user-1', [
      { id: 'm1', title: 'A' },
      { id: 'm2', title: 'B' },
    ])
    const first = lastCall().groupKey
    await notifyMissionParticipationCancelled('user-1', [
      { id: 'm2', title: 'B' },
      { id: 'm1', title: 'A' },
    ])

    expect(lastCall().groupKey).toBe(first)
  })

  it('미션 묶음이 다르면 다른 키다', async () => {
    await notifyMissionParticipationCancelled('user-1', [
      { id: 'm1', title: 'A' },
      { id: 'm2', title: 'B' },
    ])
    const first = lastCall().groupKey
    await notifyMissionParticipationCancelled('user-1', [
      { id: 'm1', title: 'A' },
      { id: 'm3', title: 'C' },
    ])

    expect(lastCall().groupKey).not.toBe(first)
  })

  it('날이 다르면 같은 미션도 새로 만든다 — 다시 참가했다 또 취소된 경우를 놓치지 않는다', async () => {
    await notifyMissionParticipationCancelled('user-1', [{ id: 'm1', title: '한강 100km' }])
    const first = lastCall().groupKey

    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'))
    await notifyMissionParticipationCancelled('user-1', [{ id: 'm1', title: '한강 100km' }])

    expect(first).toBe('mission_participation_cancelled:m1:2026-10-19')
    expect(lastCall().groupKey).toBe('mission_participation_cancelled:m1:2026-10-20')
  })

  it('날짜는 한국 시간 기준이다 — UTC 15시는 한국의 다음 날 0시다', async () => {
    vi.setSystemTime(new Date('2026-10-19T15:30:00Z'))
    await notifyMissionParticipationCancelled('user-1', [{ id: 'm1', title: '한강 100km' }])

    expect(lastCall().groupKey).toBe('mission_participation_cancelled:m1:2026-10-20')
  })

  it('취소된 미션이 없으면 소식을 만들지 않는다', async () => {
    await notifyMissionParticipationCancelled('user-1', [])

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('같은 미션이 두 번 오면 한 번만 센다 — 개수가 부풀지 않는다', async () => {
    await notifyMissionParticipationCancelled('user-1', [
      { id: 'm1', title: '한강 100km' },
      { id: 'm1', title: '한강 100km' },
    ])

    expect(lastCall().payload.missions).toEqual([{ mission_id: 'm1', title: '한강 100km' }])
    expect(lastCall().groupKey).toBe('mission_participation_cancelled:m1:2026-10-19')
  })

  it('id가 없는 항목은 건너뛴다', async () => {
    await notifyMissionParticipationCancelled('user-1', [
      { id: '', title: '이름만 있음' },
      { id: 'm1', title: '한강 100km' },
    ])

    expect(lastCall().payload.missions).toEqual([{ mission_id: 'm1', title: '한강 100km' }])
  })
})

describe('만든 행이 알림함에서 그대로 읽힌다 — 만드는 쪽과 읽는 쪽이 같은 payload 모양', () => {
  it('1개는 미션 이름을 말하고 목록으로 보낸다', async () => {
    await notifyMissionParticipationCancelled('user-1', [{ id: 'm1', title: '한강 100km' }])

    const view = viewOf(lastCall())
    expect(notificationPlainText(view)).toBe('트라이브가 바뀌어 「한강 100km」 미션 참가가 취소됐어요')
    expect(notificationTarget(view).href).toBe('/missions')
  })

  it('여러 개는 개수로 접고 목록으로 보낸다', async () => {
    await notifyMissionParticipationCancelled('user-1', [
      { id: 'm1', title: '한강 100km' },
      { id: 'm2', title: '남산 오르기' },
    ])

    const view = viewOf(lastCall())
    expect(notificationPlainText(view)).toBe('트라이브가 바뀌어 미션 2개 참가가 취소됐어요')
    expect(notificationTarget(view).href).toBe('/missions')
  })
})
