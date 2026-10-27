/**
 * 항목 서랍의 접힘을 모두 펼친 모양으로 바꾸는 시험용 대체품 (티켓 20261026_2024 2회차).
 *
 * 서랍(`OpsItemDetail`)의 접힘 안쪽(내용 전체·제출 원본·결정 기록·검수 자세히)은 닫혀 있으면 서버 렌더에 나오지 않는다.
 * 안쪽 문장을 확인하는 시험 파일이 `vi.mock('@/components/admin/ui/accordion', () => import('./accordionOpen'))`로 이 파일을 쓴다.
 * 서랍의 접힘 값(`DRAWER_VALUES`)만 펼치고, 그 밖의 접힘(결정 패널의 「종류별로 고르기」 등)은 실제 동작대로 닫아 둔다.
 * 기본이 접힘이라는 사실은 `drawer.test.tsx`가 실제 접힘으로 따로 확인한다.
 */
import { createContext, useContext, type ReactNode } from 'react'

const DRAWER_VALUES = ['content', 'original', 'history', 'review-detail']

const OpenContext = createContext(false)

export function Accordion({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}

export function AccordionItem({ children, className, value }: { children?: ReactNode; className?: string; value?: string }) {
  return (
    <OpenContext.Provider value={value !== undefined && DRAWER_VALUES.includes(value)}>
      <div className={className}>{children}</div>
    </OpenContext.Provider>
  )
}

export function AccordionTrigger({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <button type="button" className={className}>
      {children}
    </button>
  )
}

export function AccordionContent({ children }: { children?: ReactNode }) {
  const open = useContext(OpenContext)
  return open ? <div>{children}</div> : null
}
