'use client'

import { useId, useState, type FormEvent } from 'react'
import { Input } from '@ds/components/forms/Input'
import { Button } from '@ds/components/buttons/Button'
import SwapText from '@/components/ui/SwapText'
import JamBalance from '@/components/jam/JamBalance'
import { d, t } from '@/lib/i18n'
import { defaultFillAmount, maxFillAmount, parseFillAmount, sanitizeFillInput } from '@/lib/jam/jam-fill'

/**
 * 잼 채우기 입력 — 캡슐과 잠긴 아이템 배지가 같이 쓰는 입력 단계 (티켓 20261018_0054, 운영 로직 7.2절)
 *
 * 같은 동작이 두 곳에서 다르면 안 되므로 한 컴포넌트로 둔다. 어느 API를 부를지는 호출부가 `onConfirm`에 담아 넘긴다.
 *  - 가진 잼을 다시 보여 준다(가진 잼이 보이는 세 곳 중 하나).
 *  - 숫자 입력창의 기본값은 `min(남은 양, 가진 잼)`이다. 줄일 수 있고, 상한(남은 양과 가진 잼 중 작은 쪽)을 넘기면 상한으로 맞춘다.
 *  - 입력이 비었거나 0이면 «채우기»를 막는다. 제출 중에는 «채우는 중»으로 바뀌고 다시 누를 수 없다.
 * 호출부는 이 패널을 조건부로 그려(단계 전환·시트가 열릴 때마다) 열릴 때마다 기본값에서 시작하게 한다.
 * 바깥 아래 여백(시트 바닥과의 간격)은 호출부가 정한다 — 패널 아래에 «취소» 같은 보조 동작이 붙는 곳이 있다.
 */
interface Props {
  /** 남은 양(서버가 준 값) */
  remaining: number
  /** 가진 잼(서버가 준 값) */
  balance: number
  /** 1 이상의 정수로 확인된 채울 양 */
  onConfirm: (amount: number) => void
  /** 제출 중 — 버튼이 «채우는 중»으로 바뀌고 입력과 제출을 막는다 */
  pending: boolean
}

export default function JamFillPanel({ remaining, balance, onConfirm, pending }: Props) {
  const hintId = useId()
  const max = maxFillAmount(remaining, balance)
  const initial = defaultFillAmount(remaining, balance)
  const [value, setValue] = useState(initial > 0 ? String(initial) : '')

  const amount = parseFillAmount(value)
  const canSubmit = amount !== null && amount <= max && !pending

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (canSubmit && amount !== null) onConfirm(amount)
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 pb-2 pt-2 flex flex-col gap-4">
      <JamBalance balance={balance} />

      {/* 높이 48px 이상(터치 영역·iOS 입력). DS Input의 기본 높이는 44px이라 클래스로 올린다 */}
      <Input
        value={value}
        onChange={(e) => setValue(sanitizeFillInput(e.target.value, max))}
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        disabled={pending}
        aria-label={d.capsule.fill.amountLabel}
        aria-describedby={hintId}
        className="h-12! tabular-nums"
      />

      <p
        id={hintId}
        className="m-0 break-keep wrap-break-word text-pretty text-sm text-foreground"
      >
        {amount === null ? d.capsule.fill.hintInvalid : t(d.capsule.fill.hint, { n: amount.toLocaleString('ko-KR') })}
      </p>

      <Button type="submit" variant="primary" fullWidth disabled={!canSubmit} aria-busy={pending || undefined} className="whitespace-nowrap">
        <SwapText value={pending ? d.capsule.fill.submitting : d.capsule.fill.submit} />
      </Button>
    </form>
  )
}
