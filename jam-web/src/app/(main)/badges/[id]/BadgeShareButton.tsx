'use client'

import { useEffect, useRef, useState } from 'react'
import { IconButton } from '@ds/components/buttons/IconButton'
import { Button } from '@ds/components/buttons/Button'
import { WanderingEyesLoader } from '@ds/components/feedback/WanderingEyesLoader'
import { Carousel } from '@ds/components/navigation/Carousel'
import BottomSheet from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import { pushTabBarHidden } from '@/lib/uiOverlay'
import { buildBadgeShareBlob, buildBadgeImageBlob, type BadgeShareStats } from './buildBadgeShareBlob'
import { useDebouncedLoading } from '@/hooks/useDebouncedLoading'
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
  /** 레벨형 배지의 Lv.N — 공유 카드에 LEVEL 행으로 들어간다 (티켓 20260905_0038 B) */
  level?: number | null
  /** 획득 횟수 — 2 이상이면 공유 카드에 COUNT 행으로 들어간다 */
  earnCount?: number | null
}

type ShareErrorReason =
  | 'strava_disconnected'
  | 'no_strava_trigger'
  | 'strava_fetch_failed'
  | 'strava_activity_not_found'
  | 'unknown'

type ShareItemState =
  | { kind: 'loading' }
  | { kind: 'ready'; blobUrl: string; blob: Blob }
  | { kind: 'error'; reason: ShareErrorReason }

/**
 * 공유 시트 캐러셀 2항목 (티켓 20260911_1102). `card`는 기존 통계 포함 공유 카드(1080×1920),
 * `badge`는 배지 원본 이미지를 300px 정사각형으로 변환한 것 — 두 blob은 독립적으로 준비된다
 * (하나가 로딩/에러여도 다른 하나는 이미 완료돼 있을 수 있다).
 */
type ShareItemKind = 'card' | 'badge'

interface ShareState {
  card: ShareItemState
  badge: ShareItemState
}

const SHARE_ITEM_KINDS: ShareItemKind[] = ['card', 'badge']

/** 저장/공유 파일명 접미사 — 항목에 따라 구분한다(티켓 20260911_1102 구현 계획 4). */
const FILENAME_SUFFIX: Record<ShareItemKind, string> = { card: 'jam', badge: 'badge' }

