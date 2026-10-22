import { Card } from '@ds/components/cards/Card'
import { d } from '@/lib/i18n'
import type { ImageCardView } from '@/lib/today/cardView'
import { CardBody, CardDescription, CardEndLine, CardFacts, CardTitleGroup } from './CardBody'
import CardChipRow from './CardChipRow'
import CardImageSlot from './CardImageSlot'

/**
 * 티켓(`ticket`) 모양 — 티켓 20261022_2225 (사용자 결정에 따른 신규 카드 형태).
 *
 * BadgeFrame 모티브의 티켓 실루엣으로, 상단 이미지와 하단 본문 사이에 펀칭 홈과
 * 점선 절취선(Dashed Perforation)이 들어가는 쿠폰·보상·이벤트 카드 전용 형태입니다.
 */
export default function TicketCard({ view }: { view: ImageCardView }) {
  const hasTitleGroup = !view.titleInImage

  return (
    <div className="relative group">
      <Card
        className="overflow-hidden relative"
        style={{
          padding: 0,
          borderRadius: 'var(--radius-2xl)',
        }}
      >
        {/* 상단 이미지 슬롯 */}
        <div className="relative">
          <CardImageSlot view={view} ratio="video" />
        </div>

        {/* 티켓 분할 절취선 & 좌우 펀칭 노치 */}
        <div className="relative flex items-center h-4 bg-white -my-2 z-10">
          {/* 좌측 반원 펀칭 홈 */}
          <div
            className="absolute -left-3 size-6 rounded-full bg-[#f7f5f0] border border-slate-200"
            style={{
              clipPath: 'polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%)',
            }}
          />
          {/* 점선 절취선 */}
          <div className="w-full border-t-2 border-dashed border-slate-200 mx-5" />
          {/* 우측 반원 펀칭 홈 */}
          <div
            className="absolute -right-3 size-6 rounded-full bg-[#f7f5f0] border border-slate-200"
            style={{
              clipPath: 'polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)',
            }}
          />
        </div>

        {/* 하단 본문 영역 */}
        <CardBody>
          <CardChipRow view={view} />

          {hasTitleGroup && <CardTitleGroup title={view.title} subtitle={view.subtitle} />}

          <CardFacts facts={view.facts} />

          <CardDescription description={view.description} />

          {view.href && (
            <CardEndLine
              label={view.resource === 'article' ? d.today.cardReadArticle : d.today.cardReadMore}
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
