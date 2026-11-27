'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import PopInNumber from '@/components/ui/PopInNumber'
import InlineNotice from '@/components/ui/InlineNotice'
import { Skeleton } from '@/components/ui/Skeleton'
import { LOGO_GLYPHS } from '@/components/ui/CategorySticker'
import { prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import {
  CHAPTER_CHIP_WIDTH_PX,
  CHAPTER_TRACK_HEIGHT_PX,
  CHAPTER_TRACK_PADDING_PX,
  CHAPTER_WORDMARK_WIDTH_PX,
  ENTRY_DELAY_MS,
  ENTRY_MS,
  ENTRY_TABBAR_CLEARANCE_PX,
  ENTRY_VISIBLE_RATIO,
  chapterFillRatio,
  formatGemCount,
  moveDurationMs,
  numberPlacement,
} from '@/components/ui/chapterGaugeCardMath'

/**
 * 챕터 게이지 카드 (티켓 20261127_1733, 채원 사전 판정 2026-11-28, 사용자 승인 2026-11-28) — 서비스 전용 정본.
 *
 * 어두운 카드 한 장 안에 트라이브 이름·챕터 번호(윗줄), 모은 잼 게이지(트랙·채움·JAM 워드마크 칩), 필요 잼 숫자 줄이 들어간다.
 * 잼은 챕터를 올리는 경험치다. 카드는 문장을 만들지 않는다 — 영문 라벨(`chapterLabel`)과 접근성 문구(`ariaLabel`·`trackAriaLabel`)는 호출부가 넘긴다.
 * 눌러도 아무 일도 없다(`button`·`jam-press`·커서가 없다). 화면은 폭과 위치만 정한다.
 *
 * 채움: 왼쪽 끝에서 시작하고 길이 = 칩 폭(44px) + (트랙 안쪽 폭 - 칩 폭) × 채움 정도다. 칩이 채움의 왼쪽 끝을 덮는다.
 * 값이 0이면 채움을 그리지 않는다. 칩 아래에 가려진 오렌지 가장자리가 칩 둘레에 실선처럼 비치지 않게 하려는 것이다.
 * 모은 잼 숫자: 채움 안에 들어갈 폭이면 채움 안쪽 오른쪽 끝(어두운 글자 `--capsule-track`), 아니면 트랙 안 오른쪽 끝(오렌지 글자 `--capsule-fill`)이다.
 * 챕터 10처럼 `required`가 `null`이면 채움은 가득이고 필요 잼 줄은 같은 높이로 비워 둔다(문구 없음, 챕터는 추후 늘어난다).
 *
 * 모션(채원 판정): 트랙이 절반 이상 보이면(하단 탭바 가림 높이를 뺀다) 260ms 쉰 뒤 채움이 1,500ms `--ease-smooth-out`으로 늘어나고,
 * 모은 잼 숫자가 같은 순간 한 번 팝인한다. 같은 화면에서 값이 바뀌면 지금 값에서 새 값으로 700~1,500ms 동안 옮겨 간다.
 * `prefers-reduced-motion`이면 쉼도 시간도 0이다. 챕터 번호에는 모션이 없다. 칩은 처음부터 있다.
 *
 * 접근성: 카드 `role="group"`, 트랙 `role="img"`(숫자는 라벨이 읽어 준다), 칩·워드마크는 `aria-hidden`이다.
 *
 * `ChapterGaugeCardSkeleton`(불러오는 중)과 `ChapterGaugeCardError`(불러오기 실패)는 카드와 같은 높이를 지킨다.
 *
 * @summary 트라이브 이름·챕터 번호와 모은 잼 게이지를 한 장에 담은 어두운 카드다. 챕터 진행을 보여 주는 프로필·홈에서 쓴다.
 */

const LOGO_VIEWBOX_W = 2610
const LOGO_VIEWBOX_H = 865
const LOGO_KEYS = ['J', 'a', 'm'] as const

interface Props {
  /** 트라이브 이름. 없으면 비워 두고 윗줄 높이는 그대로다 */
  tribeName: string | null
  /** 챕터 번호 */
  chapterNo: number
  /** 챕터 번호 위의 라벨(호출부가 넘긴다) */
  chapterLabel: string
  /** 모은 잼 */
  filled: number
  /** 다음 챕터까지 필요한 잼. 마지막 챕터이면 `null` */
  required: number | null
  /** 카드(group) 접근성 이름 */
  ariaLabel: string
  /** 트랙(img) 접근성 이름 */
  trackAriaLabel: string
  className?: string
}

interface Motion {
  ratio: number
  durationMs: number
}

/** 카드 틀 — 로딩·오류 자리가 같은 높이를 지키도록 같은 틀을 쓴다. 상태 없음 */
function CardLayout({
  tribeName,
  chapterNo,
  chapterLabel,
  children,
  requiredText,
  rootProps,
  className,
}: {
  tribeName: string | null
  chapterNo: number | string
  chapterLabel: string
  /** 게이지 트랙 */
  children: ReactNode
  /** 필요 잼 줄에 쓸 글자. `null`이면 줄을 비워 두고 높이만 지킨다 */
  requiredText: string | null
  rootProps?: { role?: 'group'; 'aria-label'?: string }
  className?: string
}) {
  return (
    <div
      {...rootProps}
      className={cn('flex w-full select-none flex-col rounded-2xl', className)}
      style={{ padding: 'var(--spacing-12)', gap: 'var(--spacing-12)', background: 'var(--chapter-card-bg)', color: 'var(--snow)' }}
    >
      {/* 윗줄 — 트라이브 이름은 왼쪽, 챕터 블록은 오른쪽(안에서만 가운데 정렬) */}
      <div className="flex items-end justify-between" style={{ paddingInline: 'var(--spacing-16)', gap: 'var(--spacing-12)' }}>
        <p className="m-0 min-w-0 break-keep text-xl font-extrabold wrap-anywhere">{tribeName}</p>
        <div className="flex shrink-0 flex-col items-center">
          <span className="whitespace-nowrap text-xs font-extrabold">{chapterLabel}</span>
          <span className="whitespace-nowrap text-4xl font-extrabold tabular-nums">{chapterNo}</span>
        </div>
      </div>

      {children}

      {/* 필요 잼 줄 — 트랙에 붙여 오른쪽 정렬. 필요 잼이 없으면 비워 두되 높이는 지킨다 */}
      <div
        aria-hidden={requiredText === null ? true : undefined}
        data-chapter-required={requiredText === null ? 'empty' : 'value'}
        className="text-right text-base font-extrabold tabular-nums"
        style={{ paddingInline: 'var(--spacing-16)', marginTop: 'calc(var(--spacing-8) * -1)', color: 'var(--capsule-fill)' }}
      >
        {requiredText ?? '\u00A0'}
      </div>
    </div>
  )
}

/** JAM 워드마크 — 로고 원본(`LOGO_GLYPHS`)을 그대로 그린다. 글자색은 상속(`currentColor`) */
function Wordmark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={CHAPTER_WORDMARK_WIDTH_PX}
      height={(CHAPTER_WORDMARK_WIDTH_PX * LOGO_VIEWBOX_H) / LOGO_VIEWBOX_W}
      viewBox={`0 0 ${LOGO_VIEWBOX_W} ${LOGO_VIEWBOX_H}`}
      fill="currentColor"
      style={{ display: 'block' }}
    >
      {LOGO_KEYS.map((k) => (
        <path key={k} d={LOGO_GLYPHS[k].d} fillRule={LOGO_GLYPHS[k].evenodd ? 'evenodd' : undefined} />
      ))}
    </svg>
  )
}

