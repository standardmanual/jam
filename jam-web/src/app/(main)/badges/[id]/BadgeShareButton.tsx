'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { WanderingEyesLoader } from '@/components/ui/WanderingEyesLoader'
import BottomSheet from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import { pushTabBarHidden } from '@/lib/uiOverlay'
import { buildBadgeImageBlob } from './buildBadgeImageBlob'
import { canShareFile, copyImage, openShareSheet, saveImage } from './badgeShareActions'
import { ShareActionButtons } from './ShareActionButtons'
import { useDebouncedLoading } from '@/hooks/useDebouncedLoading'
import { d } from '@/lib/i18n'
import type { BadgeType } from '@/types/database'

interface BadgeShareButtonProps {
  /** 호출부(page.tsx)가 배지 종류를 구분해 넘긴다. 공유 이미지는 종류와 무관하게 배지 이미지 한 장이다. */
  badgeId: string
  badgeType: BadgeType
  imageUrl: string | null
  badgeName: string
  hasEarned: boolean
}

type ShareItemState =
  | { kind: 'loading' }
  /** `canNativeShare`: 이미지가 준비된 시점에 `navigator.canShare({ files })`가 참이었는지 — 거짓이면 «더보기»를 그리지 않는다 */
  | { kind: 'ready'; blobUrl: string; blob: Blob; canNativeShare: boolean }
  | { kind: 'error' }

/**
 * 배지 상세 콘텐츠 끝의 «공유하기» 버튼 + 미리보기 바텀시트.
 * (20260821_003 UI 셸 → 20260821_004 실제 기능 → 20261115_1249 체크무늬 카드 한 장과 복사·저장·더보기)
 *
 * 시트는 배지 이미지 한 장(`buildBadgeImageBlob`이 만드는 300×300 투명 PNG)을 투명 체크무늬 카드 안에
 * 보여 주고, 준비되면 아래에 «복사하기»·«저장하기»·«더보기»를 둔다. «더보기»는 OS 공유 시트를 열 수
 * 있는 브라우저(`canShare({ files })`가 참)에서만 그린다.
 *
 * 미획득 배지는 클릭 전에 판별 가능하므로 버튼을 사전 비활성화하고, 클릭 시 작은 팝오버로
 * 사유를 안내한다. 타인 배지에서의 미노출은 이 컴포넌트를 아예 렌더링하지 않는 방식으로 호출부
 * (`page.tsx`)에서 처리한다. 시트가 열린 뒤의 런타임 실패(이미지 변환 실패 등)만 에러 상태로 남는다.
 */
