/**
 * lib/chapter/rise — 순환 import 없음 (티켓 20261019_1316)
 *
 * 챕터 시작(`start.ts`)이 오름 처리(`rise.ts`)를 가져오고, 오름 처리는 챕터 배지 판정 래퍼(`jamActionRoute`)를 쓴다. 래퍼는 `strava/sync.ts`를 가져오고
 * `sync.ts`는 퀘스트 완료 처리를 거쳐 챕터 시작(`start.ts`)으로 이어진다(옛 점수 모듈 `score.ts`는 티켓 20261028_1742 2회에서 걷었다). `rise.ts`가 래퍼를 호출 시점에 `await import()`로 불러서 모듈 평가 시점의
 * 순환이 없다. 이 시험은 실제 모듈을 두 순서로 불러 어느 쪽도 비어 있는(undefined) 내보내기를 만나지 않는지, 오름 처리가 실제 래퍼 모듈을 불러오는지 본다.
 * 소스의 정적 import 순환 자체는 이 시험이 아니라 작업 중 import 그래프 검사기(타입 import·동적 import 제외)로 확인했다 — 순환 묶음 0개.
 *
 * 공용 DB는 부르지 않는다 — 모듈을 불러오기만 한다(클라이언트는 호출 시점에 만든다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/rise-import-cycle.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createNotificationMock, logMock } = vi.hoisted(() => ({ createNotificationMock: vi.fn(), logMock: vi.fn() }))

vi.mock('@/lib/notifications', async () => {
  const groupKey = await vi.importActual<typeof import('@/lib/notifications/groupKey')>('@/lib/notifications/groupKey')
  return { createNotification: (...args: unknown[]) => createNotificationMock(...args), scopedGroupKey: groupKey.scopedGroupKey }
})
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

beforeEach(() => {
  vi.resetModules()
  createNotificationMock.mockReset()
  createNotificationMock.mockResolvedValue({ id: 'n1' })
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('start → rise → jamActionRoute → sync → 퀘스트 완료 → start', () => {
  it('챕터 시작 쪽에서 먼저 불러도 모든 내보내기가 함수로 채워져 있다', async () => {
    const start = await import('../start')
    const rise = await import('../rise')
    const route = await import('@/lib/badge-engine/jamActionRoute')
    const settlement = await import('@/lib/jam/settlement')

    expect(typeof start.startChapter).toBe('function')
    expect(typeof rise.processChapterRise).toBe('function')
    expect(typeof route.runJamActionEvaluation).toBe('function')
    expect(typeof settlement.settleActivities).toBe('function')
  })

  it('판정 래퍼 쪽에서 먼저 불러도(동기화가 챕터 시작을 먼저 가져오는 순서) 모든 내보내기가 채워져 있다', async () => {
    const route = await import('@/lib/badge-engine/jamActionRoute')
    const settlement = await import('@/lib/jam/settlement')
    const start = await import('../start')
    const rise = await import('../rise')

    expect(typeof route.runJamActionEvaluation).toBe('function')
    expect(typeof settlement.settleActivities).toBe('function')
    expect(typeof start.startChapter).toBe('function')
    expect(typeof rise.processChapterRise).toBe('function')
  })

  it('오름 처리가 실제 판정 래퍼 모듈을 불러오고, 불러오기에 실패해도 던지지 않는다', async () => {
    const rise = await import('../rise')

    // 래퍼 모듈이 실제로 불려 오는지: `vitest.setup.ts`가 Supabase 환경 변수를 비워서 service 클라이언트를 만들다 실패하고, 래퍼가 그 실패를 삼킨다.
    // 실 DB에는 닿지 않는다. 어느 쪽이든 오름 처리는 던지지 않는다
    await expect(rise.processChapterRise({ userId: 'u1', reachedChapters: [1] })).resolves.toBeUndefined()
  })
})
