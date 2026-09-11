'use client'

import ListRowCard from '@/components/ui/ListRowCard'
import { UserIcon } from '@/components/ui/icons'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'

/**
 * 순위 행 하나 — 미션 상세 화면(`MissionStatusClient.tsx`)과 홈 피드 랭킹보드 카드가
 * 공유하는 서비스 레이어 컴포넌트(티켓 20260911_1440).
 *
 * 원래 `MissionStatusClient.tsx`의 파일 로컬 컴포넌트였다. 그 화면 전용으로 짜여 있어
 * `formatMissionProgress(value, missionType)`를 직접 호출했는데, 랭킹보드는 지표에 따라
 * 값 포맷이 달라진다(거리·횟수·팔로워 수 등) — `formatValue`를 외부 주입받는 형태로 분리해
 * 도메인 결합을 없앴다(오케스트레이터 UI 재사용 판정 — MODULAR 승격은 이번 범위에서
 * 강제하지 않고, 재료(`ListRowCard`·`ProgressBar`)는 그대로 재사용한다).
 *
 * `ListRowCard`는 MODULAR 원본이 아니라 서비스 로컬 포팅 사본(`@/components/ui/ListRowCard`)이다
 * — 그대로 재사용한다(새로 만들지 않는다). `ProgressBar`는 MODULAR 원본
 * (`@ds/components/feedback/ProgressBar`)을 그대로 쓴다.
 */
export interface RankingListEntryLike {
  userId: string
  /** 표시용 이름 — display_name 우선, 없으면 username, 그마저 없으면 '익명' (라우팅 불가) */
  displayName: string
  /** 라우팅용 원본 users.username 컬럼값 — 탈퇴 등으로 유저 레코드가 없으면 null */
  username: string | null
  avatarUrl: string | null
  /** 정렬 지표의 현재값(미션 진행도·누적 거리·배지 개수 등 — 의미는 `formatValue`가 안다) */
  value: number
  rank: number
}

export interface RankingListRowProps {
  entry: RankingListEntryLike
  /** 진행 바 채움 비율의 기준값(보통 1위 값). 0 이하면 바가 채워지지 않는다 */
  maxValue: number
  isMe: boolean
  /** 지표별 값 표시 포맷 — 미션 상세는 `formatMissionProgress`, 랭킹보드는 `formatRankingMetricValue`를 주입 */
  formatValue: (value: number) => string
}

/** 순위 목록의 행 하나 — 순위 번호·아바타·이름·진행 바·값을 그린다(1·2·3위 강조 포디엄 없음) */
export default function RankingListRow({ entry, maxValue, isMe, formatValue }: RankingListRowProps) {
  const fillRatio = maxValue > 0 ? Math.min(1, entry.value / maxValue) : 0
  // 내 순위 행만 h4 토큰(24px)으로 확대 강조, 그 외에는 small 토큰(14px) 그대로
  const emphasisFontSize = isMe ? 'var(--text-h4)' : 'var(--text-small)'

  return (
    <ListRowCard
      href={entry.username ? `/${entry.username}` : undefined}
      icon={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 순위 번호 — 내 순위는 --color-primary(레드)로 강조 */}
          <span
            style={{
              fontSize: emphasisFontSize,
              fontWeight: 'bold',
              color: isMe ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              width: 20,
              textAlign: 'center',
            }}
          >
            {entry.rank}
          </span>

          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {entry.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <UserIcon className="w-[18px] h-[18px] text-[#666]" />
            )}
          </div>
        </div>
      }
      trailing={
        <span style={{ fontSize: emphasisFontSize, fontWeight: 'bold', color: isMe ? 'var(--color-primary)' : 'var(--color-text)' }}>
          {formatValue(entry.value)}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        <p
          className="m-0 truncate"
          style={{ fontSize: 'var(--text-small)', fontWeight: isMe ? 'bold' : 'normal', color: 'var(--color-text)' }}
        >
          {entry.displayName}
        </p>
        <ProgressBar
          percent={fillRatio * 100}
          labelType="none"
          height={6}
          color="var(--color-primary)"
          trackColor="var(--color-border)"
          radius="3px"
        />
      </div>
    </ListRowCard>
  )
}
