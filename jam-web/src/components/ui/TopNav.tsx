'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { TopNav as DsTopNav } from '@ds/components/navigation/TopNav'

/**
 * SuperHi Plus 상단 네비게이션 (iOS HIG Navigation Bar 패턴)
 *
 * 20260820_009: 실연결 — `@ds/components/navigation/TopNav`(모듈러 캐노니컬 스펙)를
 * 내부에서 렌더링하고, Next.js 전용 라우팅(backHref → router.push)과 서비스 타이틀
 * 크기(16px, 일반체)만 이 래퍼에서 매핑한다.
 *
 * backHref를 그대로 ds에 전달하지 않는 이유: `badges/[id]/page.tsx` 등 6개 호출처가
 * 서버 컴포넌트라 함수 prop(onBack)을 직접 정의해 넘길 수 없다 — 대신 이 파일이
 * 'use client' 경계에서 backHref(string, 직렬화 가능)를 받아 router.push로 변환한
 * onBack을 만들어 ds에 넘긴다. 이 과정에서 <Link>의 prefetch/우클릭-새탭 열기 같은
 * 앵커 시맨틱은 사라지고 button 기반 프로그래매틱 이동으로 바뀐다(뒤로가기 버튼이라
 * 실사용 영향은 낮다고 판단 — 완료 기록 참고).
 *
 * - 배경: 기본값 --color-bg. 페이지 캔버스가 --color-surface인 화면은 `headerStyle`로
 *   덮어써 맞춘다(예: headerStyle={{ background: 'var(--color-surface)' }}) / 텍스트: --color-text
 * - elevation: 보더/드롭섀도 없음(20260816_012) — 헤더와 본문 배경톤 차이만으로 구분
 * - 뒤로가기: backHref가 있으면 router.push(backHref), 없으면 onBack ?? router.back()
 * - 터치 영역: chevron / rightSlot 모두 최소 44×44pt
 */
export interface TopNavProps {
  title: string
  /** 커스텀 뒤로가기 핸들러. 미지정 시 router.back() */
  onBack?: () => void
  /** 명시적 경로가 있으면 router.push로 이동 (onBack보다 우선) */
  backHref?: string
  /** 우측 액션 슬롯 (버튼/링크 등). 44×44pt는 슬롯 내부에서 보장할 것 */
  rightSlot?: ReactNode
  /**
   * 뒤로가기 노출 여부. 기본 true.
   * 탭바로 직접 진입하는 루트 화면(예: 본인 프로필)에서는 false로 두어
   * 되돌아갈 곳이 없는 chevron이 뜨지 않게 합니다.
   */
  showBack?: boolean
  /** header 엘리먼트에 적용할 인라인 스타일. bg/color 오버라이드에 사용. */
  headerStyle?: React.CSSProperties
}

export default function TopNav({ title, onBack, backHref, rightSlot, showBack = true, headerStyle }: TopNavProps) {
  const router = useRouter()

  const handleBack = backHref ? () => router.push(backHref) : (onBack ?? (() => router.back()))

  return (
    <DsTopNav
      title={title}
      showBack={showBack}
      onBack={handleBack}
      rightSlot={rightSlot}
      titleSize="var(--text-body)"
      titleWeight="var(--weight-body)"
      titleLineHeight="var(--leading-body)"
      titleTracking="normal"
      style={headerStyle}
    />
  )
}
