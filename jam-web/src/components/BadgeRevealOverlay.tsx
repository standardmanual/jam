'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeRevealCarousel } from '@ds/components/patterns/BadgeRevealCarousel'
import { WanderingEyesLoader } from '@ds/components/feedback/WanderingEyesLoader'
import { IconButton } from '@ds/components/buttons/IconButton'
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
  /**
   * 레벨형 배지의 Lv.N (마이그레이션 130). `rarity`와 배타적이라 값이 있으면 캐러셀이
   * 등급 칩 대신 Lv.N 칩을 그린다 (티켓 20260905_0038 B).
   */
  level?: number | null
  /** 지금까지 이 배지를 획득한 횟수. 2 이상이면 카드에 ×N이 붙는다 */
  earnCount?: number
  /**
   * 잠긴 아이템 배지(티켓 20261018_0054, 운영 로직 7.3절). `true`이면 `name`·`description`·`imageUrl`을 무시하고
   * 가린 이름(`d.lockedItem.card.name`)과 여는 데 필요한 양 문구, 그림 자리의 잠금 타일로 그린다.
   * 호출부 실수로 이름·그림이 새지 않게 래퍼가 막는다. 서버도 잠긴 개체에는 이 값들을 내리지 않는다.
   */
  locked?: boolean
  /** 잠긴 개체를 여는 데 필요한 잼. 없거나 0 이하이면 설명 줄을 생략한다 */
  unlockRequired?: number
}

/** 캐러셀 항목 — 잠긴 개체는 가린 이름과 필요한 양 문구로 바꾸고 그림을 비운다 */
export function toCarouselItem(item: RevealBadge): RevealBadge {
  if (item.locked !== true) return item
  const hasRequired = Number.isFinite(item.unlockRequired) && (item.unlockRequired ?? 0) > 0
  return {
    id: item.id,
    name: d.lockedItem.card.name,
    description: hasRequired ? t(d.lockedItem.card.description, { n: item.unlockRequired as number }) : '',
    imageUrl: null,
    rarity: item.rarity,
    locked: true,
  }
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
  /**
   * `items`가 비어 있을 때 캐러셀 대신 같은 오버레이 셸에 보여줄 문구(티켓 20260917_1655).
   * `BadgeRevealCarousel`은 0장이면 아무것도 렌더하지 않는 설계라(캐러셀 자체 미노출이
   * 정상 경로) 믹스 실패처럼 "결과가 나왔지만 배지가 없다"는 상태는 호출부가 직접
   * 처리해야 한다. 지정하지 않으면 기존 동작(0장 시 미노출)을 그대로 유지한다.
   */
  emptyMessage?: string
  /**
   * 카드 위에 한 줄로 보여 줄 결과 문구(티켓 20261018_0054). 캡슐 열기 결과(«캡슐을 열었어요. 아이템 배지 {n}개를 얻었어요.»)처럼
   * 획득 연출에 맥락 문장이 필요한 호출부가 쓴다. 지정하면 오버레이가 열릴 때 라이브 리전이 개수 문구 대신 이 문구를 알린다.
   * 지정하지 않으면 기존 화면 그대로다(헤더 슬롯 없음).
   */
  resultMessage?: string
  /**
   * 카드 위에 얹는 요약 한 줄(티켓 20261025_2050). 동기화 결과의 «이번에 잼 {n}만큼 받았어요»처럼 배지 개수 공지를 대신하지 않고 보태는 문장이다.
   * `resultMessage`와 같은 헤더 패널에 그린다. 라이브 리전은 «배지 {count}개를 획득했어요. {요약}» 순서로 읽는다.
   * `resultMessage`도 함께 주면 `resultMessage`가 이긴다(요약은 그리지도 읽지도 않는다). 지정하지 않으면 기존 화면 그대로다.
   */
  summaryMessage?: string
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
  emptyMessage,
  resultMessage,
  summaryMessage,
}: Props) {
  const router = useRouter()
  // 항목 배열의 정체성을 유지한다 — 잠긴 개체를 가린 문구로 바꾸는 변환이 렌더마다 새 배열을 만들지 않게 한다.
  const carouselItems = useMemo(() => items.map((item) => toCarouselItem(item)), [items])

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
  const countAnnouncement = summaryMessage
    ? t(d.badgeReveal.openedWithSummary, { count: cardCount, summary: summaryMessage })
    : t(d.badgeReveal.opened, { count: cardCount })
  const announcement = revealing && cardCount > 0 ? (resultMessage ?? countAnnouncement) : ''
  // 헤더 패널은 resultMessage가 쓰는 마크업 하나를 같이 쓴다
  const headerMessage = resultMessage ?? summaryMessage
  const showEmptyState = revealing && cardCount === 0 && Boolean(emptyMessage)

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
            background: 'var(--backdrop)',
          }}
        >
          <WanderingEyesLoader duration="2s" eyeColor="var(--snow)" pupilColor="var(--background-inverse)" />
          <span className="sr-only">{d.badgeReveal.loading}</span>
        </div>
      )}

      {showEmptyState && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            ...COLUMN_STYLE,
            zIndex: OVERLAY_Z_INDEX,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--spacing-24)',
            padding: 'var(--spacing-24)',
            background: 'var(--backdrop)',
          }}
        >
          <p
            style={{
              color: 'var(--base-white)',
              fontSize: 'var(--text-base)',
              lineHeight: 'var(--text-base--line-height)',
              textAlign: 'center',
            }}
          >
            {emptyMessage}
          </p>
          <IconButton icon="close" label={d.common.close} surface="light" onClick={onClose} />
        </div>
      )}

      <BadgeRevealCarousel
        open={revealing && !showEmptyState}
        items={carouselItems}
        moreCount={moreCount}
        onMoreClick={handleMoreClick}
        onClose={onClose}
        ariaLabel={d.badgeReveal.ariaLabel}
        closeLabel={d.common.close}
        moreLabel={d.badgeReveal.moreLabel}
        moreMessage={(n: number) => t(d.badgeReveal.moreMessage, { count: n })}
        earnCountMessage={(n: number) => t(d.badges.earnCountAria, { count: n })}
        style={COLUMN_STYLE}
        header={
          headerMessage ? (
            // 흰 글자를 --backdrop 위에 직접 놓으면 크림 바탕 위에서 대비가 모자라 --surface 패널에 올린다(보류 고르기 헤더와 같은 방식).
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: '0 0 var(--radius-2xl) var(--radius-2xl)',
                padding: 'max(var(--spacing-16), env(safe-area-inset-top)) var(--spacing-24) var(--spacing-16)',
                textAlign: 'left',
              }}
            >
              <p
                className="m-0 break-keep wrap-break-word text-balance"
                style={{ color: 'var(--foreground)', fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', fontWeight: 700 }}
              >
                {headerMessage}
              </p>
            </div>
          ) : undefined
        }
      />
    </>
  )
}
