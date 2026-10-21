'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import { pushTabBarHidden } from '@/lib/uiOverlay'
import { d } from '@/lib/i18n'
import { stravaDuplicateMode, urlWithoutStravaParam, type StravaDuplicateMode } from '@/lib/strava/duplicate-param'
import {
  STRAVA_REPLACE_DONE_PATH,
  STRAVA_RESTART_PATH,
  requestStravaReplace,
  runStravaReplace,
  type StravaReplaceNotice,
} from '@/lib/strava/replace-client'

interface StravaDuplicateSheetViewProps {
  open: boolean
  /** offer: «취소»와 «그래도 연결하기». blocked: «닫기»와 «문의하기» */
  mode: StravaDuplicateMode
  /** 서버 처리 중이면 취소가 막히고 시트 닫기(바깥 탭·아래로 끌기·Escape)도 막힌다. offer 모양에서만 쓴다 */
  submitting: boolean
  /** 실패 안내. 서버가 완성한 문장이다. 없으면 null. offer 모양에서만 보인다 */
  notice: StravaReplaceNotice | null
  onClose: () => void
  onConfirm: () => void
  onInquire: () => void
  /** «Strava 다시 동기화하기» — 연결 요청이 닫혔을 때 처음부터 다시 진행한다 */
  onRestart: () => void
}

/** 버튼 한 쌍의 공통 클래스. `StravaDisconnectSheet`·`WithdrawSheet`의 푸터와 같다 */
const FOOTER_BUTTON = 'px-3! whitespace-nowrap'

/**
 * 중복 연결 안내 시트의 겉모습 (티켓 20261021_1249 4회, 채원 사전 판정 2026-10-22).
 *
 * 재사용만 한다: BottomSheet(compact) + Button(secondary, danger, primary main, outline) + InlineNotice. 새 토큰·새 부품·새 클래스가 없다.
 * 한 시트가 두 모양이다. offer는 «취소»(secondary)와 «그래도 연결하기»(danger)를 같은 폭·같은 높이로 나란히 둔다(가이드 5.2).
 * 확인 문구 입력칸이 없다: 두 번째 버튼 누름이 확인이다. 기존 계정의 이름·사진·수치는 보이지 않는다.
 * blocked는 «닫기»(secondary)와 «문의하기»(primary main) 둘이고 danger 버튼이 없다. 막힌 까닭은 문구에 쓰지 않는다.
 * 본문은 3문장 안내라 가운데가 아니라 왼쪽 정렬이고 가장자리는 제목과 같은 px-6이다.
 *
 * 제출 중에는 확정 버튼이 loading이고 라벨이 «연결하는 중»(5.3)이며 취소가 막히고 시트 닫기가 막힌다.
 * 실패 안내는 푸터 맨 위에 InlineNotice 한 블록으로 보이고 애니메이션이 없다. restart 안내에는 «Strava 다시 동기화하기»(outline)가 붙고
 * «그래도 연결하기»는 disabled이다(연결 요청이 닫혀 다시 눌러도 소용이 없다). retry 안내에서는 확정 버튼이 켜져 있다.
 * `footerBottomInset="safe-area"`를 쓰므로 열려 있는 동안 컨테이너가 `pushTabBarHidden()`을 부른다.
 */
