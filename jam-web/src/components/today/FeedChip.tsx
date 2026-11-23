import type { ReactNode } from 'react'
import {
  FEED_CHIP,
  FEED_CORNER_CHIP,
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
 * - 면 색: 통합 팔레트 색 키 9개(`FEED_COLOR_KEYS`, 새 `white`는 `--jam-chip-white`) + `'black'`(구분 칩). 색 키는 `feedColorVar`를 거쳐 `var(--…)`로만 칠한다(hex를 쓰지 않는다).
 * - 글자 색은 `--foreground` 고정이고 검정 칩만 `--snow`다(`--snow`는 통합 팔레트 위에서 AA 미달, 채원 판정).
 * - 기울기는 기본(제목 속 칩 등)에서 여섯 값(`FeedTilt`) 중 하나다. 이 밖의 값은 타입 오류다.
 * - 코너 변형(`variant="corner"`, 티켓 20261122_2228 R1): 카드 모서리 칩 전용이다. 크기가 더 크고(큰 칩 높이 52·글자 24, 작은 칩 높이 40·글자 18, `FEED_CORNER_CHIP`)
 *   굵기가 900(`font-black`)이며, 기울기를 `FeedTilt` 여섯 값뿐 아니라 3~12° 자유 각도(`number`, 계산값이라 저장하지 않는다)로 받는다.
 *   제목 속 칩(`ChipTitle`)은 변형을 주지 않으므로 지금 크기·`font-bold`·`FeedTilt` 그대로다. 면 색·글자 색 규칙은 두 변형이 같다.
 * - 자리는 부모가 정한다: 칩은 `className`으로 받은 위치 클래스를 쓸 뿐 자리를 계산하지 않는다.
 *   Tailwind v4의 `translate-*`·`-top-*`은 `transform`이 아니라 `translate`·`top`을 쓰므로 인라인 `rotate`와 부딪치지 않는다.
 *   칩은 박스를 자르는 마스크 밖의 형제 층에 놓는 용도라 마스크 요소 안에 넣지 않는다(`FeedBox.stories.tsx` 합성 예시).
 */

export type FeedChipColor = FeedColorKey | 'black'
export type FeedChipSize = 'lg' | 'sm'

export type FeedChipVariant = 'inline' | 'corner'

const SIZE_CLASS: Record<FeedChipVariant, Record<FeedChipSize, string>> = {
  inline: { lg: 'px-4 text-lg font-bold', sm: 'px-3 text-sm font-bold' },
  corner: { lg: 'px-4 text-2xl font-black', sm: 'px-3 text-lg font-black' },
}

const SIZE_PRESET: Record<FeedChipVariant, Record<FeedChipSize, { height: number }>> = {
  inline: { lg: FEED_CHIP.large, sm: FEED_CHIP.small },
  corner: { lg: FEED_CORNER_CHIP.large, sm: FEED_CORNER_CHIP.small },
}

/** 칩 면 색 → CSS 값. 검정(구분 칩)은 `--foreground`, 나머지는 색 키(`white` 포함)를 `feedColorVar`로 칠한다. */
function faceColor(color: FeedChipColor): string {
  if (color === 'black') return 'var(--foreground)'
  return feedColorVar(color)
}

export type FeedChipProps = {
  children: ReactNode
  size?: FeedChipSize
  color: FeedChipColor
  /**
   * 기울기(deg). 기본 변형(제목 속 칩 등)은 `FeedTilt` 여섯 값만 쓴다(호출부 `ChipTitle`이 `FeedTilt`로 좁혀 넘긴다).
   * 코너 변형은 `FeedTilt`를 포함한 3~12° 자유 각도(`number`)를 받는다 — 범위는 호출부가 `FEED_CORNER_TILT_RANGE`로 지킨다.
   */
  tilt: FeedTilt | number
  /** `inline`(기본, 제목 속 칩 크기) 또는 `corner`(카드 모서리 칩 크기) */
  variant?: FeedChipVariant
  className?: string
}

export default function FeedChip({ children, size = 'sm', color, tilt, className, variant = 'inline' }: FeedChipProps) {
  const textClass = color === 'black' ? 'text-snow' : 'text-foreground'
  const classes = [
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap break-keep wrap-break-word rounded-full border-foreground',
    SIZE_CLASS[variant][size],
    textClass,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={{
        height: SIZE_PRESET[variant][size].height,
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
