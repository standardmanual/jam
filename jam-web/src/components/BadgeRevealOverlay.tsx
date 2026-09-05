'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeRevealCarousel } from '@ds/components/patterns/BadgeRevealCarousel'
import { WanderingEyesLoader } from '@ds/components/feedback/WanderingEyesLoader'
import { pushTabBarHidden } from '@/lib/uiOverlay'
import { d, t } from '@/lib/i18n'

/**
 * 배지 획득 연출 오버레이 — MODULAR `patterns/BadgeRevealCarousel`의 서비스 호출부 래퍼 (20260823_008).
 *
 * 두 진입 경로가 공유한다.
 *   1. 수동 동기화 — `SyncButton`이 `/api/strava/sync` 응답을 받은 **그 시점**에 연다.
 *      대기 표현은 이 오버레이가 아니라 `SyncButton`의 `loading` 스피너다(20260824_001).
 *   2. 최초 Strava 연동 — 콜백 리다이렉트 도착 페이지(`StravaConnectReveal`)가 최근 획득을
 *      되읽는 동안 `loading`으로 대기 화면을 띄우고, 결과가 오면 그대로 캐러셀로 넘어간다.
 *      이 경로에는 스피너를 걸 버튼이 없어 오버레이가 대기 표현을 맡는다 (20260824_003).
 *
 * 래퍼가 책임지는 것 (컴포넌트 자체는 건드리지 않는다)
 *   - 탭바 숨김: z-index로 덮기만 하면 iOS Safari 동적 툴바 상태에서 탭바가 비쳐 보인 이력이
 *     있어 `pushTabBarHidden()`을 병행한다.
 *   - 배경 스크롤 락: `document.body`가 아니라 실제 스크롤 컨테이너인 `main`을 잠근다
 *     (`BottomSheet.tsx` 선례).
 *   - 서비스 컬럼 폭(430px) 맞춤 — `inset: 0` + 좌우 auto 마진으로 가운데 정렬한다.
 *   - 노출 문구 4종(ariaLabel·moreMessage·moreLabel·closeLabel) 주입. 컴포넌트에 한국어
 *     기본값이 있어 주입을 빠뜨려도 화면은 정상으로 보이므로 여기서 전부 명시한다.
 *   - 접근성 공지: 오버레이가 열릴 때 획득 개수를 라이브 리전으로 알린다.
 *     (카드가 바뀔 때의 공지는 컴포넌트 안 라이브 리전이 담당한다)
 */

export interface RevealBadge {
  id: string
  name: string
  description: string
  imageUrl?: string | null
  /**
   * `null`은 «등급이 존재하지 않음»(무한레벨형, 마이그레이션 130)이고 `undefined`는 «미지정»이다.
   * 둘의 의미가 다르므로 여기서 접지 않고 그대로 캐러셀에 넘긴다 — `RarityBadge`가 null이면
   * 칩을 그리지 않는다 (티켓 20260905_0030).
   */
  rarity?: 'common' | 'rare' | 'epic' | 'mystic' | null
}

interface Props {
  /** 오버레이(대기 화면 또는 캐러셀) 표시 여부 */
  open: boolean
  /** true면 캐러셀 대신 대기 화면(WanderingEyesLoader)을 띄운다 */
  loading?: boolean
  /** 서버가 상한(10장)까지 잘라 내려준 배지 목록 — 받은 그대로 그린다 */
  items: RevealBadge[]
  /** 상세를 싣지 못한 잔여 개수. 0이면 "전체 보기" 카드가 뜨지 않는다 */
  moreCount?: number
  /** "배지 전부 보기" 이동 경로 — 탭바 프로필 링크와 같은 값 */
  profileHref: string
  /** 닫기 버튼·Escape·"배지 전부 보기" 이동 직전에 호출된다 */
  onClose: () => void
}

/** 캐러셀 오버레이(zIndex 60)와 같은 층에 두는 대기 화면 */
const OVERLAY_Z_INDEX = 60

/** 서비스 컬럼 폭에 맞춘 오버레이 박스 — fixed + inset:0 + 좌우 auto 마진으로 가운데 정렬된다 */
const COLUMN_STYLE = { maxWidth: 430, marginLeft: 'auto', marginRight: 'auto' } as const

export default function BadgeRevealOverlay({
  open,
  loading = false,
  items,
  moreCount = 0,
  profileHref,
  onClose,
}: Props) {
  const router = useRouter()

  // 오버레이가 떠 있는 동안 플로팅 탭바를 DOM에서 제거한다(닫히면 정리 함수가 복원).
  useEffect(() => {
    if (!open) return
    return pushTabBarHidden()
  }, [open])

  // 배경 스크롤 락 — 스크롤 컨테이너는 body가 아니라 (main)/layout.tsx의 <main>이다.
  useEffect(() => {
    if (!open) return
    const scroller = document.querySelector<HTMLElement>('main')
    const prevOverflow = scroller?.style.overflow
    if (scroller) scroller.style.overflow = 'hidden'
    return () => {
      if (scroller) scroller.style.overflow = prevOverflow ?? ''
    }
  }, [open])

  /* 오픈 시 획득 개수 공지.
     라이브 리전은 **닫혀 있을 때도 계속 마운트**돼 있어야 내용 변경이 공지된다 — 그래서 이
     컴포넌트는 항상 렌더되고 텍스트만 열림/닫힘에 따라 채우고 비운다. 상태·이펙트 없이 렌더
     중에 파생시킨다(이미 떠 있는 노드의 내용이 바뀌는 것이므로 별도 커밋이 필요 없다). */
  const revealing = open && !loading
  const cardCount = items.length + moreCount
  const announcement = revealing && cardCount > 0 ? t(d.badgeReveal.opened, { count: cardCount }) : ''

  function handleMoreClick() {
    onClose()
    router.push(profileHref)
  }

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {open && loading && (
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
            background: 'var(--color-overlay)',
          }}
        >
          <WanderingEyesLoader duration="2s" eyeColor="#f8fafc" pupilColor="#0f172a" />
          <span className="sr-only">{d.badgeReveal.loading}</span>
        </div>
      )}

      <BadgeRevealCarousel
        open={revealing}
        items={items}
        moreCount={moreCount}
        onMoreClick={handleMoreClick}
        onClose={onClose}
        ariaLabel={d.badgeReveal.ariaLabel}
        closeLabel={d.common.close}
        moreLabel={d.badgeReveal.moreLabel}
        moreMessage={(n: number) => t(d.badgeReveal.moreMessage, { count: n })}
        style={COLUMN_STYLE}
      />
    </>
  )
}
