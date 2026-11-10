'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import TopNav from '@/components/ui/TopNav'
import { Card } from '@ds/components/cards/Card'
import RankingListRow from '@/components/ranking/RankingListRow'
import { UserIcon, UsersIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { MissionType } from '@/types/database'
import { formatMissionProgress } from '@/lib/missions/format'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
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

type StatusResponse = { type: 'ranking'; entries: RankingEntry[]; me: RankingEntry | null; totalParticipants: number }

interface Props {
  missionId: string
  missionTitle: string
  displayType: string
  missionType: MissionType
}

// ────────────────────────────────────────────────────────────────
// 포디엄 설정값 (1위, 2위, 3위) — 티켓 20261107_2246: 막대는 단색이다. 순위는 높이(130/90/60)와 명도 단계로만 말한다.
// 1위 --foreground, 2위 --progress-short(#737373), 3위 --base-neutral-400(#a3a3a3).
// 막대 위 글자는 면 대비를 지킨다: 1·2위는 --snow(약 17:1·4.7:1), 3위는 --foreground(약 7:1).
// 폰트 크기는 모듈러 타이포 토큰 스케일(--text-3xl:28 / --text-2xl:24 /
// --text-xs:12 / --text-xs:11)에 맞춘 값이다.
// ────────────────────────────────────────────────────────────────
const PODIUM_CONFIG = [
  {
    rank: 1,
    barHeight: 130,
    barBg: 'var(--foreground)',
    avatarSize: 60,
    avatarBg: 'var(--border)',
    avatarBorder: 'var(--foreground)',
    barTextColor: 'var(--snow)',
    barNumFontSize: 'var(--text-3xl)', // 28px — 가장 가까운 토큰
    usernameFontSize: 'var(--text-xs)', // 12px
    usernameBold: true,
  },
  {
    rank: 2,
    barHeight: 90,
    barBg: 'var(--progress-short)',
    avatarSize: 48,
    avatarBg: 'var(--border)',
    avatarBorder: 'var(--progress-short)',
    barTextColor: 'var(--snow)',
    barNumFontSize: 'var(--text-2xl)', // 24px
    usernameFontSize: 'var(--text-xs)', // 11px
    usernameBold: false,
  },
  {
    rank: 3,
    barHeight: 60,
    barBg: 'var(--base-neutral-400)',
    avatarSize: 48,
    avatarBg: 'var(--border)',
    avatarBorder: 'var(--base-neutral-400)',
    barTextColor: 'var(--foreground)',
    barNumFontSize: 'var(--text-2xl)',
    usernameFontSize: 'var(--text-xs)',
    usernameBold: false,
  },
] as const

type PodiumConfig = typeof PODIUM_CONFIG[number]

// ────────────────────────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────────────────────────

/** 포디엄 아바타 원 */
function PodiumAvatar({
  url,
  size,
  bg,
  border,
}: {
  url: string | null
  size: number
  bg: string
  border: string | null
}) {
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: bg,
    border: border ? `2px solid ${border}` : undefined,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ ...baseStyle, objectFit: 'cover' }} />
  }
  const iconSize = Math.round(size * 0.4)
  return (
    <div style={baseStyle}>
      <UserIcon className="text-muted" style={{ width: iconSize, height: iconSize }} />
    </div>
  )
}

