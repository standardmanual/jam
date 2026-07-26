import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublishedArticleCard } from '@/lib/today/cards'
import LocalDate from '@/components/LocalDate'

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
    <div className="min-h-full bg-jam-cream pb-16">
      {card.cover_image_url && (
        <div className="w-full aspect-[16/10] bg-jam-ink/5 overflow-hidden border-b-[3px] border-jam-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.cover_image_url} alt={card.title} className="w-full h-full object-cover" />
        </div>
      )}

      <article className="px-5 pt-6">
        <Link href="/" className="text-xs font-black text-jam-ink/50 underline">
          ← 투데이로
        </Link>

        <span className="inline-block mt-4 text-[10px] font-black tracking-wide uppercase px-2 py-0.5 rounded-full border-2 border-jam-ink bg-jam-ink text-jam-cream">
          기사
        </span>

        <h1 className="text-3xl font-black text-jam-ink leading-tight mt-3">{card.title}</h1>
        {card.subtitle && (
          <p className="text-base text-jam-ink/60 font-bold mt-2 leading-snug">{card.subtitle}</p>
        )}
        <p className="text-xs text-jam-ink/40 font-semibold mt-3">
          <LocalDate iso={card.starts_at} options={{ year: 'numeric', month: 'long', day: 'numeric' }} />
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-jam-ink/90 font-medium whitespace-pre-line">
                {p}
              </p>
            ))
          ) : (
            <p className="text-jam-ink/40 font-semibold">본문이 없습니다.</p>
          )}
        </div>
      </article>
    </div>
  )
}
