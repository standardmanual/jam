'use client'

import { createContext, useContext, useId, useMemo, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/admin/ui/switch'
import { sampleToggleHref } from '@/lib/admin/opsHome/links'

/**
 * 시험 묶음 스위치 (티켓 20261006_1339 ②-a, 채원 판정 「S1·S4 두 화면 공통 규칙」). 운영 홈(S1)과 일정표(S4)가 머리 오른쪽 같은 자리에 쓴다.
 *
 * - 값은 URL `?sample=1`뿐이다(꺼짐이면 키가 없다, localStorage를 쓰지 않는다). 바꾸면 `router.replace`로 `sample`만 붙이고 빼며 다른 쿼리 키는 유지한다.
 * - 라벨 안에 스위치를 넣어 눌리는 영역을 `min-h-11`(44px)로 잡고, 켜짐·꺼짐을 글자로도 적는다(색·위치만으로 나누지 않는다).
 * - 바꾸는 동안(서버가 새로 그리는 동안)에는 스위치를 끄고, `OpsSampleBusy`로 감싼 아래 영역을 `aria-busy` + `opacity-60`으로 흐리게 한다.
 *   `OpsSampleScope`가 그 둘이 같은 전환 상태를 보게 이어 준다. 모션을 줄이는 설정이면 흐려지는 전환 효과는 없다.
 * - 도움말: 시험 묶음을 켜도 슬랙은 어떤 경우에도 가지 않는다. 시험 묶음이 하나도 없으면 스위치 옆에 알린다.
 */

interface OpsSampleScopeValue {
  pending: boolean
  start: (callback: () => void) => void
}

const OpsSampleScopeContext = createContext<OpsSampleScopeValue | null>(null)

/** 스위치와 아래 영역이 같은 전환 상태를 보게 하는 틀. DOM을 만들지 않는다. */
export function OpsSampleScope({ children }: { children: ReactNode }) {
  const [pending, start] = useTransition()
  const value = useMemo(() => ({ pending, start }), [pending, start])
  return <OpsSampleScopeContext.Provider value={value}>{children}</OpsSampleScopeContext.Provider>
}

/** 스위치가 바뀌는 동안 흐려지고 `aria-busy`가 되는 영역(`OpsSampleScope` 안에서만 흐려진다). */
export function OpsSampleBusy({ children, className }: { children: ReactNode; className?: string }) {
  const pending = useContext(OpsSampleScopeContext)?.pending ?? false
  return (
    <div
      aria-busy={pending}
      className={cn('transition-opacity duration-200 motion-reduce:transition-none', pending && 'opacity-60', className)}
    >
      {children}
    </div>
  )
}

export const OPS_SAMPLE_SWITCH_LABEL = '시험 묶음 포함해서 보기'
export const OPS_SAMPLE_SWITCH_STATE = { on: '켜짐', off: '꺼짐' } as const
export const OPS_SAMPLE_SWITCH_HELP = '슬랙은 어떤 경우에도 가지 않아요'
export const OPS_SAMPLE_NONE_NOTE = '지금 시험 묶음이 없어요'

interface OpsSampleSwitchProps {
  /** 지금 시험 묶음을 포함해서 보는가(서버가 `?sample=1`을 읽어 넘긴다). */
  includeSample: boolean
  /** 시험 묶음 개수. 0이면 스위치 옆에 「지금 시험 묶음이 없어요」를 보인다. 모르면 비운다. */
  sampleBundleCount?: number
  className?: string
}

export function OpsSampleSwitch({ includeSample, sampleBundleCount, className }: OpsSampleSwitchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scope = useContext(OpsSampleScopeContext)
  const [ownPending, ownStart] = useTransition()
  const pending = scope ? scope.pending : ownPending
  const start = scope ? scope.start : ownStart
  const switchId = useId()
  const helpId = useId()

  const change = (next: boolean) => {
    start(() => {
      router.replace(sampleToggleHref(pathname, searchParams?.toString() ?? '', next), { scroll: false })
    })
  }

  return (
    <div className={cn('flex flex-col items-start gap-0.5 sm:items-end', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={switchId} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          {OPS_SAMPLE_SWITCH_LABEL}
          <Switch
            id={switchId}
            checked={includeSample}
            disabled={pending}
            aria-describedby={helpId}
            onCheckedChange={change}
          />
          {/* 스위치가 켜짐·꺼짐을 읽어 주므로 보이는 글자는 보조 기기에서 숨긴다(두 번 읽히지 않게). */}
          <span aria-hidden="true" className="min-w-8 text-muted-foreground">
            {includeSample ? OPS_SAMPLE_SWITCH_STATE.on : OPS_SAMPLE_SWITCH_STATE.off}
          </span>
        </label>
        {sampleBundleCount === 0 && <span className="text-sm text-muted-foreground">{OPS_SAMPLE_NONE_NOTE}</span>}
      </div>
      <p id={helpId} className="text-xs text-muted-foreground">
        {OPS_SAMPLE_SWITCH_HELP}
      </p>
    </div>
  )
}
