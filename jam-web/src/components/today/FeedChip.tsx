import type { ReactNode } from 'react'
import {
  FEED_CHIP,
  FEED_OUTLINE_WIDTH,
  feedColorVar,
  type FeedColorKey,
  type FeedTilt,
} from '@/lib/today/feedConstants'

/**
 * 홈피드 새 카드의 칩 (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정) — 채원 판정·사용자 승인 2026-11-20.
 *
 * 값만 받아 그린다(DB·조회·훅 없음, 서버 컴포넌트로 그려진다). 옛 7모양 전용 `CardChipRow`는 티켓 20261122_1101에서 지웠다(`LabelChip`은 MODULAR 원본이라 그대로).
 *
 * - 모양: 검정 2px 외곽선 알약(`rounded-full`), 글자는 굵게·한 줄.
 *   큰 칩은 높이 40·글자 18(`text-lg`)·가로 여백 16(`px-4`), 작은 칩은 높이 32·글자 14(`text-sm`)·가로 여백 12(`px-3`). 높이는 `FEED_CHIP`이 정본이다.
 * - 면 색: 통합 팔레트 색 키 19개(`FEED_COLOR_KEYS`, 새 `white`는 `--jam-chip-white`) + `'black'`(구분 칩). 색 키는 `feedColorVar`를 거쳐 `var(--…)`로만 칠한다(hex를 쓰지 않는다).
 * - 글자 색은 `--foreground` 고정이고 검정 칩만 `--snow`다(`--snow`는 옛 15색 위에서 AA 미달, 채원 판정).
 * - 기울기는 여섯 값(`FeedTilt`) 중 하나다. 이 밖의 값은 타입 오류다.
 * - 자리는 부모가 정한다: 칩은 `className`으로 받은 위치 클래스를 쓸 뿐 자리를 계산하지 않는다.
 *   Tailwind v4의 `translate-*`·`-top-*`은 `transform`이 아니라 `translate`·`top`을 쓰므로 인라인 `rotate`와 부딪치지 않는다.
 *   칩은 박스를 자르는 마스크 밖의 형제 층에 놓는 용도라 마스크 요소 안에 넣지 않는다(`FeedBox.stories.tsx` 합성 예시).
 */

export type FeedChipColor = FeedColorKey | 'black'
export type FeedChipSize = 'lg' | 'sm'

const SIZE_CLASS: Record<FeedChipSize, string> = {
  lg: 'px-4 text-lg',
  sm: 'px-3 text-sm',
}

const SIZE_PRESET: Record<FeedChipSize, (typeof FEED_CHIP)[keyof typeof FEED_CHIP]> = {
  lg: FEED_CHIP.large,
  sm: FEED_CHIP.small,
}

/** 칩 면 색 → CSS 값. 검정(구분 칩)은 `--foreground`, 나머지는 색 키(`white` 포함)를 `feedColorVar`로 칠한다. */
function faceColor(color: FeedChipColor): string {
  if (color === 'black') return 'var(--foreground)'
  return feedColorVar(color)
}

export default function FeedChip({
  children,
  size = 'sm',
  color,
  tilt,
  className,
}: {
  children: ReactNode
  size?: FeedChipSize
  color: FeedChipColor
  tilt: FeedTilt
  className?: string
}) {
  const textClass = color === 'black' ? 'text-snow' : 'text-foreground'
  const classes = [
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap break-keep wrap-break-word rounded-full border-foreground font-bold',
    SIZE_CLASS[size],
    textClass,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={{
        height: SIZE_PRESET[size].height,
        borderWidth: FEED_OUTLINE_WIDTH,
        borderStyle: 'solid',
        backgroundColor: faceColor(color),
        transform: `rotate(${tilt}deg)`,
      }}
    >
      {children}
    </span>
  )
}
