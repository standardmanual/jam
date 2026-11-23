import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FEED_COLOR_KEYS } from '@/lib/today/feedConstants'
import FeedStamp from './FeedStamp'

/**
 * 도장 `FeedStamp` (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정).
 * 60px 도넛에 `JOIN AND MOVE`가 띠를 따라 돈다. 가운데 작은 원은 투명한 구멍이라 뒤의 이미지가 보인다. 외곽선·글자는 검정, 띠 면은 카드 색 중 하나다.
 * 장식이라 `aria-hidden`이고 포인터 이벤트가 없다. 한 카드에 하나만 두며 자리는 부모가 정한다.
 */

const meta: Meta<typeof FeedStamp> = {
  title: '서비스/Today/FeedStamp',
  component: FeedStamp,
  args: { color: 'yellow' },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '60px 도넛 도장. 띠 면은 색 키 9개 중 하나, 글자는 검정. 서비스 전용 컴포넌트라 MODULAR이 아니다.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

/** 색 키 9개 전부. */
export const Colors: Story = {
  name: '도장 색 — 9색',
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {FEED_COLOR_KEYS.map((key) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <FeedStamp color={key} />
          <span className="text-xs text-muted">{key}</span>
        </div>
      ))}
    </div>
  ),
}

function fakeImage(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">` +
    `<rect width="320" height="180" fill="#3a5f7d"/>` +
    `<rect x="0" y="90" width="320" height="90" fill="#e8654a"/>` +
    `<circle cx="80" cy="60" r="34" fill="#f2c14e"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 이미지 위에 얹으면 가운데 구멍으로 뒤 이미지가 보인다(자리는 부모가 정한다. 한 카드에는 도장을 하나만 두며, 여기서는 색 비교를 위해 셋을 얹었다). */
export const OverImage: Story = {
  name: '이미지 위 — 가운데 구멍으로 뒤가 보인다',
  render: () => (
    <div className="relative h-[180px] w-[320px] overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- Story의 data: SVG 가짜 이미지라 최적화 대상이 아니다 */}
      <img src={fakeImage()} alt="" className="h-full w-full object-cover" />
      <FeedStamp color="green" className="absolute right-4 top-4" />
      <FeedStamp color="pink" className="absolute bottom-4 left-4" />
      <FeedStamp color="yellow" className="absolute bottom-4 right-4" />
    </div>
  ),
}
