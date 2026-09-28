'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SafeImage from '@/components/SafeImage'
import { useToast } from '@/components/ui/Toast'
import PoiCarouselModal from '@/components/PoiCarouselModal'
import { BADGE_FILL_PATH } from '@/components/map/MapView'
import { d } from '@/lib/i18n'
import {
  DEMO_PICKUP_POI,
  DEMO_PICKUP_DROP,
  DEMO_DROP_ITEM,
  VIRTUAL_MAP_IMAGE_SRC,
} from '@/lib/onboarding-quest/demo-data'
import { StepSaveFailedError } from '@/lib/onboarding-quest/step-error'

/**
 * 온보딩 퀘스트 `pickup`·`drop` 차례 공용 연출 씬(티켓 20260927_2126 T3, 20260927_2128 T5).
 * 파일명은 T3(픽업) 도입 당시 그대로 남아 있지만, `mode` prop으로 두 단계를 한 씬이 함께
 * 처리한다 — "픽업 전용 씬"으로 오해하지 말 것(채원 craft_notes).
 * `QuestBagGrid.tsx`와 같은 위치·같은 성격의 얇은 클라이언트 래퍼 — 실제 `PoiCarouselModal`·
 * `BadgeDetailSheet`를 그대로 쓰고, 배경(가상 지도 이미지)과 정지 마커 1개만 새로 그린다.
 *
 * 마커는 실제 드랍 마커와 같은 실루엣(`MapView.tsx`의 `BADGE_FILL_PATH`)을 재사용한다 —
 * 새 아이콘을 그리지 않는다(사용자 결정, 2026-09-28). 마커를 탭하면 `PoiCarouselModal`을
 * `demoMode`로 연다. `pickup`은 데모 POI에 미리 채워둔 드랍 1건만 보여주고 "여기에 드랍"
 * 버튼을 숨기며(존재하지 않는 POI id로 실제 드랍 API가 불리는 사고 방지), `drop`은 그 반대로
 * 빈 목록에서 시작해 "여기에 드랍" 버튼을 살린다(채원 판정 2026-09-28, 20260927_2128).
 */

interface QuestPickupSceneProps {
  mode: 'pickup' | 'drop'
}

/** 정지 마커 서클 지름(px) — 실제 지도 드랍 마커(기본 24px)와 동일. */
const MARKER_SIZE = 24
/** 마커 내부 배지 아이콘 크기(px) — `dropMarkerIconHtml`과 같은 0.6배 비율. */
const MARKER_ICON_SIZE = Math.round(MARKER_SIZE * 0.6)

