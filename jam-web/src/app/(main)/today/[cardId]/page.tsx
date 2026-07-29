import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublishedArticleCard } from '@/lib/today/cards'
import LocalDate from '@/components/LocalDate'
import { d } from '@/lib/i18n'

type Props = { params: Promise<{ cardId: string }> }

/**
 * editorial_article 전용 기사 페이지.
 * 마크다운 파서 없이 "빈 줄 기준 문단 분리"로만 본문을 렌더링(신규 의존성 없음).
 * is_active 이고 조회 시점이 starts_at~ends_at 구간 안일 때만 노출 — 그 외(예약발행 전/
 * 종료 후/비활성/다른 템플릿) 직링크 접근은 getPublishedArticleCard 가 null 을 반환 → 404.
 */
export default async function TodayArticlePage({ params }: Props) {
  const { cardId } = await params
  const card = await getPublishedArticleCard(cardId)
  if (!card) notFound()

  // 빈 줄 기준으로 문단 분리. 문단 내부의 단일 줄바꿈은 whitespace-pre-line 으로 보존.
  const paragraphs = (card.body_markdown ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <div className="min-h-full bg-surface text-text pb-[var(--spacing-40)]">
      {card.cover_image_url && (
        <div className="w-full aspect-[16/10] overflow-hidden shadow-[inset_0_-1px_0_0_var(--color-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.cover_image_url} alt={card.title} className="w-full h-full object-cover" />
        </div>
      )}

      <article className="px-[var(--spacing-16)] pt-[var(--spacing-24)]">
        <Link href="/" className="block text-[11px] text-text/50 underline underline-offset-2">
          &larr; {d.todayCard.backToToday}
        </Link>

        <span className="inline-flex items-center mt-[var(--spacing-16)] text-[12px] font-bold uppercase px-2.5 py-1.5 rounded-[var(--radius-tags)] bg-surface-inverse text-text-inverse">
          {d.todayCard.editorialArticle}
        </span>

        <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mt-[var(--spacing-16)]">{card.title}</h1>
        {card.subtitle && (
          <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text/60 mt-2">{card.subtitle}</p>
        )}
        <p className="text-[11px] text-text/40 mt-[var(--spacing-16)]">
          <LocalDate iso={card.starts_at} options={{ year: 'numeric', month: 'long', day: 'numeric' }} />
        </p>

        <div className="mt-[var(--spacing-24)] flex flex-col gap-[var(--spacing-16)]">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text/90 whitespace-pre-line">
                {p}
              </p>
            ))
          ) : (
            <p className="text-text/40">{d.todayCard.noBody}</p>
          )}
        </div>
      </article>
    </div>
  )
}
