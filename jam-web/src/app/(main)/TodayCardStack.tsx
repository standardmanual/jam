import type { TodayCardWithHref } from '@/lib/today/cards'
import TodayCard from '@/components/today/TodayCard'
import { toCardView } from '@/lib/today/cardView'
import { d } from '@/lib/i18n'

/**
 * 투데이 카드 스택 (홈 화면 최상단). 카드 0개면 아무것도 렌더링하지 않는다.
 *
 * 모든 카드를 표시 데이터(`toCardView`, 계측 정보 `tracking` 포함)로 바꿔 새 틀(`TodayCard`)로 그린다. 모양은 `resolveShape`가 정한다 —
 * 저장된 `shape`가 있으면 그 값이고, 없는 옛 카드는 `layout_type` 대응표로 정한다(티켓 20261001_2244, 1453 조각 b7이 옛 렌더러를 지웠다).
 * 카드를 누르면 이동하는 곳(`resolved_href`, 기사는 `/today/[id]`)과 노출·클릭 계측은 카드 틀(`CardFrame`)이 맡는다.
 * 랭킹 행형은 순위 행마다 자기 링크(유저 프로필)가 있어 카드 전체 링크가 없다(`TodayCard`).
 */
export default function TodayCardStack({
  cards,
  currentUserId,
}: {
  cards: TodayCardWithHref[]
  /** 랭킹 행형 `list`에서 내 순위 행을 강조하는 데 쓴다(선택 — 없으면 강조 없음) */
  currentUserId?: string
}) {
  if (!cards || cards.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-3xl">{d.today.cardStackTitle}</h2>
        <span className="text-xs text-snow/40">{d.today.cardStackSubtitle}</span>
      </div>

      <div className="flex flex-col gap-4">
        {cards.map((card) => (
          <TodayCard key={card.id} view={toCardView(card, { tracking: true })} currentUserId={currentUserId} />
        ))}
      </div>
    </section>
  )
}
