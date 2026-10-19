/**
 * 서비스 화면 이미지 렌더 지점의 미등록 호스트 내성 테스트 (티켓 20260925_2358).
 *
 * `next/image`는 `images.remotePatterns`에 없는 호스트를 만나면 **렌더 시점에 throw**해 화면 전체가
 * 오류 화면이 된다. 어드민이 넣는 배지·컬렉션·트라이브 이미지를 그리는 컴포넌트는 `SafeImage`를
 * 거쳐야 이 예외가 나지 않는다. 저장소에는 jsdom·testing-library가 없어(새 의존성 금지) 서버 렌더
 * (`renderToStaticMarkup`)로 「미등록 호스트 URL이어도 예외 없이 `<img>`가 그려진다」를 고정한다.
 *
 * 서버 렌더가 어려운 컴포넌트(라우터·데이터 페치·오버레이 훅 의존)는 아래 「SafeImage 계약」 블록의
 * 계약 테스트가 대신하고, 이유는 티켓 완료 기록에 있다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ActivityFeedRow, MissionRow } from '@/types/database'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import SafeImage from '@/components/SafeImage'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import RecipeRewardRow from '@/app/(main)/combine/RecipeRewardRow'
import FeedSection, { DetailSheet } from '@/app/(main)/FeedSection'
import MissionDetailClient from '@/app/(main)/missions/[id]/MissionDetailClient'

/** `next.config.ts`의 remotePatterns에 없는 호스트 — 어드민이 직접 넣을 수 있는 값이다 */
const UNREGISTERED = 'https://storage.heypop.kr/badges/unregistered.png'
/** 등록된 호스트(Supabase Storage 공개 오브젝트) */
const REGISTERED = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/badges/a.png'

function feedRow(id: string, over: Partial<ActivityFeedRow> & { metadata: Record<string, unknown> }): ActivityFeedRow {
  return {
    id,
    user_id: 'u1',
    event_type: 'badge_earned',
    event_at: '2026-09-25T00:00:00Z',
    created_at: '2026-09-25T00:00:00Z',
    strava_activity_id: null,
    ...over,
  }
}

describe('SafeImage 계약 — 미등록 호스트', () => {
  it('미등록 호스트 URL은 예외 없이 <img>로 그린다 (고정 크기)', () => {
    const html = renderToStaticMarkup(<SafeImage src={UNREGISTERED} alt="배지" width={40} height={40} />)
    expect(html).toContain('<img')
    expect(html).toContain(UNREGISTERED)
  })

  it('src가 비어 있거나 null이면 fallback을 그린다', () => {
    const fb = <span data-testid="fb">대체</span>
    expect(renderToStaticMarkup(<SafeImage src={null} alt="" width={40} height={40} fallback={fb} />)).toContain('data-testid="fb"')
    expect(renderToStaticMarkup(<SafeImage src="  " alt="" width={40} height={40} fallback={fb} />)).toContain('data-testid="fb"')
  })

  it('등록 호스트 URL도 예외 없이 <img>를 그린다', () => {
    const html = renderToStaticMarkup(<SafeImage src={REGISTERED} alt="배지" width={40} height={40} />)
    expect(html).toContain('<img')
  })
})

describe('미등록 호스트 이미지 URL이어도 컴포넌트가 예외 없이 렌더된다', () => {
  it('BadgeGridCard (배지 목록·컬렉션 표지)', () => {
    const html = renderToStaticMarkup(<BadgeGridCard name="테스트 배지" imageUrl={UNREGISTERED} rarity="common" href="/badges/1" />)
    expect(html).toContain('<img')
    expect(html).toContain(UNREGISTERED)
  })

  it('BadgeGridCard — 이미지가 없으면 메달 아이콘 폴백(<img> 없음)', () => {
    const html = renderToStaticMarkup(<BadgeGridCard name="테스트 배지" imageUrl={null} rarity="common" href="/badges/1" />)
    expect(html).not.toContain('<img')
    expect(html).toContain('<svg')
  })

  it('RecipeRewardRow (컴바인 레시피 보상 행)', () => {
    const html = renderToStaticMarkup(
      <RecipeRewardRow
        title="레시피"
        slotCount={2}
        points={0}
        badges={[{ id: 'b1', name: '보상 배지', image_url: UNREGISTERED, rarity: 'common' }]}
      />
    )
    expect(html).toContain('<img')
    expect(html).toContain(UNREGISTERED)
  })

  it('FeedSection — 단건 카드(40px)와 활동 묶음 썸네일(24px)', () => {
    const feedItems = [
      feedRow('single', { metadata: { badge_id: 'b0', badge_name: '단건', badge_image_url: UNREGISTERED } }),
      feedRow('g1', { strava_activity_id: 1, metadata: { badge_id: 'b1', badge_name: '묶음1', badge_image_url: UNREGISTERED } }),
      feedRow('g2', { strava_activity_id: 1, metadata: { badge_id: 'b2', badge_name: '묶음2', badge_image_url: UNREGISTERED } }),
    ]
    const html = renderToStaticMarkup(<FeedSection feedItems={feedItems} />)
    // 단건 카드 40px + 묶음 썸네일 24px×2 + 묶음을 펼쳤을 때의 카드 40px×2(접힌 패널도 DOM에 남는다)
    expect(html).toContain('width="40"')
    expect(html).toContain('width="24"')
    expect(html).toContain(UNREGISTERED)
  })

  it('FeedSection DetailSheet — 배지 이미지 112px', () => {
    const item = feedRow('d1', { metadata: { badge_id: 'b1', badge_name: '상세', badge_image_url: UNREGISTERED } })
    const html = renderToStaticMarkup(
      <DetailSheet item={item} open onClose={() => {}} onClosed={() => {}} badgeLinkQuery="" />
    )
    expect(html).toContain('width="112"')
    expect(html).toContain(UNREGISTERED)
  })

  it('FeedSection DetailSheet — 이미지가 없으면 이벤트 아이콘 폴백', () => {
    const item = feedRow('d2', { metadata: { badge_id: 'b1', badge_name: '상세' } })
    const html = renderToStaticMarkup(
      <DetailSheet item={item} open onClose={() => {}} onClosed={() => {}} badgeLinkQuery="" />
    )
    expect(html).not.toContain('width="112"')
  })

  it('MissionDetailClient — 보상 배지 행(52px)', () => {
    // 이 테스트가 읽는 필드만 채운 최소 픽스처다 — 나머지 컬럼은 화면이 참조하지 않는다.
    const mission = {
      id: 'm1',
      title: '테스트 미션',
      description: null,
      mission_type: 'distance',
      condition_json: { distance_km: 10 },
      reward_points: null,
      reward_badge_ids: ['b1'],
      starts_at: '2026-01-01T00:00:00Z',
      ends_at: null,
      image_url: null,
    } as unknown as MissionRow
    const html = renderToStaticMarkup(
      <MissionDetailClient
        mission={mission}
        isParticipating={false}
        isCompleted={false}
        progressValue={0}
        rewardBadges={[{ id: 'b1', name: '보상 배지', image_url: UNREGISTERED, rarity: 'common' }]}
      />
    )
    expect(html).toContain('width="52"')
    expect(html).toContain(UNREGISTERED)
  })
})
