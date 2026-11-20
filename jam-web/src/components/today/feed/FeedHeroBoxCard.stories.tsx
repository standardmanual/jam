import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BOX_SHAPES } from '@/lib/today/boxShape'
import FeedHeroBoxCard from './FeedHeroBoxCard'
import { BADGE, CARD_WIDTH_320, CardBox, Cell, ONE_CHIP, Row, TWO_CHIPS, feedView } from './feedStoryFixtures'

/**
 * 히어로(`hero_box`) 상태 행렬 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서비스 전용(홈피드 한정).
 * 위에 이미지 박스(마스크 모양 5종 중 하나), 아래에 제목과 설명. 샘플 카드 높이 360, 이미지 박스 높이 184.
 * 칩은 이미지 박스 모서리에 걸치고(큰 칩 40·작은 칩 32), 도장은 이미지 모서리 안쪽이다. 폭은 고정 래퍼다(358은 390 화면, 288은 320 화면).
 */
const meta: Meta<typeof FeedHeroBoxCard> = {
  title: '서비스/Today/Feed/히어로(hero_box)',
  component: FeedHeroBoxCard,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

const DESCRIPTION = '먼저 참가하고 바스락 소리를 따라 걸어 봐요.'

const base = { description: DESCRIPTION, chips: TWO_CHIPS, box_shape: 'round' as const }

/** 샘플 구성: 값 칩(큰 칩) + 구분 칩(검정 작은 칩), 제목 속 칩 1개, 설명 보임. */
export const Sample: Story = {
  name: '샘플 구성',
  render: () => (
    <CardBox>
      <FeedHeroBoxCard view={feedView('hero_box', { ...base, title_chip_words: ['걷는'] })} />
    </CardBox>
  ),
}

export const BoxShapes: Story = {
  name: '박스 모양 5종',
  render: () => (
    <Row>
      {BOX_SHAPES.map((shape) => (
        <Cell key={shape} label={shape}>
          <CardBox>
            <FeedHeroBoxCard view={feedView('hero_box', { ...base, box_shape: shape, feed_seed: 7 })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const ChipCounts: Story = {
  name: '칩 0·1·2개',
  render: () => (
    <Row>
      {([[], ONE_CHIP, TWO_CHIPS] as const).map((chips, index) => (
        <Cell key={index} label={`칩 ${chips.length}개`}>
          <CardBox>
            <FeedHeroBoxCard view={feedView('hero_box', { ...base, chips: [...chips] })} />
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
      {([[], ['걷는'], ['낙엽', '걷는']] as const).map((words, index) => (
        <Cell key={index} label={`제목 속 칩 ${words.length}개`}>
          <CardBox>
            <FeedHeroBoxCard view={feedView('hero_box', { ...base, title_chip_words: [...words] })} />
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
      <FeedHeroBoxCard view={feedView('hero_box', { ...base, stamp_enabled: true })} />
    </CardBox>
  ),
}

export const NoImage: Story = {
  name: '이미지 없음(색 면)',
  render: () => (
    <CardBox>
      <FeedHeroBoxCard view={feedView('hero_box', { ...base, imageUrl: null })} />
    </CardBox>
  ),
}

export const DescriptionHidden: Story = {
  name: '설명 숨김(show_description=false)',
  render: () => (
    <CardBox>
      <FeedHeroBoxCard view={feedView('hero_box', { ...base, show_description: false })} />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288) — 칩이 가장자리 안쪽',
  render: () => (
    <CardBox width={CARD_WIDTH_320}>
      <FeedHeroBoxCard
        view={feedView('hero_box', { ...base, title: '낙엽 소리 따라 걷는 한 주를 시작해요', stamp_enabled: true, imageUrl: BADGE })}
      />
    </CardBox>
  ),
}
