/**
 * 미션 상세 — 안내 블록과 잠긴 보상 카드의 그림 (티켓 20261019_1317 2회, 운영 로직 7.3절·13.2절)
 *
 * 고정하는 것
 *  - 밤 조건 미션(`nightNotice`)은 «달성 조건» 카드 바로 아래에 안전 안내를 늘 보인다. 닫을 수 없다(버튼이 없다). 아니면 없다.
 *  - 받을 보상을 읽지 못했을 때(`pendingRewards === null`): 완료한 미션에서만 알림과 «다시 시도»가 있다. 완료하지 않았으면 아무것도 없다.
 *  - 받을 보상 카드: 비어 있지 않을 때만 있고, 열린 보상은 그림·이름·등급 칩, 잠긴 보상은 잠금 타일·«잠긴 아이템 배지»·등급 칩만 있다.
 *    잠긴 보상의 이름·그림·id는 DOM 어디에도 없다.
 *  - «보상» 카드: 열린 배지 행 뒤에 잠긴 보상 행(링크 없음)이 이어지고, 잠긴 보상만 있어도 카드가 그려진다.
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 누르기 동작은 `MissionDetailClient.claim.test.tsx`가 맡는다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/[id]/MissionDetailClient.notice.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MissionRow } from '@/types/database'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import MissionDetailClient, { type PendingRewardInfo, type RewardBadgeInfo } from './MissionDetailClient'
import { d } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

const OPEN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LOCKED_NAME = d.lockedItem.card.name

interface State {
  participating?: boolean
  completed?: boolean
  locked?: boolean
  rewardBadges?: RewardBadgeInfo[]
  lockedRewardRarities?: (BadgeRarity | null)[]
  pendingRewards?: PendingRewardInfo[] | null
  nightNotice?: boolean
  rewardPoints?: number | null
}

function render(state: State = {}) {
  const mission = {
    id: 'm1',
    title: '주말 러닝',
    description: null,
    mission_type: 'distance',
    condition_json: { distance_km: 10 },
    condition_text: null,
    reward_points: state.rewardPoints ?? null,
    reward_badge_ids: [],
    max_completions: null,
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: null,
    image_url: null,
  } as unknown as MissionRow
  return renderToStaticMarkup(
    <MissionDetailClient
      mission={mission}
      isParticipating={state.participating ?? false}
      isCompleted={state.completed ?? false}
      progressValue={0}
      rewardBadges={state.rewardBadges ?? []}
      lockedRewardRarities={state.lockedRewardRarities}
      pendingRewards={state.pendingRewards}
      nightNotice={state.nightNotice}
      locked={state.locked ?? false}
    />
  )
}

/** 카드 제목 태그 — 읽지 못함 문구(«받을 보상을 불러오지 못했어요»)에도 «받을 보상»이 들어 있어 태그 경계로 구분한다 */
const CARD_TITLE = `>${d.missions.pendingCard.title}<`

const OPEN_BADGE: RewardBadgeInfo = { id: OPEN_ID, name: '주말 러너', image_url: null, rarity: 'rare' }
const OPEN_PENDING: PendingRewardInfo = { locked: false, id: OPEN_ID, name: '한강 러너 캡', image_url: 'https://cdn.example/open.png', rarity: 'rare' }
const LOCKED_PENDING: PendingRewardInfo = { locked: true, rarity: 'epic' }

