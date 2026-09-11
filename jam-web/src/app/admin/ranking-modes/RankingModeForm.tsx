'use client'

/**
 * 랭킹모드 생성·수정 폼 — 티켓 20260911_1440
 *
 * 대상 선정(미션 참가자 전원 / 유저 직접 지정)과 정렬 지표(미션 진행도 / 배지 조건 레지스트리
 * 필드 하나 / 배지 보유 개수)를 조합해 랭킹모드를 구성한다. 어드민은 MODULAR 적용 대상이
 * 아니라(jam-web/CLAUDE.md) 서비스 전용으로 구현하고, 투데이 카드 화면처럼 섹션 카드·레일을
 * 두는 2단 레이아웃까지는 강제하지 않는다 — 단일 열 폼으로 충분한 범위다.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import UserMultiSearchSelect, { type UserSearchResult } from '@/components/admin/UserMultiSearchSelect'
import {
  RANKING_TARGET_TYPE_OPTIONS,
  RANKING_METRIC_TYPE_OPTIONS,
  RANKING_BADGE_TYPE_OPTIONS,
  rankingMetricFieldGroups,
  collectRankingModeMissing,
  buildRankingModeSavePayload,
  type RankingModeFormValues,
} from '@/lib/admin/ranking-modes'
import type { BadgeType, RankingModeRow, RankingModeTargetType } from '@/types/database'

interface MissionOption {
  id: string
  title: string
}

interface RankingModeFormProps {
  mode?: RankingModeRow
  /** 표시 방식이 랭킹형인 미션만(User Story 2) — 부모 서버 컴포넌트가 이미 필터링해 넘긴다 */
  missions: MissionOption[]
  /** 수정 화면에서 이미 지정된 유저들의 표시용 정보(bounded 조회, TodayCardForm의 badgeLabels와 동일 패턴) */
  initialTargetUsers: UserSearchResult[]
}

const NONE_VALUE = '__none__'

function toLocalInputValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const MISSING_LABEL: Record<string, string> = {
  title: '제목을 입력해 주세요.',
  targetMissionId: '대상 미션을 선택해 주세요.',
  targetUserIds: '유저를 한 명 이상 지정해 주세요.',
  metricFieldKey: '정렬 지표 필드를 선택해 주세요(아직 지원하지 않는 필드는 고를 수 없어요).',
  metricBadgeType: '배지 타입을 선택해 주세요.',
  startsAt: '집계 시작 일시를 입력해 주세요.',
  endsAt: '집계 종료 일시를 입력해 주세요.',
}

