import SafeImage from '@/components/SafeImage'
import type { ImageCardView } from '@/lib/today/cardView'
import { resourceIconOf } from './resourceIcon'

/**
 * 이미지 모양 공용 이미지 칸 + 자리 표시 (티켓 20261001_2013, 상위 20260930_1453 조각 b4).
 * `HeroCard`가 혼자 쓰던 칸(티켓 20261001_1737)을 `PosterCard`·`SquareCard`가 비율만 바꿔 쓰게 되면서 공용으로 뺐다.
 *
 * 세 모양이 같은 규칙을 한 곳에서 지킨다:
 * - 칸은 이미지와 무관하게 늘 있다 — `SafeImage`는 주소가 없거나 실패하면 컨테이너까지 없애고 fallback만 그려서, 칸을 거기에 맡기면 카드 높이가 흔들린다
 *   (그래서 `containerClassName`을 쓰지 않고 칸을 직접 그린다). 로딩 중에는 `--background` 단색 판이다(스켈레톤·모션 없음).
 * - `alt`: 제목이 화면 글자로 보이면 비우고(본문 h3가 말한다), 이미지에만 있으면(`titleInImage`) 제목이다. 이미지가 실패하면 판 위 제목 글자가 링크 이름을 맡는다.
 * - `sizes`: 앱 열이 최대 430px이고 카드 좌우 여백이 16px씩이라 카드는 최대 398px이다. 세 모양 모두 카드 폭이 같다. 주지 않으면 100vw로 가정해 과대 다운로드한다.
 * - 자리 표시: `--background` 단색 판 + 자원 아이콘뿐이다(그라디언트·문구 없음). 제목은 이미지에 제목이 들어 있는 카드(`titleInImage`)에서만 판 위에 그린다.
 *   일반 카드는 바로 아래 본문(또는 막)이 같은 제목을 24px로 보여 주므로 아이콘만 둬 같은 제목이 한 카드에 두 번 보이지 않게 한다.
 *   가운데 정렬은 이 판에만 쓴다. 아이콘은 장식이라 숨기고(`aria-hidden`, 아이콘 세트 기본값) 판은 흑백 처리하지 않는다.
 *
 * 비율별 값은 클래스 전체 문자열 맵이다 — Tailwind는 클래스를 문자열 조립으로 만들면 읽지 못한다.
 * - `video`(hero): 16:9, 이미지를 칸에 맞춰 자른다(`object-cover`).
 * - `poster`: 4:5, 이미지를 칸에 맞춰 자른다. 아래에서 어두운 막이 올라오므로 자리 표시는 위쪽 60%에만 둔다(막과 겹쳐 읽히지 않게).
 * - `square`: 1:1, 이미지를 자르지 않는다(`object-contain`). 1:1이 아니면 판 위에 레터박스다.
 * `imageDimmed`면 이미지에만 `grayscale`을 건다(자리 표시 판·아이콘은 흑백 처리하지 않는다).
 */
export type CardImageRatio = 'video' | 'poster' | 'square'

const IMAGE_SIZES = '(min-width: 430px) 398px, calc(100vw - 32px)'

const PLACEHOLDER_CONTENT = 'flex flex-col items-center justify-center gap-2 px-6 bg-background text-center'

const SLOT: Record<CardImageRatio, { box: string; image: string; placeholder: string }> = {
  video: {
    box: 'relative aspect-video overflow-hidden bg-background',
    image: 'object-cover',
    placeholder: `absolute inset-0 ${PLACEHOLDER_CONTENT}`,
  },
  poster: {
    box: 'relative aspect-[4/5] overflow-hidden bg-background',
    image: 'object-cover',
    placeholder: `absolute inset-x-0 top-0 h-[60%] ${PLACEHOLDER_CONTENT}`,
  },
  square: {
    box: 'relative aspect-square overflow-hidden bg-background',
    image: 'object-contain',
    placeholder: `absolute inset-0 ${PLACEHOLDER_CONTENT}`,
  },
}

/** 자리 표시. 주소가 없을 때와 로드에 실패했을 때 같은 코드를 탄다(`SafeImage`의 `fallback`). 아이콘은 `BriefCard`의 64px 칸과 같은 선택 함수를 쓴다. */
function ImagePlaceholder({ view, className }: { view: ImageCardView; className: string }) {
  return (
    <div className={className}>
      {resourceIconOf(view, { className: 'w-8 h-8 text-foreground/60' })}
      {view.titleInImage && (
        <p className="text-base font-bold text-foreground line-clamp-3 break-keep break-words">{view.title}</p>
      )}
    </div>
  )
}

export default function CardImageSlot({ view, ratio }: { view: ImageCardView; ratio: CardImageRatio }) {
  const slot = SLOT[ratio]

  return (
    <div className={slot.box}>
      <SafeImage
        src={view.imageUrl}
        alt={view.titleInImage ? view.title : ''}
        sizes={IMAGE_SIZES}
        className={view.imageDimmed ? `${slot.image} grayscale` : slot.image}
        fallback={<ImagePlaceholder view={view} className={slot.placeholder} />}
      />
    </div>
  )
}
