'use client'

import { useEffect, useRef, useState } from 'react'
import { IconButton } from '@ds/components/buttons/IconButton'
import { Button } from '@ds/components/buttons/Button'
import { WanderingEyesLoader } from '@ds/components/feedback/WanderingEyesLoader'
import BottomSheet from '@/components/ui/BottomSheet'
import { MedalIcon } from '@/components/ui/icons'
import { buildBadgeShareBlob, type BadgeShareStats } from './buildBadgeShareBlob'
import { d } from '@/lib/i18n'
import type { BadgeType } from '@/types/database'

interface BadgeShareButtonProps {
  badgeId: string
  badgeType: BadgeType
  imageUrl: string | null
  badgeName: string
  hasEarned: boolean
  /**
   * activity/poi 타입에서 이 배지 소유자(본인)가 스트라바에 연동돼 있는지(page.tsx가
   * `strava_connections` 테이블을 사전 조회해 내려줌). item 타입은 스트라바 데이터가
   * 필요 없으므로 이 값과 무관하게 항상 공유 가능하다.
   */
  stravaConnected: boolean
  /** 다른 유저의 배지 상세를 보는 중이면(그 유저 기준 데이터 조회용) 그 유저의 username */
  subjectUsername?: string
}

type ShareErrorReason = 'strava_disconnected' | 'no_strava_trigger' | 'strava_fetch_failed' | 'unknown'

type ShareState =
  | { kind: 'loading' }
  | { kind: 'ready'; blobUrl: string; blob: Blob }
  | { kind: 'error'; reason: ShareErrorReason }

const KNOWN_ERROR_REASONS: ShareErrorReason[] = ['strava_disconnected', 'no_strava_trigger', 'strava_fetch_failed']

/** 사전 비활성화 사유 — 클릭 전에 판별 가능한 것만 다룬다(런타임 API 실패는 시트 내부 에러 상태로 별도 처리) */
type DisabledReason = 'not-earned' | 'strava-disconnected'

function disabledReasonCopy(reason: DisabledReason): { title: string; body: string } {
  return reason === 'not-earned'
    ? { title: d.badges.notEarnedTitle, body: d.badges.notEarnedBody }
    : { title: d.badges.shareErrorStravaDisconnectedTitle, body: d.badges.shareErrorStravaDisconnectedBody }
}

function errorCopy(reason: ShareErrorReason): { title: string; body: string } {
  switch (reason) {
    case 'strava_disconnected':
      return { title: d.badges.shareErrorStravaDisconnectedTitle, body: d.badges.shareErrorStravaDisconnectedBody }
    case 'no_strava_trigger':
      return { title: d.badges.shareErrorNoTriggerTitle, body: d.badges.shareErrorNoTriggerBody }
    case 'strava_fetch_failed':
      return { title: d.badges.shareErrorFetchFailedTitle, body: d.badges.shareErrorFetchFailedBody }
    default:
      return { title: d.badges.shareErrorUnknownTitle, body: d.badges.shareErrorUnknownBody }
  }
}

/** navigator.share가 File 공유를 지원하는지 — 지원 시 OS 공유시트, 미지원(주로 데스크톱) 시 다운로드로 대체 */
function supportsFileShare(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
}

/**
 * 배지 상세 TopNav 우측 공유 버튼 + 미리보기 바텀시트.
 * (20260821_003 UI 셸 → 20260821_004 실제 기능 → 20260821_004 재작업: 예외 처리 흐름 변경)
 *
 * activity/poi 타입은 서버 API(`/api/badges/[id]/share-data`)로 스트라바 페이스·시간을 조회한 뒤
 * `buildBadgeShareBlob`으로 투명 PNG를 생성한다. item 타입은 스트라바 조회 없이 바로 생성한다.
 *
 * 미획득 배지·스트라바 미연동(activity/poi만 해당)은 클릭 전에 판별 가능하므로 버튼을 사전
 * 비활성화하고, 클릭 시 작은 팝오버로 사유를 안내한다(호출자가 이 컴포넌트를 렌더링한다는 것은
 * 이미 "본인 배지"라는 뜻 — 타인 배지에서의 미노출은 이 컴포넌트를 아예 렌더링하지 않는 방식으로
 * 호출부(`page.tsx`)에서 처리한다). 따라서 이 컴포넌트가 실제로 시트를 여는 시점에는 항상 이미지
 * 생성이 가능한 상태이고, 시트 내부의 "미획득" 상태 분기는 더 이상 필요 없다. 시트가 열린 뒤의
 * 런타임 실패(네트워크 오류·스트라바 레이트리밋·5xx 등, 사전 판별 대상이 아닌 것)만 에러 상태로
 * 남는다.
 */
