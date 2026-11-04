/**
 * 미션 목록 NEW 칩 — 주황 면과 2일 표시 기한 (티켓 20261104_2126)
 *
 * 생성 후 2일 이내인 미션에만 NEW 칩이 붙고, 칩은 주황(--warning) 면에 검정 글자다.
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/MissionsListClient.new-chip.test.tsx"
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/missions',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import MissionsListClient, { type MissionListItem } from './MissionsListClient'
import { d } from '@/lib/i18n'

const NOW = new Date('2026-11-04T12:00:00Z')
const HOUR = 60 * 60 * 1000

function createdAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

function item(createdAt: string): MissionListItem {
  return {
    id: 'm1',
    title: '주말 러닝',
    description: null,
    image_url: null,
    mission_type: 'distance',
    condition_json: { distance_km: 10 },
    condition_text: null,
    reward_points: 10,
    reward_badge_ids: [],
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: null,
    created_at: createdAt,
    joined: false,
    done: false,
    completedAt: null,
    locked: false,
    requiredBadge: null,
    lockedRewardRarities: [],
  } as unknown as MissionListItem
}

function render(mission: MissionListItem) {
  return renderToStaticMarkup(<MissionsListClient ongoing={[mission]} ended={[]} rewardBadgeNames={{}} />)
}

describe('미션 목록 NEW 칩', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('생성 직후 미션에는 NEW 칩이 붙는다', () => {
    expect(render(item(createdAgo(HOUR)))).toContain(`>${d.missions.tagNew}<`)
  })

  it('생성 후 2일이 지나기 직전까지 NEW 칩이 붙는다', () => {
    expect(render(item(createdAgo(48 * HOUR - 1000)))).toContain(`>${d.missions.tagNew}<`)
  })

  it('생성 후 2일이 지나면 NEW 칩이 사라진다', () => {
    expect(render(item(createdAgo(48 * HOUR + 1000)))).not.toContain(`>${d.missions.tagNew}<`)
  })

  it('옛 기한이던 3일·7일 전 미션에는 NEW 칩이 붙지 않는다', () => {
    expect(render(item(createdAgo(72 * HOUR)))).not.toContain(`>${d.missions.tagNew}<`)
    expect(render(item(createdAgo(7 * 24 * HOUR - 1000)))).not.toContain(`>${d.missions.tagNew}<`)
  })

  it('NEW 칩은 주황 --warning 면에 검정 글자이고 초록 accent 면이 아니다', () => {
    const html = render(item(createdAgo(HOUR)))
    const chip = html.slice(html.lastIndexOf('<span', html.indexOf(`>${d.missions.tagNew}<`)), html.indexOf(`>${d.missions.tagNew}<`))

    expect(chip).toContain('background:var(--warning)')
    expect(chip).toContain('color:var(--accent-foreground)')
    expect(chip).not.toContain('var(--accent)')
  })
})