describe('미션 상세 — 밤 안전 안내', () => {
  it('밤 조건 미션이면 안내가 늘 보인다(참가 전·참가 중·완료)', () => {
    for (const state of [{}, { participating: true }, { completed: true }] as State[]) {
      expect(render({ ...state, nightNotice: true })).toContain(d.missions.nightNotice)
    }
  })

  it('«달성 조건» 카드 바로 아래, 진행 상황 카드 위에 놓인다', () => {
    const html = render({ nightNotice: true, participating: true })

    const condition = html.indexOf(d.missions.conditionTitle)
    const notice = html.indexOf(d.missions.nightNotice)
    const progress = html.indexOf(d.missions.myProgressTitle)
    expect(condition).toBeGreaterThan(-1)
    expect(notice).toBeGreaterThan(condition)
    expect(progress).toBeGreaterThan(notice)
  })

  it('닫을 수 없다 — 안내 블록 안에 버튼이 없다', () => {
    const html = render({ nightNotice: true })
    const start = html.lastIndexOf('<div', html.indexOf(d.missions.nightNotice))
    const block = html.slice(start, html.indexOf('</div>', start))

    expect(block).toContain('role="status"')
    expect(block).not.toContain('<button')
  })

  it('밤 조건이 아니면 안내가 없다', () => {
    expect(render({ nightNotice: false })).not.toContain(d.missions.nightNotice)
    expect(render({})).not.toContain(d.missions.nightNotice)
  })

  it('잠긴 미션에서도 밤 조건이면 조건과 함께 안내를 보인다', () => {
    expect(render({ locked: true, nightNotice: true })).toContain(d.missions.nightNotice)
  })
})

describe('미션 상세 — 받을 보상을 읽지 못함', () => {
  it('완료한 미션이면 알림과 «다시 시도»를 보인다', () => {
    const html = render({ completed: true, pendingRewards: null })

    expect(html).toContain(d.missions.pendingCard.loadFailed)
    expect(html).toContain(d.missions.pendingCard.retry)
    expect(html).not.toContain(CARD_TITLE)
  })

  it('완료하지 않은 미션이면 아무것도 보이지 않는다', () => {
    const html = render({ completed: false, participating: true, pendingRewards: null })

    expect(html).not.toContain(d.missions.pendingCard.loadFailed)
    expect(html).not.toContain(d.missions.pendingCard.retry)
  })

  it('읽었지만 받을 보상이 없으면(빈 배열) 알림도 카드도 없다 — 읽지 못함과 구분된다', () => {
    const html = render({ completed: true, pendingRewards: [] })

    expect(html).not.toContain(d.missions.pendingCard.loadFailed)
    expect(html).not.toContain(CARD_TITLE)
  })

  it('pendingRewards를 넘기지 않아도(옛 호출부) 알림이 없다', () => {
    expect(render({ completed: true })).not.toContain(d.missions.pendingCard.loadFailed)
  })
})