export default function ChapterGaugeCard({ tribeName, chapterNo, chapterLabel, filled, required, ariaLabel, trackAriaLabel, className }: Props) {
  const target = chapterFillRatio(filled, required)
  const numberText = formatGemCount(filled)

  // 처음 그리는 채움은 늘 시작 길이다. 진입 모션이 끝 길이로 옮긴다
  const [motion, setMotion] = useState<Motion>({ ratio: 0, durationMs: 0 })
  const [entered, setEntered] = useState(false)
  const enteredRef = useRef(false)
  const shownRef = useRef(0)
  // 트랙이 화면에 보였는가 — 관찰자가 없는 환경(시험·구형)에서는 처음부터 보인 것으로 친다
  const trackRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(() => typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined')
  // 트랙 안쪽 폭(px) — 숫자 자리 판정에 쓴다. 재기 전에는 0이다
  const [innerWidth, setInnerWidth] = useState(0)
  // 모은 잼 숫자를 보일 때가 되었는가 — 채움이 움직이기 시작할 때 같이 켜진다(서버 렌더와 첫 그리기에서는 꺼져 있다)
  const [numberReady, setNumberReady] = useState(false)

  useEffect(() => {
    const reduced = prefersReducedMotion()

    if (!enteredRef.current) {
      // 아직 화면에 보이지 않았으면 기다린다 — 보이면 `visible`이 바뀌어 이 효과가 다시 돈다
      if (!visible) return
      const timer = window.setTimeout(
        () => {
          enteredRef.current = true
          shownRef.current = target
          setMotion({ ratio: target, durationMs: reduced || target <= 0 ? 0 : ENTRY_MS })
          setEntered(true)
        },
        reduced ? 0 : ENTRY_DELAY_MS
      )
      return () => window.clearTimeout(timer)
    }

    // 같은 화면에서 값이 바뀜 — 지금 값에서 새 값으로 옮겨 간다(진행 중인 이동은 브라우저가 지금 자리에서 이어 받는다)
    if (shownRef.current !== target) {
      const duration = reduced ? 0 : moveDurationMs(shownRef.current, target)
      shownRef.current = target
      setMotion({ ratio: target, durationMs: duration })
    }
  }, [target, visible])

  // 숫자 팝인 시점 — 채움이 값을 향해 움직이기 시작하는 순간 같이 켠다. 효과로 켜는 이유: 서버 렌더와 첫 그리기에서는 꺼져 있어야 하이드레이션이 어긋나지 않는다.
  // 값이 바뀌면 꺼졌다가 다시 켜져 새 값으로 팝인한다
  const arrived = entered && motion.ratio === target
  useEffect(() => {
    if (!arrived) return
    const timer = window.setTimeout(() => setNumberReady(true), 0)
    return () => {
      window.clearTimeout(timer)
      setNumberReady(false)
    }
  }, [arrived, numberText])

  // 보임 관찰 — 트랙(바깥 상자)을 본다. 보이면 해제한다. 값이 0이어도 숫자(«0»)를 보여야 하므로 관찰한다
  useEffect(() => {
    if (visible) return
    const track = trackRef.current
    if (!track) return
    const observer = new window.IntersectionObserver(
      (entries) => {
        // 부동소수 오차로 0.4999가 올 수 있어 백분율로 반올림해 견준다
        if (entries.some((entry) => entry.isIntersecting && Math.round(entry.intersectionRatio * 100) >= ENTRY_VISIBLE_RATIO * 100)) {
          observer.disconnect()
          setVisible(true)
        }
      },
      { threshold: ENTRY_VISIBLE_RATIO, rootMargin: `0px 0px -${ENTRY_TABBAR_CLEARANCE_PX}px 0px` }
    )
    observer.observe(track)
    return () => observer.disconnect()
  }, [visible])

  // 트랙 안쪽 폭 재기 — 숫자 자리 판정용. 폭이 바뀌면 다시 잰다
  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const measure = () => setInnerWidth(inner.clientWidth)
    measure()
    if (typeof window.ResizeObserver === 'undefined') return
    const observer = new window.ResizeObserver(measure)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  // 숫자 자리는 모션 중간값이 아니라 실제 값으로 정한다
  const placement = numberPlacement(innerWidth, target, numberText.length)
  const showNumber = numberReady && arrived
  const numberContent = showNumber ? <PopInNumber key={numberText} value={numberText} playOnMount /> : numberText
  const numberClass = 'absolute right-0 top-0 flex h-full items-center whitespace-nowrap text-xl font-extrabold leading-none tabular-nums'
  const numberOpacity = showNumber ? undefined : 0
  // 값이 0이면 채움을 그리지 않는다. 시작 길이는 칩보다 트랙 안쪽 여백만큼 들여 칩 둘레에 오렌지 가장자리가 비치지 않게 한다
  const fillWidth =
    motion.ratio > 0
      ? `calc(${CHAPTER_CHIP_WIDTH_PX}px + (100% - ${CHAPTER_CHIP_WIDTH_PX}px) * ${motion.ratio})`
      : `${CHAPTER_CHIP_WIDTH_PX - CHAPTER_TRACK_PADDING_PX}px`

  const track = (
    <div
      ref={trackRef}
      role="img"
      aria-label={trackAriaLabel}
      className="relative block w-full rounded-full"
      style={{ height: CHAPTER_TRACK_HEIGHT_PX, padding: CHAPTER_TRACK_PADDING_PX, background: 'var(--capsule-track)' }}
    >
      {/* 트랙 안쪽 — 채움·칩·숫자의 기준 상자 */}
      <span ref={innerRef} className="relative block h-full w-full">
        {/* 트랙 안 오른쪽: 채움 밖에 두는 오렌지 숫자 */}
        {placement === 'outside' && (
          <span
            data-chapter-number="outside"
            className={numberClass}
            style={{ paddingRight: 'var(--spacing-16)', color: 'var(--capsule-fill)', opacity: numberOpacity }}
          >
            {numberContent}
          </span>
        )}

        {/* 오렌지 채움 — 왼쪽 끝에서 시작한다. 값이 0이면 그리지 않는다 */}
        {target > 0 && (
          <span
            data-chapter-fill=""
            className="absolute left-0 top-0 block h-full overflow-hidden rounded-full motion-reduce:transition-none"
            style={{
              width: fillWidth,
              background: 'var(--capsule-fill)',
              transition: motion.durationMs > 0 ? `width ${motion.durationMs}ms var(--ease-smooth-out)` : 'none',
            }}
          >
            {/* 채움 안 오른쪽: 어두운 숫자 */}
            {placement === 'inside' && (
              <span
                data-chapter-number="inside"
                className={numberClass}
                style={{ paddingRight: 'var(--spacing-12)', color: 'var(--capsule-track)', opacity: numberOpacity }}
              >
                {numberContent}
              </span>
            )}
          </span>
        )}

        {/* JAM 워드마크 칩 — 맨 위에서 채움의 왼쪽 끝을 덮는다. 장식이다 */}
        <span
          aria-hidden="true"
          data-chapter-chip=""
          className="absolute left-0 top-0 flex h-full items-center justify-center rounded-full"
          style={{ width: CHAPTER_CHIP_WIDTH_PX, background: 'var(--capsule-track)', color: 'var(--snow)' }}
        >
          <Wordmark />
        </span>
      </span>
    </div>
  )

  return (
    <CardLayout
      rootProps={{ role: 'group', 'aria-label': ariaLabel }}
      className={className}
      tribeName={tribeName}
      chapterNo={chapterNo}
      chapterLabel={chapterLabel}
      requiredText={required === null ? null : formatGemCount(required)}
    >
      {track}
    </CardLayout>
  )
}

/** 카드 자리 크기를 재려고 같은 틀을 보이지 않게 깐다 — 내용이 비어 있어도 높이는 카드와 같다 */
function PlaceholderShell() {
  return (
    <div aria-hidden="true" className="invisible">
      <CardLayout
        tribeName={'\u00A0'}
        chapterNo={0}
        chapterLabel={'\u00A0'}
        requiredText={null}
      >
        <div style={{ height: CHAPTER_TRACK_HEIGHT_PX }} />
      </CardLayout>
    </div>
  )
}

/** 불러오는 중 — 카드 자리 크기와 모서리(16px)를 같게 채운다. 스크린리더에는 부모의 상태 영역이 알린다 */
export function ChapterGaugeCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-full', className)}>
      <PlaceholderShell />
      <Skeleton radius="2xl" height="100%" style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}

/** 불러오기 실패 — 카드와 같은 높이 안에 안내 블록을 둬 아래 탭이 튀지 않게 한다. 문구와 다시 시도 동작은 호출부가 넘긴다 */
export function ChapterGaugeCardError({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('relative w-full', className)}>
      <PlaceholderShell />
      <InlineNotice className="absolute inset-0 justify-center" action={action}>
        {children}
      </InlineNotice>
    </div>
  )
}
