'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'
import { hasStravaDuplicateParam, urlWithoutStravaParam } from '@/lib/strava/duplicate-param'

interface StravaDuplicateSheetViewProps {
  open: boolean
  onClose: () => void
}

/**
 * 중복 연결 안내 시트의 겉모습 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17).
 *
 * BottomSheet(compact) + Button(primary main, 전체 폭) 조합이다. 버튼은 «취소» 하나뿐이다 —
 * 기존 계정을 지우고 새로 시작하는 버튼은 계정 삭제(상위 티켓 20261017_1420 묶음 6)가 구현된 뒤에 잇는다. 시트 바깥 탭·아래로 끌기·Escape도
 * «취소»와 같은 결과(닫기)이고 서버 호출은 없다.
 *
 * 문구는 3~4문장 안내라 가운데가 아니라 왼쪽 정렬이다. 마지막 문장은 새로 시작하는 버튼이 없다는 사실을
 * 향후 약속 없이 알린다.
 */
export function StravaDuplicateSheetView({ open, onClose }: StravaDuplicateSheetViewProps) {
  const copy = d.stravaConnection.duplicateSheet

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      detent="compact"
      title={copy.title}
      footer={
        <Button fullWidth variant="primary" surface="main" onClick={onClose}>
          {copy.cancel}
        </Button>
      }
    >
      <div className="flex flex-col gap-2 px-4 py-6 text-left">
        {copy.body.map((line) => (
          <p key={line} className="text-base text-foreground break-keep wrap-break-word text-pretty">
            {line}
          </p>
        ))}
      </div>
    </BottomSheet>
  )
}

/**
 * `(main)/layout.tsx`가 `StravaConnectReveal` 옆에 두는 중복 연결 안내. 콜백이 `/profile?strava=duplicate`로
 * 보내면 `profile/page.tsx`가 `strava` 값을 `/{username}`으로 넘기고, 이 시트는 목적지가 어디든 연다.
 * 열리자마자 주소에서 `strava` 값을 지운다(`StravaConnectReveal`의 `strava=error` 처리와 같은 방식).
 * 그래서 새로고침해도 다시 열리지 않는다.
 */
export default function StravaDuplicateSheet() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasParam = hasStravaDuplicateParam(searchParams)

  const [open, setOpen] = useState(hasParam)
  const [seenParam, setSeenParam] = useState(hasParam)

  // 레이아웃은 클라이언트 내비게이션에서 다시 마운트되지 않는다 — 파라미터가 새로 실리면 렌더 중에 연다.
  // 이펙트에서 setState하면 캐스케이딩 렌더가 된다(`TopNavDataProvider`와 같은 파생 상태 갱신).
  if (hasParam !== seenParam) {
    setSeenParam(hasParam)
    if (hasParam) setOpen(true)
  }

  // 새로고침·뒤로가기로 시트가 다시 뜨지 않도록 URL에서 값을 지운다. 시트는 이미 열린 상태(open)다.
  useEffect(() => {
    if (!hasParam) return
    router.replace(urlWithoutStravaParam(pathname, searchParams), { scroll: false })
  }, [hasParam, pathname, searchParams, router])

  return <StravaDuplicateSheetView open={open} onClose={() => setOpen(false)} />
}
