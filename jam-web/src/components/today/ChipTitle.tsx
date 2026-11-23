import type { CSSProperties, ElementType } from 'react'
import type { FeedTilt } from '@/lib/today/feedConstants'
import { splitTitleByWords } from '@/lib/today/titleChips'
import FeedChip, { type FeedChipColor, type FeedChipSize } from './FeedChip'

/**
 * 제목 속 칩 (티켓 20261120_2144). 제목 문자열과 낱말 목록(최대 2개)을 받아 낱말을 `FeedChip`으로 감싼다. 서비스 전용(홈피드 한정).
 *
 * - 쪼개기는 순수 함수 `splitTitleByWords`가 한다(규칙·예외는 `lib/today/titleChips.ts`). 제목 문자열은 그대로 두고 기호를 삽입하지 않는다.
 *   조각 글자를 이어 붙이면 제목 원문이다. 칩도 같은 줄 안의 글자 조각(`inline-flex`)이라 읽는 순서·글자가 제목과 같다.
 * - 낱말이 제목에 없거나 목록이 비면 칩 없이 글자로만 그린다.
 * - 제목 줄 높이는 칩만큼 커진다: 칩이 줄 안에 가운데 맞춤(`align-middle`)으로 놓여 칩 높이(32·40)가 줄 높이를 밀어 올린다.
 *   칩 좌우에 4px(`mx-1`)을 띄워 기울어진 칩이 이웃 글자에 닿지 않게 한다.
 * - `colors`·`tilts`는 «낱말 목록의 같은 위치»끼리 짝이다(`words[i]` ↔ `colors[i]`·`tilts[i]`). 색이 없으면 `defaultColor`(기본 노랑 `yellow`),
 *   기울기가 없으면 번갈아 −4°·4°를 쓴다. 카드가 저장한 값(색 키·기울기)을 호출부가 넘긴다.
 * - 제목 태그는 호출부가 고른다(`as`, 기본 `p`). 글자 크기·색은 호출부가 `className`으로 준다(칩 크기는 `size`).
 */

const DEFAULT_TILTS: readonly FeedTilt[] = [-4, 4]

export default function ChipTitle({
  title,
  words,
  size = 'sm',
  colors,
  tilts,
  defaultColor = 'yellow',
  as: Tag = 'p',
  className,
  style,
}: {
  title: string
  words: readonly string[]
  size?: FeedChipSize
  colors?: readonly (FeedChipColor | undefined)[]
  tilts?: readonly (FeedTilt | undefined)[]
  defaultColor?: FeedChipColor
  as?: ElementType
  className?: string
  /** 글자색 같은 인라인 스타일. 제목 속 칩은 자기 글자색 클래스를 가져 영향받지 않는다. */
  style?: CSSProperties
}) {
  const pieces = splitTitleByWords(title, words)
  const classes = ['break-keep wrap-break-word', className].filter(Boolean).join(' ')

  return (
    <Tag className={classes} style={style}>
      {pieces.map((piece, index) => {
        if (piece.type === 'text') return piece.text
        return (
          <FeedChip
            key={index}
            size={size}
            color={colors?.[piece.wordIndex] ?? defaultColor}
            tilt={tilts?.[piece.wordIndex] ?? DEFAULT_TILTS[piece.wordIndex % DEFAULT_TILTS.length]}
            className="mx-1 align-middle"
          >
            {piece.text}
          </FeedChip>
        )
      })}
    </Tag>
  )
}
