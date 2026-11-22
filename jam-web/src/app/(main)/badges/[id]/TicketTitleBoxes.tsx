import React from 'react'
import type { ReactNode } from 'react'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { BadgeLevelChip } from '@ds/components/cards/BadgeLevelChip'
import type { BadgeRow } from '@/types/database'
import { splitDescriptionSentences } from '@/lib/splitDescriptionSentences'
import styles from './BadgeTicket.module.css'

/**
 * 배지 상세 티켓의 글자 상자 (티켓 20261122_1223, 서비스 전용).
 * 사진 아래 2px 테두리 두 칸 — 위 칸: 등급/레벨 칩(+chipExtra) · 이름 h1, 아래 칸: 설명. 설명이 없으면 아래 칸과 가운데 테두리를 그리지 않는다.
 * 테두리·여백 값은 CSS 모듈에 있다. 배경은 투명이라 티켓 그라데이션이 비친다. h1은 이 상자 한 곳에만 둔다.
 */
interface TicketTitleBoxesProps {
  badge: Pick<BadgeRow, 'name' | 'rarity' | 'description'> & { level?: number | null }
  /** 등급·레벨 칩 옆에 더하는 칩(방문 횟수 ×N, «잠김») */
  chipExtra?: ReactNode
}

export default function TicketTitleBoxes({ badge, chipExtra }: TicketTitleBoxesProps) {
  const chip =
    badge.level != null ? <BadgeLevelChip level={badge.level} size="md" /> : <RarityBadge rarity={badge.rarity ?? undefined} size="md" />
  const lines = badge.description ? splitDescriptionSentences(badge.description) : []

  return (
    <div className={styles.titleBox}>
      <div className={styles.titleTop}>
        {chipExtra ? (
          <div className="flex items-center justify-center gap-2">
            {chip}
            {chipExtra}
          </div>
        ) : (
          chip
        )}
        <h1 className="min-w-0 max-w-full text-3xl font-bold text-foreground break-keep wrap-break-word text-balance">{badge.name}</h1>
      </div>
      {lines.length > 0 && (
        <div className={styles.titleDesc}>
          <p className="text-base text-muted break-keep wrap-break-word text-balance">
            {lines.map((line, index) => (
              <React.Fragment key={index}>
                {index > 0 && ' '}
                <span className="inline-block max-w-full">{line}</span>
              </React.Fragment>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
