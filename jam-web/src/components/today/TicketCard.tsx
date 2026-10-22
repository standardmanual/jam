import { d } from '@/lib/i18n'
import type { ImageCardView } from '@/lib/today/cardView'
import { CardBody, CardDescription, CardEndLine, CardFacts, CardTitleGroup } from './CardBody'
import CardChipRow from './CardChipRow'
import CardImageSlot from './CardImageSlot'

/**
 * 티켓(`ticket`) 모양 — 티켓 20261022_2225 (사용자 결정에 따른 신규 카드 형태).
 *
 * BadgeFrame 모티브의 수직 티켓(Ticket-V) 실루엣으로, 상단 중앙과 하단 중앙 모서리에
 * 펀칭 노치가 파여 한정 보상·쿠폰·이벤트 느낌을 전달하는 상하 노치 카드 형태입니다.
 */

const TICKET_CLIP_PATH =
  'polygon(0 0, calc(50% - 16px) 0, 50% 16px, calc(50% + 16px) 0, 100% 0, 100% 100%, calc(50% + 16px) 100%, 50% calc(100% - 16px), calc(50% - 16px) 100%, 0 100%)'

export default function TicketCard({ view }: { view: ImageCardView }) {
  const hasTitleGroup = !view.titleInImage

  return (
    <div
      className="relative group transition-all"
      style={{
        filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.28)) drop-shadow(0 4px 6px -1px rgba(0,0,0,0.06))',
      }}
    >
      <div
        className="relative overflow-hidden bg-white"
        style={{
          borderRadius: 'var(--radius-2xl)',
          clipPath: TICKET_CLIP_PATH,
        }}
      >
        {/* 상단 이미지 / 비디오 슬롯 */}
        <div className="relative">
          <CardImageSlot view={view} ratio="video" />
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
      </div>
    </div>
  )
}
