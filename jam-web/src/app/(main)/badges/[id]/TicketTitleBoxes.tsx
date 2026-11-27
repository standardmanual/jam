import React from 'react'
import type { ReactNode } from 'react'
import { RarityBadge } from '@/components/ui/RarityBadge'
import { BadgeLevelChip } from '@/components/ui/BadgeLevelChip'
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

/**
 * 글자 상자의 안쪽 — {칩(선택), 이름, 설명}만 받는다(티켓 20261124_2253). 배지 상세는 아래 `TicketTitleBoxes`가 칩을 만들어 넘기고,
 * 컬렉션 상세는 칩 없이 이름·설명만 넘긴다. 같은 CSS 모듈·마침표 줄바꿈을 쓴다. h1은 여기 한 곳에만 둔다.
 */
export function TicketTitleBoxesView({ chip, name, description }: { chip?: ReactNode; name: string; description?: string | null }) {
  const lines = description ? splitDescriptionSentences(description) : []

  return (
    <div className={styles.titleBox}>
      <div className={styles.titleTop}>
        {chip}
        <h1 className="min-w-0 max-w-full text-3xl font-bold text-foreground break-keep wrap-break-word text-balance">{name}</h1>
      </div>
      {lines.length > 0 && (
        <div className={styles.titleDesc}>
          <p className="text-base text-foreground break-keep wrap-break-word text-balance">
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

/** 요약 상자 통계 칸 하나 — 라벨(text-xs)과 값(text-3xl 굵게) */
export interface TicketSummaryStat {
  label: string
  /** 값 글자(단위를 붙인 한 문자열). 한 줄로 두고 줄바꿈하지 않는다 */
  value: string
}

/**
 * 같은 글자 상자 규격(2px·직각·투명 면)의 요약 변형 — 미션 현황 «내 요약»(티켓 20261127_1145).
 * 이름·설명 대신 위 칸(`top` 슬롯)과 아래 통계 한두 칸(`stats`)을 받는다. 위 칸은 `titleTop`을 그대로 쓰고, 통계가 두 칸이면 가운데 세로 선으로 나뉘고 한 칸이면 폭 전체를 쓴다.
 * h1은 두지 않는다(이 변형의 이름은 `top` 안의 문단이다).
 */
export function TicketSummaryBoxView({ top, stats }: { top: ReactNode; stats: readonly [TicketSummaryStat] | readonly [TicketSummaryStat, TicketSummaryStat] }) {
  return (
    <div className={styles.titleBox}>
      <div className={styles.titleTop}>{top}</div>
      <div className="grid grid-flow-col auto-cols-fr border-t-2 border-foreground">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`min-w-0 flex flex-col items-center gap-1 pt-3 px-2 pb-4${index > 0 ? ' border-l-2 border-foreground' : ''}`}
          >
            <span className="text-xs break-keep wrap-break-word">{stat.label}</span>
            <span className="max-w-full text-3xl font-bold tabular-nums whitespace-nowrap">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TicketTitleBoxes({ badge, chipExtra }: TicketTitleBoxesProps) {
  const chip =
    badge.level != null ? <BadgeLevelChip level={badge.level} size="md" /> : <RarityBadge rarity={badge.rarity ?? undefined} size="md" />

  return (
    <TicketTitleBoxesView
      name={badge.name}
      description={badge.description}
      chip={
        chipExtra ? (
          <div className="flex items-center justify-center gap-2">
            {chip}
            {chipExtra}
          </div>
        ) : (
          chip
        )
      }
    />
  )
}
