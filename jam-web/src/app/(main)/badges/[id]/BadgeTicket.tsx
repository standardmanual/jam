import type { CSSProperties, ReactNode } from 'react'
import { preload } from 'react-dom'
import { GRAIN_SIZE_PX, GRAIN_URL } from '@/lib/badgeGrain'
import type { TicketPaint } from '@/lib/badgeTicket/ticketColor'
import styles from './BadgeTicket.module.css'

/**
 * 배지 상세 티켓 틀 (티켓 20261122_1222, 서비스 전용).
 * 서버 컴포넌트다 — 클라이언트 훅으로 색이나 모양을 정하지 않는다. 티켓색·끝색·미획득 실루엣 색은 서버가 정한 값을 인라인 CSS 변수로 첫 HTML에 담고,
 * 모양·그라데이션·토큰 덮어쓰기는 CSS 모듈이 그린다(내용 먼저·티켓 나중 깜빡임 방지).
 *
 * 구성: 머리(로고·종류·날짜) → 절취선 1 → 아래 블록[사진 → afterPhoto → 절취선 2 → body].
 * 페이지 바탕은 다른 화면과 같은 기본 `--background`다(덮어쓰지 않는다). 절취선·홈은 그 값을 그대로 받는다.
 */
interface BadgeTicketProps {
  /** 배지 상세는 통합 팔레트의 `TicketColor`, 컬렉션 상세는 표지색에서 파생한 `DerivedTicketColor`(티켓 20261124_2253) */
  color: TicketPaint
  /** 종류 글자 — ITEM / CHECK IN / ACTIVITY */
  kindLabel: string
  /** `YYYY.MM.DD`. 미획득이면 null — 날짜 줄을 그리지 않는다 */
  dateText: string | null
  /** 사진 자리(이번 회차는 히어로 카드 통째) */
  photo: ReactNode
  /** 사진 아래(아이템 일련번호) */
  afterPhoto?: ReactNode
  /** 절취선 2 아래 카드 구간 */
  body: ReactNode
}

export default function BadgeTicket({ color, kindLabel, dateText, photo, afterPhoto, body }: BadgeTicketProps) {
  // 로고 마스크 이미지는 CSS 안에서야 요청되므로 미리 받아 두어 머리가 늦게 칠해지지 않게 한다
  preload('/jam-logo-white.png', { as: 'image' })

  // 팔레트 색은 `--jam-*` 변수를 가리키고, 파생색은 hex를 그대로 쓴다. 파생색만 글자색·카드 바탕 비율을 더 넣는다(배지 상세 HTML은 그대로)
  const vars: Record<string, string> =
    'cssVar' in color
      ? { '--ticket': `var(${color.cssVar})`, '--ticket-end': color.endColor, '--ticket-silhouette': color.silhouette }
      : {
          '--ticket': color.hex,
          '--ticket-end': color.endColor,
          '--ticket-silhouette': color.silhouette,
          '--ticket-text': color.text,
          '--card-mix': `${color.cardMix}%`,
          '--card-mix-2': `${color.cardMixSecondary}%`,
        }

  return (
    <div className={styles.ticket} style={vars as CSSProperties} data-ticket-color={color.key}>
      <div className={styles.head}>
        <div className={`jam-logo-mark ${styles.logo}`} role="img" aria-label="JAM!" />
        <div className={styles.meta}>
          <span className={styles.kind}>{kindLabel}</span>
          {dateText && <span className={styles.date}>{dateText}</span>}
        </div>
      </div>

      <div className={styles.tear} aria-hidden="true">
        <div className={styles.dots} />
      </div>

      <div className={styles.body}>
        <div
          className={styles.grain}
          aria-hidden="true"
          style={{ backgroundImage: GRAIN_URL, backgroundSize: `${GRAIN_SIZE_PX}px ${GRAIN_SIZE_PX}px` }}
        />
        <div className={styles.content}>
          {photo}
          {afterPhoto}
          <div className={styles.tear} aria-hidden="true">
            <div className={styles.dots} />
          </div>
          <div className={styles.cards}>{body}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * 티켓 안에서 글자색 층을 고르는 얇은 상자 (티켓 20261124_2253).
 * - `ink`: 카드 위 글자 — 항상 #171717(짙은 티켓에서도). 면 위에 놓이지만 밝은 면을 가진 알림 카드 등을 감싼다.
 * - `face`: 카드 구간 안이지만 티켓 면 위에 놓이는 글자 — 티켓 글자색(`--ticket-text`)을 되살린다.
 *   `keepCards`를 주면 그 안의 격자 칸·`bg-card-bg` 상자는 다시 #171717이다(SlotGrid처럼 카드와 면 글자가 섞인 부품용).
 */
export function TicketTone({
  tone,
  keepCards = false,
  className = '',
  children,
}: {
  tone: 'ink' | 'face'
  keepCards?: boolean
  className?: string
  children: ReactNode
}) {
  const toneClass = tone === 'ink' ? styles.ink : `${styles.face}${keepCards ? ` ${styles.faceKeepCards}` : ''}`
  return <div className={`${toneClass} ${className}`.trim()}>{children}</div>
}
