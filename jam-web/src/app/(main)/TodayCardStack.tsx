import Link from 'next/link'
import type { ComponentType, SVGProps } from 'react'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { TodayCardTemplateType } from '@/types/database'
import { Card } from '@ds/components/cards/Card'
import SafeImage from '@/components/SafeImage'
import RankingListRow from '@/components/ranking/RankingListRow'
import { formatRankingMetricValue } from '@/lib/ranking/format'
import { d } from '@/lib/i18n'
import {
  MedalIcon,
  HourglassIcon,
  TargetIcon,
  BookIcon,
  PinIcon,
  PackageIcon,
  NewspaperIcon,
  RankingIcon,
} from '@/components/ui/icons'

const templateLabel: Record<TodayCardTemplateType, string> = {
  badge_spotlight: d.todayCard.badgeSpotlight,
  progress_nudge: d.todayCard.progressNudge,
  mission_spotlight: d.todayCard.missionSpotlight,
  itembook_milestone: d.todayCard.itembookMilestone,
  location_trend: d.todayCard.locationTrend,
  drop_alert: d.todayCard.dropAlert,
  editorial_article: d.todayCard.editorialArticle,
  ranking_board: d.todayCard.rankingBoard,
}

/** 콘텐츠 유형 식별은 색상이 아닌 아이콘 모양으로만 구분한다(바이너리 컬러 원칙 — 제3의 컬러 도입 금지) */
const TemplateIcon: Record<TodayCardTemplateType, ComponentType<SVGProps<SVGSVGElement>>> = {
  badge_spotlight: MedalIcon,
  progress_nudge: HourglassIcon,
  mission_spotlight: TargetIcon,
  itembook_milestone: BookIcon,
  location_trend: PinIcon,
  drop_alert: PackageIcon,
  editorial_article: NewspaperIcon,
  ranking_board: RankingIcon,
}

function TemplateChip({ card }: { card: TodayCardWithHref }) {
  return (
    <span className="inline-flex items-center text-[length:var(--text-caption)] leading-none font-bold uppercase px-2.5 py-1.5 rounded-[var(--radius-tags)] bg-surface text-text">
      {templateLabel[card.template_type]}
    </span>
  )
}

/**
 * 커버 이미지 결정 — `cover_image_url`이 없으면 첫 배지 이미지를 승격한다.
 *
 * 승격된 이미지가 **아직 못 받은 배지**면 색을 빼서(grayscale) 보유하지 않았음을 말한다
 * (티켓 20260905_0038 B / 2026-09-06 확정 규칙 — 실루엣으로 감추지 않는다).
 * 어드민이 직접 올린 `cover_image_url`은 배지 아트가 아니므로 손대지 않는다.
 */
function resolveCover(card: TodayCardWithHref): { src: string | null; dimmed: boolean } {
  if (card.cover_image_url) return { src: card.cover_image_url, dimmed: false }
  const first = card.resolved_badges[0]
  if (!first?.image_url) return { src: null, dimmed: false }
  return { src: first.image_url, dimmed: !first.earned }
}

/** 큰 썸네일형 — 커버 이미지(없으면 첫 배지 이미지) 크게 + 제목/부제 */
function LargeThumbnailCard({ card }: { card: TodayCardWithHref }) {
  const { src: cover, dimmed } = resolveCover(card)
  return (
    <Card
      tone="inverse"
      className="overflow-hidden active:scale-[0.98] transition-transform duration-100"
      style={{ padding: 0 }}
    >
      {/* 20260824_004: cover_image_url은 어드민 자유 입력이라 호스트를 알 수 없다.
          next/image에 그대로 넘기면 미등록 호스트에서 홈 화면 전체가 죽는다 → SafeImage 경유 */}
      <SafeImage
        src={cover}
        alt={card.title}
        containerClassName="relative w-full aspect-[16/9] overflow-hidden"
        className={dimmed ? 'object-cover grayscale' : 'object-cover'}
      />
      <div className="p-[var(--spacing-24)]">
        <div className="flex items-center gap-2 mb-2">
          <TemplateChip card={card} />
          {card.template_type === 'location_trend' && card.region_label && (
            <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-text-inverse/60">
              <PinIcon className="w-3 h-3" />{card.region_label}
            </span>
          )}
        </div>
        <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
        <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-3">
          {card.template_type === 'editorial_article' ? d.today.cardReadArticle : d.today.cardReadMore} &rarr;
        </p>
      </div>
    </Card>
  )
}

