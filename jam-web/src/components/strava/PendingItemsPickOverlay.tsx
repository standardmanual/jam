'use client'

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeRevealCarousel } from '@ds/components/patterns/BadgeRevealCarousel'
import { Button } from '@ds/components/buttons/Button'
import { WanderingEyesLoader } from '@ds/components/feedback/WanderingEyesLoader'
import { useToast } from '@/components/ui/Toast'
import { pushTabBarHidden } from '@/lib/uiOverlay'
import { d, t } from '@/lib/i18n'
import type { PendingItemsPayload } from '@/lib/strava/pending-items-contract'
import { fetchPendingPayload, isExactChoice, submitChoice, toggleChoice, type PickResult } from '@/lib/strava/pending-pick'

/**
 * 동기화 보류 고르기 오버레이 (티켓 20261017_1425 2회, 채원 판정 2026-10-17).
 *
 * 받을 아이템 배지가 인벤토리 빈칸보다 많아 보류된 것을 MODULAR `BadgeRevealCarousel`의 선택 모드로 하나씩 넘겨 보며
 * 빈칸 수(`chooseCount`)만큼 정확히 고른다. 고르지 않은 것은 받을 수 없고 되돌릴 수 없다.
 *
 * 이 컴포넌트가 소유하는 것: 목록 읽기(GET), 선택 상태, 확정 확인 단계, 제출(POST), 오류 처리, 빈칸 0 안내.
 * 열림·닫힘과 결과 전달은 `PendingItemsPickerProvider`가 맡는다(`onFinish`).
 *
 * 화면 단계
 *   loading — GET 대기. 닫을 수 없고 8초 타임아웃으로 빠져나온다.
 *   ready   — 칸이 1 이상. 캐러셀 + 푸터(카운터·담기). «담기»를 누르면 같은 오버레이 안 푸터가 확정 확인으로 바뀐다.
 *   full    — 칸이 0. 캐러셀 없이 안내 카드: «나중에»는 보류를 남기고 닫고 «받지 않고 닫기»는 빈 선택으로 확정해 보류를 닫는다.
 *
 * 셸 코드(탭바 숨김·main 스크롤 잠금·430px 컬럼·z60)는 `BadgeRevealOverlay`와 같다.
 *
 * 클라이언트·서버 경계: 이 파일이 가져오는 모듈은 `pending-items-contract.ts`(타입 전용, import 없음)·DS·`@/lib/uiOverlay`·`@/lib/i18n`·
 * `@/components/ui/Toast`·`next/navigation`뿐이다. `@/lib/supabase/server`·`next/headers`·`lib/strava/pending-items.ts`를 가져오지 않는다.
 */

export type { PickResult }

interface Props {
  open: boolean
  /** true면 목록 읽기 실패를 토스트로 알리지 않는다(앱을 열 때의 자동 재진입) */
  quiet?: boolean
  /** 고르기가 끝났을 때(성공·보류가 없음 = 'resolved', «나중에»·읽기 실패 = 'dismissed') */
  onFinish: (result: PickResult) => void
}

export type PickPhase = 'loading' | 'ready' | 'full'

const OVERLAY_Z_INDEX = 60
/** 서비스 컬럼 폭(430px)에 맞춘 오버레이 박스 — `BadgeRevealOverlay`와 같다 */
const COLUMN_STYLE = { maxWidth: 430, marginLeft: 'auto', marginRight: 'auto' } as const
/** 목록 읽기 타임아웃. 넘기면 갇히지 않게 닫는다(탭바가 사라지고 스크롤이 잠긴 구간이다). */
const LOAD_TIMEOUT_MS = 8000
/** 카드 폭 기본값과 세로가 짧은 화면(iPhone SE 계열·가로 모드)의 값 */
const CARD_WIDTH_DEFAULT = 292
const CARD_WIDTH_SHORT = 240
/** 카드 폭 하한 — 이보다 작게 줄이지 않는다 */
const CARD_WIDTH_MIN = 180
/** 카드 높이 = 폭 × 이 비율(캐러셀 규칙과 같다) */
const CARD_HEIGHT_RATIO = 1.34
/** 카드와 헤더·푸터 사이에 남기는 최소 여백(px) */
const CARD_GAP_PX = 16
/** 푸터 내용이 바뀔 때 페이드 시간 — `--duration-quick`(150ms)과 같다 */
const FADE_MS = 150

