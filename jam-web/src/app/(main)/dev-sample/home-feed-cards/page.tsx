import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/ui/TopNav'
import { SearchIcon } from '@/components/ui/icons'
import CapsuleWidget from '@/components/capsule/CapsuleWidget'
import StravaDisconnectedCard from '@/components/strava/StravaDisconnectedCard'
import TodayCard from '@/components/today/TodayCard'
import { toCardView } from '@/lib/today/cardView'
import type { ResolvedBadge, TodayCardWithHref } from '@/lib/today/cards'
import type { TodayLeftStatus, TodayRightStatus } from '@/lib/today/status'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'
import type { RealStepsView } from '@/lib/onboarding-quest/real-view'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'
import { CARD_SHAPES, type CardShape } from '@/lib/today/shape'
import { d, t } from '@/lib/i18n'
import type { TodayCardLayoutType, TodayCardTemplateType } from '@/types/database'
import OnboardingQuestCard from '../../OnboardingQuestCard'
import SuspensionBanner from '../../SuspensionBanner'
import TodayStatusStrip from '../../TodayStatusStrip'

/**
 * 샘플 전용 — 홈 화면(`(main)/page.tsx`)과 같은 틀(상단 내비·탭 바·푸터·여백) 안에 홈에 나올 수 있는 요소를 전부 그린다.
 * 홈 상단 요소(이용 정지 배너·인사말·캡슐·Strava 끊김 카드·«JAM! 시작하기» 카드·오늘의 현황 스트립)의 상태별 모습과,
 * 홈피드 카드 유형(template_type 10개) × 모양(shape 7개) 전체 조합, 주요 변형을 한 화면에 모은다.
 * 링크가 없는 숨은 경로다(메뉴·홈 어디에도 연결하지 않는다). DB를 읽지 않고 손으로 만든 값을 실제 변환(`toCardView`)과
 * 실제 컴포넌트에 그대로 넣는다 — 홈과 같은 코드로 그려지므로 디자인이 바뀌면 이 화면도 따라 바뀐다.
 * 계측 정보(`tracking`)를 싣지 않아 카드의 노출·클릭 기록이 남지 않고 카드 전체 링크도 걸리지 않는다.
 * 데이터를 바꾸는 버튼(연출 동기화 등)은 일부러 그리지 않는 상태만 골랐다 — 눌러도 이동만 일어난다.
 */

export const metadata: Metadata = {
  title: '홈피드 카드 전체 샘플',
  robots: { index: false, follow: false },
}

// 남은 시간 줄(7일 이내)이 요청 시각 기준으로 계산되도록 매 요청 새로 그린다.
export const dynamic = 'force-dynamic'

const STORAGE = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images'
const CARD_COVER = '/dev-sample/card-cover.webp'
// square 모양은 이미지를 자르지 않고 칸에 맞추므로(1:1), 가로를 꽉 채우려면 정사각으로 자른 이미지를 쓴다
const CARD_COVER_SQUARE = '/dev-sample/card-cover-square.webp'

const COVER = {
  walk: CARD_COVER,
  collection: CARD_COVER,
  intro: CARD_COVER,
  drop: CARD_COVER,
  stroll: CARD_COVER,
  mountain: CARD_COVER,
  subway: CARD_COVER,
  salon: CARD_COVER,
  video: `${STORAGE}/today_cards/asset-generator/e0000000-0000-4000-8000-000000000001.mp4?v=1792680584507`,
}

const BADGE_ART = ['s008', 's094', 's001', 's003', 's004', 's005', 's006', 's007'].map((id) => `/badges/sample/${id}.png`)
const BADGE_NAMES = ['성수동 탐험가', '한강 물병', '뚝섬 돗자리', '서울숲 손전등', '새벽 러너', '겨울잠 담요', '산책 지도', '지하철 패스']
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'rare', 'common', 'epic', 'rare']

