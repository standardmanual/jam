/**
 * 개발·배포 상황판 구역 (티켓 20261026_2028 3회차)
 *
 * 서버 컴포넌트를 `await`로 불러 얻은 요소를 `renderToStaticMarkup`으로 그린다. 읽기는 모두 가짜다(GitHub·DB에 닿지 않는다).
 * 지키는 것:
 * - 스냅샷을 읽으면 배포 현황·묶음·보드·기준 시각이 그려진다
 * - 스냅샷 읽기가 던지면 구역마다 안내 카드이고 읽기 안내 줄·기준 시각은 비운다
 * - staging 색인만 못 읽으면 묶음·보드 자리만 안내 카드이고 배포 현황은 그대로다(한도 초과면 설명이 토큰을 권한다)
 * - 읽기 안내 줄은 `sources`에 따라 나오고 `mainIndex: 'missing'`은 안내하지 않는다(추정 표시만 쓴다)
 * - `startDevBoard`는 읽기 객체·요청 목록을 연결해 `loadDevBoard`를 한 번 부르고, 던져도 `{ ok: false }`로 담는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DevBoardSnapshot, SourceKey, SourceState } from '@/lib/admin/devBoard/types'

const hoisted = vi.hoisted(() => ({
  loadDevBoard: vi.fn(),
  listBoardRequests: vi.fn(),
  reader: { marker: 'reader' },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ marker: 'service' }) }))
vi.mock('@/lib/admin/devBoard/load', () => ({ loadDevBoard: hoisted.loadDevBoard }))
vi.mock('@/lib/admin/devBoard/github', () => ({ getDefaultGithubReader: () => hoisted.reader }))
vi.mock('@/lib/admin/devBoard/requests', () => ({ listBoardRequests: hoisted.listBoardRequests }))

import { AsOfSection, BoardSection, BundleSection, DeploySection, NoticesSection, startDevBoard, type DevBoardRead } from '../_sections'

const html = (element: React.ReactElement | null) => (element ? renderToStaticMarkup(element).replace(/<!-- -->/g, '') : '')
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const SOURCES: Record<SourceKey, SourceState> = {
  stagingIndex: 'ok',
  mainIndex: 'missing',
  deployState: 'ok',
  compare: 'ok',
  deployment: 'ok',
  requests: 'ok',
}

function snapshot(overrides: Partial<Record<SourceKey, SourceState>> = {}): DevBoardSnapshot {
  const empty = { cards: [], total: 0 }
  return {
    generatedAt: '2026-10-27T03:00:00.000Z',
    deploy: {
      frozen: true,
      reason: '동결 사유',
      nextDeploy: 'JAM 2.0 출시 때',
      ahead: 1278,
      label: '동결',
      lastDeploy: { at: '2026-10-14T07:31:59Z', kstDate: '2026-10-14', sha: '1e2d55e2', state: 'success', estimated: false },
    },
    bundles: [{ number: 1, name: '기반', ticketId: '20261016_2337', done: 3, active: 0, remaining: 0, total: 3 }],
    columns: {
      waiting: {
        cards: [
          { kind: 'request', id: 'request-7', requestNo: 7, title: '캡슐 확률', category: '', priority: '', origin: 'eco', path: null },
          { kind: 'ticket', id: 't1', requestNo: null, title: '[Admin] 한 일', category: 'Admin', priority: 'P2', origin: null, path: 'docs/t1.md' },
        ],
        total: 435,
      },
      progress: { cards: [], total: 14 },
      staged: { cards: [], total: 112 },
      deployed: empty,
    },
    undatedClosed: 73,
    sources: { ...SOURCES, ...overrides },
    estimatedDeployed: true,
  }
}

const ok = (overrides: Partial<Record<SourceKey, SourceState>> = {}): Promise<DevBoardRead> =>
  Promise.resolve({ ok: true, snapshot: snapshot(overrides) })
const failed = (): Promise<DevBoardRead> => Promise.resolve({ ok: false })

beforeEach(() => {
  hoisted.loadDevBoard.mockReset()
  hoisted.listBoardRequests.mockReset()
})

describe('구역: 스냅샷을 읽었을 때', () => {
  it('배포 현황·묶음·보드·기준 시각(KST)이 그려진다', async () => {
    const read = ok()
    const deploy = textOf(html(await DeploySection({ read })))
    expect(deploy).toContain('■ 동결')
    expect(deploy).toContain('staging이 main보다 1,278 커밋 앞서요')

    const bundles = textOf(html(await BundleSection({ read })))
    expect(bundles).toContain('묶음 1 · 기반')

    const board = textOf(html(await BoardSection({ read })))
    expect(board).toContain('대기 435')
    expect(board).toContain('요청 7번')
    expect(board).toContain('한 일')
    expect(board).toContain('추정')
    expect(board).toContain('닫은 날짜가 없는 완료 티켓 73건은 이 칸에 넣지 않았어요')

    expect(textOf(html(await AsOfSection({ read })))).toContain('2026.10.27 12:00 기준')
  })

  it('읽기 안내 줄은 문제가 없으면 비어 있다 (mainIndex가 missing이어도 정상이다)', async () => {
    expect(html(await NoticesSection({ read: ok() }))).toBe('')
  })

  it('읽기 안내 줄은 sources에 따라 문제가 있는 것만 보인다', async () => {
    const text = textOf(html(await NoticesSection({ read: ok({ compare: 'rate_limited', deployState: 'missing', mainIndex: 'error' }) })))
    expect(text).toContain('읽기 한도를 넘었어요')
    expect(text).toContain('GITHUB_READ_TOKEN')
    expect(text).toContain('배포됨은 임시 추정이에요')
    expect(text).toContain('배포 상태가 「확인 안 됨」이에요')
    expect(text).not.toContain('개발 요청을 불러오지 못했어요')
  })
})

describe('구역: 읽기가 실패했을 때', () => {
  it('staging 색인만 못 읽으면 묶음·보드만 안내 카드이고 배포 현황은 그대로다', async () => {
    const read = ok({ stagingIndex: 'error' })
    const bundles = textOf(html(await BundleSection({ read })))
    const board = textOf(html(await BoardSection({ read })))
    expect(bundles).toContain('묶음 진행을 불러오지 못했어요')
    expect(board).toContain('개발 항목 보드를 불러오지 못했어요')
    expect(board).not.toContain('요청 7번')
    expect(textOf(html(await DeploySection({ read })))).toContain('■ 동결')
  })

  it('색인을 못 읽은 이유가 한도 초과면 안내 카드 설명이 토큰을 권한다', async () => {
    const board = textOf(html(await BoardSection({ read: ok({ stagingIndex: 'rate_limited' }) })))
    expect(board).toContain('GITHUB_READ_TOKEN')
  })

  it('스냅샷 읽기가 통째로 실패하면 구역마다 안내 카드이고 안내 줄·기준 시각은 비운다', async () => {
    const read = failed()
    expect(textOf(html(await DeploySection({ read })))).toContain('배포 현황을 불러오지 못했어요')
    expect(textOf(html(await BundleSection({ read })))).toContain('묶음 진행을 불러오지 못했어요')
    expect(textOf(html(await BoardSection({ read })))).toContain('개발 항목 보드를 불러오지 못했어요')
    expect(html(await NoticesSection({ read }))).toBe('')
    expect(html(await AsOfSection({ read }))).toBe('')
  })
})

describe('startDevBoard', () => {
  it('읽기 객체와 개발 요청 목록을 연결해 loadDevBoard를 한 번 부른다', async () => {
    hoisted.loadDevBoard.mockResolvedValue(snapshot())
    hoisted.listBoardRequests.mockResolvedValue([])
    const result = await startDevBoard()
    expect(result.ok).toBe(true)
    expect(hoisted.loadDevBoard).toHaveBeenCalledTimes(1)
    const [deps, now] = hoisted.loadDevBoard.mock.calls[0]
    expect(deps.reader).toBe(hoisted.reader)
    expect(now).toBeInstanceOf(Date)
    await deps.listRequests()
    expect(hoisted.listBoardRequests).toHaveBeenCalledWith({ marker: 'service' })
  })

  it('loadDevBoard가 던져도 { ok: false }로 담는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.loadDevBoard.mockImplementation(async () => {
      throw new Error('boom')
    })
    expect(await startDevBoard()).toEqual({ ok: false })
    spy.mockRestore()
  })
})
