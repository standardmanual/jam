/**
 * 미션 목록의 보상 줄 — 잠긴 아이템 배지 보상 (티켓 20261019_1317 2회, 운영 로직 7.3절)
 *
 * 잠긴 보상은 이름·그림 없이 «등급 칩 + 잠긴 아이템 배지»만 보이고, 열린 배지 뒤·포인트 앞에 이어진다.
 * 서버 페이지가 잠긴 보상의 이름·id를 내리지 않으므로(`page.hidden-reward.test.tsx`) 이 화면에는 등급 목록만 들어온다.
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/MissionsListClient.locked-reward.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/missions',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import MissionsListClient, { type MissionListItem, type RewardBadgeInfo } from './MissionsListClient'
import { d } from '@/lib/i18n'

const OPEN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LOCKED_NAME = d.lockedItem.card.name

function item(overrides: Partial<MissionListItem> = {}): MissionListItem {
  return {
    id: 'm1',
    title: '주말 러닝',
    description: null,
    image_url: null,
    mission_type: 'distance',
    condition_json: { distance_km: 10 },
    condition_text: null,
    reward_points: null,
    reward_badge_ids: [],
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: null,
    created_at: '2026-01-01T00:00:00Z',
    joined: false,
    done: false,
    completedAt: null,
    locked: false,
    requiredBadge: null,
    lockedRewardRarities: [],
    ...overrides,
  } as unknown as MissionListItem
}

const NAMES: Record<string, RewardBadgeInfo> = {
  [OPEN_ID]: { name: '주말 러너', rarity: 'rare', level: null },
}

function render(mission: MissionListItem, names: Record<string, RewardBadgeInfo> = NAMES) {
  return renderToStaticMarkup(<MissionsListClient ongoing={[mission]} ended={[]} rewardBadgeNames={names} />)
}

/** 보상 줄 한 줄의 텍스트만 뽑는다(태그 제거) */
function rewardText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('미션 목록 — 잠긴 보상 배지', () => {
  it('열린 배지 뒤에 «잠긴 아이템 배지»가 « + »로 이어진다', () => {
    const html = render(item({ reward_badge_ids: [OPEN_ID], lockedRewardRarities: ['epic'] }))

    const text = rewardText(html)
    expect(text).toContain('주말 러너 배지')
    expect(text).toContain(LOCKED_NAME)
    expect(text.indexOf('주말 러너 배지')).toBeLessThan(text.indexOf(LOCKED_NAME))
    expect(text).toMatch(/주말 러너 배지 \+ .*잠긴 아이템 배지/)
  })

  it('잠긴 보상의 등급 칩이 그려진다. 이름·그림은 없다', () => {
    const html = render(item({ lockedRewardRarities: ['epic'] }))

    expect(html).toContain('Epic')
    expect(html).toContain(LOCKED_NAME)
    expect(html).not.toContain('<img')
  })

  it('잠긴 보상만 있어도 «없음»이 아니다', () => {
    const html = render(item({ lockedRewardRarities: ['rare'] }))

    expect(rewardText(html)).not.toContain(d.missions.rewardNone)
    expect(html).toContain(LOCKED_NAME)
  })

  it('잠긴 보상이 여러 개면 개수만큼 이어 붙고 포인트가 맨 뒤다', () => {
    const html = render(item({ lockedRewardRarities: ['epic', 'rare'], reward_points: 300 }))

    const text = rewardText(html)
    expect(text.split(LOCKED_NAME).length - 1).toBe(2)
    expect(text.lastIndexOf(LOCKED_NAME)).toBeLessThan(text.indexOf('300 포인트'))
  })

  it('등급이 없는 잠긴 보상은 칩 없이 «잠긴 아이템 배지»만 남는다', () => {
    const html = render(item({ lockedRewardRarities: [null] }))

    expect(html).toContain(LOCKED_NAME)
    for (const label of ['Common', 'Rare', 'Epic', 'Mystic']) expect(html).not.toContain(label)
  })

  it('잠긴 보상이 없으면 보상 줄이 지금과 같다', () => {
    const html = render(item({ reward_badge_ids: [OPEN_ID], reward_points: 300 }))

    const text = rewardText(html)
    expect(text).not.toContain(LOCKED_NAME)
    expect(text).toContain('주말 러너 배지 + 300 포인트')
  })

  it('보상이 아무것도 없으면 «없음»이다', () => {
    expect(rewardText(render(item()))).toContain(d.missions.rewardNone)
  })

  it('잠긴 보상 칸에 링크와 그림이 없다', () => {
    const html = render(item({ lockedRewardRarities: ['epic'] }))
    const lockedSpan = html.slice(html.lastIndexOf('<span', html.indexOf(LOCKED_NAME)))

    expect(lockedSpan.includes('href=')).toBe(false)
    expect(lockedSpan.includes('<img')).toBe(false)
  })
})
