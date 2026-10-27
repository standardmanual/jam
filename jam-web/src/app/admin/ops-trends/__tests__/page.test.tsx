/**
 * 트렌드 레이더 페이지 (티켓 20261026_2033 2회차)
 *
 * 지키는 것: 출처와 묶음을 따로 읽어 한쪽이 실패해도 그 구역만 안내 카드가 되고 다른 구역은 그대로 보인다(빈 상태로 보이지 않는다),
 * `?sample=1`이 묶음 읽기에 시험 포함으로 넘어간다, 출처 이름이 출처 칩에 쓰인다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/ops-trends/__tests__/page.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-trends',
  useSearchParams: () => new URLSearchParams(''),
}))

const mocks = vi.hoisted(() => ({
  listTrendSources: vi.fn(),
  loadTrendRadarInput: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/admin/queryError', () => ({ logQueryError: vi.fn() }))
vi.mock('@/lib/admin/opsTrends/sourceStore', () => ({ listTrendSources: mocks.listTrendSources }))
vi.mock('@/lib/admin/opsTrends/radarLoad', () => ({ loadTrendRadarInput: mocks.loadTrendRadarInput }))

import OpsTrendsPage from '../page'

const SOURCE = {
  id: '00000000-0000-4000-8000-000000000001',
  no: 1,
  name: '러닝 해시태그',
  kind: 'hashtag',
  location: '#러닝',
  enabled: true,
  createdAt: '2026-10-20T00:00:00Z',
  lastReadAt: null,
}

function bundle() {
  return {
    id: 'bundle-uuid-1',
    week: '2026-W44',
    title: '비 오는 날 러닝',
    receivedAt: new Date().toISOString(),
    trends: [{ label: '러닝 크루', source_ids: [1], summary: '요약 문장', outcome: 'held' }],
    isSample: false,
    items: [],
  }
}

async function render(search: Record<string, string> = {}): Promise<string> {
  const element = await OpsTrendsPage({ searchParams: Promise.resolve(search) })
  return renderToStaticMarkup(element).replace(/<!-- -->/g, '')
}

beforeEach(() => {
  mocks.listTrendSources.mockReset()
  mocks.loadTrendRadarInput.mockReset()
})

describe('/admin/ops-trends', () => {
  it('두 구역을 모두 읽으면 출처 표와 레이더가 보인다(출처 칩에 이름이 쓰인다)', async () => {
    mocks.listTrendSources.mockResolvedValue([SOURCE])
    mocks.loadTrendRadarInput.mockResolvedValue([bundle()])
    const out = await render()
    expect(out).toContain('트렌드 레이더')
    expect(out).toContain('내가 등록한 출처')
    expect(out).toContain('읽은 트렌드')
    expect(out).toContain('러닝 해시태그')
    expect(out).toContain('출처 1 · 러닝 해시태그')
    expect(out).toContain('러닝 크루')
  })

  it('출처를 못 읽으면 그 구역만 안내 카드이고 레이더는 그대로다', async () => {
    mocks.listTrendSources.mockRejectedValue(new Error('boom'))
    mocks.loadTrendRadarInput.mockResolvedValue([bundle()])
    const out = await render()
    expect(out).toContain('등록한 출처를 불러오지 못했어요')
    expect(out).not.toContain('읽은 트렌드를 불러오지 못했어요')
    expect(out).toContain('러닝 크루')
    expect(out).toMatch(/>출처 1</)
  })

  it('레이더를 못 읽으면 그 구역만 안내 카드이고 출처 표는 그대로다', async () => {
    mocks.listTrendSources.mockResolvedValue([SOURCE])
    mocks.loadTrendRadarInput.mockRejectedValue(new Error('boom'))
    const out = await render()
    expect(out).toContain('읽은 트렌드를 불러오지 못했어요')
    expect(out).not.toContain('등록한 출처를 불러오지 못했어요')
    expect(out).toContain('러닝 해시태그')
    expect(out).not.toContain('최근 14일에 읽은 트렌드가 없어요')
  })

  it('둘 다 못 읽으면 안내 카드가 둘이고 오류 내용은 화면에 없다', async () => {
    mocks.listTrendSources.mockRejectedValue(new Error('secret-1'))
    mocks.loadTrendRadarInput.mockRejectedValue(new Error('secret-2'))
    const out = await render()
    expect(out).toContain('등록한 출처를 불러오지 못했어요')
    expect(out).toContain('읽은 트렌드를 불러오지 못했어요')
    expect(out).not.toContain('secret')
  })

  it('sample=1이면 시험 포함으로 묶음을 읽고, 없으면 시험을 뺀다', async () => {
    mocks.listTrendSources.mockResolvedValue([])
    mocks.loadTrendRadarInput.mockResolvedValue([])
    await render({ sample: '1' })
    expect(mocks.loadTrendRadarInput.mock.calls[0][1]).toMatchObject({ includeSample: true })
    await render()
    expect(mocks.loadTrendRadarInput.mock.calls[1][1]).toMatchObject({ includeSample: false })
  })

  it('출처에는 끈 것까지 모두 읽는다', async () => {
    mocks.listTrendSources.mockResolvedValue([])
    mocks.loadTrendRadarInput.mockResolvedValue([])
    await render()
    expect(mocks.listTrendSources.mock.calls[0][1]).toEqual({ includeDisabled: true })
  })
})
