import type { Metadata } from 'next'
import TodayCard from '@/components/today/TodayCard'
import { toCardView } from '@/lib/today/cardView'
import type { ResolvedBadge, TodayCardWithHref } from '@/lib/today/cards'
import { CARD_SHAPES, type CardShape } from '@/lib/today/shape'
import type { TodayCardLayoutType, TodayCardTemplateType } from '@/types/database'

/**
 * 샘플 전용 — 홈피드에 노출될 수 있는 카드 유형(template_type 10개) × 모양(shape 7개) 전체 조합과
 * 주요 변형(돔 포스터형·이미지 속 제목·이미지 없음·동영상·미보유 흑백·레시피 공개 전후·랭킹 빈 상태 등)을 한 화면에 그린다.
 * 링크가 없는 숨은 경로다(메뉴·홈 어디에도 연결하지 않는다). DB를 읽지 않고 손으로 만든 카드 행을 실제 변환(`toCardView`)과
 * 실제 렌더러(`TodayCard`)에 그대로 넣는다 — 홈과 같은 코드로 그려지므로 카드 디자인이 바뀌면 이 화면도 따라 바뀐다.
 * 계측 정보(`tracking`)를 싣지 않아 노출·클릭 기록이 남지 않고 카드 전체 링크도 걸리지 않는다.
 */

export const metadata: Metadata = {
  title: '홈피드 카드 전체 샘플',
  robots: { index: false, follow: false },
}

// 남은 시간 줄(7일 이내)이 요청 시각 기준으로 계산되도록 매 요청 새로 그린다.
export const dynamic = 'force-dynamic'

const STORAGE = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images'
const COVER = {
  walk: `${STORAGE}/ops-inbox/today_cards/315404ce-31a2-4758-8661-a21d1b47091f.webp?v=1793669389268`,
  collection: `${STORAGE}/ops-inbox/today_cards/d8443781-194a-4a04-a16a-096bafdb1dcf.webp?v=1793611221002`,
  intro: `${STORAGE}/ops-inbox/today_cards/4589e1b0-0d94-415f-b14a-de67625977cd.webp?v=1793611202424`,
  drop: `${STORAGE}/ops-inbox/today_cards/6377b1b0-527b-4911-ab3c-7289f3f2318e.webp?v=1793611212547`,
  stroll: `${STORAGE}/ops-inbox/today_cards/578d143e-d260-4266-baa0-f8557ff6929d.webp?v=1793611209572`,
  mountain: `${STORAGE}/ops-inbox/today_cards/d6050f14-33b5-4453-a5ba-1a6090daca60.webp?v=1793611219079`,
  subway: `${STORAGE}/ops-inbox/today_cards/d08c9729-5940-471d-a9c4-319db3bd9f00.webp?v=1793611206271`,
  salon: `${STORAGE}/missions/asset-generator/b1009708-3258-477d-9278-107ad2c67d12.webp?v=1790435221169`,
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

/** 카드 하나를 캡션과 함께 그린다. 그려진 모양이 요청한 모양과 다르면(예: 타일 0개 list → brief) 캡션에 적는다. */
function Sample({ caption, card }: { caption: string; card: TodayCardWithHref }) {
  const view = toCardView(card)
  const requested = card.shape
  const fellBack = requested && requested !== view.shape
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] text-[var(--muted)] px-1">
        {caption}
        {fellBack && <span className="text-[var(--danger,#d4380d)]">{` → 실제로는 ${view.shape}로 그려짐`}</span>}
      </p>
      <TodayCard view={view} currentUserId="u3" />
    </div>
  )
}

interface Variant {
  id: string
  title: string
  note: string
  card: TodayCardWithHref
}

