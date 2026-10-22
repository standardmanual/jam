import { Card } from '@ds/components/cards/Card'
import { d } from '@/lib/i18n'
import type { ImageCardView } from '@/lib/today/cardView'
import { CardBody, CardDescription, CardEndLine, CardFacts, CardTitleGroup } from './CardBody'
import CardChipRow from './CardChipRow'
import CardImageSlot from './CardImageSlot'

/**
 * 아치 돔(`dome`) 모양 — 티켓 20261022_2225 (사용자 결정에 따른 신규 카드 형태).
 *
 * 상단은 140px의 부드럽고 웅장한 아치 돔 실루엣(`borderRadius: 140px 140px var(--radius-2xl) var(--radius-2xl)`),
 * 하단은 24px 직각을 유지하는 건축적 서피스입니다.
 * - 이미지는 아치형으로 자연스럽게 클리핑되며, 하단 텍스트 영역의 가독성과 레이아웃을 100% 보존합니다.
 * - JAM! 2.0 테두리(`1px solid var(--border)`)와 완벽하게 호환됩니다.
 */
export default function DomeCard({ view }: { view: ImageCardView }) {
  const hasTitleGroup = !view.titleInImage

  return (
    <Card
      className="overflow-hidden"
      style={{
        padding: 0,
        borderRadius: '140px 140px var(--radius-2xl) var(--radius-2xl)',
      }}
    >
      {/* 16:9 와이드 또는 포스터 이미지 슬롯 */}
      <CardImageSlot view={view} ratio="video" />

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
  )
}
