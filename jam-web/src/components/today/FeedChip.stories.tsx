import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'
import { FEED_COLOR_KEYS, FEED_TILTS } from '@/lib/today/feedConstants'
import FeedChip, { type FeedChipColor } from './FeedChip'

/**
 * 홈피드 새 카드의 칩 `FeedChip` (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정) — 채원 판정·사용자 승인 2026-11-20.
 * 값만 받아 그린다. 면 색은 통합 팔레트 색 키 19개(`white`는 `--jam-chip-white`) + 검정(구분 칩)이고, 글자는 `--foreground` 고정(검정 칩만 `--snow`)이다.
 * 아래 Story는 큰·작은 칩, 기울기 여섯 값, 색 17가지 위 글자 대비, 한 줄 긴 글자(12자)를 차례로 보인다.
 */

const meta: Meta<typeof FeedChip> = {
  title: '서비스/Today/FeedChip',
  component: FeedChip,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '검정 2px 외곽선 알약 칩. 큰 칩은 높이 40·글자 18·가로 여백 16, 작은 칩은 높이 32·글자 14·가로 여백 12. 기울기는 −8°·−6°·−4°·4°·6°·8° 여섯 값뿐이다. ' +
          '자리는 부모가 정한다(칩은 위치 클래스를 받아 쓸 뿐이다). 서비스 전용 컴포넌트라 MODULAR이 아니다.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

function Row({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <p className="mb-2 text-sm text-muted break-keep wrap-break-word">{caption}</p>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  )
}

const ALL_COLORS: readonly FeedChipColor[] = [...FEED_COLOR_KEYS, 'black']

/** 큰 칩(높이 40·글자 18)과 작은 칩(높이 32·글자 14). */
export const Sizes: Story = {
  name: '크기 — 큰 칩 · 작은 칩',
  render: () => (
    <Row caption="큰 칩 40px · 작은 칩 32px">
      <FeedChip size="lg" color="yellow" tilt={-4}>
        10일 남음
      </FeedChip>
      <FeedChip size="sm" color="yellow" tilt={-4}>
        10일 남음
      </FeedChip>
    </Row>
  ),
}

/** 기울기 여섯 값. 이 밖의 값은 타입 오류다. */
export const Tilts: Story = {
  name: '기울기 여섯 값',
  render: () => (
    <>
      <Row caption="큰 칩">
        {FEED_TILTS.map((tilt) => (
          <FeedChip key={tilt} size="lg" color="ref-lime" tilt={tilt}>
            {tilt}도
          </FeedChip>
        ))}
      </Row>
      <Row caption="작은 칩">
        {FEED_TILTS.map((tilt) => (
          <FeedChip key={tilt} size="sm" color="ref-lime" tilt={tilt}>
            {tilt}도
          </FeedChip>
        ))}
      </Row>
    </>
  ),
}

/** 색 19개 + 검정 위 글자 대비. 글자는 모두 `--foreground`이고 검정 칩만 `--snow`다. */
export const Colors: Story = {
  name: '색 19개 + 검정 — 글자 대비',
  render: () => (
    <>
      <Row caption="큰 칩 — 색 키 19개 + 검정(구분 칩)">
        {ALL_COLORS.map((color) => (
          <FeedChip key={color} size="lg" color={color} tilt={4}>
            {color}
          </FeedChip>
        ))}
      </Row>
      <Row caption="작은 칩 — 같은 20가지">
        {ALL_COLORS.map((color) => (
          <FeedChip key={color} size="sm" color={color} tilt={-4}>
            {color}
          </FeedChip>
        ))}
      </Row>
    </>
  ),
}

/** 한 줄 긴 글자. 문구 칩 상한 12자는 줄바꿈 없이 한 줄로 그려진다. */
export const LongText: Story = {
  name: '한 줄 긴 글자 — 12자',
  render: () => (
    <Row caption="12자(줄바꿈 없음)">
      <FeedChip size="lg" color="ref-blue" tilt={6}>
        열두글자짜리문구칩이에요
      </FeedChip>
      <FeedChip size="sm" color="ref-pink" tilt={-6}>
        열두글자짜리문구칩이에요
      </FeedChip>
    </Row>
  ),
}
