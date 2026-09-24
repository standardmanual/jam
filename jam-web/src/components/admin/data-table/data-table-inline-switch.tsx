'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/admin/ui/switch'

interface InlineSwitchCellProps {
  checked: boolean
  /** 서버 반영. 실패하면 throw — 메시지는 이 컴포넌트가 토스트로 띄운다 */
  onCheckedChange: (next: boolean) => Promise<void>
  /** 등급 2 확인창 등, 반영 전에 거쳐야 할 게이트. false를 돌려주면 아무 것도 바꾸지 않는다 */
  beforeChange?: (next: boolean) => Promise<boolean>
  label: string
}

/**
 * 표 안에서 바로 반영되는 스위치(티켓 20260924_0940, 상위 티켓 §1-7a). 누르면 낙관적으로
 * 바로 바뀐 값을 보여주고, 성공하면 `router.refresh()`로 서버 값을 다시 읽는다. 실패하면
 * 원래 값으로 되돌리고 토스트로 안내한다. `beforeChange`는 끄는 쪽이 등급 2인 메뉴(배지·
 * 트라이브·미션 숨김·POI 등)가 확인창을 여는 자리다 — 여기서 값을 바로 바꾸지 않는다.
 */
export function InlineSwitchCell({ checked, onCheckedChange, beforeChange, label }: InlineSwitchCellProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [localChecked, setLocalChecked] = useState(checked)
  const [prevChecked, setPrevChecked] = useState(checked)

  // 서버 값(checked prop)이 바뀌면(router.refresh() 반영 등) 로컬 표시도 맞춘다 —
  // BadgesTable.tsx의 prevBadges와 같은 "렌더 중 상태 조정" 패턴.
  if (checked !== prevChecked) {
    setPrevChecked(checked)
    setLocalChecked(checked)
  }

  const handleChange = async (next: boolean) => {
    if (beforeChange) {
      const proceed = await beforeChange(next)
      if (!proceed) return
    }
    setLocalChecked(next)
    setPending(true)
    try {
      await onCheckedChange(next)
      router.refresh()
    } catch (error) {
      setLocalChecked(!next)
      toast.error(error instanceof Error ? error.message : '변경에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Switch checked={localChecked} onCheckedChange={handleChange} disabled={pending} aria-label={label} />
  )
}
