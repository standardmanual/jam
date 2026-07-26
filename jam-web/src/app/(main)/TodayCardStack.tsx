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

/**
 * 투데이 카드 스택 (홈 화면 최상단). 카드 0개면 아무것도 렌더링하지 않는다.
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
        {cards.map((card) => {
          const chip = templateChipBg[card.template_type]
          return (
            <Link key={card.id} href={card.resolved_href} className="block">
              <article className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] overflow-hidden active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_#161616] transition-transform">
                {card.cover_image_url && (
                  <div className="w-full aspect-[16/9] bg-jam-ink/5 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={card.cover_image_url} alt={card.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-black tracking-wide uppercase px-2 py-0.5 rounded-full border-2 border-jam-ink ${chip}`}>
                      {templateLabel[card.template_type]}
                    </span>
                    {card.template_type === 'location_trend' && card.region_label && (
                      <span className="text-[10px] font-black text-jam-ink/60">📍 {card.region_label}</span>
                    )}
                  </div>
                  <h3 className="font-black text-lg text-jam-ink leading-tight">{card.title}</h3>
                  {card.subtitle && (
                    <p className="text-sm text-jam-ink/60 font-semibold mt-1 leading-snug">{card.subtitle}</p>
                  )}
                  <p className="text-xs font-black text-jam-ink/40 mt-3">
                    {card.template_type === 'editorial_article' ? '기사 읽기 →' : '자세히 보기 →'}
                  </p>
                </div>
              </article>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
