import Link from 'next/link'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { TodayCardTemplateType } from '@/types/database'

const templateLabel: Record<TodayCardTemplateType, string> = {
  badge_spotlight: '배지 소개',
  progress_nudge: '진행 알림',
  mission_spotlight: '미션',
  itembook_milestone: '아이템북',
  location_trend: '지역 트렌드',
  drop_alert: '드랍',
  editorial_article: '기사',
}

const templateChipBg: Record<TodayCardTemplateType, string> = {
  badge_spotlight: 'bg-jam-teal/40',
  progress_nudge: 'bg-jam-yellow/50',
  mission_spotlight: 'bg-jam-orange/50',
  itembook_milestone: 'bg-jam-purple/30',
  location_trend: 'bg-jam-lime',
  drop_alert: 'bg-jam-cream',
  editorial_article: 'bg-jam-ink text-jam-cream',
}

const templateIcon: Record<TodayCardTemplateType, string> = {
  badge_spotlight: '🏅',
  progress_nudge: '⏳',
  mission_spotlight: '🎯',
  itembook_milestone: '📖',
  location_trend: '📍',
  drop_alert: '📦',
  editorial_article: '📰',
}

function TemplateChip({ card }: { card: TodayCardWithHref }) {
  return (
    <span className={`text-[10px] font-black tracking-wide uppercase px-2 py-0.5 rounded-full border-2 border-jam-ink ${templateChipBg[card.template_type]}`}>
      {templateLabel[card.template_type]}
    </span>
  )
}

/** 큰 썸네일형 — 커버 이미지(없으면 첫 배지 이미지) 크게 + 제목/부제 */
function LargeThumbnailCard({ card }: { card: TodayCardWithHref }) {
  const cover = card.cover_image_url || card.resolved_badges[0]?.image_url || null
  return (
    <article className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] overflow-hidden active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_#161616] transition-transform">
      {cover && (
        <div className="w-full aspect-[16/9] bg-jam-ink/5 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={card.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <TemplateChip card={card} />
          {card.template_type === 'location_trend' && card.region_label && (
            <span className="text-[10px] font-black text-jam-ink/60">📍 {card.region_label}</span>
          )}
        </div>
        <h3 className="font-black text-lg text-jam-ink leading-tight">{card.title}</h3>
        {card.subtitle && <p className="text-sm text-jam-ink/60 font-semibold mt-1 leading-snug">{card.subtitle}</p>}
        <p className="text-xs font-black text-jam-ink/40 mt-3">
          {card.template_type === 'editorial_article' ? '기사 읽기 →' : '자세히 보기 →'}
        </p>
      </div>
    </article>
  )
}

/** 배지목록형 — 배지 여러 개를 가로 갤러리로 나열 */
function BadgeGalleryCard({ card }: { card: TodayCardWithHref }) {
  return (
    <article className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_#161616] transition-transform">
      <div className="flex items-center gap-2 mb-2">
        <TemplateChip card={card} />
        {card.region_label && <span className="text-[10px] font-black text-jam-ink/60">📍 {card.region_label}</span>}
      </div>
      <h3 className="font-black text-lg text-jam-ink leading-tight">{card.title}</h3>
      {card.subtitle && <p className="text-sm text-jam-ink/60 font-semibold mt-1 leading-snug">{card.subtitle}</p>}

      {card.resolved_badges.length > 0 && (
        <div className="flex gap-3 mt-3 overflow-x-auto pb-1">
          {card.resolved_badges.map((b) => (
            <div key={b.id} className="flex flex-col items-center gap-1 shrink-0 w-16">
              <div className="w-16 h-16 rounded-xl bg-jam-ink/5 border-2 border-jam-ink overflow-hidden flex items-center justify-center">
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image_url} alt={b.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">🏅</span>
                )}
              </div>
              <span className="text-[10px] font-bold text-jam-ink/70 text-center leading-tight line-clamp-2">{b.name}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs font-black text-jam-ink/40 mt-3">전체 보기 →</p>
    </article>
  )
}

/** 바로가기형 — 이미지 없이 짧은 CTA 한 줄 */
function ShortcutCard({ card }: { card: TodayCardWithHref }) {
  return (
    <article className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-3.5 flex items-center gap-3 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_#161616] transition-transform">
      <div className="w-11 h-11 rounded-xl bg-jam-ink/5 border-2 border-jam-ink flex items-center justify-center text-xl shrink-0">
        {templateIcon[card.template_type]}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-sm text-jam-ink truncate">{card.title}</h3>
        {card.subtitle && <p className="text-xs text-jam-ink/60 font-semibold truncate">{card.subtitle}</p>}
      </div>
      <span className="text-jam-ink/30 text-lg shrink-0">›</span>
    </article>
  )
}

/** 배너형 — 가로로 넓은 띠 배너, 이미지 위 텍스트 오버레이 */
function BannerCard({ card }: { card: TodayCardWithHref }) {
  const cover = card.cover_image_url || card.resolved_badges[0]?.image_url || null
  return (
    <article className="relative rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] overflow-hidden h-24 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_#161616] transition-transform bg-jam-ink">
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt={card.title} className="absolute inset-0 w-full h-full object-cover opacity-50" />
      )}
      <div className="relative h-full flex flex-col justify-center px-4">
        <span className="text-[10px] font-black tracking-wide uppercase text-jam-lime mb-0.5">{templateLabel[card.template_type]}</span>
        <h3 className="font-black text-base text-white leading-tight truncate">{card.title}</h3>
        {card.subtitle && <p className="text-xs text-white/70 font-semibold truncate">{card.subtitle}</p>}
      </div>
    </article>
  )
}

/** 기타 — 위 4종에 안 맞는 콘텐츠를 위한 기본형(이미지 없는 담백한 카드) */
function OtherCard({ card }: { card: TodayCardWithHref }) {
  return (
    <article className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_#161616] transition-transform">
      <div className="mb-2"><TemplateChip card={card} /></div>
      <h3 className="font-black text-base text-jam-ink leading-tight">{card.title}</h3>
      {card.subtitle && <p className="text-sm text-jam-ink/60 font-semibold mt-1 leading-snug">{card.subtitle}</p>}
      <p className="text-xs font-black text-jam-ink/40 mt-3">자세히 보기 →</p>
    </article>
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-lg text-jam-ink">투데이</h2>
        <span className="text-xs font-bold text-jam-ink/40">오늘의 소식</span>
      </div>

      <div className="flex flex-col gap-3">
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
