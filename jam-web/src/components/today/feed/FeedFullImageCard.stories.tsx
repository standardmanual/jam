import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FEED_FULL_IMAGE_ENABLED, FEED_FULL_IMAGE_SCRIM } from '@/lib/today/feedConstants'
import FeedFullImageCard from './FeedFullImageCard'
import { CARD_WIDTH_320, CardBox, Cell, ONE_CHIP, Row, TWO_CHIPS, feedView } from './feedStoryFixtures'

/**
 * 전체 배경 이미지(`full_image`) 상태 행렬 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서비스 전용(홈피드 한정).
 *
 * **지금 홈에서는 꺼져 있다**: `FEED_FULL_IMAGE_ENABLED`가 거짓이라 `toCardView`가 이 유형을 옛 경로로 보낸다. 이미지 위 제목의 대비 기준이 없기 때문이다(이미지 규칙은 8회차).
 * 이 Story는 켜질 때의 모습을 미리 보이는 용도다. 정사각(1:1), 제목은 왼쪽 아래 16px(30/36 굵기 900), 설명 숨김. 제목 글자는 다른 유형처럼 `--foreground`이고 제목 뒤 막은 기본 농도 0(없음)이다.
 * 이미지 위 제목 대비 기준은 이미지 규칙(8회차)에서 채원이 정하며, 켤 때 채원이 글자색·막을 함께 정한다. 칩은 이미지 위 모서리 안쪽이고 제목 자리인 왼쪽 아래는 쓰지 않는다.
 */
const meta: Meta<typeof FeedFullImageCard> = {
  title: '서비스/Today/Feed/전체 배경 이미지(full_image, 꺼짐)',
  component: FeedFullImageCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `꺼짐 상태(FEED_FULL_IMAGE_ENABLED = ${String(FEED_FULL_IMAGE_ENABLED)}). 홈은 이 유형을 옛 모양으로 그린다. 제목 글자는 --foreground이고 막 농도는 ${FEED_FULL_IMAGE_SCRIM.opacity}(없음)다. 켤 때 채원이 글자색·막(높이 ${FEED_FULL_IMAGE_SCRIM.heightPercent}%)을 함께 정한다.`,
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

const base = {
  title: '잎 진 산길에서\n만나는 하늘',
  chips: [{ kind: 'value' as const, source: 'mission.remaining' }, { kind: 'label' as const }],
}

export const Sample: Story = {
  name: '샘플 구성(꺼짐 상태에서 미리 보기)',
  render: () => (
    <CardBox>
      <FeedFullImageCard view={feedView('full_image', { ...base, stamp_enabled: true })} />
    </CardBox>
  ),
}

export const ChipCounts: Story = {
  name: '칩 0·1·2개',
  render: () => (
    <Row>
      {([[], ONE_CHIP, TWO_CHIPS] as const).map((chips, index) => (
        <Cell key={index} label={`칩 ${chips.length}개`}>
          <CardBox>
            <FeedFullImageCard view={feedView('full_image', { ...base, chips: [...chips] })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const TitleChipCounts: Story = {
  name: '제목 속 칩 0·1·2개',
  render: () => (
    <Row>
      {([[], ['산길'], ['산길', '하늘']] as const).map((words, index) => (
        <Cell key={index} label={`제목 속 칩 ${words.length}개`}>
          <CardBox>
            <FeedFullImageCard view={feedView('full_image', { ...base, title_chip_words: [...words] })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const NoImage: Story = {
  name: '이미지 없음(색 면)',
  render: () => (
    <CardBox>
      <FeedFullImageCard view={feedView('full_image', { ...base, imageUrl: null })} />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288)',
  render: () => (
    <CardBox width={CARD_WIDTH_320}>
      <FeedFullImageCard view={feedView('full_image', base)} />
    </CardBox>
  ),
}
