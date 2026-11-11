'use client'

import { useEffect, useState, type ReactNode } from 'react'
import TopNav from '@/components/ui/TopNav'
import { ListRow, ListRowChip } from '@/components/ui/ListRow'
import { Card } from '@ds/components/cards/Card'
import RankingListRow from '@/components/ranking/RankingListRow'
import { UserIcon, UsersIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { MissionType } from '@/types/database'
import { formatMissionProgress, missionProgressUnit } from '@/lib/missions/format'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { WanderingEyesLoader } from '@ds/components/feedback/WanderingEyesLoader'
import { useDebouncedLoading } from '@/hooks/useDebouncedLoading'

interface RankingEntry {
  userId: string
  /** 표시용 이름 — display_name 우선, 없으면 username, 그마저 없으면 '익명' (라우팅 불가) */
  displayName: string
  /** 라우팅용 원본 users.username 컬럼값 — 탈퇴 등으로 유저 레코드가 없으면 null */
  username: string | null
  avatarUrl: string | null
  progressValue: number
  isCompleted: boolean
  completedAt: string | null
  rank: number
}

interface AchievementEntry {
  userId: string
  /** 표시용 이름 — display_name 우선, 없으면 username, 그마저 없으면 '익명' (라우팅 불가) */
  displayName: string
  /** 라우팅용 원본 users.username 컬럼값 — 탈퇴 등으로 유저 레코드가 없으면 null */
  username: string | null
  avatarUrl: string | null
  achieved: boolean
  achievedAt: string | null
}

type StatusResponse =
  | { type: 'ranking'; entries: RankingEntry[]; me: RankingEntry | null; totalParticipants: number }
  | { type: 'achievement'; entries: AchievementEntry[]; me: AchievementEntry | null; totalParticipants: number }

interface Props {
  missionId: string
  missionTitle: string
  displayType: string
  missionType: MissionType
}

// ────────────────────────────────────────────────────────────────
// 서브 컴포넌트 (티켓 20261111_2049 — 캔버스 시안의 상황 화면. 이 화면 안에서만 쓰는 조각이라 서비스 전용으로 둔다)
// ────────────────────────────────────────────────────────────────

/**
 * 달성형 행 — `ListRow`(티켓 20261107_1947, 목록 행 4단계 3-5배치): 랭킹형 `RankingListRow`와 같은 골격.
 * 48 원형 아바타(lead) + 이름 + 달성·미달성 칩(value). 달성은 done 톤(검정 면·흰 글자), 미달성은 같은 칩의 면·글자만 --muted·--snow로 덮는다(공용 칩 톤은 건드리지 않는다). 내 행은 이 목록에 없으므로(위쪽 «나» 영역이 대신한다) «나» 칩이 없다.
 * 칩을 `trail`이 아니라 `value`에 둔 것은 행 전체를 프로필 링크 안에 두기 위해서다.
 * 이 행은 늘 카드 안이라 면은 tint다 — 카드 속 카드의 이중 테두리를 막는다(티켓 20261015_2133).
 */
/** 시험에서 마크업을 직접 확인하려고 내보낸다(티켓 20261107_1947) */
export function AchievementRow({ e }: { e: AchievementEntry }) {
  return (
    <ListRow
      tone="tint"
      leadShape="round"
      href={e.username ? `/${e.username}` : undefined}
      lead={<SimpleAvatar url={e.avatarUrl} />}
      title={e.displayName}
      value={
        <ListRowChip
          tone="done"
          style={e.achieved ? undefined : { background: 'var(--muted)', color: 'var(--snow)' }}
        >
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

/**
 * «나» 영역 위쪽 — 내 프로필 원(114) + 내 이름. 가운데 정렬은 이 영역에만 쓴다.
 * 원은 흰 링 3px(--card-bg)만 두르고 그림자는 쓰지 않는다. 사진이 없으면 사람 아이콘(47)이다.
 * 이름은 한 줄 말줄임, 최대 280(360px 폭에서 좌우 패딩 24씩을 빼도 넘치지 않는다).
 * `me`가 없으면(참가 기록을 못 읽은 경우) 이름 줄은 그리지 않고 원만 둔다.
 */
function MyHero({ avatarUrl, name, children }: { avatarUrl: string | null; name: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: '12px 24px 40px' }}>
      <div
        className="flex items-center justify-center overflow-hidden shrink-0"
        style={{
          width: 114,
          height: 114,
          borderRadius: '50%',
          border: '3px solid var(--card-bg)',
          boxSizing: 'border-box',
          background: 'var(--accent-soft)',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 아바타는 외부 URL이다
          <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <UserIcon className="text-muted" style={{ width: 47, height: 47 }} />
        )}
      </div>
      {name && (
        <p
          className="m-0 w-full text-lg font-bold text-foreground truncate break-keep wrap-break-word"
          style={{ marginTop: 12, maxWidth: 280 }}
        >
          {name}
        </p>
      )}
      <div className="flex flex-col items-center" style={{ marginTop: 20 }}>
        {children}
      </div>
    </div>
  )
}

/** 카드 헤더 — 제목(왼쪽, 굵게)과 인원 표기(오른쪽, 12px)를 기준선에 맞춘다. 면이 검정이라 둘 다 --snow다 */
function CardHeader({ title, countLabel }: { title: string; countLabel: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <p
        className="m-0 font-bold break-keep wrap-break-word"
        style={{ color: 'var(--snow)', fontSize: 'var(--status-card-title-size)', lineHeight: 'var(--status-card-title-line-height)' }}
      >
        {title}
      </p>
      <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--snow)' }}>
        {countLabel}
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────────
export default function MissionStatusClient({
  missionId,
  missionType,
}: Props) {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}/status`)
        const json = await res.json()
        if (!alive) return
        if (!res.ok) { setError(json.error ?? d.missions.statusLoadError); return }
        setData(json as StatusResponse)
      } catch {
        if (alive) setError(d.missions.statusLoadError)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [missionId])

  // 빠르게 끝나는 요청(예: 150ms)에도 매번 로더가 스치듯 보이지 않도록 디바운스 적용
  // (NavigationLoader와 동일한 SHOW_DELAY_MS/MIN_VISIBLE_MS/MAX_VISIBLE_MS 정책, 20260908_0544)
  const showLoader = useDebouncedLoading(loading)

  const isMeInEntries = (userId: string) => data?.me?.userId === userId

  // 달성형에서 내가 참가 중인데 다른 참가자가 없을 때
  const otherEmptyState = (
    <EmptyState
      icon={<UsersIcon className="w-8 h-8" />}
      title={d.missions.statusNoOtherParticipants}
      description={d.missions.statusNoOtherParticipantsBody}
    />
  )

  // 카드 영역 — 좌우 바깥 16, 아래 24 + 안전영역. 카드 면은 검정 94% 토큰이다(blur 없음)
  const cardArea = 'px-4'
  const cardAreaStyle = { paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }
  const cardFace = { background: 'var(--status-card-bg)' }

  return (
    // 배경은 강조색 한 색이다. 로딩·오류 중에도 루트에 깔아 번쩍임이 없게 하고, 상단 바 배경은 투명이라 바 뒤까지 이어진다.
    <div className="min-h-dvh relative text-foreground" style={{ background: 'var(--jam-red)' }}>
      <div className="relative">
        <TopNav title={d.missions.backToDetail} headerStyle={{ background: 'transparent' }} />

        {/* 로딩 — 다른 화면(배지 획득 연출·공유 카드 등)과 동일한 눈모양 로더.
            라우트 전환 시 뜨는 전체화면 NavigationLoader(화면 정중앙)와 위치가 어긋나 보이지 않도록,
            TopNav(56px)를 제외한 나머지 영역 정중앙에 배치한다. */}
        {showLoader && (
          <div className="min-h-[calc(100dvh-56px)] flex items-center justify-center">
            <WanderingEyesLoader />
          </div>
        )}
        {error && (
          <p className="px-4 pt-4 text-base text-foreground">
            {error}
          </p>
        )}

        {/* ── 랭킹형 ── */}
        {data?.type === 'ranking' && (() => {
          const entries = data.entries
          const me = data.me
          const maxProgress = entries[0]?.progressValue ?? me?.progressValue ?? 1
          const unit = missionProgressUnit(missionType)

          return (
            <>
              <MyHero avatarUrl={me?.avatarUrl ?? null} name={me?.displayName ?? null}>
                <p className="m-0 text-sm text-foreground break-keep wrap-break-word">{d.missions.myProgressTitle}</p>
                <p className="m-0 text-5xl font-bold text-foreground tabular-nums">
                  {formatMissionProgress(me?.progressValue ?? 0, missionType)}
                  {unit && <span className="text-base font-normal text-foreground">{unit}</span>}
                </p>
                <p className="m-0 text-sm text-foreground break-keep wrap-break-word" style={{ marginTop: 12 }}>
                  {d.missions.statusMyRankLabel}
                </p>
                {/* 레드 면 위 흰 글자 «N위» — 32/40 굵게 */}
                <p
                  className="m-0 font-bold tabular-nums"
                  style={{ color: 'var(--snow)', fontSize: 'var(--status-rank-size)', lineHeight: 'var(--status-rank-line-height)' }}
                >
                  {me ? t(d.missions.statusRankLabel, { rank: me.rank }) : '—'}
                </p>
              </MyHero>

              <div className={cardArea} style={cardAreaStyle}>
                {entries.length > 0 && (
                  <Card style={cardFace}>
                    <CardHeader
                      title={d.missions.statusAllRanks}
                      countLabel={t(d.missions.statusParticipants, { count: data.totalParticipants })}
                    />
                    {/* 행 면이 tint(테두리 없음)라 행 사이 간격(8px)이 있어야 행이 하나로 붙어 보이지 않는다 — 홈 ListCard 행형과 같다 */}
                    <div className="flex flex-col gap-2">
                      {entries.map(entry => (
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
                          isMe={isMeInEntries(entry.userId)}
                          barColor="var(--jam-red)"
                          trackColor="color-mix(in srgb, var(--foreground) 12%, var(--background-secondary))"
                          meMarker="circle"
                          formatValue={(v) => formatMissionProgress(v, missionType)}
                        />
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </>
          )
        })()}

        {/* ── 달성형 ── 순위가 없다. 위쪽에 내 상태 알약, 아래 카드에는 다른 참가자만 둔다 */}
        {data?.type === 'achievement' && (() => {
          const me = data.me
          const achieved = me?.achieved ?? false
          // 서버가 내 행을 뺀 뒤 달성한 사람을 먼저(먼저 달성한 순) 정렬해 visible_rank_count까지 잘라 보낸다. 내 행은 위쪽 알약이 대신한다
          const others = data.entries
          // totalParticipants는 나를 포함한 수다. 목록에는 내 행이 없으므로 내가 참가자일 때 1을 뺀 «다른 참가자» 수를 보여 준다
          const otherCount = me ? Math.max(data.totalParticipants - 1, 0) : data.totalParticipants

          return (
            <>
              <MyHero avatarUrl={me?.avatarUrl ?? null} name={me?.displayName ?? null}>
                <p className="m-0 text-sm text-foreground break-keep wrap-break-word">{d.missions.myProgressTitle}</p>
                <span
                  className="inline-flex items-center text-3xl font-bold whitespace-nowrap"
                  style={{
                    marginTop: 4,
                    padding: '4px 16px',
                    borderRadius: 'var(--radius-full)',
                    background: achieved ? 'var(--foreground)' : 'var(--muted)',
                    color: 'var(--snow)',
                  }}
                >
                  {achieved ? d.missions.achieved : d.missions.notAchieved}
                </span>
              </MyHero>

              <div className={cardArea} style={cardAreaStyle}>
                {others.length > 0 ? (
                  <Card style={cardFace}>
                    <CardHeader
                      title={d.missions.statusAchievementLabel}
                      countLabel={t(d.missions.statusOtherParticipants, { count: otherCount })}
                    />
                    <div className="flex flex-col gap-2">
                      {others.map(e => (
                        <AchievementRow key={e.userId} e={e} />
                      ))}
                    </div>
                  </Card>
                ) : me ? otherEmptyState : null}
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