export default function BadgeShareButton({ imageUrl, badgeName, hasEarned }: BadgeShareButtonProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ShareItemState>({ kind: 'loading' })
  const [copying, setCopying] = useState(false)
  const copyingRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)

  const isDisabled = !hasEarned

  /** 이미지 URL 자체가 없으면 생성 자체가 불가능하므로 state와 무관하게 에러로 본다. */
  const effectiveState: ShareItemState = imageUrl ? state : { kind: 'error' }

  // 페치+캔버스 합성(buildBadgeImageBlob)이 빠르게 끝나도 로더부터 스치듯 보이지 않도록 디바운스 적용
  // (NavigationLoader와 동일한 정책, 20260908_0544). ready/error는 아래 렌더링에서 이 값보다 먼저
  // 확인하므로, 실제 콘텐츠가 준비되면 minVisibleMs와 무관하게 즉시 노출된다.
  const showLoader = useDebouncedLoading(effectiveState.kind === 'loading')

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

  // 시트가 열려 있는 동안 플로팅 탭바를 물리적으로 숨긴다(닫히면 정리 함수가 자동 복원)
  useEffect(() => {
    if (!open) return
    return pushTabBarHidden()
  }, [open])

  // 20260827_020: 이펙트 진입 시의 동기 setState(초기화)는 캐스케이딩 렌더를 만든다
  // (react-hooks/set-state-in-effect). "loading으로 되돌리기"는 시트를 여는 클릭 핸들러로,
  // "이미지 URL이 없으면 에러"는 위 파생값(effectiveState)으로 옮겼다.
  useEffect(() => {
    if (!open) return

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    if (!imageUrl) return

    let cancelled = false

    async function generate() {
      try {
        const blob = await buildBadgeImageBlob(imageUrl as string)
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        objectUrlRef.current = blobUrl
        const canNativeShare = canShareFile(blob, badgeName)
        setState({ kind: 'ready', blobUrl, blob, canNativeShare })
      } catch (err) {
        console.error('[BadgeShareButton] 배지 이미지 변환 실패:', err)
        if (!cancelled) setState({ kind: 'error' })
      }
    }

    generate()

    return () => {
      cancelled = true
    }
  }, [open, imageUrl, badgeName])

  // 언마운트 시 마지막으로 만든 objectURL 정리
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  /**
   * «복사하기» — 클릭 핸들러에서 `await` 없이 `clipboard.write`를 시작한다(Safari는 사용자 동작 안에서만 허용).
   * 끝날 때까지 `aria-busy`를 달고 중복 탭은 무시한다.
   */
  function handleCopy(blob: Blob) {
    if (copyingRef.current) return
    copyingRef.current = true
    setCopying(true)
    void copyImage(blob, toast).finally(() => {
      copyingRef.current = false
      setCopying(false)
    })
  }

  function handleButtonClick() {
    if (isDisabled) {
      setPopoverOpen((v) => !v)
      return
    }
    // 이전에 열었을 때의 ready/error 결과가 남아 있으므로 여는 시점에 loading으로 되돌린다.
    setState({ kind: 'loading' })
    setOpen(true)
  }

  return (
    <>
      <div ref={wrapperRef} style={{ position: 'relative' }}>
        {/* 콘텐츠 맨 끝의 전체 폭 버튼(2026-11-10 사용자 지시, 이전에는 TopNav의 공유 아이콘). 막힌 사유를 안내 팝오버로 보이려고
            네이티브 disabled를 쓰지 않고 aria-disabled와 흐린 모양만 준다 — 눌러야 사유가 뜬다. */}
        {/* 흐린 모양은 버튼이 아니라 감싸는 칸에 준다 — 버튼 자신의 스타일이 opacity를 직접 정해서 className으로는 못 바꾼다. 팝오버는 이 칸 밖이라 흐려지지 않는다. */}
        <div className={isDisabled ? 'opacity-40' : undefined}>
          <Button
            variant="primary"
            fullWidth
            onClick={handleButtonClick}
            aria-disabled={isDisabled || undefined}
            className="whitespace-nowrap"
          >
            {d.badges.shareButtonLabel}
          </Button>
        </div>

        {popoverOpen && isDisabled && (
          <div
            role="tooltip"
            className="absolute left-1/2 bottom-full mb-2 z-50 w-55 -translate-x-1/2 rounded-2xl bg-[var(--background-inverse)] p-3 text-left"
          >
            <p className="text-sm font-bold text-[var(--snow)]">{d.badges.notEarnedTitle}</p>
          </div>
        )}
      </div>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        detent="compact"
        contentScrollable={false}
        footer={
          effectiveState.kind === 'ready' ? (
            <ShareActionButtons
              copying={copying}
              canNativeShare={effectiveState.canNativeShare}
              onCopy={() => handleCopy(effectiveState.blob)}
              onSave={() => void saveImage(effectiveState.blob, badgeName, toast)}
              onMore={() => void openShareSheet(effectiveState.blob, badgeName)}
            />
          ) : undefined
        }
      >
        <div className="px-6 pt-4 pb-4">
          {/*
            투명 체크무늬 카드 한 장(티켓 20261115_1249). 체크무늬는 투명을 읽게 하는 도구라 그림자·테두리를
            더하지 않는다. 이미지는 카드 폭의 약 70%로 가운데에 둔다 — 300px 원본을 키우면 흐려지므로
            확대·축소 transform은 쓰지 않는다. 좌우 24px은 바텀시트 캔버스 티켓 20261110_2150 ⑦ 수치다.
          */}
          <div
            className="relative mx-auto flex aspect-square w-full max-w-[var(--share-card-max-width)] items-center justify-center overflow-hidden rounded-2xl"
            style={{
              backgroundImage:
                'repeating-conic-gradient(color-mix(in srgb, var(--foreground) 8%, transparent) 0% 25%, transparent 0% 50%)',
              backgroundSize: '20px 20px',
            }}
          >
            {effectiveState.kind === 'ready' ? (
              // eslint-disable-next-line @next/next/no-img-element -- 클라이언트에서 즉석 생성한 blob: URL, next/image 최적화 대상 아님
              <img src={effectiveState.blobUrl} alt={badgeName} className="h-[var(--share-card-image-size)] w-[var(--share-card-image-size)] object-contain" />
            ) : effectiveState.kind === 'error' ? (
              // 실제 알림은 아래 sr-only 블록(aria-live="polite")이 전담한다 — 같은 문구가 여기 시각
              // 텍스트에도 있어 aria-hidden 없이 두면 스크린 리더가 두 번 읽는다(티켓 20260911_1156).
              <div className="px-6 text-center break-keep wrap-break-word" aria-hidden="true">
                <p className="whitespace-pre-line text-base text-[var(--foreground)]">{d.badges.shareErrorUnknownTitle}</p>
                <p className="mt-1 whitespace-pre-line text-xs text-muted">{d.badges.shareErrorUnknownBody}</p>
              </div>
            ) : showLoader ? (
              <WanderingEyesLoader />
            ) : null}
          </div>

          {effectiveState.kind === 'error' && (
            <span role="status" aria-live="polite" className="sr-only">
              {d.badges.shareErrorUnknownTitle} {d.badges.shareErrorUnknownBody}
            </span>
          )}
          {effectiveState.kind === 'loading' && (
            <span role="status" aria-live="polite" className="sr-only">
              {d.badges.shareImageLoading}
            </span>
          )}
        </div>
      </BottomSheet>
    </>
  )
}