function badges(count: number, earnedEvery = 2): ResolvedBadge[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sample-badge-${i}`,
    name: BADGE_NAMES[i % BADGE_NAMES.length],
    image_url: BADGE_ART[i % BADGE_ART.length],
    rarity: RARITIES[i % RARITIES.length],
    earned: i % earnedEvery === 0,
  }))
}

const DAY = 24 * 60 * 60 * 1000

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString()
}

/** 템플릿별 대표 값(제목·부제·설명·커버·연결 자원). 모양만 바꿔 7장을 그린다. */
interface TemplateSample {
  template: TodayCardTemplateType
  name: string
  base: Partial<TodayCardWithHref>
}

const RANKING = {
  entries: [
    {
      userId: 'u1',
      displayName: '새벽러너',
      username: 'dawnrun',
      avatarUrl: null,
      value: 128400,
      rank: 1,
    },
    {
      userId: 'u2',
      displayName: '성수산책',
      username: 'seongsu',
      avatarUrl: null,
      value: 97250,
      rank: 2,
    },
    {
      userId: 'u3',
      displayName: '한강라이더',
      username: 'hanriver',
      avatarUrl: null,
      value: 81030,
      rank: 3,
    },
    {
      userId: 'u4',
      displayName: '뚝섬걷기',
      username: 'ttukseom',
      avatarUrl: null,
      value: 64500,
      rank: 4,
    },
    {
      userId: 'u5',
      displayName: '서울숲러버',
      username: 'seoulforest',
      avatarUrl: null,
      value: 51200,
      rank: 5,
    },
  ],
  totalParticipants: 342,
  metricType: 'condition_field' as const,
  missionType: null,
  conditionFieldKey: 'distance',
}

function buildTemplates(): TemplateSample[] {
  const MISSION = {
    starts_at: iso(-3),
    ends_at: iso(20),
    reward_points: 300,
    reward_badge_count: 1,
    image_url: null,
  }
  return [
    {
      template: 'mission_spotlight',
      name: '미션 소개',
      base: {
        title: '10km, 걸어서 채워 볼까요',
        subtitle: '이번 주 걷기 미션',
        description: '이번 주 안에 걸어서 10km를 채우면 포인트와 배지를 받아요.',
        cover_image_url: COVER.walk,
        resolved_mission: MISSION,
        badge_ids: ['b0', 'b1', 'b2', 'b3'],
        resolved_badges: badges(4),
      },
    },
    {
      template: 'drop_alert',
      name: '드랍 알림',
      base: {
        title: '드랍하고, 픽업하고, 이어가기',
        subtitle: '성수동에 새 박스가 떨어졌어요',
        description: '근처를 지나가며 박스를 열어 봐요.',
        cover_image_url: COVER.drop,
        region_label: '성동구 성수동',
        badge_ids: ['b0', 'b1', 'b2'],
        resolved_badges: badges(3),
      },
    },
    {
      template: 'badge_spotlight',
      name: '배지 소개 (배지 1개)',
      base: {
        title: '새벽에만 주어지는 배지',
        subtitle: '해 뜨기 전에 달린 사람에게',
        description: '새벽 6시 전에 5km 이상 달리면 받을 수 있어요.',
        cover_image_url: null,
        badge_ids: ['b0'],
        resolved_badges: badges(1),
      },
    },
    {
      template: 'editorial_article',
      name: '기사',
      base: {
        title: '겨울 러닝, 이것만 챙겨요',
        subtitle: 'JAM! 에디터 노트',
        description: '추운 날에도 즐겁게 달리는 방법을 모았어요.',
        cover_image_url: COVER.mountain,
        starts_at: iso(-1),
        body_markdown: '## 본문\n샘플 본문이에요.',
      },
    },
    {
      template: 'ranking_board',
      name: '랭킹',
      base: {
        title: '이번 주 거리 랭킹',
        subtitle: '가장 멀리 간 사람들',
        cover_image_url: COVER.subway,
        resolved_ranking: RANKING,
      },
    },
    {
      template: 'itembook_milestone',
      name: '컬렉션 소식',
      base: {
        title: '컬렉션 「겨울잠의 안식처」',
        subtitle: '새 컬렉션이 열렸어요',
        description: '아이템 배지를 모아 컬렉션을 완성해 봐요.',
        cover_image_url: COVER.collection,
        resolved_collection: { name: '겨울잠의 안식처', item_count: 8 },
        badge_ids: ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'],
        resolved_badges: badges(6),
      },
    },
    {
      template: 'progress_nudge',
      name: '진행 알림 (자동)',
      base: {
        title: '목표까지 2km 남았어요',
        subtitle: '조금만 더 걸어 봐요',
        description: '오늘 산책 한 번이면 미션을 마칠 수 있어요.',
        cover_image_url: COVER.stroll,
        resolved_mission: { ...MISSION, ends_at: iso(2.5) },
        badge_ids: ['b0', 'b1'],
        resolved_badges: badges(2),
      },
    },
    {
      template: 'location_trend',
      name: '지역 트렌드 (자동)',
      base: {
        title: '요즘 서울숲에 사람이 많아요',
        subtitle: '이번 주 가장 붐빈 장소',
        description: '서울숲 근처를 지나며 체크인해 봐요.',
        cover_image_url: COVER.salon,
        region_label: '성동구 성수동',
        badge_ids: ['b0', 'b1', 'b2'],
        resolved_badges: badges(3),
      },
    },
    {
      template: 'recipe_reveal',
      name: '레시피 공개 (공개 뒤)',
      base: {
        title: '새 조합 레시피가 열렸어요',
        subtitle: '재료 4개로 만드는 배지',
        description: '가진 아이템 배지를 조합해 새 배지를 만들어 봐요.',
        cover_image_url: COVER.intro,
        recipe_id: 'sample-recipe',
        resolved_recipe: {
          state: 'released',
          ingredient_count: 4,
          reward_points: 200,
          reward_badge_count: 1,
          tiles: badges(4),
        },
      },
    },
    {
      template: 'content_intro',
      name: '컨텐츠 소개',
      base: {
        title: '입동 주간, 처음 가는 곳으로',
        subtitle: '이번 주의 이야기',
        description: '처음 가 보는 동네에서 새로운 배지를 찾아봐요.',
        cover_image_url: COVER.intro,
      },
    },
  ]
}

/** 손으로 만든 카드 행. 서버 조회 결과(`TodayCardWithHref`)와 같은 형태다. */
function row(template: TodayCardTemplateType, overrides: Partial<TodayCardWithHref>): TodayCardWithHref {
  return {
    id: `sample-${template}-${overrides.shape ?? 'legacy'}-${overrides.layout_type ?? 'default'}-${overrides.title ?? ''}`,
    template_type: template,
    layout_type: 'large_thumbnail',
    title: '제목',
    subtitle: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: [],
    starts_at: iso(-1),
    ends_at: iso(30),
    sort_order: 0,
    is_active: true,
    created_at: iso(-1),
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    description: null,
    shape: null,
    title_in_image: false,
    resolved_href: '#',
    resolved_badges: [],
    resolved_ranking: null,
    ...overrides,
  }
}

const SHAPE_NAMES: Record<CardShape, string> = {
  hero: 'hero · 16:9 큰 이미지',
  poster: 'poster · 4:5 세로 포스터',
  square: 'square · 1:1 정사각',
  brief: 'brief · 이미지 없는 짧은 카드',
  list: 'list · 타일/순위 목록',
  dome: 'dome · 아치 돔',
  ticket: 'ticket · 펀칭 티켓',
}

/** 카드 하나를 짧은 이름표와 함께 그린다. */
function Sample({ caption, card }: { caption?: string; card: TodayCardWithHref }) {
  const view = toCardView(card)
  return (
    <div className="flex flex-col gap-1.5">
      {caption && <p className="text-[12px] text-[var(--muted)] px-1">{caption}</p>}
      <TodayCard view={view} currentUserId="u3" />
    </div>
  )
}

interface Variant {
  id: string
  title: string
  card: TodayCardWithHref
}

function buildVariants(TEMPLATES: TemplateSample[]): Variant[] {
  const MISSION = TEMPLATES[0].base.resolved_mission!
  return [
    {
      id: 'v-dome-poster',
      title: 'dome 포스터형',
      card: row('content_intro', {
        ...TEMPLATES[9].base,
        shape: 'dome',
        layout_type: 'banner' as TodayCardLayoutType,
      }),
    },
    {
      id: 'v-title-in-image',
      title: '제목이 이미지 안에 있는 카드',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'hero',
        title_in_image: true,
      }),
    },
    {
      id: 'v-title-in-image-poster',
      title: '제목이 이미지 안에 있는 포스터',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'poster',
        title_in_image: true,
      }),
    },
    {
      id: 'v-no-image',
      title: '이미지 없음 · 자리 표시',
      card: row('drop_alert', {
        ...TEMPLATES[1].base,
        shape: 'hero',
        cover_image_url: null,
        badge_ids: [],
        resolved_badges: [],
      }),
    },
    {
      id: 'v-no-image-title',
      title: '이미지 없음 + 이미지 속 제목',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'hero',
        cover_image_url: null,
        badge_ids: [],
        resolved_badges: [],
        title_in_image: true,
      }),
    },
    {
      id: 'v-video',
      title: '동영상 커버',
      card: row('drop_alert', {
        ...TEMPLATES[1].base,
        shape: 'poster',
        layout_type: 'banner',
        cover_image_url: COVER.video,
      }),
    },
    {
      id: 'v-badge-cover-dimmed',
      title: '커버 없음 · 첫 배지 그림 승격 (미보유 흑백)',
      card: row('badge_spotlight', {
        ...TEMPLATES[2].base,
        shape: 'square',
        resolved_badges: badges(1).map((b) => ({ ...b, earned: false })),
      }),
    },
    {
      id: 'v-brief-thumb-dimmed',
      title: 'brief · 배지 썸네일 미보유 흑백',
      card: row('badge_spotlight', {
        ...TEMPLATES[2].base,
        shape: 'brief',
        resolved_badges: badges(1).map((b) => ({ ...b, earned: false })),
      }),
    },
    {
      id: 'v-mission-ending',
      title: '미션 마감 임박 (남은 시간)',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'hero',
        resolved_mission: { ...MISSION, ends_at: iso(0.3) },
      }),
    },
    {
      id: 'v-mission-ongoing',
      title: '상시 미션',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'ticket',
        cover_image_url: COVER.stroll,
        resolved_mission: { ...MISSION, ends_at: null },
      }),
    },
    {
      id: 'v-recipe-scheduled',
      title: '레시피 공개 전',
      card: row('recipe_reveal', {
        ...TEMPLATES[8].base,
        shape: 'list',
        resolved_recipe: {
          state: 'scheduled',
          ingredient_count: 4,
          release_at: iso(5),
        },
      }),
    },
    {
      id: 'v-recipe-scheduled-hero',
      title: '레시피 공개 전 (hero)',
      card: row('recipe_reveal', {
        ...TEMPLATES[8].base,
        shape: 'hero',
        resolved_recipe: {
          state: 'scheduled',
          ingredient_count: 4,
          release_at: iso(5),
        },
      }),
    },
    {
      id: 'v-ranking-empty',
      title: '랭킹 빈 상태',
      card: row('ranking_board', {
        ...TEMPLATES[4].base,
        shape: 'list',
        resolved_ranking: { ...RANKING, entries: [], totalParticipants: 0 },
      }),
    },
    {
      id: 'v-list-many',
      title: 'list · 타일 8개 (가로 스크롤)',
      card: row('itembook_milestone', {
        ...TEMPLATES[5].base,
        shape: 'list',
        resolved_badges: badges(8),
      }),
    },
    {
      id: 'v-minimal',
      title: '최소 카드 (제목만)',
      card: row('content_intro', { title: '제목만 있는 카드', shape: 'brief' }),
    },
    {
      id: 'v-legacy',
      title: '옛 카드 (shape 없음)',
      card: row('drop_alert', {
        ...TEMPLATES[1].base,
        shape: null,
        layout_type: 'banner',
      }),
    },
  ]
}

// ─── 홈 상단 요소 샘플 값 ──────────────────────────────────────────────

const CAPSULE_BASE: CapsuleStatus = {
  required: 100,
  filled: 42,
  remaining: 58,
  balance: 42,
  openable: false,
  notOpenableReason: 'not_full',
  freeSlots: 12,
  neededSlots: 3,
  pendingCount: 0,
  jamBlocked: false,
  claim: { blockedReason: null, freeSlots: 12, neededSlots: 3 },
  notice: 'none',
  pendingItemCount: 0,
  shortfall: 0,
}

const CAPSULES: { label: string; status: CapsuleStatus }[] = [
  { label: '캡슐 · 채우는 중', status: CAPSULE_BASE },
  {
    label: '캡슐 · 가득 참(열 수 있음)',
    status: { ...CAPSULE_BASE, filled: 100, remaining: 0, balance: 100, openable: true, notOpenableReason: null },
  },
  {
    label: '캡슐 · 막힘(빈칸 부족)',
    status: {
      ...CAPSULE_BASE,
      filled: 100,
      remaining: 0,
      balance: 100,
      notOpenableReason: 'no_free_slots',
      freeSlots: 1,
      neededSlots: 3,
      claim: { blockedReason: 'no_slots', freeSlots: 1, neededSlots: 3 },
      notice: 'blocked',
      pendingItemCount: 2,
      shortfall: 1,
    },
  },
]

const REAL_SYNC: RealStepsView = {
  rows: [
    { key: 'sync', state: 'current' },
    { key: 'locked', state: 'pending' },
  ],
  doneCount: 0,
  total: 2,
  current: { step: 'sync', stravaConnected: false },
  stravaConnected: false,
}

const REAL_LOCKED: RealStepsView = {
  rows: [
    { key: 'sync', state: 'done' },
    { key: 'locked', state: 'current' },
  ],
  doneCount: 1,
  total: 2,
  current: { step: 'locked', target: { itemId: 'sample-item', need: 300 }, shortage: { have: 120, need: 300 } },
  stravaConnected: true,
}

const QUESTS: { label: string; state: OnboardingQuestCardState }[] = [
  {
    label: '«JAM! 시작하기» · 연출 진행 중(3/7)',
    state: { kind: 'in_progress', done: 3, total: 7, nextStep: 'mix_fail', real: REAL_SYNC },
  },
  { label: '«JAM! 시작하기» · 내 활동 ① 연동 전', state: { kind: 'real', real: REAL_SYNC } },
  { label: '«JAM! 시작하기» · 내 활동 ② 잠긴 아이템 배지(포인트 부족)', state: { kind: 'real', real: REAL_LOCKED } },
]

const STRIPS: { label: string; left: TodayLeftStatus; right: TodayRightStatus }[] = [
  {
    label: '현황 · 미션 진행 + 친구 활동 여럿',
    left: { kind: 'progress', name: '10km, 걸어서 채워 볼까요', current: 6.4, total: 10, missionType: 'distance', href: '/missions' },
    right: { kind: 'friend_activity', count: 3, href: '/feed', singleFriendName: null },
  },
  {
    label: '현황 · 컬렉션 진행 + 친구 활동 한 명',
    left: { kind: 'progress', name: '겨울잠의 안식처', current: 3, total: 8, missionType: null, href: '/collections' },
    right: { kind: 'friend_activity', count: 1, href: '/feed', singleFriendName: '새벽러너' },
  },
  {
    label: '현황 · 미션 제안 + 팔로잉 없음',
    left: { kind: 'suggestion', text: '진행 중인 미션을 시작해 볼까요', category: 'missions', href: '/missions' },
    right: { kind: 'no_following', href: '/search' },
  },
  {
    label: '현황 · 드랍 제안 + 친구 활동 없음',
    left: { kind: 'suggestion', text: '근처 드랍을 찾아볼까요', category: 'drops', href: '/drops' },
    right: { kind: 'none' },
  },
  {
    label: '현황 · Strava 미연동',
    left: { kind: 'strava_not_connected', href: '/api/strava/auth' },
    right: { kind: 'none' },
  },
]

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] text-[var(--muted)] px-1">{label}</p>
      {children}
    </div>
  )
}

function GroupTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-lg font-bold pt-3 scroll-mt-4 border-b border-[var(--border,#e5e5e5)] pb-2">
      {children}
    </h2>
  )
}

export default function HomeFeedCardsSamplePage() {
  const TEMPLATES = buildTemplates()
  const VARIANTS = buildVariants(TEMPLATES)
  return (
    <div className="min-h-full text-foreground">
      <TopNav logo />

      <div className="px-4 pt-4 pb-6 flex flex-col gap-5">
        <nav className="flex flex-wrap gap-1.5">
          <a href="#home-top" className="text-[12px] px-2.5 py-1 rounded-full bg-foreground text-background">
            홈 상단
          </a>
          {TEMPLATES.map((tpl) => (
            <a key={tpl.template} href={`#t-${tpl.template}`} className="text-[12px] px-2.5 py-1 rounded-full bg-[var(--surface,#f2f2f2)]">
              {tpl.name}
            </a>
          ))}
          <a href="#variants" className="text-[12px] px-2.5 py-1 rounded-full bg-foreground text-background">
            변형
          </a>
        </nav>

        <GroupTitle id="home-top">홈 상단</GroupTitle>

        <Labeled label="이용 정지 배너">
          <SuspensionBanner reason="커뮤니티 운영 정책 위반" suspendedAt={new Date().toISOString()} />
        </Labeled>

        <Labeled label="인사말 줄">
          <div className="flex items-center justify-between gap-4">
            <p className="text-base font-bold truncate">{t(d.todayStatus.greeting, { name: '러너' })}</p>
            <Link
              href="/search"
              aria-label={d.today.searchAriaLabel}
              className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-100"
            >
              <span className="w-9 h-9 rounded-full bg-surface text-foreground flex items-center justify-center">
                <SearchIcon className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </Labeled>

        {CAPSULES.map((c) => (
          <Labeled key={c.label} label={c.label}>
            <CapsuleWidget initial={c.status} blockedCard />
          </Labeled>
        ))}

        {QUESTS.map((q) => (
          <Labeled key={q.label} label={q.label}>
            <OnboardingQuestCard state={q.state} username="sample" />
          </Labeled>
        ))}

        <Labeled label="Strava 동기화 끊김 카드">
          <StravaDisconnectedCard />
        </Labeled>

        {STRIPS.map((s) => (
          <Labeled key={s.label} label={s.label}>
            <TodayStatusStrip left={s.left} right={s.right} />
          </Labeled>
        ))}

        {TEMPLATES.map((tpl) => (
          <section key={tpl.template} className="flex flex-col gap-2">
            <GroupTitle id={`t-${tpl.template}`}>{tpl.name}</GroupTitle>
            {CARD_SHAPES.map((shape) => (
              <Sample
                key={shape}
                caption={SHAPE_NAMES[shape]}
                card={row(tpl.template, {
                  ...tpl.base,
                  cover_image_url:
                    shape === 'square' && tpl.base.cover_image_url === CARD_COVER ? CARD_COVER_SQUARE : tpl.base.cover_image_url,
                  shape,
                  layout_type: shape === 'ticket' ? 'ticket' : shape === 'dome' ? 'dome' : 'large_thumbnail',
                })}
              />
            ))}
          </section>
        ))}

        <section className="flex flex-col gap-2">
          <GroupTitle id="variants">변형</GroupTitle>
          {VARIANTS.map((v) => (
            <Sample key={v.id} caption={v.title} card={v.card} />
          ))}
        </section>
      </div>
    </div>
  )
}
