'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import {
  CONFLICT_RELOAD_LABEL,
  RELOAD_FAILED_MESSAGE,
  SAVE_FAILED_KEEP_NOTE,
  SAVE_FAILED_TITLE,
  UNSAVED_CHIP_LABEL,
} from '@/lib/admin/opsInbox/balance/settings'

/**
 * 운영 설정(S7)의 카드들이 함께 쓰는 부품 (티켓 20260930_1459 조각 C). 밸런스 규칙 카드(`OpsRuleCard`)에서 꺼냈고, 신호 기준값 카드(`OpsSignalCard`)도 같은 것을 쓴다.
 * 동작과 문구는 꺼내기 전과 같다(밸런스 카드의 기존 테스트가 그대로 통과한다).
 * - `UnsavedChip`: 「저장 전」 칩(1818의 「수정됨」과 같은 모양)
 * - `SaveFailureAlerts`: 저장 실패·충돌(409)·최신 값 불러오기 실패 알림 묶음
 * - `useFlash`: 저장 성공 뒤 1.2초 잔상
 * - `judgeFailedResponse`: 실패 응답을 알림과 칸별 오류로 가르는 판정
 * - `NoticeCard`: 구역 조회 실패·빈 상태 안내 카드(아이콘은 구역마다 다르다)
 */

export const FLASH_MS = 1200

export function UnsavedChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
      {UNSAVED_CHIP_LABEL}
    </span>
  )
}

/** 카드 안에 보이는 실패 알림의 종류. */
export type CardFailure = { kind: 'error'; message: string } | { kind: 'conflict' } | { kind: 'reload' }

/**
 * 저장 실패 응답을 가른다. 409는 충돌 알림이고, 400 `fieldErrors`는 칸 아래 오류가 된다(칸에 붙지 않는 값 전체의 오류 `value`는 카드 알림으로도 알린다).
 * 그 밖의 실패(서버 오류·네트워크 끊김)는 서버 문장 그대로 알림이다.
 */
export function judgeFailedResponse(res: { status: number; error: string; fieldErrors: Record<string, string> }): {
  failure: CardFailure | null
  fieldErrors: Record<string, string>
} {
  if (res.status === 409) return { failure: { kind: 'conflict' }, fieldErrors: {} }
  if (res.status === 400 && Object.keys(res.fieldErrors).length > 0) {
    return { failure: res.fieldErrors.value ? { kind: 'error', message: res.fieldErrors.value } : null, fieldErrors: res.fieldErrors }
  }
  return { failure: { kind: 'error', message: res.error }, fieldErrors: {} }
}

/** 저장 성공 뒤 잠깐(1.2초) 카드에 잔상을 주는 상태. `start()`를 부르면 켜지고 시간이 지나면 꺼진다. */
export function useFlash(): { flash: boolean; start: () => void } {
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flash])
  return { flash, start: () => setFlash(true) }
}

export interface SaveFailureAlertsProps {
  failure: CardFailure | null
  /** 409 문장(규칙마다 다르다: 「이 규칙이…」「이 신호의 기준값이…」). */
  conflictMessage: string
  /** 최신 값을 다시 읽는 중. */
  reloading: boolean
  onReload: () => void
}

/**
 * 실패 알림: 저장 실패는 붉은 알림(「저장하지 못했어요」 + 서버 문장 + 「입력한 값은 그대로 있어요」), 충돌·불러오기 실패는 경고 알림(문장 +
 * [최신 값 불러오기]). 실패가 없으면 아무것도 그리지 않는다.
 */
export function SaveFailureAlerts({ failure, conflictMessage, reloading, onReload }: SaveFailureAlertsProps) {
  if (failure?.kind === 'error') {
    return (
      <Alert variant="destructive">
        <IconAlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>{SAVE_FAILED_TITLE}</AlertTitle>
        <AlertDescription>
          <p className="break-words">{failure.message}</p>
          <p className="mt-1">{SAVE_FAILED_KEEP_NOTE}</p>
        </AlertDescription>
      </Alert>
    )
  }
  if (failure?.kind === 'conflict' || failure?.kind === 'reload') {
    return (
      <Alert variant="warning">
        <IconAlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>{SAVE_FAILED_TITLE}</AlertTitle>
        <AlertDescription>
          <p className="break-words">{failure.kind === 'conflict' ? conflictMessage : RELOAD_FAILED_MESSAGE}</p>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" disabled={reloading} onClick={onReload}>
              {CONFLICT_RELOAD_LABEL}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

export interface NoticeCardProps {
  /** 구역 아이콘(장식이라 `aria-hidden`). */
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  title: string
  description: string
  onRetry?: { label: string; run: () => void }
}

/** 구역 조회 실패·빈 상태 안내 카드. 다시 읽을 수 있으면 [새로 고치기] 같은 버튼을 보인다. */
export function NoticeCard({ Icon, title, description, onRetry }: NoticeCardProps) {
  return (
    <Card className="flex flex-col items-start gap-2 p-5">
      <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry.run}>
          {onRetry.label}
        </Button>
      )}
    </Card>
  )
}