/** 배지목록형 — 배지 여러 개를 가로 갤러리로 나열 */
function BadgeGalleryCard({ card }: { card: TodayCardWithHref }) {
  return (
    <Card tone="inverse" className="active:scale-[0.98] transition-transform duration-100">
      <div className="flex items-center gap-2 mb-2">
        <TemplateChip card={card} />
        {card.region_label && (
          <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-text-inverse/60">
            <PinIcon className="w-3 h-3" />{card.region_label}
          </span>
        )}
      </div>
      <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]">{card.title}</h3>
      {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}

      {card.resolved_badges.length > 0 && (
        <div className="flex gap-[var(--spacing-16)] mt-[var(--spacing-16)] overflow-x-auto pb-1">
          {card.resolved_badges.map((b) => (
            <div key={b.id} className="flex flex-col items-center gap-1 shrink-0 w-16">
              {/* 20260816_012: 보더 제거 — 흰 카드 위 썸네일이라 4% 블랙 틴트로 구분 */}
              {/* 미획득 배지는 색을 빼서 보유하지 않았음을 말한다(20260905_0038 B) */}
              <div className="w-16 h-16 rounded-[var(--radius-cards)] bg-black/[0.04] overflow-hidden flex items-center justify-center">
                <SafeImage
                  src={b.image_url}
                  alt={b.name}
                  width={64}
                  height={64}
                  className={b.earned ? 'w-full h-full object-cover' : 'w-full h-full object-cover grayscale'}
                  fallback={<MedalIcon className="w-6 h-6 text-text-inverse/40" />}
                />
              </div>
              <span className="text-[length:var(--text-caption)] text-text-inverse/70 text-center leading-tight line-clamp-2">{b.name}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-3">{d.today.cardViewAll} &rarr;</p>
    </Card>
  )
}

/** 바로가기형 — 이미지 없이 짧은 CTA 한 줄 */
function ShortcutCard({ card }: { card: TodayCardWithHref }) {
  const Icon = TemplateIcon[card.template_type]
  return (
    <Card tone="inverse" className="p-[var(--spacing-16)] flex items-center gap-[var(--spacing-16)] active:scale-[0.98] transition-transform duration-100">
      <div className="w-11 h-11 rounded-[var(--radius-cards)] bg-black/[0.04] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-text-inverse/60" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-caption)] text-text-inverse/60 truncate">{card.subtitle}</p>}
      </div>
      <span className="text-text-inverse/30 shrink-0" aria-hidden="true">&rsaquo;</span>
    </Card>
  )
}

/**
 * 배너형 — 4:5 비율 포스터 배너, 이미지 위 텍스트 오버레이(하단 그라디언트).
 * 커버 이미지가 없으면 일반 카드로 대체(스크림은 사진 전제이므로 이미지 없이 쓰면 배경이
 * 무의미하게 어두워짐).
 *
 * 20260824_004: "커버가 없는 경우"와 달리 "커버는 있는데 로드에 실패한 경우"는 서버 렌더
 * 시점에 알 수 없어 OtherCard로 대체할 수 없다(이 컴포넌트는 서버 컴포넌트다). 대신
 * SafeImage의 fallback으로 어두운 플레이트를 깔아 스크림 전제를 유지한다 — 이게 없으면
 * 흰 배경(bg-surface-inverse) 위에 검은 스크림과 흰 텍스트가 남아 부제 대비가 무너진다.
 */
function BannerCard({ card }: { card: TodayCardWithHref }) {
  const { src: cover, dimmed } = resolveCover(card)

  if (!cover) {
    return <OtherCard card={card} />
  }

  return (
    <article className="relative rounded-[var(--radius-cards)] overflow-hidden aspect-[4/5] active:scale-[0.98] transition-transform duration-100 bg-surface-inverse">
      <SafeImage
        src={cover}
        alt={card.title}
        containerClassName="absolute inset-0"
        className={dimmed ? 'object-cover grayscale' : 'object-cover'}
        fallback={<div className="absolute inset-0 bg-black" aria-hidden="true" />}
      />
      {/* 흑백 스크림 — 사진 위 텍스트 가독성 확보용 기능적 처리(브랜드 그라데이션 아님, 컬러 도입 없음) */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-[var(--spacing-24)] pt-10 pb-[var(--spacing-24)]">
        <div className="mb-2">
          <TemplateChip card={card} />
        </div>
        <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-white">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-white/80 mt-1">{card.subtitle}</p>}
      </div>
    </article>
  )
}

/** 기타 — 위 4종에 안 맞는 콘텐츠를 위한 기본형(이미지 없는 담백한 카드) */
function OtherCard({ card }: { card: TodayCardWithHref }) {
  return (
    <Card tone="inverse" className="active:scale-[0.98] transition-transform duration-100">
      <div className="mb-2"><TemplateChip card={card} /></div>
      <h3 className="text-[length:var(--text-body)] leading-[var(--leading-body)]">{card.title}</h3>
      {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
      <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-3">{d.today.cardReadMore} &rarr;</p>
    </Card>
  )
}

/**
 * 순위 리스트형 — 랭킹보드 전용(티켓 20260911_1440). 미션 상세 화면의 순위 리스트를 재사용하되
 * 1·2·3위 강조 포디엄 그래프는 뺀다(User Story 12). `resolved_ranking`은 서버(`lib/today/cards.ts`)가
 * 이미 계산해 넘긴 값 — 이 컴포넌트는 그리기만 한다.
 *
 * 다른 레이아웃과 달리 카드 전체를 `<Link>`로 감싸지 않는다 — 순위 행(`RankingListRow`)이 각자
 * 유저 프로필로 이동하는 `<Link>`를 이미 갖고 있어(User Story 11, 미션 상세 화면과 동일 동작),
 * 카드 전체를 감싸면 앵커 안에 앵커가 중첩되는 무효 마크업이 된다. 대신 제목 영역만 카드
 * 이동 경로(`resolved_href`, User Story 10)로 링크한다 — `TodayCardStack`이 이 컴포넌트를
 * 호출할 때 공통 `<Link>` 래핑을 건너뛴다.
 */
function RankingListCard({ card, currentUserId }: { card: TodayCardWithHref; currentUserId?: string }) {
  const ranking = card.resolved_ranking
  const entries = ranking?.entries ?? []
  const maxValue = entries[0]?.value ?? 0
  const formatValue = (v: number) =>
    ranking
      ? formatRankingMetricValue(ranking.metricType, v, {
          missionType: ranking.missionType,
          conditionFieldKey: ranking.conditionFieldKey,
        })
      : String(v)

  return (
    <Card tone="inverse">
      <Link href={card.resolved_href} className="block active:scale-[0.98] transition-transform duration-100">
        <div className="mb-2"><TemplateChip card={card} /></div>
        <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
      </Link>

      {entries.length > 0 ? (
        <div className="flex flex-col mt-[var(--spacing-16)]">
          {entries.map((entry) => (
            <RankingListRow
              key={entry.userId}
              entry={entry}
              maxValue={maxValue}
              isMe={entry.userId === currentUserId}
              formatValue={formatValue}
            />
          ))}
        </div>
      ) : (
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-2">
          {d.todayCard.rankingEmpty}
        </p>
      )}
    </Card>
  )
}

/**
 * 투데이 카드 스택 (홈 화면 최상단). 카드 0개면 아무것도 렌더링하지 않는다.
 * layout_type에 따라 서로 다른 UI로 렌더링(콘텐츠 종류인 template_type과는 별개 축).
 * 카드 클릭 시 resolved_href 로 이동 (editorial_article은 /today/[id]).
 */
export default function TodayCardStack({
  cards,
  currentUserId,
}: {
  cards: TodayCardWithHref[]
  /** 랭킹보드 카드(ranking_list 레이아웃)에서 내 순위 행을 강조하는 데 쓴다(선택 — 없으면 강조 없음) */
  currentUserId?: string
}) {
  if (!cards || cards.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-[var(--spacing-16)]">
        <h2 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">{d.today.cardStackTitle}</h2>
        <span className="text-[length:var(--text-caption)] text-text-inverse/40">{d.today.cardStackSubtitle}</span>
      </div>

      <div className="flex flex-col gap-[var(--spacing-16)]">
        {cards.map((card) =>
          // ranking_list는 행마다 자체 <Link>(유저 프로필)를 가지므로 공통 카드 래핑
          // <Link>를 건너뛴다 — 중첩 앵커 방지(RankingListCard 주석 참고).
          card.layout_type === 'ranking_list' ? (
            <RankingListCard key={card.id} card={card} currentUserId={currentUserId} />
          ) : (
            <Link key={card.id} href={card.resolved_href} className="block">
              {card.layout_type === 'badge_gallery' ? <BadgeGalleryCard card={card} />
                : card.layout_type === 'shortcut' ? <ShortcutCard card={card} />
                : card.layout_type === 'banner' ? <BannerCard card={card} />
                : card.layout_type === 'other' ? <OtherCard card={card} />
                : <LargeThumbnailCard card={card} />}
            </Link>
          )
        )}
      </div>
    </section>
  )
}
