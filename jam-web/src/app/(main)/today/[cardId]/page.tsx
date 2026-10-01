import { notFound } from 'next/navigation'
import { getPublishedArticleCard } from '@/lib/today/cards'
import { toArticleView } from '@/lib/today/articleView'
import ArticleView from '@/components/today/ArticleView'
import TopNav from '@/components/ui/TopNav'
import { d } from '@/lib/i18n'

type Props = { params: Promise<{ cardId: string }> }

/**
 * editorial_article 전용 기사 페이지.
 * 마크다운 파서 없이 "빈 줄 기준 문단 분리"로만 본문을 렌더링(신규 의존성 없음).
 * is_active 이고 조회 시점이 starts_at~ends_at 구간 안일 때만 노출 — 그 외(예약발행 전/
 * 종료 후/비활성/다른 템플릿) 직링크 접근은 getPublishedArticleCard 가 null 을 반환 → 404.
 *
 * 티켓 20261001_1737: 상단에 TopNav(「투데이」, 뒤로 `/`)를 두고 본문은 표시 데이터만 받는 `ArticleView`가 그린다.
 * 카드 행 → 표시 데이터 변환(문단 나누기·CTA 우선순위와 라벨)은 순수 함수 `toArticleView`가 맡아 운영툴 미리보기와 공유한다.
 */
export default async function TodayArticlePage({ params }: Props) {
  const { cardId } = await params
  const card = await getPublishedArticleCard(cardId)
  if (!card) notFound()

  return (
    <div className="min-h-full">
      <TopNav title={d.today.cardStackTitle} backHref="/" />
      <ArticleView view={toArticleView(card)} />
    </div>
  )
}
