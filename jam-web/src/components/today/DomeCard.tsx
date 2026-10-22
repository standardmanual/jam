import { Card } from '@ds/components/cards/Card'
import { d } from '@/lib/i18n'
import type { ImageCardView } from '@/lib/today/cardView'
import { CardBody, CardDescription, CardEndLine, CardFacts, CardTitleGroup } from './CardBody'
import CardChipRow from './CardChipRow'
import CardImageSlot from './CardImageSlot'

/**
 * 아치 돔(`dome`) 모양 — 티켓 20261022_2225, 20261022_2300 후속.
 *
 * 상단은 140px의 부드럽고 웅장한 아치 돔 실루엣(`borderRadius: 140px 140px var(--radius-2xl) var(--radius-2xl)`),
 * 하단은 24px 직각을 유지하는 건축적 서피스입니다.
 * - 포스터형(`layoutType === 'banner'`): 카드 전체(4:5)가 영상/이미지 배경이고 하단에 다크 스크림 오버레이와 텍스트가 올라옵니다.
 * - 히어로형(기본): 상단 16:9 미디어 슬롯 + 하단 화이트 본문 카드입니다.
 * - JAM! 2.0 테두리(`1px solid var(--border)`)와 완벽하게 호환됩니다.
 */

const SCRIM_CLASS =
  'absolute inset-x-0 bottom-0 flex flex-col gap-3 pt-8 px-6 pb-6 bg-[linear-gradient(to_bottom,transparent,color-mix(in_srgb,var(--base-black)_60%,transparent)_var(--spacing-32))]'

const DOME_BORDER_RADIUS = '140px 140px var(--radius-2xl) var(--radius-2xl)'

export default function DomeCard({ view }: { view: ImageCardView }) {
  const isPoster = view.layoutType === 'banner'

  if (isPoster) {
    const facts = view.facts ?? []
    return (
      <Card
        className="relative overflow-hidden"
        style={{
          padding: 0,
          borderRadius: DOME_BORDER_RADIUS,
        }}
      >
        <CardImageSlot view={view} ratio="poster" />

        <div className={SCRIM_CLASS}>
          <CardChipRow
            view={{ resource: view.resource, label: view.label, regionLabel: view.regionLabel, rarity: view.rarity }}
            on="scrim"
          />

          {!view.titleInImage && (
            <h3 className="text-2xl text-snow font-bold line-clamp-2 break-keep break-words">
              {view.title}
            </h3>
          )}

          {facts.length > 0 && (
            <div>
              {facts.map((line, index) => (
                <p key={index} className="text-sm text-snow break-keep break-words">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      </Card>
    )
  }

  const hasTitleGroup = !view.titleInImage

  return (
    <Card
      className="overflow-hidden"
      style={{
        padding: 0,
        borderRadius: DOME_BORDER_RADIUS,
      }}
    >
      {/* 16:9 와이드 또는 히어로 이미지 슬롯 */}
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
