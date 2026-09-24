'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/admin/ui/input'
import { useListParams } from './use-list-params'

interface DataTableSearchProps {
  placeholder?: string
}

/**
 * URL `q` 파라미터에 0.4초 지연 후 반영되는 검색 입력(티켓 20260924_0940, 상위 티켓 §1-8).
 * 기존 `BadgesFilterBar.tsx`의 디바운스 패턴을 공용화했다 — 타이핑마다 라우팅하면 요청이
 * 과도해지고, 그렇다고 별도 검색 버튼을 두면 공식 Toolbar 패턴과 어긋난다.
 */
export function DataTableSearch({ placeholder }: DataTableSearchProps) {
  const { q, setQ } = useListParams()
  const [value, setValue] = useState(q)
  const [prevQ, setPrevQ] = useState(q)

  // 다른 곳(필터 초기화 등)에서 q가 바뀌면 입력창도 맞춘다 — 렌더 중 상태 조정 패턴
  // (BadgesTable.tsx의 prevBadges와 동일). 디바운스가 직접 반영한 값과는 이미 같으므로
  // 타이핑 중 입력을 덮어쓰지 않는다.
  if (q !== prevQ) {
    setPrevQ(q)
    setValue(q)
  }

  useEffect(() => {
    if (value === q) return
    const timer = setTimeout(() => setQ(value.trim()), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q·setQ까지 deps에 넣으면 반영 직후 재실행돼 타이머가 계속 재설정된다
  }, [value])

  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="h-8 w-[180px] lg:w-[260px]"
    />
  )
}