export default function RankingModeForm({ mode, missions, initialTargetUsers }: RankingModeFormProps) {
  const router = useRouter()
  const isEdit = !!mode

  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [title, setTitle] = useState(mode?.title ?? '')
  const [targetType, setTargetType] = useState<RankingModeTargetType>(mode?.target_type ?? 'mission_participants')
  const [targetMissionId, setTargetMissionId] = useState(mode?.target_mission_id ?? '')
  const [targetUsers, setTargetUsers] = useState<UserSearchResult[]>(initialTargetUsers)
  const [metricType, setMetricType] = useState<'condition_field' | 'badge_count'>(
    mode?.metric_type === 'badge_count' ? 'badge_count' : 'condition_field'
  )
  const [metricFieldKey, setMetricFieldKey] = useState(mode?.metric_field_key ?? '')
  const [metricBadgeType, setMetricBadgeType] = useState<BadgeType | ''>(mode?.metric_badge_type ?? '')
  const [startsAt, setStartsAt] = useState(mode ? toLocalInputValue(mode.starts_at) : '')
  const [endsAt, setEndsAt] = useState(mode ? toLocalInputValue(mode.ends_at) : '')
  const [visibleRankCount, setVisibleRankCount] = useState(mode?.visible_rank_count?.toString() ?? '')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const formValues: RankingModeFormValues = {
    title,
    targetType,
    targetMissionId,
    targetUserIds: targetUsers.map((u) => u.id),
    metricType,
    metricFieldKey,
    metricBadgeType,
    startsAt,
    endsAt,
    visibleRankCount,
  }

  const metricGroups = rankingMetricFieldGroups()

  function addUser(u: UserSearchResult) {
    setTargetUsers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]))
  }
  function removeUser(id: string) {
    setTargetUsers((prev) => prev.filter((u) => u.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const missingKeys = collectRankingModeMissing(formValues)
    if (missingKeys.length > 0) {
      setMissing(missingKeys)
      return
    }
    setMissing([])
    setLoading(true)

    try {
      const body = buildRankingModeSavePayload(formValues)
      const res = await fetch(isEdit ? `/api/admin/ranking-modes/${mode.id}` : '/api/admin/ranking-modes', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '저장 실패')
      }
      router.push('/admin/ranking-modes')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!mode) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/ranking-modes/${mode.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '삭제 실패')
      }
      router.push('/admin/ranking-modes')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ranking-mode-title" className="text-sm font-medium text-foreground">
          제목
        </label>
        <Input id="ranking-mode-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이주의 러닝 챔피언" autoComplete="off" />
        {missing.includes('title') && <p className="text-xs text-destructive">{MISSING_LABEL.title}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ranking-mode-target-type" className="text-sm font-medium text-foreground">
          대상 선정
        </label>
        <Select value={targetType} onValueChange={(v) => setTargetType(v as RankingModeTargetType)}>
          <SelectTrigger id="ranking-mode-target-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={themeContainer ?? undefined}>
            {RANKING_TARGET_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {targetType === 'mission_participants' ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ranking-mode-mission" className="text-sm font-medium text-foreground">
            대상 미션
          </label>
          <Select value={targetMissionId || NONE_VALUE} onValueChange={(v) => setTargetMissionId(v === NONE_VALUE ? '' : v)}>
            <SelectTrigger id="ranking-mode-mission">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              <SelectItem value={NONE_VALUE}>없음</SelectItem>
              {missions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            표시 방식이 랭킹형인 미션만 골라볼 수 있어요. 정렬 지표는 그 미션의 진행도로 자동 고정돼요.
          </p>
          {missing.includes('targetMissionId') && <p className="text-xs text-destructive">{MISSING_LABEL.targetMissionId}</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ranking-mode-users" className="text-sm font-medium text-foreground">
              대상 유저
            </label>
            <div id="ranking-mode-users">
              <UserMultiSearchSelect selected={targetUsers} onSelect={addUser} onRemove={removeUser} placeholder="아이디 또는 이름 검색..." />
            </div>
            {missing.includes('targetUserIds') && <p className="text-xs text-destructive">{MISSING_LABEL.targetUserIds}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ranking-mode-metric-type" className="text-sm font-medium text-foreground">
              정렬 지표 유형
            </label>
            <Select value={metricType} onValueChange={(v) => setMetricType(v as 'condition_field' | 'badge_count')}>
              <SelectTrigger id="ranking-mode-metric-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                {RANKING_METRIC_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {metricType === 'condition_field' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ranking-mode-metric-field" className="text-sm font-medium text-foreground">
                정렬 지표 필드
              </label>
              <Select value={metricFieldKey || NONE_VALUE} onValueChange={(v) => setMetricFieldKey(v === NONE_VALUE ? '' : v)}>
                <SelectTrigger id="ranking-mode-metric-field">
                  <SelectValue placeholder="필드를 선택하세요" />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  {metricGroups.map((g) => (
                    <SelectGroup key={g.section}>
                      <SelectLabel>{g.sectionLabel}</SelectLabel>
                      {g.fields.map((f) => (
                        <SelectItem key={f.key} value={f.key} disabled={!f.supported}>
                          {f.label}
                          {f.unit ? ` (${f.unit})` : ''}
                          {!f.supported ? ' — 준비 중' : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">배지 조건을 만들 때 보던 것과 같은 필드 목록이에요. 준비 중 표시는 아직 랭킹 지표로 계산할 수 없는 필드라는 뜻이에요.</p>
              {missing.includes('metricFieldKey') && <p className="text-xs text-destructive">{MISSING_LABEL.metricFieldKey}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ranking-mode-badge-type" className="text-sm font-medium text-foreground">
                배지 타입
              </label>
              <Select value={metricBadgeType || NONE_VALUE} onValueChange={(v) => setMetricBadgeType(v === NONE_VALUE ? '' : (v as BadgeType))}>
                <SelectTrigger id="ranking-mode-badge-type">
                  <SelectValue placeholder="배지 타입을 선택하세요" />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  {RANKING_BADGE_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {missing.includes('metricBadgeType') && <p className="text-xs text-destructive">{MISSING_LABEL.metricBadgeType}</p>}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ranking-mode-starts-at" className="text-sm font-medium text-foreground">
            집계 시작 일시
          </label>
          <Input id="ranking-mode-starts-at" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          {missing.includes('startsAt') && <p className="text-xs text-destructive">{MISSING_LABEL.startsAt}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ranking-mode-ends-at" className="text-sm font-medium text-foreground">
            집계 종료 일시
          </label>
          <Input id="ranking-mode-ends-at" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          {missing.includes('endsAt') && <p className="text-xs text-destructive">{MISSING_LABEL.endsAt}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ranking-mode-visible-count" className="text-sm font-medium text-foreground">
          공개할 순위 인원 (선택)
        </label>
        <Input
          id="ranking-mode-visible-count"
          type="number"
          inputMode="numeric"
          value={visibleRankCount}
          onChange={(e) => setVisibleRankCount(e.target.value)}
          placeholder="비워 두면 전체 공개"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '랭킹모드 등록'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/admin/ranking-modes')}>
          취소
        </Button>
        {isEdit && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={() => setShowDeleteConfirm(true)}>
            삭제
          </Button>
        )}
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open && !loading) setShowDeleteConfirm(false) }}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>랭킹모드 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{mode?.title}&apos; 랭킹모드를 삭제합니다. 이 랭킹모드를 연결한 투데이 카드가 있다면
              연결이 풀리고 빈 순위 목록으로 남습니다. 삭제하면 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={loading} onClick={() => setShowDeleteConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={loading} onClick={handleDelete}>
              {loading ? '삭제 중...' : '삭제 확인'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