/** 푸터의 «선택» 층과 «확정 확인» 층을 같은 자리에 겹쳐 두고 활성 층만 보인다 — 높이가 두 층 중 큰 쪽으로 고정돼 전환 때 흔들리지 않는다. */
function footerLayerStyle(active: boolean) {
  return {
    gridArea: '1 / 1',
    opacity: active ? 1 : 0,
    visibility: active ? 'visible' : 'hidden',
    transition: `opacity var(--duration-quick) var(--ease-out), visibility 0s linear ${active ? 0 : FADE_MS}ms`,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-8)',
  } as const
}

export default function PendingItemsPickOverlay({ open, quiet = false, onFinish }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const titleId = useId()

  const [phase, setPhase] = useState<PickPhase>('loading')
  const [payload, setPayload] = useState<PendingItemsPayload | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [cardWidth, setCardWidth] = useState(CARD_WIDTH_DEFAULT)

  /** 제출 중복 방지 — state는 다음 렌더에야 반영되므로 같은 틱의 두 번째 클릭은 ref로 막는다 */
  const submittingRef = useRef(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const laterButtonRef = useRef<HTMLDivElement>(null)

  /* 최신 콜백·값을 이펙트·비동기 안에서 읽는다(이펙트 의존성에 넣으면 목록을 다시 읽는다) */
  const latest = useRef({ onFinish, quiet, toast, router })
  useEffect(() => {
    latest.current = { onFinish, quiet, toast, router }
  })

  // 열릴 때마다 처음 상태로 돌아온다(렌더 중 상태 조정 — 이펙트에서 setState하지 않는다)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setPhase('loading')
      setPayload(null)
      setSelected([])
      setConfirming(false)
      setSubmitting(false)
      setErrorText(null)
    }
  }

  // 목록 읽기
  useEffect(() => {
    if (!open) return
    let active = true
    void (async () => {
      const result = await fetchPendingPayload(fetch, LOAD_TIMEOUT_MS)
      if (!active) return
      const { onFinish: finish, quiet: silent, toast: showToast } = latest.current
      if (!result) {
        if (!silent) showToast(d.syncPending.loadFailed, 'error')
        finish('dismissed')
        return
      }
      if (result.pendingCount === 0) {
        // 이미 다른 곳에서 고르기를 마쳤다 — 조용히 끝낸다
        finish('resolved')
        return
      }
      setPayload(result)
      setPhase(result.chooseCount === 0 ? 'full' : 'ready')
    })()
    return () => {
      active = false
    }
  }, [open])

  // 오버레이가 떠 있는 동안 플로팅 탭바를 DOM에서 제거한다
  useEffect(() => {
    if (!open) return
    return pushTabBarHidden()
  }, [open])

  // 배경 스크롤 락 — 스크롤 컨테이너는 body가 아니라 (main)/layout.tsx의 <main>이다
  useEffect(() => {
    if (!open) return
    const scroller = document.querySelector<HTMLElement>('main')
    const prevOverflow = scroller?.style.overflow
    if (scroller) scroller.style.overflow = 'hidden'
    return () => {
      if (scroller) scroller.style.overflow = prevOverflow ?? ''
    }
  }, [open])

  /* 카드 폭 — 세로가 640px 미만이면 240, 그 밖에는 292. 헤더·푸터의 실측 높이(offsetHeight)를 뺀 남는 높이에 카드가 들어가지
     않으면 폭을 더 줄여(하한 180) 헤더·푸터와 겹치지 않게 한다. ResizeObserver는 관찰을 시작할 때 한 번 호출되므로
     첫 측정도 콜백 안에서 이뤄진다. */
  useEffect(() => {
    if (!open || phase !== 'ready') return
    const measure = () => {
      const short = window.matchMedia?.('(max-height: 639px)').matches ?? false
      const base = short ? CARD_WIDTH_SHORT : CARD_WIDTH_DEFAULT
      const chrome = (headerRef.current?.offsetHeight ?? 0) + (footerRef.current?.offsetHeight ?? 0)
      const fit = Math.floor((window.innerHeight - chrome - CARD_GAP_PX) / CARD_HEIGHT_RATIO)
      setCardWidth(Math.max(CARD_WIDTH_MIN, Math.min(base, fit)))
    }
    window.addEventListener('resize', measure)
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      if (headerRef.current) observer.observe(headerRef.current)
      if (footerRef.current) observer.observe(footerRef.current)
    }
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [open, phase])

  const chooseCount = payload?.chooseCount ?? 0

  function handleLater() {
    if (submittingRef.current) return
    latest.current.onFinish('dismissed')
  }

  function handleToggle(id: string) {
    if (submittingRef.current || confirming) return
    setErrorText(null)
    setSelected((prev) => toggleChoice(prev, id, chooseCount))
  }

  /** 고르기 확정. 고른 수가 정확히 맞을 때만 보내고(`submitChoice`), 제출 중에는 한 번만 보낸다. */
  async function submit(chosenIds: string[]) {
    if (!isExactChoice(chosenIds.length, chooseCount)) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setErrorText(null)
    try {
      const outcome = await submitChoice(fetch, chosenIds, chooseCount)
      const { onFinish: finish, toast: showToast, router: nav } = latest.current
      if (outcome.kind === 'success') {
        // 오버레이를 닫은 뒤에 토스트를 띄운다(토스트가 오버레이 위에서 겹쳐 보이지 않게)
        finish('resolved')
        showToast(
          outcome.granted > 0 ? t(d.syncPending.pick.resolvedToast, { count: outcome.granted }) : d.syncPending.pick.resolvedNoneToast,
          outcome.granted > 0 ? 'success' : 'info'
        )
        nav.refresh()
      } else if (outcome.kind === 'already_resolved') {
        // 이미 고르기를 마쳤다(중복 클릭·다른 기기) — 닫고 화면을 새로 읽는다
        finish('resolved')
        nav.refresh()
      } else if (outcome.kind === 'error') {
        setErrorText(outcome.message)
        setConfirming(false)
        if (outcome.reload) {
          // 목록이 달라졌다 — 다시 읽고 선택을 비운다
          setSelected([])
          const fresh = await fetchPendingPayload(fetch, LOAD_TIMEOUT_MS)
          if (fresh && fresh.pendingCount > 0) {
            setPayload(fresh)
            setPhase(fresh.chooseCount === 0 ? 'full' : 'ready')
          } else if (fresh) {
            finish('resolved')
            nav.refresh()
          }
        }
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  // 빈칸 0 안내: Escape = «나중에», Tab은 두 버튼 안에서만 돈다
  useEffect(() => {
    if (!open || phase !== 'full') return
    const root = laterButtonRef.current?.parentElement?.parentElement
    laterButtonRef.current?.querySelector('button')?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!submittingRef.current) latest.current.onFinish('dismissed')
        return
      }
      if (e.key !== 'Tab') return
      const buttons = Array.from(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      if (buttons.length === 0) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, phase])

  return (
    <PendingItemsPickView
      open={open}
      phase={phase}
      payload={payload}
      selected={selected}
      confirming={confirming}
      submitting={submitting}
      errorText={errorText}
      cardWidth={cardWidth}
      titleId={titleId}
      headerRef={headerRef}
      footerRef={footerRef}
      laterButtonRef={laterButtonRef}
      onToggle={handleToggle}
      onLater={handleLater}
      onOpenConfirm={() => setConfirming(true)}
      onBack={() => setConfirming(false)}
      onSubmitSelected={() => void submit(selected)}
      onDiscardAll={() => void submit([])}
    />
  )
}

export interface PendingItemsPickViewProps {
  open: boolean
  phase: PickPhase
  payload: PendingItemsPayload | null
  selected: string[]
  confirming: boolean
  submitting: boolean
  errorText: string | null
  cardWidth: number
  titleId: string
  headerRef: RefObject<HTMLDivElement | null>
  footerRef: RefObject<HTMLDivElement | null>
  laterButtonRef: RefObject<HTMLDivElement | null>
  onToggle: (id: string) => void
  onLater: () => void
  onOpenConfirm: () => void
  onBack: () => void
  onSubmitSelected: () => void
  onDiscardAll: () => void
}

/** 화면만 그린다(상태·요청은 `PendingItemsPickOverlay`가 소유한다). 서버 렌더 시험이 단계별 화면을 직접 그려 볼 수 있게 내보낸다. */
export function PendingItemsPickView({
  open,
  phase,
  payload,
  selected,
  confirming,
  submitting,
  errorText,
  cardWidth,
  titleId,
  headerRef,
  footerRef,
  laterButtonRef,
  onToggle,
  onLater,
  onOpenConfirm,
  onBack,
  onSubmitSelected,
  onDiscardAll,
}: PendingItemsPickViewProps) {
  const chooseCount = payload?.chooseCount ?? 0
  const total = payload?.pendingCount ?? 0
  const unselected = Math.max(0, total - chooseCount)

  const items = useMemo(
    () =>
      (payload?.items ?? []).map((p) => ({
        // 보류 개체는 각자 다른 id라 같은 배지여도 별개 카드다(캐러셀이 같은 id만 한 장으로 접는다)
        id: p.id,
        name: p.name,
        description: '',
        imageUrl: p.imageUrl,
        rarity: p.rarity,
      })),
    [payload]
  )

  /** 스크린리더가 열림을 알 수 있게 상시 마운트된 라이브 리전에 안내를 채운다 */
  const announcement =
    open && phase === 'ready'
      ? `${t(d.syncPending.pick.title, { n: chooseCount })}. ${t(d.syncPending.pick.subtitle, { total })}`
      : open && phase === 'full'
        ? d.syncPending.pick.fullTitle
        : ''

  const counterText = t(d.syncPending.pick.counter, { k: selected.length, n: chooseCount })
  const confirmLabel = t(d.syncPending.pick.confirmCta, { n: chooseCount })

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {open && phase === 'loading' && (
        <div
          role="status"
          style={{
            position: 'fixed',
            inset: 0,
            ...COLUMN_STYLE,
            zIndex: OVERLAY_Z_INDEX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--backdrop)',
          }}
        >
          <WanderingEyesLoader duration="2s" eyeColor="var(--snow)" pupilColor="var(--background-inverse)" />
          <span className="sr-only">{d.syncPending.pick.loading}</span>
        </div>
      )}

      {open && phase === 'full' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{
            position: 'fixed',
            inset: 0,
            ...COLUMN_STYLE,
            zIndex: OVERLAY_Z_INDEX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-24)',
            background: 'var(--backdrop)',
            fontFamily: 'var(--font-family-base)',
          }}
        >
          <style>{`@keyframes ds-badge-reveal-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
          <div
            style={{
              width: '100%',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-2xl)',
              padding: 'var(--spacing-24)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-16)',
              animation: 'ds-badge-reveal-in 220ms var(--ease-out) both',
            }}
          >
            <p
              id={titleId}
              className="m-0 break-keep wrap-break-word text-balance"
              style={{ color: 'var(--foreground)', fontSize: 'var(--text-lg)', lineHeight: 'var(--text-lg--line-height)', fontWeight: 700 }}
            >
              {d.syncPending.pick.fullTitle}
            </p>
            <p
              className="m-0 break-keep wrap-break-word text-pretty"
              style={{ color: 'var(--muted)', fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)' }}
            >
              {t(d.syncPending.pick.fullBody, { total })}
            </p>
            {errorText && (
              <p
                role="alert"
                className="m-0 break-keep wrap-break-word text-pretty"
                style={{ color: 'var(--foreground)', fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)' }}
              >
                {errorText}
              </p>
            )}
            {/* 두 버튼은 같은 폭·같은 높이(시각 무게가 같다). 좁으면 위아래로 쌓인다(각 130px 이상 유지) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-8)' }}>
              <div ref={laterButtonRef} style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Button
                  variant="secondary"
                  fullWidth
                  className="break-keep wrap-break-word"
                  disabled={submitting}
                  onClick={onLater}
                >
                  {d.syncPending.pick.fullLater}
                </Button>
              </div>
              <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Button
                  variant="primary"
                  fullWidth
                  className="break-keep wrap-break-word"
                  loading={submitting}
                  onClick={onDiscardAll}
                >
                  {submitting ? d.syncPending.pick.submitting : d.syncPending.pick.fullDiscard}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BadgeRevealCarousel
        open={open && phase === 'ready'}
        items={items}
        cardWidth={cardWidth}
        selectable
        selectedIds={selected}
        selectionFull={selected.length >= chooseCount}
        onToggleSelect={onToggle}
        selectLabel={d.syncPending.pick.toggleSelect}
        selectedLabel={d.syncPending.pick.toggleSelected}
        closeDisabled={submitting}
        onClose={onLater}
        ariaLabel={d.syncPending.pick.ariaLabel}
        closeLabel={d.syncPending.pick.fullLater}
        earnCountMessage={(n: number) => t(d.badges.earnCountAria, { count: n })}
        style={COLUMN_STYLE}
        header={
          // 헤더 글자를 --backdrop 위에 직접 놓으면 흰 글자 대비가 크림 바탕 위에서 약 4.1:1(4.5:1 미달)이라 --surface 패널에 올린다.
          <div
            ref={headerRef}
            style={{
              background: 'var(--surface)',
              borderRadius: '0 0 var(--radius-2xl) var(--radius-2xl)',
              padding: 'max(var(--spacing-16), env(safe-area-inset-top)) var(--spacing-24) var(--spacing-16)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-4)',
              textAlign: 'left',
            }}
          >
            <p
              className="m-0 break-keep wrap-break-word text-balance"
              style={{ color: 'var(--foreground)', fontSize: 'var(--text-lg)', lineHeight: 'var(--text-lg--line-height)', fontWeight: 700 }}
            >
              {t(d.syncPending.pick.title, { n: chooseCount })}
            </p>
            <p
              className="m-0 break-keep wrap-break-word text-pretty"
              style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)' }}
            >
              {t(d.syncPending.pick.subtitle, { total })}
            </p>
          </div>
        }
        footer={
          <div
            ref={footerRef}
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
              padding: 'var(--spacing-16) var(--spacing-24) max(var(--spacing-16), env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-8)',
              textAlign: 'left',
            }}
          >
            {errorText && (
              <p
                role="alert"
                className="m-0 break-keep wrap-break-word text-pretty"
                style={{ color: 'var(--foreground)', fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)' }}
              >
                {errorText}
              </p>
            )}
            <div style={{ display: 'grid' }}>
              {/* 선택 */}
              <div style={footerLayerStyle(!confirming)} inert={confirming}>
                <p
                  aria-live="polite"
                  className="m-0 break-keep wrap-break-word"
                  style={{ color: 'var(--foreground)', fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', fontWeight: 700 }}
                >
                  {counterText}
                </p>
                {unselected > 0 && (
                  <p
                    className="m-0 break-keep wrap-break-word text-pretty"
                    style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)' }}
                  >
                    {t(d.syncPending.pick.unselectedNote, { count: unselected })}
                  </p>
                )}
                <Button
                  variant="primary"
                  fullWidth
                  className="whitespace-nowrap"
                  disabled={selected.length !== chooseCount || submitting}
                  onClick={onOpenConfirm}
                >
                  {confirmLabel}
                </Button>
              </div>

              {/* 확정 확인 */}
              <div style={footerLayerStyle(confirming)} inert={!confirming}>
                <p
                  className="m-0 break-keep wrap-break-word text-balance"
                  style={{ color: 'var(--foreground)', fontSize: 'var(--text-lg)', lineHeight: 'var(--text-lg--line-height)', fontWeight: 700 }}
                >
                  {t(d.syncPending.pick.confirmTitle, { n: chooseCount })}
                </p>
                {unselected > 0 && (
                  <p
                    className="m-0 break-keep wrap-break-word text-pretty"
                    style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)' }}
                  >
                    {t(d.syncPending.pick.confirmBody, { m: unselected })}
                  </p>
                )}
                {/* 두 버튼은 같은 폭·같은 높이. 좁으면 위아래로 쌓인다(각 130px 이상 유지) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-8)' }}>
                  <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                    <Button
                      variant="secondary"
                      fullWidth
                      className="break-keep wrap-break-word"
                      disabled={submitting}
                      onClick={onBack}
                    >
                      {d.syncPending.pick.confirmBack}
                    </Button>
                  </div>
                  <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                    <Button
                      variant="primary"
                      fullWidth
                      className="whitespace-nowrap"
                      loading={submitting}
                      onClick={onSubmitSelected}
                    >
                      {submitting ? d.syncPending.pick.submitting : confirmLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      />
    </>
  )
}