export default function QuestPickupScene({ mode }: QuestPickupSceneProps) {
  const [carouselOpen, setCarouselOpen] = useState(false)
  // 드랍 기록(`POST .../step` {step:'drop'})이 끝났는지 — 카드를 닫을 때 홈으로 보낼지
  // 판단하는 데만 쓴다(채원 판정 1). pickup 모드는 성공 즉시 router.push하므로 쓰지 않는다.
  const [dropRecorded, setDropRecorded] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  /**
   * 실제 픽업 API 대신 호출되는 콜백(`PoiCarouselModal`의 `onPickupOverride`). 성공하면
   * 홈으로 이동하고, 실패하면 시트를 유지한 채 토스트만 띄워 재시도할 수 있게 한다
   * (`QuestBagGrid.tsx`의 두 갈래 토스트 패턴과 동일 구조). 절대 throw하지 않는다 —
   * 호출부(`executePickup`)가 이 콜백을 await만 하고 별도로 catch하지 않는다.
   */
  async function handlePickup() {
    try {
      const res = await fetch('/api/onboarding-quest/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'pickup' }),
      })
      if (!res.ok) throw new StepSaveFailedError()
      router.push('/')
    } catch (err) {
      if (err instanceof StepSaveFailedError) {
        toast(d.onboardingQuest.pickupStepSaveFailed, 'error')
      } else {
        toast(d.common.networkError, 'error')
      }
    }
  }

  /**
   * 실제 드랍 API 대신 호출되는 콜백(`PoiCarouselModal`의 `onDropOverride`). pickup과 달리
   * 성공해도 즉시 이동하지 않는다 — "놓인 장면"(방금 드랍한 배지가 목록에 보이는 화면)을
   * 사용자가 보고 나서 직접 카드를 닫아야 홈으로 이동한다(채원 판정 1). 실패하면 false를
   * 돌려줘 확인 단계를 유지하고, 이 함수가 직접 토스트를 띄운다(`PoiCarouselModal`은 결과만
   * await한다 — never throw).
   */
  async function handleDrop(): Promise<boolean> {
    try {
      const res = await fetch('/api/onboarding-quest/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'drop' }),
      })
      if (!res.ok) throw new StepSaveFailedError()
      setDropRecorded(true)
      return true
    } catch (err) {
      if (err instanceof StepSaveFailedError) {
        toast(d.onboardingQuest.dropStepSaveFailed, 'error')
      } else {
        toast(d.common.networkError, 'error')
      }
      return false
    }
  }

  /** 카드 닫기(X·배경 탭) — drop 기록이 끝난 뒤에만 홈으로 이동한다(채원 판정 1). */
  function handleCarouselClose() {
    if (mode === 'drop' && dropRecorded) {
      router.push('/')
      return
    }
    setCarouselOpen(false)
  }

  return (
    <div className="absolute inset-0">
      {/* 배경 — 임시 배경은 단색만(그라데이션·블러 금지, 사용자 결정 2). */}
      {VIRTUAL_MAP_IMAGE_SRC ? (
        <SafeImage
          src={VIRTUAL_MAP_IMAGE_SRC}
          alt=""
          containerClassName="absolute inset-0"
          className="object-cover"
          fallback={<div className="absolute inset-0 bg-surface-elevated" aria-hidden="true" />}
        />
      ) : (
        <div className="absolute inset-0 bg-surface-elevated" aria-hidden="true" />
      )}

      {/* 정지 마커 — 좌 33%/상 67%(이미지 좌하단 1/3, 사용자 결정 4). 펄스 모션 없음. */}
      <button
        type="button"
        onClick={() => setCarouselOpen(true)}
        aria-label={d.onboardingQuest.pickupMarkerLabel}
        className="absolute flex flex-col items-center gap-1"
        style={{ left: '33%', top: '67%', transform: 'translate(-50%, -50%)', minWidth: 44, minHeight: 44 }}
      >
        <span
          className="flex items-center justify-center rounded-full border-2 border-white shrink-0"
          style={{ width: MARKER_SIZE, height: MARKER_SIZE, background: 'var(--color-primary)' }}
        >
          <svg
            viewBox="0 0 24 24"
            width={MARKER_ICON_SIZE}
            height={MARKER_ICON_SIZE}
            fill="#ffffff"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: BADGE_FILL_PATH }}
          />
        </span>
        <span className="px-2 py-1 rounded-[var(--radius-tags)] bg-black/70 text-white text-[length:var(--text-body)] font-bold whitespace-nowrap">
          {d.onboardingQuest.pickupMarkerLabel}
        </span>
      </button>

      {carouselOpen && (
        <PoiCarouselModal
          pois={[DEMO_PICKUP_POI]}
          initialPoiId={DEMO_PICKUP_POI.id}
          userLat={0}
          userLng={0}
          onClose={handleCarouselClose}
          onCenterChange={() => {}}
          onDropOrPickupSuccess={() => {}}
          demoMode
          // 채원 판정 2: drop 차례는 3단계에서 주운 연출 드랍을 다시 보여주지 않고 빈 목록에서
          // 시작한다 — 이미 남아 있으면 픽업이 반영되지 않은 것처럼 보인다.
          initialDropsCache={{ [DEMO_PICKUP_POI.id]: mode === 'drop' ? [] : [DEMO_PICKUP_DROP] }}
          onPickupOverride={mode === 'pickup' ? handlePickup : undefined}
          demoDropItems={mode === 'drop' ? [DEMO_DROP_ITEM] : undefined}
          onDropOverride={mode === 'drop' ? handleDrop : undefined}
        />
      )}
    </div>
  )
}
