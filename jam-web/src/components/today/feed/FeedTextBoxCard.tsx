import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_CARD_MIN_HEIGHT, FEED_TEXT_BOX_MIN_HEIGHT, FEED_TEXT_BOX_PADDING } from '@/lib/today/feedConstants'
import FeedBox from '../FeedBox'
import { FeedCardShell, FeedChipLayer, FeedStampLayer, FeedTitle } from './FeedCardParts'

/**
 * 텍스트(`text_box`) — 박스가 카드를 채우고 가운데에 큰 글자만 둔다 (티켓 20261121_0041).
 *
 * 샘플: 카드 최소 높이 440, 바깥 여백 16, 박스 최소 높이 408(색 면 또는 이미지 마스크), 큰 글자 48px/줄 1.1 굵기 900 가운데 정렬.
 * 줄바꿈은 데이터의 줄바꿈 그대로다. 설명은 그리지 않는다(`look.showDescription`이 이 유형에서 늘 거짓). 박스에 외곽선이 없다. 칩은 박스 모서리에 걸친다.
 * 박스가 이미지 마스크(`look.boxKind === 'image_mask'`)이고 이미지가 있으면 이미지를 박스 모양으로 자르고, 아니면 색 면이다.
 *
 * 글자 안쪽 여백은 부모(이 파일)가 준다: 물결 가장자리가 최대 22px, 티켓 홈 반지름이 28px 패이므로 32px(`FEED_TEXT_BOX_PADDING`)다.
 * 반원 돌출은 `FeedBox`가 돌출 반지름만큼 안쪽 여백을 따로 건다. 티켓 모양의 홈이 겹치지 않는 최소 높이(190px)보다 박스 최소 높이(408)가 크다.
 */

const IMAGE_SIZES = '(min-width: 430px) 366px, calc(100vw - 64px)'

export default function FeedTextBoxCard({ view }: { view: FeedCardView }) {
  const { look } = view
  const useImage = look.boxKind === 'image_mask' && Boolean(view.imageUrl)
  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.text_box}>
      <div className="relative flex flex-1" style={{ minHeight: FEED_TEXT_BOX_MIN_HEIGHT }}>
        <FeedBox
          shape={look.boxShape}
          orientation="text"
          color={look.colors.box}
          seed={look.seed}
          className="relative flex flex-1 items-center justify-center overflow-hidden"
        >
          {useImage && <SafeImage src={view.imageUrl} alt="" sizes={IMAGE_SIZES} className="object-cover" />}
          <div className="relative" style={{ padding: FEED_TEXT_BOX_PADDING }}>
            <FeedTitle view={view} big onBox />
          </div>
        </FeedBox>
        <FeedChipLayer view={view} />
        <FeedStampLayer view={view} />
      </div>
    </FeedCardShell>
  )
}