/** 포디엄 단일 열 (2위-1위-3위 순으로 렌더) */
function PodiumColumn({
  entry,
  cfg,
  missionType,
}: {
  entry: RankingEntry | undefined
  cfg: PodiumConfig
  missionType: MissionType
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
      {/* 아바타 (원형) */}
      <PodiumAvatar
        url={entry?.avatarUrl ?? null}
        size={cfg.avatarSize}
        bg={cfg.avatarBg}
        border={cfg.avatarBorder}
      />

      {/* 유저명 */}
      <span style={{
        fontSize: cfg.usernameFontSize,
        fontWeight: cfg.usernameBold ? 'bold' : 'normal',
        color: 'var(--foreground)',
        textAlign: 'center',
        maxWidth: 80,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {entry ? entry.displayName : '—'}
      </span>

      {/* 포디엄 바 — 순위 번호·진행값을 바 하단에 함께 배치 */}
      <div style={{
        width: '100%',
        height: cfg.barHeight,
        background: cfg.barBg,
        borderRadius: '10px 10px 0 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 5,
      }}>
        {entry && (
          <>
            <span style={{ fontSize: cfg.barNumFontSize, fontWeight: 'bold', color: cfg.barTextColor }}>
              {cfg.rank}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: cfg.barTextColor }}>
              {formatMissionProgress(entry.progressValue, missionType)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 나의 순위 카드 — 20260825 리뉴얼: 목록에 항상 중복 노출하던 것에서,
 * 내 순위가 공개 목록(visible_rank_count) 밖일 때만 예외적으로 보여주는 방식으로 변경.
 * 목록 안에 있을 때는 RankingListRow의 isMe 강조만으로 충분하다.
 * 색상은 MissionDetailClient의 "참가중" 칩과 같은 accent 계열 어휘(--accent-soft·--accent-soft-hover)를 재사용.
 */
function MyRankCard({
  me,
  maxProgress,
  missionType,
}: {
  me: RankingEntry
  maxProgress: number
  missionType: MissionType
}) {
  const fillRatio = maxProgress > 0 ? Math.min(1, me.progressValue / maxProgress) : 0

  return (
    <div style={{
      backgroundColor: 'var(--accent-soft)',
      borderRadius: 'var(--radius-2xl)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 'bold',
          color: 'var(--link)',
          width: 20,
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {me.rank}
        </span>

        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: 'var(--accent-soft-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <UserIcon className="w-[18px] h-[18px]" style={{ color: 'var(--link)' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'bold',
            color: 'var(--foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {me.displayName}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 1 }}>
            {formatMissionProgress(me.progressValue, missionType)} {d.missions.achieved}
          </div>
        </div>

        <span style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 'bold',
          color: 'var(--link)',
          flexShrink: 0,
        }}>
          {formatMissionProgress(me.progressValue, missionType)}
        </span>
      </div>

      <div style={{ paddingLeft: 28, paddingTop: 8 }}>
        <ProgressBar
          percent={fillRatio * 100}
          labelType="none"
          height={6}
          color="var(--accent)"
          trackColor="var(--accent-soft-hover)"
          radius="3px"
        />
      </div>
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

  return (
    <div className="min-h-full text-foreground">
      <TopNav title={d.missions.backToDetail} />

      {/* 로딩 — 다른 화면(배지 획득 연출·공유 카드 등)과 동일한 눈모양 로더.
          라우트 전환 시 뜨는 전체화면 NavigationLoader(화면 정중앙)와 위치가 어긋나 보이지 않도록,
          TopNav(56px)를 제외한 나머지 영역 정중앙에 배치한다. */}
      {showLoader && (
        <div className="min-h-[calc(100dvh-56px)] flex items-center justify-center">
          <WanderingEyesLoader />
        </div>
      )}
      {error && (
        <p className="px-4 pt-4 text-base text-muted">
          {error}
        </p>
      )}

      {/* ── 랭킹 타입 ── */}
      {data?.type === 'ranking' && (() => {
        const entries = data.entries
        const me = data.me
        const maxProgress = entries[0]?.progressValue ?? me?.progressValue ?? 1
        // 포디엄 배열: 2위(좌) - 1위(중앙, 최장바) - 3위(우)
        const top3 = [
          { cfg: PODIUM_CONFIG[1], entry: entries.find(e => e.rank === 2) },
          { cfg: PODIUM_CONFIG[0], entry: entries.find(e => e.rank === 1) },
          { cfg: PODIUM_CONFIG[2], entry: entries.find(e => e.rank === 3) },
        ]
        const rest = entries.filter(e => e.rank >= 4)
        // 내 순위가 공개 목록(entries, visible_rank_count로 잘릴 수 있음) 안에 이미 있으면
        // RankingListRow의 isMe 강조로 충분하다 — 목록 밖일 때만 MyRankCard를 따로 보여준다.
        const meOutsideList = me !== null && !entries.some(e => e.userId === me.userId)

        return (
          <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
            {/* TOP 3 포디엄 — InfoCard(bg-surface, radius-cards, p-6)로 다른 화면과 동일하게 카드화.
                3명 미만이면 빈 슬롯 "—" 처리 */}
            {entries.length > 0 && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  {top3.map(({ cfg, entry }) => (
                    <PodiumColumn key={cfg.rank} cfg={cfg} entry={entry} missionType={missionType} />
                  ))}
                </div>
              </Card>
            )}

            {/* 전체 순위 목록 (4위~) — InfoCard + 섹션 라벨(다른 화면의 SectionLabel과 동일 톤) */}
            {rest.length > 0 && (
              <Card>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="m-0 text-[15px] font-bold text-foreground">{d.missions.statusAllRanks}</p>
                  <span className="text-xs text-muted">
                    {t(d.missions.statusParticipants, { count: data.totalParticipants })}
                  </span>
                </div>

                {/* 행 면이 tint(테두리 없음)라 행 사이 간격(8px)이 있어야 행이 하나로 붙어 보이지 않는다 — 홈 ListCard 행형과 같다 */}
                <div className="flex flex-col gap-2">
                  {rest.map(entry => (
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
                      formatValue={(v) => formatMissionProgress(v, missionType)}
                    />
                  ))}
                </div>
              </Card>
            )}

            {/* 나의 순위 카드 — 목록 밖일 때만 예외적으로 노출 */}
            {meOutsideList && me && (
              <MyRankCard me={me} maxProgress={maxProgress} missionType={missionType} />
            )}

            {/* 빈 상태: entries.length === 0 && me === null */}
            {entries.length === 0 && !me && (
              <EmptyState
                icon={<UsersIcon className="w-8 h-8" />}
                title={d.missions.statusNoParticipants}
                description={d.missions.statusNoParticipantsBody}
              />
            )}
          </div>
        )
      })()}
    </div>
  )
}
