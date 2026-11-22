import type { CSSProperties, ReactNode } from 'react'
import { preload } from 'react-dom'
import { AURA_GRAIN_SIZE_PX, AURA_GRAIN_URL } from '@/lib/badgeAura'
import type { TicketColor } from '@/lib/badgeTicket/ticketColor'
import styles from './BadgeTicket.module.css'

/**
 * 배지 상세 티켓 틀 (티켓 20261122_1222, 서비스 전용).
 * 서버 컴포넌트다 — 클라이언트 훅으로 색이나 모양을 정하지 않는다. 티켓색은 서버가 고른 값을 인라인 CSS 변수로 첫 HTML에 담고,
 * 모양·그라데이션·토큰 덮어쓰기는 CSS 모듈이 그린다(내용 먼저·티켓 나중 깜빡임 방지).
 *
 * 구성: 머리(로고·종류·날짜) → 절취선 1 → 아래 블록[사진 → afterPhoto → 절취선 2 → body].
 * 페이지 바탕은 다른 화면과 같은 기본 `--background`다(덮어쓰지 않는다). 절취선·홈은 그 값을 그대로 받는다.
 */
interface BadgeTicketProps {
  color: TicketColor
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

  const vars = { '--ticket': `var(${color.cssVar})`, '--ticket-end': color.endColor } as CSSProperties

  return (
    <div className={styles.ticket} style={vars} data-ticket-color={color.key}>
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
          style={{ backgroundImage: AURA_GRAIN_URL, backgroundSize: `${AURA_GRAIN_SIZE_PX}px ${AURA_GRAIN_SIZE_PX}px` }}
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
