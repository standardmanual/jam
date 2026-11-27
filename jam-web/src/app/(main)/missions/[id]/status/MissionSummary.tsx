'use client'

import Avatar from '@/components/ui/Avatar'
import { ListRowChip } from '@/components/ui/ListRow'
import { WanderingEyesLoader } from '@/components/ui/WanderingEyesLoader'
import { TicketSummaryBoxView } from '@/app/(main)/badges/[id]/TicketTitleBoxes'
import { d, t } from '@/lib/i18n'
import { formatMissionProgress, missionProgressUnit } from '@/lib/missions/format'
import { useMissionStatus } from './MissionStatusContext'
import { achievedCount, gapToFirstText } from './missionStatusStats'
import styles from './MissionStatus.module.css'

/**
 * 미션 현황 티켓의 «내 요약» 자리(photo 슬롯) — 티켓 20261127_1145.
 * 글자 상자(2px·직각·투명) 위 칸에 내 아바타 96·이름·내 기록(랭킹형) 또는 내 현황 알약(달성형), 아래 두 칸에 통계를 둔다.
 * 가운데 정렬은 이 상자(위 칸·통계 칸)에만 쓴다. 로딩은 눈 모양 로더, 오류는 티켓 면 글자색 문장이며 둘 다 같은 최소 높이 자리에 둔다.
 * `me`가 없으면(참가 기록을 못 읽은 경우) 이름·값은 «—», 아바타는 사람 아이콘이다.
 */
export default function MissionSummary() {
  const { data, error, showLoader, missionType } = useMissionStatus()

  if (error) {
    return (
      <div className={styles.slot}>
        <p className="m-0 text-base text-foreground break-keep wrap-break-word">{error}</p>
      </div>
    )
  }
  if (!data) {
    return <div className={styles.slot}>{showLoader && <WanderingEyesLoader />}</div>
  }

  // 응답의 me는 두 틀의 합집합이라 아바타·이름만 공통으로 읽고, 나머지는 틀별로 좁힌 뒤 읽는다
  const avatar = <Avatar src={data.me?.avatarUrl ?? null} alt="" size={96} className={styles.avatar} />
  const name = <p className={`${styles.name} text-lg font-bold text-foreground`}>{data.me?.displayName ?? '—'}</p>

  if (data.type === 'ranking') {
    const me = data.me
    const unit = missionProgressUnit(missionType)
    return (
      <TicketSummaryBoxView
        top={
          <>
            {avatar}
            {name}
            <p className={`${styles.topLabel} text-sm text-foreground break-keep wrap-break-word`}>{d.missions.statusMyRecordLabel}</p>
            <p className={`${styles.topValue} text-5xl font-bold text-foreground`}>
              {me ? formatMissionProgress(me.progressValue, missionType) : '—'}
              {me && unit && <span className="text-base font-normal text-foreground">{unit}</span>}
            </p>
          </>
        }
        stats={[
          { label: d.missions.statusMyRankLabel, value: me ? t(d.missions.statusRankLabel, { rank: me.rank }) : '—' },
          { label: d.missions.statusGapToFirstLabel, value: gapToFirstText(data.entries, me, missionType) },
        ]}
      />
    )
  }

  const me = data.me
  const achieved = me?.achieved ?? false
  const count = achievedCount(data.entries, me, data.totalParticipants)
  return (
    <TicketSummaryBoxView
      top={
        <>
          {avatar}
          {name}
          <p className={`${styles.topLabel} text-sm text-foreground break-keep wrap-break-word`}>{d.missions.statusMyStatusLabel}</p>
          <ListRowChip tone={achieved ? 'done' : 'outline'} size="lg" className={styles.topPill}>
            {achieved ? d.missions.achieved : d.missions.notAchieved}
          </ListRowChip>
        </>
      }
      stats={[
        { label: d.missions.statusAchievedCountLabel, value: count == null ? '—' : t(d.missions.statusPeopleCount, { count }) },
        { label: d.missions.statusTotalCountLabel, value: t(d.missions.statusPeopleCount, { count: data.totalParticipants }) },
      ]}
    />
  )
}
