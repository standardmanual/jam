/**
 * 개발·배포 상황판 읽기 (티켓 20261026_2028 2회차)
 *
 * 지키는 것:
 * - 모든 읽기가 성공하면 배포 현황·묶음·보드·출처가 채워진다
 * - main 색인이 없으면(404) 추정 규칙을 쓰고 estimatedDeployed가 true다
 * - 읽기 하나가 실패해도 그 부분만 error이고 던지지 않는다(읽기 객체가 던져도, 요청 목록이 던져도)
 * - 배포 기록이 없으면 main 마지막 커밋 시각으로 대신하고 estimated로 표시한다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/load.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { GithubReader, ReadResult } from '../github'
import { loadDevBoard } from '../load'
import type { BoardRequestInput } from '../types'
import { entry } from './fixtures'

const NOW = new Date('2026-10-27T03:00:00Z')

const STAGING_INDEX = JSON.stringify([
  entry({ id: '20261016_2335' }),
  entry({ id: '20261016_2336', parent: '20261016_2335', status: 'CLOSED', closed: '2026-10-10' }),
  entry({ id: '20261016_2337', parent: '20261016_2335', status: 'CLOSED', closed: '2026-10-10' }),
  entry({ id: 'x1', parent: '20261016_2336', status: 'CLOSED', closed: '2026-10-20' }),
  entry({ id: 'x2', parent: '20261016_2336', status: 'IN_PROGRESS' }),
  entry({ id: 'x3', parent: '20261016_2337', status: 'OPEN' }),
])
const STATE_FILE = JSON.stringify({ frozen: true, reason: '사유', nextDeploy: '다음' })

function reader(overrides: Partial<GithubReader> = {}): GithubReader {
  return {
    async readFile(path, ref): Promise<ReadResult<string>> {
      if (path.endsWith('_index.json')) return ref === 'staging' ? { state: 'ok', value: STAGING_INDEX } : { state: 'missing' }
      return { state: 'ok', value: STATE_FILE }
    },
    async compareAhead() {
      return { state: 'ok', value: 1273 }
    },
    async latestDeployment() {
      return { state: 'ok', value: { createdAt: '2026-10-14T07:31:59Z', sha: '1e2d55e2', state: 'success' } }
    },
    async latestCommit() {
      return { state: 'ok', value: { date: '2026-10-13T01:00:00Z', sha: 'cafe' } }
    },
    ...overrides,
  }
}

const requests: BoardRequestInput[] = [{ no: 7, title: '캡슐 확률을 코드 밖으로', origin: 'eco' }]
const listRequests = async () => requests

describe('loadDevBoard', () => {
  it('모든 읽기가 성공하면 배포 현황·묶음·보드가 채워진다(main 색인 없음 → 추정)', async () => {
    const snapshot = await loadDevBoard({ reader: reader(), listRequests }, NOW)
    expect(snapshot.generatedAt).toBe('2026-10-27T03:00:00.000Z')
    expect(snapshot.deploy).toMatchObject({
      frozen: true,
      reason: '사유',
      nextDeploy: '다음',
      ahead: 1273,
      label: '동결',
      lastDeploy: { kstDate: '2026-10-14', sha: '1e2d55e2', state: 'success', estimated: false },
    })
    expect(snapshot.sources).toEqual({
      stagingIndex: 'ok',
      mainIndex: 'missing',
      deployState: 'ok',
      compare: 'ok',
      deployment: 'ok',
      requests: 'ok',
    })
    expect(snapshot.estimatedDeployed).toBe(true)
    expect(snapshot.bundles).toHaveLength(8)
    expect(snapshot.bundles[0]).toMatchObject({ number: 0, done: 1, active: 1, remaining: 0, total: 2 })
    expect(snapshot.bundles[1]).toMatchObject({ number: 1, done: 0, active: 0, remaining: 1, total: 1 })
    // 10-20에 닫힌 x1은 마지막 배포(10-14) 뒤라서 staging 반영, 10-10에 닫힌 두 묶음 티켓은 14일 창(10-13~) 밖이라 빠진다
    expect(snapshot.columns.staged.cards.map((c) => c.id)).toEqual(['x1'])
    expect(snapshot.columns.deployed.total).toBe(0)
    expect(snapshot.columns.progress.cards.map((c) => c.id)).toEqual(['x2'])
    expect(snapshot.columns.waiting.cards.map((c) => c.id)).toEqual(['request-7', 'x3', '20261016_2335'])
  })

  it('main 색인이 있으면 정확한 규칙을 쓰고 추정이 아니다', async () => {
    const mainIndex = JSON.stringify([entry({ id: 'x1', status: 'CLOSED' })])
    const snapshot = await loadDevBoard(
      {
        reader: reader({
          async readFile(path, ref) {
            if (path.endsWith('_index.json')) return { state: 'ok', value: ref === 'staging' ? STAGING_INDEX : mainIndex }
            return { state: 'ok', value: STATE_FILE }
          },
        }),
        listRequests,
      },
      NOW
    )
    expect(snapshot.estimatedDeployed).toBe(false)
    expect(snapshot.columns.deployed.cards.map((c) => c.id)).toEqual(['x1'])
    expect(snapshot.columns.staged.cards.map((c) => c.id)).toEqual(['20261016_2337', '20261016_2336'])
  })

  it('staging 색인만 실패하면 보드·묶음만 비고 나머지는 계산된다', async () => {
    const snapshot = await loadDevBoard(
      {
        reader: reader({
          async readFile(path, ref) {
            if (path.endsWith('_index.json')) return ref === 'staging' ? { state: 'error' } : { state: 'missing' }
            return { state: 'ok', value: STATE_FILE }
          },
        }),
        listRequests,
      },
      NOW
    )
    expect(snapshot.sources.stagingIndex).toBe('error')
    expect(snapshot.bundles).toEqual([])
    expect(snapshot.columns.waiting.cards.map((c) => c.id)).toEqual(['request-7'])
    expect(snapshot.deploy.ahead).toBe(1273)
    expect(snapshot.deploy.label).toBe('동결')
  })

  it('compare가 실패하면 앞선 커밋 수만 null이다', async () => {
    const snapshot = await loadDevBoard(
      { reader: reader({ async compareAhead() { return { state: 'rate_limited' } } }), listRequests },
      NOW
    )
    expect(snapshot.deploy.ahead).toBeNull()
    expect(snapshot.sources.compare).toBe('rate_limited')
    expect(snapshot.bundles).toHaveLength(8)
  })

  it('색인이 깨진 JSON이면 error, 배포 상태 파일이 깨졌으면 「확인 안 됨」이다', async () => {
    const snapshot = await loadDevBoard(
      {
        reader: reader({
          async readFile(path) {
            return { state: 'ok', value: path.endsWith('_index.json') ? '{깨짐' : '{"frozen":"예"}' }
          },
        }),
        listRequests,
      },
      NOW
    )
    expect(snapshot.sources.stagingIndex).toBe('error')
    expect(snapshot.sources.deployState).toBe('error')
    expect(snapshot.deploy).toMatchObject({ frozen: null, label: '확인 안 됨', reason: '' })
  })

  it('배포 기록이 없으면 main 마지막 커밋 시각으로 대신하고 추정으로 표시한다', async () => {
    const snapshot = await loadDevBoard(
      { reader: reader({ async latestDeployment() { return { state: 'missing' } } }), listRequests },
      NOW
    )
    expect(snapshot.sources.deployment).toBe('missing')
    expect(snapshot.deploy.lastDeploy).toMatchObject({ kstDate: '2026-10-13', sha: 'cafe', state: null, estimated: true })
  })

  it('배포 기록도 커밋도 못 읽으면 마지막 배포는 null이고 배포됨을 정하지 않는다', async () => {
    const snapshot = await loadDevBoard(
      {
        reader: reader({
          async latestDeployment() {
            return { state: 'missing' }
          },
          async latestCommit() {
            return { state: 'error' }
          },
        }),
        listRequests,
      },
      NOW
    )
    expect(snapshot.deploy.lastDeploy).toBeNull()
    expect(snapshot.sources.deployment).toBe('error')
    expect(snapshot.columns.deployed.total).toBe(0)
  })

  it('요청 목록이 던져도 그 부분만 error이고 던지지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const snapshot = await loadDevBoard(
      {
        reader: reader(),
        listRequests: async () => {
          throw new Error('db down')
        },
      },
      NOW
    )
    expect(snapshot.sources.requests).toBe('error')
    expect(snapshot.columns.waiting.cards.every((c) => c.kind === 'ticket')).toBe(true)
    expect(snapshot.sources.stagingIndex).toBe('ok')
    spy.mockRestore()
  })

  it('읽기 객체가 약속을 어기고 던져도 그 부분만 error이고 던지지 않는다', async () => {
    const snapshot = await loadDevBoard(
      {
        reader: reader({
          async readFile() {
            throw new Error('boom')
          },
          async compareAhead() {
            throw new Error('boom')
          },
        }),
        listRequests,
      },
      NOW
    )
    expect(snapshot.sources.stagingIndex).toBe('error')
    expect(snapshot.sources.mainIndex).toBe('error')
    expect(snapshot.sources.compare).toBe('error')
    expect(snapshot.sources.deployment).toBe('ok')
    expect(snapshot.deploy.label).toBe('확인 안 됨')
  })
})