const KNOWN_ERROR_REASONS: ShareErrorReason[] = [
  'strava_disconnected',
  'no_strava_trigger',
  'strava_fetch_failed',
  'strava_activity_not_found',
]

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
    case 'strava_activity_not_found':
      return { title: d.badges.shareErrorActivityNotFoundTitle, body: d.badges.shareErrorActivityNotFoundBody }
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
 * iOS(Safari 기반 웹뷰 포함) 판별 — "저장" 버튼의 동작 분기 전용.
 * iOS는 웹 표준상 사용자 승인 없이 Photos 라이브러리에 직접 쓰는 API가 없고, `<a download>`는
 * 사진 앱이 아니라 Files 앱(다운로드 폴더)에만 저장된다(플랫폼 제약 — 완료 기록 참고).
 * iPadOS 13+는 데스크톱 Safari와 동일한 UA 문자열을 쓰므로 UA 정규식만으로는 iPad를 못 잡는다 —
 * `MacIntel` + 멀티터치 여부로 보정한다(데스크톱 Mac은 마우스 전용이라 maxTouchPoints가 0~1).
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
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
  level = null,
  earnCount = null,
}: BadgeShareButtonProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ShareState>({ card: { kind: 'loading' }, badge: { kind: 'loading' } })
  const [activeIndex, setActiveIndex] = useState(0)
  const cardObjectUrlRef = useRef<string | null>(null)
  const badgeObjectUrlRef = useRef<string | null>(null)

  const disabledReason: DisabledReason | null = !hasEarned
    ? 'not-earned'
    : badgeType !== 'item' && !stravaConnected
      ? 'strava-disconnected'
      : null
  const isDisabled = disabledReason !== null

  /** 이미지 URL 자체가 없으면 두 항목 모두 생성 자체가 불가능하므로 state와 무관하게 에러로 본다. */
  const effectiveState: ShareState = imageUrl
    ? state
    : { card: { kind: 'error', reason: 'unknown' }, badge: { kind: 'error', reason: 'unknown' } }

  // 페치+캔버스 합성(buildBadgeShareBlob/buildBadgeImageBlob)이 빠르게 끝나도 로더부터
  // 스치듯 보이지 않도록 디바운스 적용 (NavigationLoader와 동일한 정책, 20260908_0544).
  // 두 캐러셀 항목은 독립적으로 준비되므로 로딩 상태도 항목별로 각각 디바운스한다
  // (티켓 20260911_1102). ready/error는 아래 렌더링에서 이 값보다 먼저 확인하므로, 실제
  // 콘텐츠가 준비되면 minVisibleMs와 무관하게 즉시 노출된다 — 인위적으로 늦춰지지 않는다.
  const showCardLoader = useDebouncedLoading(effectiveState.card.kind === 'loading')
  const showBadgeLoader = useDebouncedLoading(effectiveState.badge.kind === 'loading')

  const activeKind: ShareItemKind = SHARE_ITEM_KINDS[activeIndex] ?? 'card'
  const activeItemState = effectiveState[activeKind]

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
  // "이미지 URL이 없으면 에러"는 아래 파생값(effectiveState)으로 옮겼다. 화면에 보이는
  // 로딩/에러 전이는 기존과 같다(오히려 한 프레임 빨리 확정된다).
  useEffect(() => {
    if (!open) return

    if (cardObjectUrlRef.current) {
      URL.revokeObjectURL(cardObjectUrlRef.current)
      cardObjectUrlRef.current = null
    }

    if (!imageUrl) return

    let cancelled = false

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
            if (!cancelled) setState((prev) => ({ ...prev, card: { kind: 'error', reason } }))
            return
          }
          stats = (await res.json()) as BadgeShareStats
        }

        const blob = await buildBadgeShareBlob({ badgeImageUrl: imageUrl as string, stats, level, earnCount })
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        cardObjectUrlRef.current = blobUrl
        setState((prev) => ({ ...prev, card: { kind: 'ready', blobUrl, blob } }))
      } catch (err) {
        console.error('[BadgeShareButton] 공유 카드 생성 실패:', err)
        if (!cancelled) setState((prev) => ({ ...prev, card: { kind: 'error', reason: 'unknown' } }))
      }
    }

    generate()

    return () => {
      cancelled = true
    }
  }, [open, badgeType, badgeId, subjectUsername, imageUrl, level, earnCount])

  // 배지 이미지 단독(300px 정사각형) 항목 — 통계 API 조회가 필요 없어 카드 생성과 독립적으로
  // 진행된다(티켓 20260911_1102). 하나가 아직 로딩 중이어도 다른 하나는 먼저 준비될 수 있다.
  useEffect(() => {
    if (!open) return

    if (badgeObjectUrlRef.current) {
      URL.revokeObjectURL(badgeObjectUrlRef.current)
      badgeObjectUrlRef.current = null
    }

    if (!imageUrl) return

    let cancelled = false

    async function generate() {
      try {
        const blob = await buildBadgeImageBlob(imageUrl as string)
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        badgeObjectUrlRef.current = blobUrl
        setState((prev) => ({ ...prev, badge: { kind: 'ready', blobUrl, blob } }))
      } catch (err) {
        console.error('[BadgeShareButton] 배지 이미지 변환 실패:', err)
        if (!cancelled) setState((prev) => ({ ...prev, badge: { kind: 'error', reason: 'unknown' } }))
      }
    }

    generate()

    return () => {
      cancelled = true
    }
  }, [open, imageUrl])

  // 언마운트 시 마지막으로 만든 objectURL 정리
  useEffect(() => {
    return () => {
      if (cardObjectUrlRef.current) URL.revokeObjectURL(cardObjectUrlRef.current)
      if (badgeObjectUrlRef.current) URL.revokeObjectURL(badgeObjectUrlRef.current)
    }
  }, [])

  async function handleAction(blob: Blob, filenameSuffix: string) {
    const file = new File([blob], `${badgeName}-${filenameSuffix}.png`, { type: 'image/png' })

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
    a.download = `${badgeName}-${filenameSuffix}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  /**
   * "저장" 버튼 — 배지 이미지를 스마트폰 사진 앱(카메라 롤)에 보관하려는 의도.
   *
   * 플랫폼 제약(실기기 검증 완료, 티켓 20260903_1122 참고):
   * - iOS: `navigator.share`도 `<a download>`도 사진 앱에 직접 쓰지 못한다. `<a download>`는
   *   Files 앱 다운로드 폴더에 저장될 뿐이다. 과거에는 "공유" 버튼과 시트가 겹치는 걸 피하려고
   *   이미지를 새 탭에 여는 방식을 썼으나, 실기기에서 사진 앱 저장으로 이어지지 않았다(투명 PNG를
   *   브라우저가 흰 배경 위에 그려 흰색 텍스트·로고도 안 보이는 부작용까지 있었다). 사용자가 실기기로
   *   확인한 유일하게 동작하는 경로는 `navigator.share` → OS 공유시트 → 시트 안의 "저장" 액션이므로,
   *   "공유" 버튼(`handleAction`)과 동일한 호출을 그대로 재사용한다. 두 버튼이 같은 시트를 띄우는
   *   것은 웹 플랫폼 제약상 불가피하며, "실제로 저장돼야 한다"는 요구가 우선한다.
   * - Android: `<a download>`로 다운로드 폴더에 저장하면 MediaStore가 스캔해 갤러리/사진 앱에
   *   자동 노출된다. "공유" 버튼(OS 공유시트)과 확연히 다른 동작이라 별도 안내 없이 저장 완료로
   *   알린다.
   * - 데스크톱: 사진 앱 개념이 없어 `<a download>`로 파일을 내려받는 것이 곧 "저장"이다.
   */
  async function handleSave(blob: Blob, filenameSuffix: string) {
    if (isIOS()) {
      // 시트가 뜨면 화면 대부분을 시트가 덮으므로, 열리기 직전에 토스트로 어떤 액션을 눌러야
      // 하는지 안내한다(시트 자체는 handleAction과 완전히 동일한 navigator.share 호출).
      toast(d.badges.shareSaveIOSHint, 'info')
      await handleAction(blob, filenameSuffix)
      return
    }

    try {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${badgeName}-${filenameSuffix}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast(d.badges.shareSaveSuccess, 'success')
    } catch (err) {
      console.error('[BadgeShareButton] 이미지 저장 실패:', err)
      toast(d.badges.shareSaveError, 'error')
    }
  }

  function handleButtonClick() {
    if (isDisabled) {
      setPopoverOpen((v) => !v)
      return
    }
    // 이전에 열었을 때의 ready/error 결과가 남아 있으므로 여는 시점에 loading으로 되돌리고,
    // 캐러셀 선택도 첫 항목(공유 카드)으로 초기화한다.
    setState({ card: { kind: 'loading' }, badge: { kind: 'loading' } })
    setActiveIndex(0)
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
        contentScrollable={false}
        footerBottomInset="safe-area"
        footer={
          activeItemState.kind === 'ready' ? (
            <div className="flex gap-[var(--spacing-8)]">
              <div className="flex-1">
                <Button
                  surface="dark"
                  fullWidth
                  onClick={() => handleAction(activeItemState.blob, FILENAME_SUFFIX[activeKind])}
                >
                  {d.badges.shareActionShare}
                </Button>
              </div>
              <div className="flex-1">
                <Button
                  surface="dark"
                  variant="secondary"
                  fullWidth
                  onClick={() => handleSave(activeItemState.blob, FILENAME_SUFFIX[activeKind])}
                >
                  {d.badges.shareActionDownload}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="h-full flex flex-col min-h-0 px-[var(--spacing-16)]">
          {/*
            "기존 이미지(공유 카드)"·"배지 이미지" 2항목 캐러셀 (티켓 20260911_1102).
            MODULAR Carousel(센터 포커스, 좌우 peek)을 그대로 재사용 — 슬라이드 전환 시
            activeIndex가 바뀌고, 아래 푸터의 "공유"·"저장" 버튼은 항상 이 activeIndex에
            해당하는 항목의 blob을 대상으로 한다.
            체크보드 프레임·130% 확대 스타일은 각 슬라이드(renderItem) 안에 그대로 유지한다
            (아래 원래 주석 — 20260821_003 결정 유지, 2026-08-21 재작업).
            aspect-square가 아니라 flex-1로 시트 헤더~푸터 사이 세로 공간을 남김없이 전부 채운다.
          */}
          <div className="relative w-full flex-1 min-h-0">
            <Carousel
              items={SHARE_ITEM_KINDS}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              getItemKey={(kind: ShareItemKind) => kind}
              ariaLabel="공유 이미지 선택"
              style={{ height: '100%', alignItems: 'stretch' }}
              renderItem={(kind: ShareItemKind) => {
                const itemState = effectiveState[kind]
                const showLoader = kind === 'card' ? showCardLoader : showBadgeLoader
                return (
                  <div
                    role="group"
                    aria-label={kind === 'card' ? '통계 포함 공유 카드' : '배지 이미지 단독'}
                    className="relative w-full h-full rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center"
                    style={{
                      backgroundImage:
                        'repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, rgba(255,255,255,0.02) 0% 50%)',
                      backgroundSize: '20px 20px',
                    }}
                  >
                    {itemState.kind === 'ready' ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 클라이언트에서 즉석 생성한 blob: URL, next/image 최적화 대상 아님
                      <img
                        src={itemState.blobUrl}
                        alt={badgeName}
                        className="w-full h-full object-contain"
                        /*
                          카드(1080×1920)는 캔버스 위/아래에 여백(스토리 템플릿 특성상 배지+텍스트
                          블록 주위로 넓은 여백)이 있어 그대로 보여주면 작아 보인다 — 130% 확대해서
                          프레임 밖으로 여백이 잘려나가더라도 배지 이미지~마지막 텍스트까지는 더 크게
                          보이는 쪽을 택했다(2026-08-21 사용자 피드백). 프레임의 overflow-hidden이
                          잘라내는 역할을 한다.
                          배지 이미지(300px 정사각형)는 여백 없이 꽉 찬 이미지라 같은 배율을 적용하면
                          그대로 잘려 보이므로 축소해서 보여준다(2026-09-11 사용자 피드백).
                          실제 저장/공유되는 파일은 두 항목 모두 원본 그대로다 — 이 확대/축소는
                          미리보기 화면에만 적용된다.
                        */
                        style={{ transform: kind === 'card' ? 'scale(1.3)' : 'scale(0.5)' }}
                      />
                    ) : itemState.kind === 'error' ? (
                      // 실제 알림은 프레임 바깥의 sr-only 블록(aria-live="polite")이 전담한다 —
                      // 같은 문구가 여기 시각 텍스트에도 있어 aria-hidden 없이 두면 스크린 리더가
                      // 두 번 읽는다(인터페이스 리뷰 지적, 티켓 20260911_1156).
                      <div className="px-[var(--spacing-24)] text-center" aria-hidden="true">
                        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
                          {errorCopy(itemState.reason).title}
                        </p>
                        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--color-text-secondary)]/60">
                          {errorCopy(itemState.reason).body}
                        </p>
                      </div>
                    ) : showLoader ? (
                      <WanderingEyesLoader />
                    ) : null}
                  </div>
                )
              }}
            />
          </div>

          {activeItemState.kind === 'error' && (
            // 안내 문구 자체는 캐러셀 프레임 안(renderItem)에 직접 표시한다 — 이 블록은 스크린
            // 리더 알림 역할만 유지하고 화면에는 노출하지 않는다(중복 방지).
            <span role="status" aria-live="polite" className="sr-only">
              {errorCopy(activeItemState.reason).title} {errorCopy(activeItemState.reason).body}
            </span>
          )}
          {activeItemState.kind === 'loading' && (
            <span role="status" aria-live="polite" className="sr-only">
              {d.badges.shareImageLoading}
            </span>
          )}
        </div>
      </BottomSheet>
    </>
  )
}
