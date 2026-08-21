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
  /** 다른 유저의 배지 상세를 보는 중이면(그 유저 기준 데이터 조회용) 그 유저의 username */
  subjectUsername?: string
}

type ShareErrorReason = 'strava_disconnected' | 'no_strava_trigger' | 'strava_fetch_failed' | 'unknown'

type ShareState =
  | { kind: 'loading' }
  | { kind: 'ready'; blobUrl: string; blob: Blob }
  | { kind: 'not-earned' }
  | { kind: 'error'; reason: ShareErrorReason }

const KNOWN_ERROR_REASONS: ShareErrorReason[] = ['strava_disconnected', 'no_strava_trigger', 'strava_fetch_failed']

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
 * 배지 상세 TopNav 우측 공유 버튼 + 미리보기 바텀시트 (20260821_003 UI 셸 → 20260821_004 실제 기능).
 *
 * activity/poi 타입은 서버 API(`/api/badges/[id]/share-data`)로 스트라바 페이스·시간을 조회한 뒤
 * `buildBadgeShareBlob`으로 투명 PNG를 생성한다. item 타입은 스트라바 조회 없이 바로 생성한다.
 * 아직 획득하지 않은 배지는 공유할 데이터가 없으므로(활동 배지는 거리·페이스·시간 자체가 없음)
 * API 호출 없이 바로 미획득 안내를 보여준다.
 */
export default function BadgeShareButton({
  badgeId,
  badgeType,
  imageUrl,
  badgeName,
  hasEarned,
  subjectUsername,
}: BadgeShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ShareState>({ kind: 'loading' })
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    if (!hasEarned) {
      setState({ kind: 'not-earned' })
      return
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
  }, [open, hasEarned, badgeType, badgeId, subjectUsername, imageUrl])

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

  return (
    <>
      <IconButton icon="share" label={d.badges.shareButtonLabel} onClick={() => setOpen(true)} />

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        detent="full"
        footer={
          state.kind === 'ready' ? (
            <Button surface="dark" fullWidth onClick={() => handleAction(state.blob)}>
              {supportsFileShare() ? d.badges.shareActionShare : d.badges.shareActionDownload}
            </Button>
          ) : undefined
        }
      >
        <div className="px-[var(--spacing-24)] pt-[var(--spacing-8)] pb-[var(--spacing-32)] flex flex-col items-center gap-4">
          {/*
            체크보드 미리보기 프레임 — 투명 PNG의 투명 영역을 시각화한다.
            다크 서피스 톤에 맞춰 라이트톤 체크보드(spike/background-generator/FilterPreview.tsx)보다
            대비를 낮춘 흰색 저투명도 2톤 조합으로 재조정했다(20260821_003 결정 유지).
          */}
          <div
            className="w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center"
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
                className="w-full h-full object-contain p-[var(--spacing-24)]"
              />
            ) : state.kind === 'loading' ? (
              <WanderingEyesLoader />
            ) : (
              <MedalIcon className="w-16 h-16 text-text/40" />
            )}
          </div>

          {state.kind === 'not-earned' && (
            <div className="text-center">
              <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{d.badges.notEarnedTitle}</p>
              <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)]/60 mt-1">{d.badges.notEarnedBody}</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="text-center">
              <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{errorCopy(state.reason).title}</p>
              <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)]/60 mt-1">{errorCopy(state.reason).body}</p>
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  )
}
