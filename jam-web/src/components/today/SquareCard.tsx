import { Card } from '@ds/components/cards/Card'
import type { ImageCardView } from '@/lib/today/cardView'
import { CardBody, CardFacts, CardTitleGroup } from './CardBody'
import CardChipRow from './CardChipRow'
import CardImageSlot from './CardImageSlot'

/**
 * 정사각 큰 카드(`square`) 모양 — 면(표면) 겹 (티켓 20261001_2013, 상위 20260930_1453 확정 설계 1·3·4절 조각 b4).
 *
 * 링크·계측·눌림·포커스 윤곽선은 모르고(`CardFrame`이 맡는다) 표시 데이터(`ImageCardView`) 값만 읽어 그린다.
 * 위는 카드 폭 가득한 1:1 이미지 칸, 아래는 흰 본문이다: 칩 줄 → 제목 · 요약 → 필수 정보. 설명문·끝 줄은 없다(결정 15). 본문은 전부 왼쪽 정렬이다.
 *
 * - 이미지는 자르지 않는다(`object-contain`). 1:1이 아니면 크림 판(`bg-background`) 위에 레터박스가 되고, 투명 PNG 배지 그림도 크림 판 위에서 잘 보인다.
 *   판을 흰색으로 바꾸거나 이미지 모서리를 따로 둥글리지 않는다(카드 모서리는 `Card`의 `overflow-hidden`이 자른다). 이미지 위에는 아무것도 얹지 않는다.
 * - 본문 칸·제목 그룹·필수 정보는 `HeroCard`·`ListCard`와 공용 조각이다(`CardBody.tsx`, 티켓 20261001_2104 — 셋째 소비자가 생겨 공용으로 뺐다).
 *   `titleInImage`로 제목 그룹을 빼는 판단은 이 파일에 둔다(이미지 모양만의 규칙이다).
 * - 안쪽 여백은 `Card`가 인라인 `style`로 주기 때문에 클래스로는 덮이지 않아 `HeroCard`와 같은 인라인 `style`로 0을 주고, 본문 24px은 본문 칸이 가진다.
 * - 눌림·hover를 안쪽에 더하지 않는다(`CardFrame`의 링크가 가진 `.jam-press` 하나뿐이다). `overflow-hidden`은 `Card`에만 걸어 포커스 윤곽선이 잘리지 않게 한다.
 * - `--text-base`은 서비스에서 14px이 아니라 16px이다. 필수 정보 14px은 `--text-sm`이다.
 * - 옅은 글자는 `text-muted` 한 단계로 통일한다(흰 면 위 5.74:1). 불투명도로 글자색을 만들지 않는다(티켓 20261015_2133).
 * - 칩 줄에 `publishedAt`은 넘기지 않는다(`brief`와 같다, 기사는 `hero`로만 간다).
 * - 이미지 칸·자리 표시·`alt`·`sizes`는 `CardImageSlot`이 그린다. `imageDimmed`는 이미지만 흑백이고 희귀도 칩은 컬러다.
 *   `titleInImage`(옛 미션 소개 카드 포함)면 제목·요약을 빼고(이미지 `alt`가 제목) 필수 정보가 칩 줄 바로 다음에 온다.
 */

export default function SquareCard({ view }: { view: ImageCardView }) {
  const hasTitleGroup = !view.titleInImage

  return (
    <Card className="overflow-hidden" style={{ padding: 0 }}>
      <CardImageSlot view={view} ratio="square" />

      <CardBody>
        <CardChipRow view={{ resource: view.resource, label: view.label, regionLabel: view.regionLabel, rarity: view.rarity }} />

        {hasTitleGroup && <CardTitleGroup title={view.title} subtitle={view.subtitle} />}

        <CardFacts facts={view.facts} />
      </CardBody>
    </Card>
  )
}