function buildVariants(TEMPLATES: TemplateSample[]): Variant[] {
  const MISSION = TEMPLATES[0].base.resolved_mission!
  return [
    {
      id: 'v-dome-poster',
      title: 'dome 포스터형',
      note: 'layout_type = banner인 돔 카드. 이미지 위 어두운 막에 제목과 정보 줄을 얹는다.',
      card: row('content_intro', {
        ...TEMPLATES[9].base,
        shape: 'dome',
        layout_type: 'banner' as TodayCardLayoutType,
      }),
    },
    {
      id: 'v-title-in-image',
      title: '제목이 이미지 안에 있는 카드',
      note: 'title_in_image = true. 본문 제목을 그리지 않는다(hero).',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'hero',
        title_in_image: true,
      }),
    },
    {
      id: 'v-title-in-image-poster',
      title: '제목이 이미지 안에 있는 포스터',
      note: 'title_in_image = true(poster).',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'poster',
        title_in_image: true,
      }),
    },
    {
      id: 'v-no-image',
      title: '이미지 없음 · 자리 표시',
      note: '커버도 배지도 없을 때 이미지 칸은 유지하고 자원 아이콘을 그린다.',
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
      note: 'title_in_image인데 이미지가 없으면 판 위에 제목을 그린다.',
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
      note: 'cover_image_url이 mp4면 자동 재생(무음 반복)한다.',
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
      note: '커버가 없으면 첫 배지 그림을 이미지로 쓰고, 유저가 그 배지를 갖지 않았으면 흑백으로 그린다.',
      card: row('badge_spotlight', {
        ...TEMPLATES[2].base,
        shape: 'square',
        resolved_badges: badges(1).map((b) => ({ ...b, earned: false })),
      }),
    },
    {
      id: 'v-brief-thumb-dimmed',
      title: 'brief · 배지 썸네일 미보유 흑백',
      note: '배지 1개 brief는 64px 칸에 배지 그림을 그리고, 미보유면 흑백이다.',
      card: row('badge_spotlight', {
        ...TEMPLATES[2].base,
        shape: 'brief',
        resolved_badges: badges(1).map((b) => ({ ...b, earned: false })),
      }),
    },
    {
      id: 'v-mission-ending',
      title: '미션 마감 임박 (남은 시간)',
      note: '종료가 24시간 이내면 기간 대신 «N시간 남음»을 보인다.',
      card: row('mission_spotlight', {
        ...TEMPLATES[0].base,
        shape: 'hero',
        resolved_mission: { ...MISSION, ends_at: iso(0.3) },
      }),
    },
    {
      id: 'v-mission-ongoing',
      title: '상시 미션',
      note: '종료일이 없으면 «상시» 기간 줄이다.',
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
      note: '공개 전에는 재료 수와 공개일만 보이고 타일이 없다(list → brief).',
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
      note: '같은 공개 전 레시피를 이미지 모양으로 그린 경우.',
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
      note: '순위가 없으면 «아직 랭킹이 없어요».',
      card: row('ranking_board', {
        ...TEMPLATES[4].base,
        shape: 'list',
        resolved_ranking: { ...RANKING, entries: [], totalParticipants: 0 },
      }),
    },
    {
      id: 'v-list-many',
      title: 'list · 타일 8개 (가로 스크롤)',
      note: '타일이 많으면 가로로 넘긴다.',
      card: row('itembook_milestone', {
        ...TEMPLATES[5].base,
        shape: 'list',
        resolved_badges: badges(8),
      }),
    },
    {
      id: 'v-minimal',
      title: '최소 카드 (제목만)',
      note: '부제·설명·정보 줄이 모두 없을 때.',
      card: row('content_intro', { title: '제목만 있는 카드', shape: 'brief' }),
    },
    {
      id: 'v-legacy',
      title: '옛 카드 (shape 없음)',
      note: 'shape가 NULL이면 layout_type으로 모양을 정한다. 아래는 banner + 커버 → poster.',
      card: row('drop_alert', {
        ...TEMPLATES[1].base,
        shape: null,
        layout_type: 'banner',
      }),
    },
  ]
}

export default function HomeFeedCardsSamplePage() {
  const TEMPLATES = buildTemplates()
  const VARIANTS = buildVariants(TEMPLATES)
  return (
    <div className="min-h-dvh w-full max-w-[430px] mx-auto bg-background text-foreground">
      <div className="px-4 pt-6 pb-16 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">홈피드 카드 전체 샘플</h1>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed">
            유형 {TEMPLATES.length}개 × 모양 {CARD_SHAPES.length}개 = {TEMPLATES.length * CARD_SHAPES.length}장 조합과 변형{' '}
            {VARIANTS.length}장이에요. 홈과 같은 변환·렌더러로 그리고, 데이터는 샘플 값이에요. 기록·링크는 없어요.
          </p>
          <nav className="flex flex-wrap gap-1.5 pt-1">
            {TEMPLATES.map((tpl) => (
              <a
                key={tpl.template}
                href={`#t-${tpl.template}`}
                className="text-[12px] px-2.5 py-1 rounded-full bg-[var(--surface,#f2f2f2)]"
              >
                {tpl.name}
              </a>
            ))}
            <a href="#variants" className="text-[12px] px-2.5 py-1 rounded-full bg-foreground text-background">
              변형
            </a>
          </nav>
        </header>

        {TEMPLATES.map((tpl) => (
          <section key={tpl.template} id={`t-${tpl.template}`} className="flex flex-col gap-4 scroll-mt-4">
            <div className="border-b border-[var(--border,#e5e5e5)] pb-2">
              <h2 className="text-lg font-bold">{tpl.name}</h2>
              <p className="text-[12px] text-[var(--muted)]">template_type = {tpl.template}</p>
            </div>
            {CARD_SHAPES.map((shape) => (
              <Sample
                key={shape}
                caption={SHAPE_NAMES[shape]}
                card={row(tpl.template, {
                  ...tpl.base,
                  shape,
                  // 돔 기본형은 16:9, 포스터형은 아래 «변형»에 따로 둔다
                  layout_type: shape === 'ticket' ? 'ticket' : shape === 'dome' ? 'dome' : 'large_thumbnail',
                })}
              />
            ))}
          </section>
        ))}

        <section id="variants" className="flex flex-col gap-6 scroll-mt-4">
          <div className="border-b border-[var(--border,#e5e5e5)] pb-2">
            <h2 className="text-lg font-bold">변형</h2>
            <p className="text-[12px] text-[var(--muted)]">상태·데이터에 따라 달라지는 모습</p>
          </div>
          {VARIANTS.map((v) => (
            <div key={v.id} className="flex flex-col gap-1">
              <p className="text-[14px] font-bold px-1">{v.title}</p>
              <Sample caption={v.note} card={v.card} />
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