export function StravaDuplicateSheetView({
  open,
  mode,
  submitting,
  notice,
  onClose,
  onConfirm,
  onInquire,
  onRestart,
}: StravaDuplicateSheetViewProps) {
  const copy = d.stravaConnection.duplicateSheet
  const blocked = mode === 'blocked'
  const body = blocked ? copy.blockedBody : copy.offerBody

  return (
    <BottomSheet
      open={open}
      // 제출 중에는 어떤 경로로도 닫히지 않는다 — 서버 처리 중에 시트가 사라지면 결과를 알 수 없다
      onClose={submitting ? () => {} : onClose}
      detent="compact"
      title={copy.title}
      footerBottomInset="safe-area"
      footer={
        blocked ? (
          <div className="flex gap-4">
            <Button fullWidth variant="secondary" className={FOOTER_BUTTON} onClick={onClose}>
              {copy.close}
            </Button>
            <Button fullWidth variant="primary" surface="main" className={FOOTER_BUTTON} onClick={onInquire}>
              {d.voc.inquireCta}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {notice && (
              <InlineNotice
                action={
                  notice.next === 'restart' ? (
                    <Button variant="outline" fullWidth onClick={onRestart}>
                      {d.stravaConnection.settings.reconnectButton}
                    </Button>
                  ) : undefined
                }
              >
                {notice.message}
              </InlineNotice>
            )}
            <div className="flex gap-4">
              <Button fullWidth variant="secondary" className={FOOTER_BUTTON} onClick={onClose} disabled={submitting}>
                {copy.cancel}
              </Button>
              <Button
                fullWidth
                variant="danger"
                className={FOOTER_BUTTON}
                loading={submitting}
                disabled={notice?.next === 'restart'}
                onClick={onConfirm}
              >
                {submitting ? copy.confirming : copy.confirm}
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-2 px-6 pb-6 text-left">
        {body.map((line) => (
          <p key={line} className="text-base text-foreground break-keep wrap-break-word text-pretty">
            {line}
          </p>
        ))}
      </div>
    </BottomSheet>
  )
}

/**
 * `(main)/layout.tsx`가 `StravaConnectReveal` 옆에 두는 중복 연결 안내. 콜백이 `/profile?strava=duplicate` 또는 `?strava=duplicate_blocked`로
 * 보내면 `profile/page.tsx`가 `strava` 값을 `/{username}`으로 넘기고, 이 시트는 목적지가 어디든 연다.
 * 열리자마자 주소에서 `strava` 값을 지운다(`StravaConnectReveal`의 `strava=error` 처리와 같은 방식). 그래서 새로고침해도 다시 열리지 않는다.
 * 시트 모양(offer·blocked)은 열릴 때 주소 값으로 정하고, 주소 값이 지워진 뒤에도 상태로 남는다. 실행 중에 서버가 `blocked`를 알리면 blocked로 바뀐다.
 *
 * «취소»·«닫기»·시트 닫기는 서버를 부르지 않는다. «그래도 연결하기»는 `POST /api/strava/replace`이고, 호출·중복 탭 막기·성공 뒤 이동은
 * `lib/strava/replace-client.ts`의 `runStravaReplace`가 맡는다(단위 시험으로 고정). 성공하면 시트를 «연결하는 중» 상태 그대로 두고
 * `window.location.replace`로 도착 화면으로 이동한다(닫으면 새 연결이 반영되기 전의 화면이 잠깐 비친다).
 */
export default function StravaDuplicateSheet() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paramMode = stravaDuplicateMode(searchParams)

  const [open, setOpen] = useState(paramMode !== null)
  const [mode, setMode] = useState<StravaDuplicateMode>(paramMode ?? 'offer')
  const [seenParamMode, setSeenParamMode] = useState(paramMode)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<StravaReplaceNotice | null>(null)
  const inFlight = useRef(false)

  // 레이아웃은 클라이언트 내비게이션에서 다시 마운트되지 않는다 — 파라미터가 새로 실리면 렌더 중에 연다.
  // 이펙트에서 setState하면 캐스케이딩 렌더가 된다(`TopNavDataProvider`와 같은 파생 상태 갱신).
  if (paramMode !== seenParamMode) {
    setSeenParamMode(paramMode)
    if (paramMode !== null) {
      setOpen(true)
      setMode(paramMode)
      setNotice(null)
    }
  }

  // 새로고침·뒤로가기로 시트가 다시 뜨지 않도록 URL에서 값을 지운다. 시트는 이미 열린 상태(open)다.
  const hasParam = paramMode !== null
  useEffect(() => {
    if (!hasParam) return
    router.replace(urlWithoutStravaParam(pathname, searchParams), { scroll: false })
  }, [hasParam, pathname, searchParams, router])

  // 시트가 열려 있는 동안 플로팅 탭바를 물리적으로 숨긴다(`footerBottomInset="safe-area"`와 짝, 닫히면 정리 함수가 복원)
  useEffect(() => {
    if (!open) return
    return pushTabBarHidden()
  }, [open])

  function handleConfirm() {
    void runStravaReplace({
      inFlight,
      request: () => requestStravaReplace(),
      setSubmitting,
      setNotice,
      onBlocked: () => setMode('blocked'),
      redirect: () => window.location.replace(STRAVA_REPLACE_DONE_PATH),
    })
  }

  return (
    <StravaDuplicateSheetView
      open={open}
      mode={mode}
      submitting={submitting}
      notice={notice}
      onClose={() => setOpen(false)}
      onConfirm={handleConfirm}
      onInquire={() => {
        // 시트는 레이아웃에 상시 마운트돼 있어 닫지 않고 이동하면 문의 화면 위에 남는다
        setOpen(false)
        router.push('/voc')
      }}
      onRestart={() => {
        window.location.href = STRAVA_RESTART_PATH
      }}
    />
  )
}
