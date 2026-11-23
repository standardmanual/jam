import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_PHOTO_TEXT_SCRIM, FEED_TEXT_BOX_PADDING } from '@/lib/today/feedConstants'
import FeedBox from '../FeedBox'
import { FeedCardShell, FeedChipLayer, FeedStampLayer, FeedTitle } from './FeedCardParts'

/**
 * 텍스트(`text_box`) — 박스가 카드를 채우고 가운데에 큰 글자만 둔다 (티켓 20261121_0041, 정사각형·사진 글자는 티켓 20261122_2228 R2).
 *
 * 카드는 정사각형(`aspect-square`, 폭은 부모가 정하고 높이 숫자는 두지 않는다)이고, 바깥 여백 16을 뺀 나머지를 박스(색 면 또는 이미지 마스크)가 채운다.
 * 큰 글자는 48px/줄 1.1 굵기 900 가운데 정렬이고 제목이 길면 `feedTextBoxTitleSizeClass`가 36·30으로 낮춘다. 글자 층은 `max-h-full`·`overflow-hidden`이라 박스 밖으로 나가지 않는다.
 * 줄바꿈은 데이터의 줄바꿈 그대로다. 설명은 그리지 않는다(`look.showDescription`이 이 유형에서 늘 거짓). 박스에 외곽선이 없다. 칩은 박스 모서리에 걸친다.
 * 박스가 이미지 마스크(`look.boxKind === 'image_mask'`)이고 이미지가 있으면 이미지를 박스 모양으로 자르고, 아니면 색 면이다.
 * 사진이 실제로 그려질 때만 박스 전체에 어둠 막 32%(`FEED_PHOTO_TEXT_SCRIM`)를 한 겹 깔고 제목을 흰 글자(`--snow`)로 쓴다. 색 면 박스의 제목은 `--foreground`다.
 *
 * 글자 안쪽 여백은 부모(이 파일)가 준다: 물결 가장자리가 최대 22px, 티켓 홈 반지름이 28px 패이므로 32px(`FEED_TEXT_BOX_PADDING`)다.
 * 반원 돌출은 `FeedBox`가 돌출 반지름만큼 안쪽 여백을 따로 건다.
 */

const IMAGE_SIZES = '(min-width: 430px) 366px, calc(100vw - 64px)'

/** 사진 위 어둠 막 색: `--foreground`를 막 농도만큼 섞는다(hex 없음). */
const PHOTO_SCRIM_COLOR = `color-mix(in srgb, var(--foreground) ${Math.round(FEED_PHOTO_TEXT_SCRIM * 100)}%, transparent)`

export default function FeedTextBoxCard({ view }: { view: FeedCardView }) {
  const { look } = view
  const useImage = look.boxKind === 'image_mask' && Boolean(view.imageUrl)
  return (
    <FeedCardShell view={view} className="aspect-square @container">
      <div className="relative flex min-h-0 flex-1">
        <FeedBox
          shape={look.boxShape}
          orientation="text"
          color={look.colors.box}
          seed={look.seed}
          className="relative flex flex-1 items-center justify-center overflow-hidden"
        >
          {useImage && <SafeImage src={view.imageUrl} alt="" sizes={IMAGE_SIZES} className="object-cover" />}
          {useImage && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundColor: PHOTO_SCRIM_COLOR }} />
          )}
          <div className="relative max-h-full max-w-full overflow-hidden" style={{ padding: FEED_TEXT_BOX_PADDING }}>
            <FeedTitle view={view} big onBox onPhoto={useImage} />
          </div>
        </FeedBox>
        <FeedChipLayer view={view} />
        <FeedStampLayer view={view} />
      </div>
    </FeedCardShell>
  )
}
