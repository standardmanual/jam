import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import FeedBadgeOnlyCard from './FeedBadgeOnlyCard'
import { BADGE, CARD_WIDTH_320, CardBox, Cell, Row, TWO_CHIPS, feedView } from './feedStoryFixtures'

/**
 * 배지만(`badge_only`) 상태 행렬 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서비스 전용(홈피드 한정).
 * 위에 제목, 아래에 배지 그림(208×208, 영역 높이 216). 샘플 카드 높이 332. 칩이 없고(칩이 저장돼 있어도 이 유형은 자리가 없어 그리지 않는다) 제목 속 칩만 선택으로 쓴다. 설명은 숨김.
 */
const meta: Meta<typeof FeedBadgeOnlyCard> = {
  title: '서비스/Today/Feed/배지만(badge_only)',
  component: FeedBadgeOnlyCard,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

const base = { title: '해가 짧아진 저녁의\n한 바퀴', badgeImageUrl: BADGE, badgeName: '파장의 골목 배지' }

export const Sample: Story = {
  name: '샘플 구성',
  render: () => (
    <CardBox>
      <FeedBadgeOnlyCard view={feedView('badge_only', base)} />
    </CardBox>
  ),
}

export const TitleChipCounts: Story = {
  name: '제목 속 칩 0·1·2개',
  render: () => (
    <Row>
      {([[], ['저녁'], ['해가', '한 바퀴']] as const).map((words, index) => (
        <Cell key={index} label={`제목 속 칩 ${words.length}개`}>
          <CardBox>
            <FeedBadgeOnlyCard view={feedView('badge_only', { ...base, title_chip_words: [...words] })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const StoredChipsIgnored: Story = {
  name: '저장된 칩이 있어도 그리지 않음',
  render: () => (
    <CardBox>
      <FeedBadgeOnlyCard view={feedView('badge_only', { ...base, chips: TWO_CHIPS })} />
    </CardBox>
  ),
}

export const NoImage: Story = {
  name: '배지 그림 없음(빈 영역 유지)',
  render: () => (
    <CardBox>
      <FeedBadgeOnlyCard view={feedView('badge_only', { ...base, badgeImageUrl: null, imageUrl: null })} />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288)',
  render: () => (
    <CardBox width={CARD_WIDTH_320}>
      <FeedBadgeOnlyCard view={feedView('badge_only', { ...base, title_chip_words: ['저녁'] })} />
    </CardBox>
  ),
}
