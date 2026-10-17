'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { requestStravaDisconnect, runStravaDisconnect } from '@/lib/strava/disconnect-client'

interface StravaDisconnectSheetProps {
  open: boolean
  onClose: () => void
  /** 끊기에 성공했을 때(이미 끊긴 연결 포함) — 설정 화면이 구획을 «끊었어요» 상태로 바꾼다 */
  onDisconnected?: () => void
}

interface StravaDisconnectSheetViewProps {
  open: boolean
  /** 서버 처리 중이면 두 버튼이 막히고 시트 닫기(바깥 탭·아래로 끌기·Escape)도 막힌다 */
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}

/**
 * 끊기 확인 시트의 겉모습 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17).
 *
 * 재사용만 한다: BottomSheet(compact) + Button(secondary 취소, danger 확정). 새 토큰·새 부품이 없다.
 * `OnboardingQuestSkipSheet`와 같은 버튼 배치이며 취소와 확정의 시각 무게는 같다(가이드 5.2).
 * danger 글자는 `--foreground`다(흰 글자 3.57:1 금지 — Button 주석). 본문은 3문장이라 가운데가 아니라 왼쪽 정렬이다.
 * 제출 중 확정 버튼은 loading이고 라벨이 «동기화 끊는 중»이다(5.3). 닫힘 트랜지션은 BottomSheet가 DOM에 남겨 처리한다.
 */
export function StravaDisconnectSheetView({ open, submitting, onClose, onConfirm }: StravaDisconnectSheetViewProps) {
  const copy = d.stravaConnection.disconnectSheet

  return (
    <BottomSheet
      open={open}
      // 제출 중에는 어떤 경로로도 닫히지 않는다 — 서버 처리 중에 시트가 사라지면 결과를 알 수 없다
      onClose={submitting ? () => {} : onClose}
      detent="compact"
      title={copy.title}
      footer={
        <div className="flex gap-4">
          <Button
            fullWidth
            variant="secondary"
            className="px-3! whitespace-nowrap"
            onClick={onClose}
            disabled={submitting}
          >
            {copy.cancel}
          </Button>
          <Button
            fullWidth
            variant="danger"
            className="px-3! whitespace-nowrap"
            loading={submitting}
            onClick={onConfirm}
          >
            {submitting ? copy.confirming : copy.confirm}
          </Button>
        </div>
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
 * 프로필 설정의 «동기화 끊기» 확인 시트.
 *
 * 확정은 `POST /api/strava/disconnect`다. 성공(404 포함)이면 시트를 닫고 토스트를 띄운 뒤 `router.refresh()`로
 * 서버 화면(상단 메뉴·홈)이 새 상태를 읽게 한다. 프로필 설정은 클라이언트가 읽은 값이라 구획은 `onDisconnected`로
 * 직접 «끊었어요» 상태로 바꾼다. 실패면 시트를 유지하고 토스트로 알린다. 호출·중복 클릭 막기는
 * `lib/strava/disconnect-client.ts`의 `runStravaDisconnect`가 맡는다(단위 시험으로 고정).
 */
export default function StravaDisconnectSheet({ open, onClose, onDisconnected }: StravaDisconnectSheetProps) {
  const copy = d.stravaConnection.disconnectSheet
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const { toast } = useToast()
  const router = useRouter()

  function handleConfirm() {
    void runStravaDisconnect({
      inFlight,
      request: () => requestStravaDisconnect(),
      setSubmitting,
      onSuccess: () => {
        onClose()
        onDisconnected?.()
        toast(copy.successToast, 'success')
        router.refresh()
      },
      onError: () => toast(copy.errorToast, 'error'),
    })
  }

  return (
    <StravaDisconnectSheetView open={open} submitting={submitting} onClose={onClose} onConfirm={handleConfirm} />
  )
}