export default function BadgeShareButton({
  badgeId,
  badgeType,
  imageUrl,
  badgeName,
  hasEarned,
  stravaConnected,
  subjectUsername,
}: BadgeShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ShareState>({ kind: 'loading' })
  const objectUrlRef = useRef<string | null>(null)

  const disabledReason: DisabledReason | null = !hasEarned
    ? 'not-earned'
    : badgeType !== 'item' && !stravaConnected
      ? 'strava-disconnected'
      : null
  const isDisabled = disabledReason !== null

  const [popoverOpen, setPopoverOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!popoverOpen) return
    function onOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [popoverOpen])

  useEffect(() => {
    if (!open) return

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    if (!imageUrl) {
      setState({ kind: 'error', reason: 'unknown' })
      return
    }

    let cancelled = false
    setState({ kind: 'loading' })

    async function generate() {
      try {
        let stats: BadgeShareStats | null = null

        if (badgeType !== 'item') {
          const qs = subjectUsername ? `?u=${encodeURIComponent(subjectUsername)}` : ''
          const res = await fetch(`/api/badges/${badgeId}/share-data${qs}`)
          if (!res.ok) {
            const body: { error?: string } = await res.json().catch(() => ({}))
            const reason = KNOWN_ERROR_REASONS.includes(body.error as ShareErrorReason)
              ? (body.error as ShareErrorReason)
              : 'unknown'
            if (!cancelled) setState({ kind: 'error', reason })
            return
          }
          stats = (await res.json()) as BadgeShareStats
        }

        const blob = await buildBadgeShareBlob({ badgeImageUrl: imageUrl as string, stats })
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        objectUrlRef.current = blobUrl
        setState({ kind: 'ready', blobUrl, blob })
      } catch (err) {
        console.error('[BadgeShareButton] 공유 이미지 생성 실패:', err)
        if (!cancelled) setState({ kind: 'error', reason: 'unknown' })
      }
    }

    generate()

    return () => {
      cancelled = true
    }
  }, [open, badgeType, badgeId, subjectUsername, imageUrl])

  // 언마운트 시 마지막으로 만든 objectURL 정리
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  async function handleAction(blob: Blob) {
    const file = new File([blob], `${badgeName}-jam.png`, { type: 'image/png' })

    if (supportsFileShare() && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
      } catch (err) {
        // 유저가 공유시트를 취소한 경우(AbortError)는 정상 흐름 — 별도 처리 없음
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('[BadgeShareButton] 공유 실패:', err)
        }
      }
      return
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${badgeName}-jam.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function handleButtonClick() {
    if (isDisabled) {
      setPopoverOpen((v) => !v)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <div ref={wrapperRef} style={{ position: 'relative' }}>
        <IconButton
          icon="share"
          label={d.badges.shareButtonLabel}
          onClick={handleButtonClick}
          disabled={isDisabled}
        />

        {popoverOpen && disabledReason && (
          <div
            role="tooltip"
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-[220px] rounded-[var(--radius-cards)] bg-[var(--color-bg-inverse)] p-3 text-left shadow-lg"
          >
            <p className="text-[length:var(--text-small)] font-bold text-[var(--color-text-inverse)]">
              {disabledReasonCopy(disabledReason).title}
            </p>
            <p className="mt-1 text-[length:var(--text-caption)] text-[var(--color-text-inverse)]/70">
              {disabledReasonCopy(disabledReason).body}
            </p>
          </div>
        )}
      </div>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        detent="full"
        topGapPx={20}
        footer={
          state.kind === 'ready' ? (
            <Button surface="dark" fullWidth onClick={() => handleAction(state.blob)}>
              {supportsFileShare() ? d.badges.shareActionShare : d.badges.shareActionDownload}
            </Button>
          ) : undefined
        }
      >
        <div className="h-full flex flex-col items-center gap-4 px-[var(--spacing-24)] pt-[var(--spacing-8)]">
          {/*
            체크보드 미리보기 프레임 — 투명 PNG의 투명 영역을 시각화한다.
            다크 서피스 톤에 맞춰 라이트톤 체크보드(spike/background-generator/FilterPreview.tsx)보다
            대비를 낮춘 흰색 저투명도 2톤 조합으로 재조정했다(20260821_003 결정 유지).
            aspect-square가 아니라 flex-1로 남은 세로 공간을 전부 채운다 — 실제 이미지는 1080×1920
            세로 비율이라, 정사각형으로 눌러두면 실제보다 작게 보였다(2026-08-21 재작업).
          */}
          <div
            className="relative w-full flex-1 min-h-0 rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center"
            style={{
              backgroundImage:
                'repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, rgba(255,255,255,0.02) 0% 50%)',
              backgroundSize: '20px 20px',
            }}
          >
            {state.kind === 'ready' ? (
              // eslint-disable-next-line @next/next/no-img-element -- 클라이언트에서 즉석 생성한 blob: URL, next/image 최적화 대상 아님
              <img
                src={state.blobUrl}
                alt={badgeName}
                className="w-full h-full object-contain p-[var(--spacing-16)]"
              />
            ) : state.kind === 'loading' ? (
              <WanderingEyesLoader />
            ) : (
              <MedalIcon className="w-16 h-16 text-text/40" />
            )}
          </div>

          {state.kind === 'error' && (
            <div className="shrink-0 pb-[var(--spacing-16)] text-center">
              <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{errorCopy(state.reason).title}</p>
              <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)]/60 mt-1">{errorCopy(state.reason).body}</p>
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  )
}