describe('미션 상세 — 받을 보상 카드', () => {
  it('받을 보상이 있으면 제목·안내·«받기» 버튼이 있다', () => {
    const html = render({ completed: true, pendingRewards: [OPEN_PENDING, LOCKED_PENDING] })

    expect(html).toContain(CARD_TITLE)
    expect(html).toContain('보상 2개를 한 번에 받아요')
    expect(html).toContain(`>${d.missions.pendingCard.claim}<`)
    expect(html).not.toContain(d.missions.pendingCard.loadFailed)
  })

  it('히어로 아래, 달성 조건 카드 위에 놓인다. 잠금 안내보다도 위다', () => {
    const html = render({ completed: true, locked: true, pendingRewards: [OPEN_PENDING] })

    const hero = html.indexOf('주말 러닝')
    const card = html.indexOf(d.missions.pendingCard.title)
    const lockedTitle = html.indexOf(d.missions.lockedTitle)
    const condition = html.indexOf(d.missions.conditionTitle)
    expect(card).toBeGreaterThan(hero)
    expect(lockedTitle).toBeGreaterThan(card)
    expect(condition).toBeGreaterThan(lockedTitle)
  })

  it('받을 보상이 없으면 카드가 없다', () => {
    const html = render({ completed: true, pendingRewards: [] })

    expect(html).not.toContain(CARD_TITLE)
    expect(html).not.toContain(`>${d.missions.pendingCard.claim}<`)
  })

  it('열린 보상은 그림·이름·등급 칩을 보인다', () => {
    const html = render({ completed: true, pendingRewards: [OPEN_PENDING] })

    expect(html).toContain('한강 러너 캡')
    expect(html).toContain('Rare')
    expect(html).toContain('<img')
  })

  it('잠긴 보상은 잠금 타일·«잠긴 아이템 배지»·등급 칩만 보인다. 이름·그림·id가 DOM 어디에도 없다', () => {
    const html = render({ completed: true, pendingRewards: [LOCKED_PENDING] })

    expect(html).toContain(LOCKED_NAME)
    expect(html).toContain('Epic')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="/badges')
  })

  it('열린 보상과 잠긴 보상이 섞여도 잠긴 보상의 값은 DOM에 없다', () => {
    const html = render({ completed: true, pendingRewards: [OPEN_PENDING, LOCKED_PENDING] })

    expect(html).toContain('한강 러너 캡')
    expect(html).toContain(LOCKED_NAME)
    // 잠긴 보상 쪽에서 새어 나올 수 있는 값: 비밀 이름·그림·id는 애초에 props에 없으므로, 등급 말고 어떤 id도 싣지 않는다
    expect(html.split(LOCKED_NAME).length - 1).toBe(1)
  })

  it('값이 섞여 들어와도(계약 위반) 잠긴 보상의 이름·그림 주소·id는 그리지 않는다', () => {
    const leaked = { locked: true, rarity: 'epic', id: 'leaked-id-1234', name: '비밀 장갑', image_url: 'https://cdn.example/secret.png' } as unknown as PendingRewardInfo

    const html = render({ completed: true, pendingRewards: [leaked] })

    expect(html).toContain(LOCKED_NAME)
    expect(html).not.toContain('비밀 장갑')
    expect(html).not.toContain('secret.png')
    expect(html).not.toContain('leaked-id-1234')
  })

  it('받는 중·안내 상태가 아닌 처음 모양에는 InlineNotice가 없다', () => {
    const html = render({ completed: true, pendingRewards: [OPEN_PENDING] })

    expect(html).not.toContain('role="status"')
  })

  it('보상 행의 긴 이름은 줄여서(truncate) 넘치지 않게 한다', () => {
    const longName = '아주아주아주아주아주아주아주아주아주아주아주아주 긴 이름의 배지'
    const html = render({
      completed: true,
      pendingRewards: [{ locked: false, id: OPEN_ID, name: longName, image_url: null, rarity: 'rare' }],
    })

    const nameTag = html.slice(html.lastIndexOf('<p', html.indexOf(longName)), html.indexOf(longName))
    expect(nameTag).toContain('truncate')
    expect(nameTag).toContain('break-keep')
  })
})

describe('미션 상세 — 보상 카드의 잠긴 보상 행', () => {
  it('열린 배지 행 뒤에 잠긴 보상 행이 이어지고, 포인트 행은 그 뒤다', () => {
    const html = render({
      rewardBadges: [OPEN_BADGE],
      lockedRewardRarities: ['epic'],
      rewardPoints: 300,
      completed: true,
    })

    const open = html.indexOf('주말 러너')
    const locked = html.indexOf(LOCKED_NAME)
    const points = html.indexOf('300 포인트')
    expect(open).toBeGreaterThan(-1)
    expect(locked).toBeGreaterThan(open)
    expect(points).toBeGreaterThan(locked)
  })

  it('잠긴 보상 행은 등급 칩과 «완료하면 획득해요»를 보이고 링크가 없다', () => {
    const html = render({ lockedRewardRarities: ['epic'] })

    expect(html).toContain(LOCKED_NAME)
    expect(html).toContain('Epic')
    expect(html).toContain(d.missions.rewardBadgeCaption)
    expect(html).not.toContain('href="/badges')
  })

  it('잠긴 보상만 있어도 보상 카드가 그려진다', () => {
    const html = render({ lockedRewardRarities: ['rare'] })

    expect(html).toContain(d.missions.rewardSectionTitle)
    expect(html).toContain(LOCKED_NAME)
  })

  it('보상이 아무것도 없으면 보상 카드가 없다', () => {
    expect(render({})).not.toContain(d.missions.rewardSectionTitle)
  })

  it('잠긴 보상이 여러 개면 개수만큼 행이 있다', () => {
    const html = render({ lockedRewardRarities: ['epic', null, 'rare'] })

    expect(html.split(LOCKED_NAME).length - 1).toBe(3)
  })

  it('잠긴 보상 행에 그림이 없다', () => {
    expect(render({ lockedRewardRarities: ['epic'] })).not.toContain('<img')
  })
})
