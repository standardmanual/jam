import { ListRow, ListRowChip } from '@/components/ui/ListRow'
import { UserIcon } from '@/components/ui/icons'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { d, t } from '@/lib/i18n'

/**
 * 순위 행 하나 — 미션 상세 화면(`MissionStatusClient.tsx`)과 홈 피드 랭킹보드 카드가
 * 공유하는 서비스 레이어 컴포넌트(티켓 20260911_1440).
 *
 * 원래 `MissionStatusClient.tsx`의 파일 로컬 컴포넌트였다. 그 화면 전용으로 짜여 있어
 * `formatMissionProgress(value, missionType)`를 직접 호출했는데, 랭킹보드는 지표에 따라
 * 값 포맷이 달라진다(거리·횟수·팔로워 수 등) — `formatValue`를 외부 주입받는 형태로 분리해
 * 도메인 결합을 없앴다(오케스트레이터 UI 재사용 판정 — MODULAR 승격은 이번 범위에서
 * 강제하지 않고, 재료(`ListRow`·`ProgressBar`)는 그대로 재사용한다).
 *
 * 행 골격은 서비스 사본 `ListRow`(`@/components/ui/ListRow`)다(티켓 20261107_1947, 목록 행 4단계 3-5배치).
 * `ProgressBar`는 MODULAR 원본(`@ds/components/feedback/ProgressBar`)을 그대로 쓴다.
 *
 * **`'use client'`가 없다**(티켓 20261001_2104). 이 파일은 훅이 없고 안쪽 `ListRow`에는 문자열·JSX만 넘긴다. 홈 `ListCard`는 서버 컴포넌트라
 * 이 컴포넌트가 클라이언트 경계면 `formatValue` 함수 prop을 서버에서 클라이언트로 넘기게 되어 렌더 때 「Functions cannot be passed directly to Client Components」로
 * 실패한다(`tsc`·lint·`renderToStaticMarkup` 테스트에는 안 잡힌다). 지시어가 없으면 서버에서는 `formatValue`가 서버 안에서 호출되고, `MissionStatusClient`(클라이언트)에서는
 * 그대로 클라이언트 번들로 동작한다. 훅·이벤트 핸들러를 넣게 되면 지시어를 되살리고 `formatValue`를 함수 prop이 아닌 값으로 바꿔야 한다.
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

/**
 * 순위 목록의 행 하나 — 순위 번호(indicator)·48 원형 아바타(lead)·이름·내 행 «나» 칩(titleSuffix)·진행 바(meta)·값(value)을 그린다(1·2·3위 강조 포디엄 없음).
 * 이 행은 늘 흰 카드(홈 `ListCard`, 미션 현황의 순위 카드) 안에 들어가므로 면은 `tone="tint"`(--background-secondary, 테두리 없음)다 —
 * 카드 속 카드의 이중 테두리를 막는다(티켓 20261015_2133). 행 사이에는 호출부가 간격(gap 8)을 둔다.
 *
 * 내 행은 크기·색이 아니라 이름 옆 «나» 칩 하나로 알린다(색 강조 한 곳 규칙, 티켓 20261107_1947 사용자 승인).
 * 클릭 영역(프로필 링크) 안은 phrasing만 쓴다 — 진행 바는 `as="span"`이고 장식이라 호출부 span 래퍼에 aria-hidden을 건다.
 * 순위 숫자는 화면용 숫자(aria-hidden)와 «N위»(sr-only)를 함께 둔다.
 */
export default function RankingListRow({ entry, maxValue, isMe, formatValue }: RankingListRowProps) {
  const fillRatio = maxValue > 0 ? Math.min(1, entry.value / maxValue) : 0

  return (
    <ListRow
      tone="tint"
      leadShape="round"
      href={entry.username ? `/${entry.username}` : undefined}
      indicator={
        <>
          <span aria-hidden="true">{entry.rank}</span>
          <span className="sr-only">{t(d.missions.statusRankLabel, { rank: entry.rank })}</span>
        </>
      }
      lead={
        entry.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 아바타는 외부 URL이고 크기는 lead 박스가 정한다(ListRow CSS)
          <img src={entry.avatarUrl} alt="" />
        ) : (
          <UserIcon className="w-6 h-6" />
        )
      }
      title={entry.displayName}
      titleSuffix={isMe ? <ListRowChip tone="accent">{d.missions.statusMeChip}</ListRowChip> : undefined}
      meta={
        <span aria-hidden="true" className="block">
          <ProgressBar
            as="span"
            percent={fillRatio * 100}
            labelType="none"
            height={6}
            color="var(--accent)"
            trackColor="var(--border)"
            radius="3px"
          />
        </span>
      }
      value={formatValue(entry.value)}
    />
  )
}
