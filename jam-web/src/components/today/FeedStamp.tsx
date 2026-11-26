import { useId } from 'react'
import { FEED_OUTLINE_WIDTH, FEED_STAMP_SIZE, feedColorVar, type FeedColorKey } from '@/lib/today/feedConstants'

/**
 * 홈피드 새 카드의 도장 `FeedStamp` (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정).
 *
 * 값만 받아 그린다(DB·조회 없음, 서버 컴포넌트로 그려진다). 문구는 `JOIN AND MOVE` 하나뿐이다(영문 고정, 장식이라 `aria-hidden`).
 *
 * - 크기 60px(`FEED_STAMP_SIZE`)의 도넛: 바깥 원과 안쪽 원 사이 띠를 `color`(색 키)로 칠하고, 가운데 작은 원은 **투명한 구멍**이다
 *   (채움 규칙 `evenodd` — 뒤의 이미지가 보인다). 바깥·안쪽 원에 검정(`--foreground`) 2px 외곽선.
 * - 글자는 띠의 가운데 경로를 따라 돈다. 글자 색은 검정(`--foreground`)이다(`--snow`는 대비가 모자란다). 글자 간격은 문구가 둘레를 한 바퀴 채우고
 *   이음매에 작은 틈이 남도록 `letter-spacing`으로 맞춘다.
 * - 포인터 이벤트가 없다(`pointer-events: none`). 한 카드에 하나만 두므로 자리는 부모가 정한다(`className`).
 * - 면 색은 `feedColorVar`를 거쳐 `var(--…)`로만 칠한다(hex 없음).
 */

const SIZE = FEED_STAMP_SIZE
const CENTER = SIZE / 2
/** 바깥 원 반지름: 외곽선 바깥 끝이 요소 가장자리에 닿도록 선 두께의 절반만큼 안쪽 */
const OUTER_RADIUS = CENTER - FEED_OUTLINE_WIDTH / 2
/** 안쪽(구멍) 원 반지름. 띠 폭은 바깥 29 − 안쪽 12 = 17 */
const INNER_RADIUS = 12
/** 글자가 도는 경로의 반지름: 띠 가운데(20.5)에서 글자 높이의 절반(약 3)만큼 안쪽에 두면 글자 가운데가 띠 가운데에 놓인다(글자는 경로 바깥쪽으로 선다) */
const TEXT_RADIUS = 17.5
const TEXT = 'JOIN AND MOVE'

const circlePath = (radius: number) =>
  `M ${CENTER} ${CENTER - radius} a ${radius} ${radius} 0 1 1 0 ${2 * radius} a ${radius} ${radius} 0 1 1 0 ${-2 * radius} Z`

export default function FeedStamp({ color, className }: { color: FeedColorKey; className?: string }) {
  const id = useId().replace(/[^\w-]/g, '')
  const pathId = `feed-stamp-text-${id}`

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
      focusable="false"
      className={['pointer-events-none shrink-0', className].filter(Boolean).join(' ')}
    >
      <defs>
        {/* 시계 방향으로 한 바퀴, 맨 아래에서 시작한다 */}
        <path
          id={pathId}
          d={`M ${CENTER} ${CENTER + TEXT_RADIUS} a ${TEXT_RADIUS} ${TEXT_RADIUS} 0 1 1 0 ${-2 * TEXT_RADIUS} a ${TEXT_RADIUS} ${TEXT_RADIUS} 0 1 1 0 ${2 * TEXT_RADIUS}`}
        />
      </defs>
      <path
        d={`${circlePath(OUTER_RADIUS)} ${circlePath(INNER_RADIUS)}`}
        fillRule="evenodd"
        strokeWidth={FEED_OUTLINE_WIDTH}
        style={{ fill: feedColorVar(color), stroke: 'var(--foreground)' }}
      />
      <text
        fontSize={9}
        fontWeight={800}
        letterSpacing={2.4}
        style={{ fill: 'var(--foreground)' }}
      >
        <textPath href={`#${pathId}`} startOffset={4}>
          {TEXT}
        </textPath>
      </text>
    </svg>
  )
}
