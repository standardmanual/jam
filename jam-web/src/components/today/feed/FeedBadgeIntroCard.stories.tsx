import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import FeedBadgeIntroCard from './FeedBadgeIntroCard'
import { BADGE, CARD_WIDTH_320, CardBox, Cell, ONE_CHIP, Row, TWO_CHIPS, feedView } from './feedStoryFixtures'

/**
 * 배지 소개(`badge_intro`) 상태 행렬 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서비스 전용(홈피드 한정).
 * 위에 배지 그림을 박스 없이 가운데에(208×208, 영역 높이 216), 아래에 제목과 설명. 샘플 카드 높이 384. 칩은 카드 모서리에 걸쳐 계획(`look.chipPlan`)대로 놓이고 배지 그림 가운데를 가리지 않는다.
 */
const meta: Meta<typeof FeedBadgeIntroCard> = {
  title: '서비스/Today/Feed/배지 소개(badge_intro)',
  component: FeedBadgeIntroCard,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

const base = {
  title: '산 위에서\n한숨 돌리는 날',
  description: '산에서 최고 고도 700m를 넘기면 높은 곳 배지를 획득할 수 있어요.',
  badgeImageUrl: BADGE,
  badgeName: '높은 곳 배지',
  chips: [
    { kind: 'phrase' as const, text: '700m' },
    { kind: 'label' as const, text: '최고 고도' },
  ],
}

export const Sample: Story = {
  name: '샘플 구성',
  render: () => (
    <CardBox>
      <FeedBadgeIntroCard view={feedView('badge_intro', base)} />
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
            <FeedBadgeIntroCard view={feedView('badge_intro', { ...base, chips: [...chips] })} />
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
      {([[], ['한숨'], ['산', '한숨']] as const).map((words, index) => (
        <Cell key={index} label={`제목 속 칩 ${words.length}개`}>
          <CardBox>
            <FeedBadgeIntroCard view={feedView('badge_intro', { ...base, title_chip_words: [...words] })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const WithStamp: Story = {
  name: '도장 있음',
  render: () => (
    <CardBox>
      <FeedBadgeIntroCard view={feedView('badge_intro', { ...base, stamp_enabled: true })} />
    </CardBox>
  ),
}

export const NoImage: Story = {
  name: '배지 그림 없음(빈 영역 유지)',
  render: () => (
    <CardBox>
      <FeedBadgeIntroCard view={feedView('badge_intro', { ...base, badgeImageUrl: null, imageUrl: null })} />
    </CardBox>
  ),
}

export const DescriptionHidden: Story = {
  name: '설명 숨김(show_description=false)',
  render: () => (
    <CardBox>
      <FeedBadgeIntroCard view={feedView('badge_intro', { ...base, show_description: false })} />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288)',
  render: () => (
    <CardBox width={CARD_WIDTH_320}>
      <FeedBadgeIntroCard view={feedView('badge_intro', { ...base, stamp_enabled: true })} />
    </CardBox>
  ),
}
