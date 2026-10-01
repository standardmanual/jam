import { Card } from '@ds/components/cards/Card'
import type { ImageCardView } from '@/lib/today/cardView'
import CardChipRow from './CardChipRow'
import CardImageSlot from './CardImageSlot'

/**
 * 포스터(`poster`) 모양 — 면(표면) 겹 (티켓 20261001_2013, 상위 20260930_1453 확정 설계 1·3·4절 조각 b4).
 *
 * 링크·계측·눌림·포커스 윤곽선은 모르고(`CardFrame`이 맡는다) 표시 데이터(`ImageCardView`) 값만 읽어 그린다.
 * 4:5 이미지가 카드 전체이고, 아래쪽에만 어두운 막(글자 블록)이 올라온다: 칩 줄 → 제목 → 필수 정보. 요약·설명문·끝 줄은 없다. 글자는 전부 왼쪽 정렬이다.
 *
 * - 막은 글자 블록 높이 + 위 32px 램프까지다. 카드 전체나 절반을 덮지 않는다. 막이 `absolute`라 글자 수가 카드 높이를 바꾸지 않고 위로만 자란다.
 * - **막의 진하기**: 단일 선형 그라디언트 `transparent → var(--color-overlay)`이고 정지점은 퍼센트가 아니라 고정 길이(`var(--spacing-32)`)다.
 *   막 높이는 제목 1~2줄·필수 정보 0~2줄에 따라 달라서 퍼센트 정지점을 쓰면 첫 줄 자리의 진하기가 글자 수에 따라 변한다(옛 `BannerCard`의 `from-black/70 via-black/30`이
 *   그 문제다). 위 32px는 램프이고 글자 블록의 위 여백(`pt-32`)과 같아서, 칩 줄 윗변은 늘 램프가 끝난 뒤(알파 `--color-overlay`)에서 시작한다.
 *   `--color-overlay`는 0.6이고 확정 설계 1절 「첫 줄에서도 60% 이상」의 하한과 같다. 이 설계는 그 값이 0.6 아래로 내려가면 깨지므로
 *   `__tests__/PosterCard.test.tsx`가 토큰 파일에서 알파를 읽어 0.6 이상임을 단언한다. 막은 검정 알파 하나뿐이다(색 섞기·blur·그림자·테두리 광택 없음).
 * - 막 위 글자는 전부 `text-white`다(옅은 단계 없음). 막 0.6 아래 순백 이미지에서 흰 글자 대비는 5.74:1이고 `/80`은 4.37:1, `/60`은 3.22:1이라 AA(4.5)에 못 미친다.
 *   `text-text`를 쓰지 않는 것은 Storybook 라이트 토글에서 값이 뒤집히는데 막은 늘 검정이라서다.
 * - 칩 줄은 막의 첫 줄이다(`CardChipRow on="scrim"`). 이미지 위(막 밖)에 칩을 흩뿌리지 않는다. `publishedAt`은 넘기지 않는다(`brief`와 같다, 기사는 `hero`로만 간다).
 * - 안쪽 여백은 `Card`가 인라인 `style`로 주기 때문에 클래스로는 덮이지 않아 `HeroCard`와 같은 인라인 `style`로 0을 준다. 바탕 색조는 이미지 판이 덮으므로 `default`다.
 *   모서리는 `Card`의 `overflow-hidden`이 자른다. 눌림·hover를 안쪽에 더하지 않는다(`CardFrame`의 링크가 가진 `.jam-press` 하나뿐이다).
 * - 이미지 칸·자리 표시·`alt`·`sizes`는 `CardImageSlot`이 그린다. 자리 표시는 카드 위쪽 60%에만 있어 아래에서 올라오는 막과 겹치지 않는다.
 *   `imageDimmed`는 이미지만 흑백이고 막·글자·희귀도 칩은 컬러다. `titleInImage`면 제목을 빼고(이미지 `alt`가 제목) 필수 정보가 칩 줄 바로 다음에 온다.
 */

/** 막 — 글자 블록 아래쪽 정렬, 위 32px가 램프다(고정 길이 정지점, 위 설명 참고). 클래스 전체 문자열이어야 Tailwind가 읽는다. */
const SCRIM_CLASS =
  'absolute inset-x-0 bottom-0 flex flex-col gap-[var(--spacing-12)] pt-[var(--spacing-32)] px-[var(--spacing-24)] pb-[var(--spacing-24)] bg-[linear-gradient(to_bottom,transparent,var(--color-overlay)_var(--spacing-32))]'

export default function PosterCard({ view }: { view: ImageCardView }) {
  const facts = view.facts ?? []

  return (
    <Card tone="default" className="relative overflow-hidden" style={{ padding: 0 }}>
      <CardImageSlot view={view} ratio="poster" />

      <div className={SCRIM_CLASS}>
        <CardChipRow
          view={{ resource: view.resource, label: view.label, regionLabel: view.regionLabel, rarity: view.rarity }}
          on="scrim"
        />

        {!view.titleInImage && (
          <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-white line-clamp-2 break-keep break-words">
            {view.title}
          </h3>
        )}

        {/* 필수 정보 — 아이콘·불릿 없이 글자로, 한 줄에 하나씩. 자르지 않고 줄바꿈한다(말줄임 없음). 보통 굵기다(확정 설계 3절 poster 열에 굵게 지정이 없다) */}
        {facts.length > 0 && (
          <div>
            {facts.map((line, index) => (
              <p
                key={index}
                className="text-[length:var(--text-small)] leading-[var(--leading-small)] text-white break-keep break-words"
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
