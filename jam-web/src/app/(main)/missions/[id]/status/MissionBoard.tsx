'use client'

import { ListRow, ListRowChip } from '@/components/ui/ListRow'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import RankingListRow from '@/components/ranking/RankingListRow'
import { UserIcon, UsersIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import { formatMissionProgress } from '@/lib/missions/format'
import { useMissionStatus } from './MissionStatusContext'
import type { AchievementEntry } from './missionStatusTypes'

/**
 * 달성형 행 — `ListRow`(티켓 20261107_1947, 목록 행 4단계 3-5배치): 랭킹형 `RankingListRow`와 같은 골격.
 * 48 원형 아바타(lead) + 이름 + 달성·미달성 칩(value). 행 면은 검정 카드 위 한 단계 밝은 `onInverse` 톤이다(티켓 20261127_1145).
 * 달성은 코랄 한 색 칩(`ticket`), 미달성은 같은 행 위 한 단계 더 밝은 회색 칩(`on-inverse`)이다. 내 행은 이 목록에 없으므로(위쪽 «내 요약»이 대신한다) «나» 칩이 없다.
 * 칩을 `trail`이 아니라 `value`에 둔 것은 행 전체를 프로필 링크 안에 두기 위해서다.
 */
/** 시험에서 마크업을 직접 확인하려고 내보낸다(티켓 20261107_1947) */
export function AchievementRow({ e }: { e: AchievementEntry }) {
  return (
    <ListRow
      tone="onInverse"
      leadShape="round"
      href={e.username ? `/${e.username}` : undefined}
      lead={<SimpleAvatar url={e.avatarUrl} />}
      title={e.displayName}
      value={
        <ListRowChip tone={e.achieved ? 'ticket' : 'on-inverse'}>
          {e.achieved ? d.missions.achieved : d.missions.notAchieved}
        </ListRowChip>
      }
    />
  )
}

/** 아바타 lead 안쪽 (달성형용) — 크기와 원형 면은 `ListRow`의 lead 박스(48, round)가 정한다 */
function SimpleAvatar({ url }: { url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- 아바타는 외부 URL이고 크기는 lead 박스가 정한다(ListRow CSS)
    return <img src={url} alt="" />
  }
  return <UserIcon className="w-6 h-6" />
}

/** 카드 헤더 — 제목(왼쪽, 굵게)과 인원 표기(오른쪽, 12px)를 기준선에 맞춘다. 면이 검정이라 둘 다 Card inverse가 정한 --foreground(--snow)다. 왼쪽 정렬이다 */
function CardHeader({ title, countLabel }: { title: string; countLabel: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <p className="m-0 text-xl font-bold text-foreground break-keep wrap-break-word">{title}</p>
      <span className="text-xs text-foreground tabular-nums whitespace-nowrap">{countLabel}</span>
    </div>
  )
}

/**
 * 미션 현황 티켓의 «목록 카드» 자리(body 슬롯) — 티켓 20261127_1145. 검정 카드(Card tone="inverse") 안에 헤더와 행 목록을 둔다.
 * 랭킹형은 entries가 비면 카드를 그리지 않고, 달성형은 다른 참가자가 없을 때 내가 참가자이면 카드 안에 EmptyState를 둔다(검정 면 위에서 읽히게).
 * 로딩·오류 중에는 아무것도 그리지 않는다(요약 자리가 그 상태를 보여 준다). 행 면은 `onInverse`, 막대·«나» 원·달성 칩은 티켓색 한 색(--mission-ticket)이다.
 */
export default function MissionBoard() {
  const { data, missionType } = useMissionStatus()
  if (!data) return null

  if (data.type === 'ranking') {
    const { entries, me } = data
    if (entries.length === 0) return null
    const maxProgress = entries[0]?.progressValue ?? me?.progressValue ?? 1
    return (
      <div className="px-4 pb-6">
        <Card tone="inverse">
          <CardHeader
            title={d.missions.statusAllRanks}
            countLabel={t(d.missions.statusParticipants, { count: data.totalParticipants })}
          />
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <RankingListRow
                key={entry.userId}
                entry={{
                  userId: entry.userId,
                  displayName: entry.displayName,
                  username: entry.username,
                  avatarUrl: entry.avatarUrl,
                  value: entry.progressValue,
                  rank: entry.rank,
                }}
                maxValue={maxProgress}
                isMe={me?.userId === entry.userId}
                barColor="var(--mission-ticket)"
                barShape="capsule"
                meMarker="circle"
                rowTone="onInverse"
                formatValue={(v) => formatMissionProgress(v, missionType)}
              />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // 달성형: 서버가 내 행을 뺀 뒤 달성한 사람을 먼저(먼저 달성한 순) 정렬해 visible_rank_count까지 잘라 보낸다. 내 행은 위쪽 «내 요약»이 대신한다
  const { entries: others, me } = data
  // totalParticipants는 나를 포함한 수다. 목록에는 내 행이 없으므로 내가 참가자일 때 1을 뺀 «다른 참가자» 수를 보여 준다
  const otherCount = me ? Math.max(data.totalParticipants - 1, 0) : data.totalParticipants

  if (others.length > 0) {
    return (
      <div className="px-4 pb-6">
        <Card tone="inverse">
          <CardHeader title={d.missions.statusAchievementLabel} countLabel={t(d.missions.statusOtherParticipants, { count: otherCount })} />
          <div className="flex flex-col gap-2">
            {others.map((e) => (
              <AchievementRow key={e.userId} e={e} />
            ))}
          </div>
        </Card>
      </div>
    )
  }
  if (!me) return null
  // 달성형에서 내가 참가 중인데 다른 참가자가 없을 때 — 검정 카드 안에 둬서 코랄 면 위 잉크 글자 대신 반전 글자로 읽히게 한다
  return (
    <div className="px-4 pb-6">
      <Card tone="inverse">
        <EmptyState
          icon={<UsersIcon className="w-8 h-8" />}
          title={d.missions.statusNoOtherParticipants}
          description={d.missions.statusNoOtherParticipantsBody}
        />
      </Card>
    </div>
  )
}
