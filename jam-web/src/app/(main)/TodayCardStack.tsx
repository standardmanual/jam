import Link from 'next/link'
import type { ComponentType, SVGProps } from 'react'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { TodayCardTemplateType } from '@/types/database'
import Card from '@/components/ui/Card'
import { d } from '@/lib/i18n'
import {
  MedalIcon,
  HourglassIcon,
  TargetIcon,
  BookIcon,
  PinIcon,
  PackageIcon,
  NewspaperIcon,
} from '@/components/ui/icons'

const templateLabel: Record<TodayCardTemplateType, string> = {
  badge_spotlight: d.todayCard.badgeSpotlight,
  progress_nudge: d.todayCard.progressNudge,
  mission_spotlight: d.todayCard.missionSpotlight,
  itembook_milestone: d.todayCard.itembookMilestone,
  location_trend: d.todayCard.locationTrend,
  drop_alert: d.todayCard.dropAlert,
  editorial_article: d.todayCard.editorialArticle,
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
}

function TemplateChip({ card }: { card: TodayCardWithHref }) {
  return (
    <span className="inline-flex items-center text-[12px] leading-none font-bold uppercase px-2.5 py-1.5 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] text-text-inverse/70">
      {templateLabel[card.template_type]}
    </span>
  )
}

/** 큰 썸네일형 — 커버 이미지(없으면 첫 배지 이미지) 크게 + 제목/부제 */
function LargeThumbnailCard({ card }: { card: TodayCardWithHref }) {
  const cover = card.cover_image_url || card.resolved_badges[0]?.image_url || null
  return (
    <Card className="p-0 overflow-hidden active:scale-[0.98] transition-transform duration-100">
      {cover && (
        <div className="w-full aspect-[16/9] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={card.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-[var(--spacing-24)]">
        <div className="flex items-center gap-2 mb-2">
          <TemplateChip card={card} />
          {card.template_type === 'location_trend' && card.region_label && (
            <span className="inline-flex items-center gap-1 text-[10px] text-text-inverse/60">
              <PinIcon className="w-3 h-3" />{card.region_label}
            </span>
          )}
        </div>
        <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
        <p className="text-[11px] text-text-inverse/40 mt-3">
          {card.template_type === 'editorial_article' ? d.today.cardReadArticle : d.today.cardReadMore} &rarr;
        </p>
      </div>
    </Card>
  )
}

/** 배지목록형 — 배지 여러 개를 가로 갤러리로 나열 */
function BadgeGalleryCard({ card }: { card: TodayCardWithHref }) {
  return (
    <Card className="active:scale-[0.98] transition-transform duration-100">
      <div className="flex items-center gap-2 mb-2">
        <TemplateChip card={card} />
        {card.region_label && (
          <span className="inline-flex items-center gap-1 text-[10px] text-text-inverse/60">
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
              <div className="w-16 h-16 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] overflow-hidden flex items-center justify-center">
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image_url} alt={b.name} className="w-full h-full object-cover" />
                ) : (
                  <MedalIcon className="w-6 h-6 text-text-inverse/40" />
                )}
              </div>
              <span className="text-[10px] text-text-inverse/70 text-center leading-tight line-clamp-2">{b.name}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-text-inverse/40 mt-3">{d.today.cardViewAll} &rarr;</p>
    </Card>
  )
}

/** 바로가기형 — 이미지 없이 짧은 CTA 한 줄 */
function ShortcutCard({ card }: { card: TodayCardWithHref }) {
  const Icon = TemplateIcon[card.template_type]
  return (
    <Card className="p-[var(--spacing-16)] flex items-center gap-[var(--spacing-16)] active:scale-[0.98] transition-transform duration-100">
      <div className="w-11 h-11 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-text-inverse/60" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{card.title}</h3>
        {card.subtitle && <p className="text-[11px] text-text-inverse/60 truncate">{card.subtitle}</p>}
      </div>
      <span className="text-text-inverse/30 shrink-0" aria-hidden="true">&rsaquo;</span>
    </Card>
  )
}

/** 배너형 — 4:5 비율 포스터 배너, 이미지 위 텍스트 오버레이(하단 그라디언트). 커버 이미지가 없으면 일반 카드로 대체(스크림은 사진 전제이므로 이미지 없이 쓰면 배경이 무의미하게 어두워짐). */
function BannerCard({ card }: { card: TodayCardWithHref }) {
  const cover = card.cover_image_url || card.resolved_badges[0]?.image_url || null

  if (!cover) {
    return <OtherCard card={card} />
  }

  return (
    <article className="relative rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] overflow-hidden aspect-[4/5] active:scale-[0.98] transition-transform duration-100 bg-surface-inverse">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover} alt={card.title} className="absolute inset-0 w-full h-full object-cover" />
      {/* 흑백 스크림 — 사진 위 텍스트 가독성 확보용 기능적 처리(브랜드 그라데이션 아님, 컬러 도입 없음) */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-[var(--spacing-16)] pt-10 pb-[var(--spacing-16)]">
        <span className="inline-flex items-center text-[12px] font-bold uppercase text-white/80 mb-1">
          {templateLabel[card.template_type]}
        </span>
        <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-white">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-white/80 mt-1">{card.subtitle}</p>}
      </div>
    </article>
  )
}

/** 기타 — 위 4종에 안 맞는 콘텐츠를 위한 기본형(이미지 없는 담백한 카드) */
function OtherCard({ card }: { card: TodayCardWithHref }) {
  return (
    <Card className="active:scale-[0.98] transition-transform duration-100">
      <div className="mb-2"><TemplateChip card={card} /></div>
      <h3 className="text-[length:var(--text-body)] leading-[var(--leading-body)]">{card.title}</h3>
      {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
      <p className="text-[11px] text-text-inverse/40 mt-3">{d.today.cardReadMore} &rarr;</p>
    </Card>
  )
}

/**
 * 투데이 카드 스택 (홈 화면 최상단). 카드 0개면 아무것도 렌더링하지 않는다.
 * layout_type에 따라 서로 다른 UI로 렌더링(콘텐츠 종류인 template_type과는 별개 축).
 * 카드 클릭 시 resolved_href 로 이동 (editorial_article은 /today/[id]).
 */
export default function TodayCardStack({ cards }: { cards: TodayCardWithHref[] }) {
  if (!cards || cards.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-[var(--spacing-16)]">
        <h2 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">{d.today.cardStackTitle}</h2>
        <span className="text-[11px] text-text-inverse/40">{d.today.cardStackSubtitle}</span>
      </div>

      <div className="flex flex-col gap-[var(--spacing-16)]">
        {cards.map((card) => (
          <Link key={card.id} href={card.resolved_href} className="block">
            {card.layout_type === 'badge_gallery' ? <BadgeGalleryCard card={card} />
              : card.layout_type === 'shortcut' ? <ShortcutCard card={card} />
              : card.layout_type === 'banner' ? <BannerCard card={card} />
              : card.layout_type === 'other' ? <OtherCard card={card} />
              : <LargeThumbnailCard card={card} />}
          </Link>
        ))}
      </div>
    </section>
  )
}
