import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'
import { BOX_ORIENTATIONS, BOX_SHAPES, boxProtrusion, type BoxOrientation, type BoxShape } from '@/lib/today/boxShape'
import FeedBox from './FeedBox'
import FeedChip from './FeedChip'

/**
 * 박스 모양 5종 `FeedBox` (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정).
 * 라운드·티켓·우표·물결·반원 돌출을 텍스트 박스(`text`)·이미지 마스크(`image`)·아이템 배지 박스(`item`) 세 방향으로 보인다. 박스에는 외곽선이 없다.
 * 마스크는 박스 요소에만 걸리므로 칩은 박스 밖의 형제 층에 둔다(「칩을 겹친 합성 예시」).
 * `item` 방향의 줄인 홈 치수·텍스트 박스 우표 홈 개수·텍스트 박스 반원 돌출 반지름은 PRD가 정하지 않아 `lib/today/boxShape.ts`가 정한 값이다(채원 확인 필요).
 */

const meta: Meta<typeof FeedBox> = {
  title: '서비스/Today/FeedBox',
  component: FeedBox,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '박스 모양 5종 × 방향 3종. 티켓·우표·반원 돌출은 CSS mask(radial-gradient), 물결은 시드로 만든 SVG 경로다. 같은 시드는 같은 물결을 그린다. ' +
          '반원 돌출은 돌출 영역을 요소 상자 안에 포함하고 그만큼 안쪽 여백을 건다(`boxProtrusion`). 서비스 전용 컴포넌트라 MODULAR이 아니다.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

const SHAPE_NAME: Record<BoxShape, string> = {
  round: '라운드',
  ticket: '티켓',
  stamp: '우표',
  wave: '물결',
  bump: '반원 돌출',
}

/** 방향별 격자 칸 크기(px). 돌출은 바깥 여백만큼 키운다. */
const CELL: Record<BoxOrientation, { width: number; height: number }> = {
  text: { width: 200, height: 260 },
  image: { width: 320, height: 180 },
  item: { width: 84, height: 84 },
}

function cellSize(shape: BoxShape, orientation: BoxOrientation) {
  const { left, right, top, bottom } = boxProtrusion(shape, orientation)
  const base = CELL[orientation]
  return { width: base.width + left + right, height: base.height + top + bottom }
}

/** 외부 요청 없는 `data:` SVG 가짜 이미지. */
function fakeImage(width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#3a5f7d"/>` +
    `<circle cx="${width * 0.3}" cy="${height * 0.4}" r="${height * 0.22}" fill="#f2c14e"/>` +
    `<rect x="${width * 0.45}" y="${height * 0.55}" width="${width * 0.45}" height="${height * 0.3}" fill="#e8654a"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm text-muted break-keep wrap-break-word">{children}</p>
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-sm font-bold text-foreground break-keep wrap-break-word">{children}</span>
}

/** 5모양 × 방향 세 가지 격자. 면 색은 같고 모양만 다르다. */
export const ShapesByOrientation: Story = {
  name: '5모양 × 방향 3종',
  render: () => (
    <div className="flex flex-col gap-8">
      {BOX_ORIENTATIONS.map((orientation) => (
        <section key={orientation}>
          <Caption>
            {orientation === 'text' ? '텍스트 박스' : orientation === 'image' ? '이미지 마스크' : '아이템 배지 박스(작은 칸)'}
          </Caption>
          <div className="flex flex-wrap items-start gap-6">
            {BOX_SHAPES.map((shape) => {
              const size = cellSize(shape, orientation)
              return (
                <div key={shape} className="flex flex-col gap-2">
                  <Label>{SHAPE_NAME[shape]}</Label>
                  <FeedBox shape={shape} orientation={orientation} color="ref-blue" seed="card-42" className="shrink-0">
                    <div style={{ width: size.width, height: size.height }} />
                  </FeedBox>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  ),
}

/** 물결은 시드가 같으면 같은 모양, 다르면 다른 모양이다. 시드가 없으면 라운드로 대신한다. */
export const WaveSeeds: Story = {
  name: '물결 — 시드 둘 나란히 · 시드 없음',
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      {(['card-1', 'card-1', 'card-2', undefined] as const).map((seed, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Label>{seed === undefined ? '시드 없음 → 라운드' : `시드 ${seed}${index === 1 ? ' (위와 같다)' : ''}`}</Label>
          <FeedBox shape="wave" orientation="image" color="ref-pink" seed={seed}>
            <div style={{ width: 240, height: 135 }} />
          </FeedBox>
        </div>
      ))}
    </div>
  ),
}

/** 반원 돌출은 박스 밖으로 튀어나오므로 요소 상자가 돌출 반지름만큼 크다. 점선은 요소 상자, 안쪽이 몸통이다. */
export const BumpOuterMargin: Story = {
  name: '반원 돌출 — 바깥 여백',
  render: () => (
    <div className="flex flex-wrap items-start gap-8">
      {(['image', 'item'] as const).map((orientation) => {
        const { top, right, bottom, left } = boxProtrusion('bump', orientation)
        return (
          <div key={orientation} className="flex flex-col gap-2">
            <Label>
              {orientation === 'image' ? '이미지 마스크: 양쪽 52px' : '아이템 배지 박스: 위·아래 28px'} (여백 {top}/{right}/{bottom}/{left})
            </Label>
            <div className="outline-1 outline-dashed outline-muted">
              <FeedBox shape="bump" orientation={orientation} color="ref-yellow">
                <div
                  style={{
                    width: orientation === 'image' ? 240 : 84,
                    height: orientation === 'image' ? 135 : 84,
                  }}
                />
              </FeedBox>
            </div>
          </div>
        )
      })}
    </div>
  ),
}

/**
 * 이미지 마스크 합성 예시: 안쪽 이미지를 모양대로 자르고, 칩은 **마스크 밖의 형제 층**에 얹는다.
 * 구조는 `relative 부모 > [FeedBox(마스크) , FeedChip(absolute)]`다. 칩을 FeedBox 안에 넣으면 마스크에 잘려 모서리에 걸칠 수 없다.
 * 칩이 모서리에 걸치는 정도는 `FEED_CHIP_OFFSET`(가로 12px·세로 16px, 채원 확인 필요)과 같은 값이다: `-left-3`·`-right-3`은 12px, `-top-4`·`-bottom-4`는 16px이다.
 */
export const ImageMaskWithSiblingChip: Story = {
  name: '이미지 마스크 + 형제 층 칩 합성',
  render: () => (
    <div className="flex flex-col gap-10">
      {(['round', 'ticket', 'stamp', 'wave'] as const).map((shape) => (
        <div key={shape} className="relative w-[320px] max-w-full">
          <FeedBox shape={shape} orientation="image" color="ref-lime" seed="card-7" className="aspect-video w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- Story의 data: SVG 가짜 이미지라 최적화 대상이 아니다 */}
            <img src={fakeImage(640, 360)} alt="" className="h-full w-full object-cover" />
          </FeedBox>
          <FeedChip size="sm" color="yellow" tilt={-6} className="absolute -top-4 -left-3">
            {SHAPE_NAME[shape]}
          </FeedChip>
          <FeedChip size="sm" color="black" tilt={6} className="absolute -right-3 -bottom-4">
            마스크 밖 칩
          </FeedChip>
        </div>
      ))}
    </div>
  ),
}
