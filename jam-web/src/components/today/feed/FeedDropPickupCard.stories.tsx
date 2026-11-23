import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BOX_SHAPES } from '@/lib/today/boxShape'
import FeedDropPickupCard from './FeedDropPickupCard'
import { CARD_WIDTH_320, CardBox, Cell, ITEM_BADGES, Row, feedView, type StoryCardOptions } from './feedStoryFixtures'

/**
 * 드랍·픽업(`drop_pickup`) 상태 행렬 (티켓 20261121_0115, 상위 20261120_2026 4회차-3). 서비스 전용(홈피드 한정).
 * 위에 아이템 배지 3개를 박스에 담아 한 줄(영역 높이 184, 칸 간격 8, 칸마다 배지 80×80을 가운데에), 아래에 제목과 설명. 샘플 카드 높이 360.
 * 박스 모양은 5종 중 하나를 아이템 방향으로 그린다. 칩은 «DROP»·«PICKUP» 분류 칩 두 개가 카드 모서리에 계획(`look.chipPlan`)대로 놓인다(스티커는 한 개뿐이고 둘째는 검정 알약, 칩을 못 놓으면 계획이 둘째를 뺀다).
 * 칩이 저장되지 않은 카드는 이 두 칩이 자동으로 붙고, 저장된 chips가 있으면 그것을 따른다.
 */
const meta: Meta<typeof FeedDropPickupCard> = {
  title: '서비스/Today/Feed/드랍·픽업(drop_pickup)',
  component: FeedDropPickupCard,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

const base: StoryCardOptions = {
  title: '내겐 남는 것이\n누군가의 새것',
  description: '남는 아이템 배지는 드랍하고, 필요한 건 픽업해 봐요.',
  imageUrl: null,
  itemBadges: ITEM_BADGES.slice(0, 3),
  valueSource: { resource: 'drop_pickup' },
  box_shape: 'round',
  feed_seed: 5,
}

const view = (options: StoryCardOptions = {}) => feedView('drop_pickup', { ...base, ...options })

export const Sample: Story = {
  name: '샘플 구성',
  render: () => (
    <CardBox>
      <FeedDropPickupCard view={view()} />
    </CardBox>
  ),
}

export const BoxShapes: Story = {
  name: '박스 모양 5종(아이템 방향)',
  render: () => (
    <Row>
      {BOX_SHAPES.map((shape) => (
        <Cell key={shape} label={shape}>
          <CardBox>
            <FeedDropPickupCard view={view({ box_shape: shape })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const BadgeCounts: Story = {
  name: '배지 1·2·3개',
  render: () => (
    <Row>
      {[1, 2, 3].map((count) => (
        <Cell key={count} label={`배지 ${count}개`}>
          <CardBox>
            <FeedDropPickupCard view={view({ itemBadges: ITEM_BADGES.slice(0, count) })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const NoImages: Story = {
  name: '이미지 없음(이름 글자로 대신)',
  render: () => (
    <CardBox>
      <FeedDropPickupCard view={view({ itemBadges: ITEM_BADGES.slice(0, 3).map((badge) => ({ ...badge, imageUrl: null })) })} />
    </CardBox>
  ),
}

export const DiagonalChipPairs: Story = {
  name: '어드민이 자리를 정한 칩 2개(대각선 두 짝)',
  render: () => (
    <Row>
      <Cell label="왼쪽 위 ↔ 오른쪽 아래">
        <CardBox>
          <FeedDropPickupCard
            view={view({
              chips: [
                { kind: 'phrase', text: '드랍', slot: 'box-row-top-left' },
                { kind: 'label', text: '픽업', slot: 'box-row-bottom-right' },
              ],
            })}
          />
        </CardBox>
      </Cell>
      <Cell label="오른쪽 위 ↔ 왼쪽 아래">
        <CardBox>
          <FeedDropPickupCard
            view={view({
              chips: [
                { kind: 'phrase', text: '드랍', slot: 'box-row-top-right' },
                { kind: 'label', text: '픽업', slot: 'box-row-bottom-left' },
              ],
            })}
          />
        </CardBox>
      </Cell>
    </Row>
  ),
}

export const ChipVariants: Story = {
  name: '칩 없음 · 한 개만 저장',
  render: () => (
    <Row>
      <Cell label="칩 없음">
        <CardBox>
          <FeedDropPickupCard view={view({ chips: [] })} />
        </CardBox>
      </Cell>
      <Cell label="한 개만 저장(검정)">
        <CardBox>
          <FeedDropPickupCard view={view({ chips: [{ kind: 'label', text: '픽업', slot: 'box-row-top-left' }] })} />
        </CardBox>
      </Cell>
    </Row>
  ),
}

export const WithTitleChip: Story = {
  name: '제목 속 칩',
  render: () => (
    <CardBox>
      <FeedDropPickupCard view={view({ title_chip_words: ['새것'] })} />
    </CardBox>
  ),
}

export const DescriptionHidden: Story = {
  name: '설명 숨김(show_description=false)',
  render: () => (
    <CardBox>
      <FeedDropPickupCard view={view({ show_description: false })} />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288, 칸 폭 80)',
  render: () => (
    <CardBox width={CARD_WIDTH_320}>
      <FeedDropPickupCard view={view({ box_shape: 'bump' })} />
    </CardBox>
  ),
}
