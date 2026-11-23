import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BOX_SHAPES } from '@/lib/today/boxShape'
import FeedTextBoxCard from './FeedTextBoxCard'
import { CARD_WIDTH_320, CardBox, Cell, ONE_CHIP, Row, TWO_CHIPS, feedView } from './feedStoryFixtures'

/**
 * 텍스트(`text_box`) 상태 행렬 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서비스 전용(홈피드 한정).
 * 박스(색 면 또는 이미지 마스크)가 카드를 채우고 가운데에 큰 글자만 둔다. 샘플 카드 높이 440, 박스 최소 높이 408, 큰 글자 48/1.1 굵기 900.
 * 설명은 그리지 않는다(`show_description`이 참이어도 숨김). 박스에 외곽선이 없고 칩은 박스 모서리에 걸친다.
 * 물결·티켓·반원 돌출은 가장자리가 패이거나 튀어나와 글자 안쪽 여백(32px)을 부모가 준다.
 */
const meta: Meta<typeof FeedTextBoxCard> = {
  title: '서비스/Today/Feed/텍스트(text_box)',
  component: FeedTextBoxCard,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

const TITLE = '잠긴 채\n온 배지,\n열어\n볼까요'
const base = {
  title: TITLE,
  chips: [
    { kind: 'phrase' as const, text: '포인트로 한 번' },
    { kind: 'label' as const, text: '아이템 배지' },
  ],
  box_shape: 'round' as const,
}

export const Sample: Story = {
  name: '샘플 구성',
  render: () => (
    <CardBox>
      <FeedTextBoxCard view={feedView('text_box', base)} />
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
            <FeedTextBoxCard view={feedView('text_box', { ...base, box_shape: shape, feed_seed: 11 })} />
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
            <FeedTextBoxCard view={feedView('text_box', { ...base, chips: [...chips] })} />
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
      {([[], ['배지'], ['배지', '열어']] as const).map((words, index) => (
        <Cell key={index} label={`제목 속 칩 ${words.length}개`}>
          <CardBox>
            <FeedTextBoxCard
              view={feedView('text_box', { ...base, title: '잠긴 채 온 배지,\n열어 볼까요', title_chip_words: [...words] })}
            />
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
      <FeedTextBoxCard view={feedView('text_box', { ...base, stamp_enabled: true })} />
    </CardBox>
  ),
}

export const ImageMask: Story = {
  name: '박스 종류: 이미지 마스크',
  render: () => (
    <CardBox>
      <FeedTextBoxCard view={feedView('text_box', { ...base, box_kind: 'image_mask', box_shape: 'wave', feed_seed: 3 })} />
    </CardBox>
  ),
}

export const NoImageMask: Story = {
  name: '이미지 마스크인데 이미지 없음(색 면)',
  render: () => (
    <CardBox>
      <FeedTextBoxCard view={feedView('text_box', { ...base, box_kind: 'image_mask', imageUrl: null })} />
    </CardBox>
  ),
}

export const DescriptionNeverShown: Story = {
  name: '설명 숨김(이 유형은 항상 숨김)',
  render: () => (
    <CardBox>
      <FeedTextBoxCard
        view={feedView('text_box', { ...base, description: '이 문장은 그려지지 않아요.', show_description: true })}
      />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288)',
  render: () => (
    <CardBox width={CARD_WIDTH_320}>
      <FeedTextBoxCard view={feedView('text_box', { ...base, box_shape: 'ticket', stamp_enabled: true })} />
    </CardBox>
  ),
}

/** 짙은 초록 바탕(`green-deep`) + 노랑 박스: 박스 안 큰 글자는 검정(`--foreground`)이다. 바탕 위 글자(흰색)는 이 유형에 없다. */
export const DeepGreenBackground: Story = {
  name: '짙은 초록 바탕 — 박스 안 글자 검정',
  render: () => (
    <CardBox>
      <FeedTextBoxCard view={feedView('text_box', { ...base, bg_color_key: 'green-deep', box_color_key: 'yellow' })} />
    </CardBox>
  ),
}
