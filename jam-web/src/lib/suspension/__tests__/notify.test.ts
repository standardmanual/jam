/**
 * 이용 정지·풀림 소식 (티켓 20261021_1249 6-3 5회)
 *
 * 고정하는 것:
 * - 정지됨: `suspension_started` 소식을 `suspension_started:{정지 줄 id}` 키로 `once` 모드로 한 번만 만든다. payload는 정지 줄 id와 건 시각뿐이다.
 * - 풀림: `suspension_lifted` 소식을 `suspension_lifted:{정지 줄 id}` 키로 `once` 모드로 한 번만 만든다. payload는 정지 줄 id와 푼 시각뿐이다.
 * - 사유 글, 어드민 이메일, 상담 메모가 소식 입력에 들어가지 않는다(입력 자체가 받지 않는다).
 * - 소식 생성이 예외를 던지거나 null을 돌려줘도 던지지 않는다 — 이미 끝난 정지·풀림 결과를 바꾸지 않는다. 예외는 로그로 남는다.
 *
 * 소식 라이브러리는 모의한다. 실제 공용 DB는 호출하지 않고, 실제 정지를 걸지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/suspension/__tests__/notify.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createNotificationMock = vi.hoisted(() => vi.fn(async (): Promise<unknown> => null))
vi.mock('@/lib/notifications', () => ({ createNotification: createNotificationMock }))

import { notifySuspensionLifted, notifySuspensionStarted } from '../notify'

const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SUSPENSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  createNotificationMock.mockReset()
  createNotificationMock.mockImplementation(async () => null)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('notifySuspensionStarted', () => {
  it('정지 줄 id 키로 한 번만 만드는 소식 한 건을 보낸다', async () => {
    await notifySuspensionStarted({ userId: USER, suspensionId: SUSPENSION, suspendedAt: '2026-10-22T01:00:00.000Z' })

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith({
      userId: USER,
      type: 'suspension_started',
      payload: { suspension_id: SUSPENSION, suspended_at: '2026-10-22T01:00:00.000Z' },
      groupKey: `suspension_started:${SUSPENSION}`,
      mode: 'once',
    })
  })

  it('소식 라이브러리가 던져도 던지지 않고 로그를 남긴다', async () => {
    createNotificationMock.mockRejectedValueOnce(new Error('rpc down'))

    await expect(
      notifySuspensionStarted({ userId: USER, suspensionId: SUSPENSION, suspendedAt: '2026-10-22T01:00:00.000Z' })
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain(SUSPENSION)
  })

  it('소식 라이브러리가 null을 돌려줘도(생성 실패) 던지지 않는다', async () => {
    createNotificationMock.mockResolvedValueOnce(null)

    await expect(
      notifySuspensionStarted({ userId: USER, suspensionId: SUSPENSION, suspendedAt: '2026-10-22T01:00:00.000Z' })
    ).resolves.toBeUndefined()
  })
})

describe('notifySuspensionLifted', () => {
  it('정지 줄 id 키로 한 번만 만드는 소식 한 건을 보낸다', async () => {
    await notifySuspensionLifted({ userId: USER, suspensionId: SUSPENSION, liftedAt: '2026-10-23T01:00:00.000Z' })

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith({
      userId: USER,
      type: 'suspension_lifted',
      payload: { suspension_id: SUSPENSION, lifted_at: '2026-10-23T01:00:00.000Z' },
      groupKey: `suspension_lifted:${SUSPENSION}`,
      mode: 'once',
    })
  })

  it('소식 라이브러리가 던져도 던지지 않고 로그를 남긴다', async () => {
    createNotificationMock.mockRejectedValueOnce(new Error('rpc down'))

    await expect(
      notifySuspensionLifted({ userId: USER, suspensionId: SUSPENSION, liftedAt: '2026-10-23T01:00:00.000Z' })
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

describe('정지와 풀림 소식의 묶음 키', () => {
  it('같은 정지 줄이라도 정지됨과 풀림은 서로 다른 키라 하나가 다른 하나를 막지 않는다', async () => {
    await notifySuspensionStarted({ userId: USER, suspensionId: SUSPENSION, suspendedAt: '2026-10-22T01:00:00.000Z' })
    await notifySuspensionLifted({ userId: USER, suspensionId: SUSPENSION, liftedAt: '2026-10-23T01:00:00.000Z' })

    const keys = (createNotificationMock.mock.calls as unknown as [{ groupKey: string }][]).map(([c]) => c.groupKey)
    expect(keys).toEqual([`suspension_started:${SUSPENSION}`, `suspension_lifted:${SUSPENSION}`])
  })

  it('소식 입력에 사유·이메일·메모에 해당하는 값이 들어가지 않는다', async () => {
    await notifySuspensionStarted({ userId: USER, suspensionId: SUSPENSION, suspendedAt: '2026-10-22T01:00:00.000Z' })
    await notifySuspensionLifted({ userId: USER, suspensionId: SUSPENSION, liftedAt: '2026-10-23T01:00:00.000Z' })

    const sent = JSON.stringify(createNotificationMock.mock.calls)
    expect(sent).not.toMatch(/reason|email|memo|note|suspended_by|lifted_by/)
  })
})
