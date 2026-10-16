import { Card } from '@ds/components/cards/Card'
import { d } from '@/lib/i18n'
import type { ImageCardView } from '@/lib/today/cardView'
import { CardBody, CardDescription, CardEndLine, CardFacts, CardTitleGroup } from './CardBody'
import CardChipRow from './CardChipRow'
import CardImageSlot from './CardImageSlot'

/**
 * 큰 이미지(`hero`) 모양 — 면(표면) 겹 (티켓 20261001_1737, 상위 20260930_1453 확정 설계 1·3·4절 조각 b3).
 *
 * 링크·계측·눌림·포커스 윤곽선은 모르고(`CardFrame`이 맡는다) 표시 데이터(`ImageCardView`) 값만 읽어 그린다.
 * 위는 16:9 이미지 칸, 아래는 흰 본문이다: 칩 줄 → 제목 · 요약 → 필수 정보 → 설명문 → 끝 줄. 본문은 전부 왼쪽 정렬이다.
 *
 * - 안쪽 여백은 `Card`가 인라인 `style`(`padding: var(--layout-card-padding)`)로 주기 때문에 클래스(`p-*`)로는 덮이지 않는다. 이미지가 카드 모서리까지
 *   닿아야 해서 같은 인라인 `style`로 0을 주고, 본문 24px은 본문 칸이 가진다. 이미지 모서리는 `Card`의 `overflow-hidden`이 자른다.
 * - 눌림·hover를 안쪽에 더하지 않는다(`CardFrame`의 링크가 가진 `.jam-press` 하나뿐이다). `overflow-hidden`은 `Card`에만 걸어 포커스 윤곽선이 잘리지 않게 한다.
 * - `--text-base`은 서비스에서 14px이 아니라 16px이다. 필수 정보·설명문 14px은 `--text-sm`이다.
 * - 옅은 글자는 `text-muted` 한 단계로 통일한다(흰 면 위 5.74:1). 불투명도로 글자색을 만들지 않는다(티켓 20261015_2133).
 * - 이미지 위에는 아무것도 얹지 않는다(칩·그림자·어두운 막 없음). 칩 줄은 이미지 아래 흰 본문의 첫 줄이다.
 * - 본문 칸·제목 그룹·필수 정보·설명문·끝 줄은 `SquareCard`·`ListCard`와 공용 조각이다(`CardBody.tsx`, 티켓 20261001_2104 — 셋째 소비자가 생겨 공용으로 뺐다).
 *   `titleInImage`로 제목 그룹을 빼는 판단은 이 파일에 둔다(이미지 모양만의 규칙이다).
 */

export default function HeroCard({ view }: { view: ImageCardView }) {
  const hasTitleGroup = !view.titleInImage

  return (
    <Card className="overflow-hidden" style={{ padding: 0 }}>
      {/* 16:9 이미지 칸·자리 표시·alt·sizes는 `poster`·`square`와 공용이다(`CardImageSlot`) */}
      <CardImageSlot view={view} ratio="video" />

      <CardBody>
        <CardChipRow view={view} />

        {hasTitleGroup && <CardTitleGroup title={view.title} subtitle={view.subtitle} />}

        <CardFacts facts={view.facts} />

        <CardDescription description={view.description} />

        {/* 끝 줄 — 링크가 없는 카드(`href` 없음)는 「자세히 보기」라고 말하지 않는다. 미리보기도 링크만 없을 뿐 `href`가 있으면 보인다 */}
        {view.href && <CardEndLine label={view.resource === 'article' ? d.today.cardReadArticle : d.today.cardReadMore} />}
      </CardBody>
    </Card>
  )
}
