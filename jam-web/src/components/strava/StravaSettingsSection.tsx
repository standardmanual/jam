'use client'

import Button from '@/components/ui/Button'
import LocalDate from '@/components/LocalDate'
import { d } from '@/lib/i18n'
import type { StravaUiState } from '@/lib/strava/connection-state'

/** 구획을 그리는 상태 — none은 그리지 않는다(홈과 상단 메뉴가 이미 CTA를 갖고 있다) */
export type StravaSettingsState = Exclude<StravaUiState, 'none'>

interface StravaSettingsSectionProps {
  state: StravaSettingsState
  /** 마지막 동기화 시각(ISO). connected일 때만 보조 줄로 보인다 */
  lastSyncedAt: string | null
  /** «동기화 끊기»를 눌렀을 때 — 확인 시트를 연다 */
  onDisconnect: () => void
}

/**
 * 프로필 설정 «Strava 동기화» 구획 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17).
 *
 * 카드 틀·구분선 없이 기존 «라벨, 값» 입력 구획(`text-base text-muted` 라벨)과 같은 문법이다.
 * 상태 문구는 connected·끊김(오류)·끊김(유저가 직접 끊음) 셋이고, 버튼은 Button outline 전체 폭이다.
 * 「다시 동기화」는 OAuth 전체 페이지 이동이다. 구획만 따로 깜빡이지 않도록 호출부가 사용자 정보와 같은 시점에 받은
 * 값으로만 그린다. 구획 문구가 바뀔 때 높이를 고정하지 않고 한 번에 바뀐다.
 */
export default function StravaSettingsSection({ state, lastSyncedAt, onDisconnect }: StravaSettingsSectionProps) {
  const copy = d.stravaConnection.settings
  const statusText =
    state === 'connected'
      ? copy.connected
      : state === 'disconnected_error'
        ? copy.disconnectedError
        : copy.disconnectedByUser

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-muted break-keep wrap-break-word">{copy.label}</p>
      <p className="text-base break-keep wrap-break-word text-pretty">{statusText}</p>
      {state === 'connected' && lastSyncedAt && (
        <p className="text-xs text-muted break-keep wrap-break-word">
          {d.auth.stravaLastSyncedLabel} <LocalDate iso={lastSyncedAt} korean={{ year: true, time: true }} />
        </p>
      )}
      {state === 'connected' ? (
        <Button variant="outline" fullWidth onClick={onDisconnect}>
          {copy.disconnectButton}
        </Button>
      ) : (
        <Button
          variant="outline"
          fullWidth
          onClick={() => {
            window.location.href = '/api/strava/auth'
          }}
        >
          {copy.reconnectButton}
        </Button>
      )}
    </div>
  )
}
