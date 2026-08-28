'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { TopNav as DsTopNav } from '@ds/components/navigation/TopNav'
import { useTopNavData } from '@/lib/topNavData'
import SyncButton from '@/components/SyncButton'
import Button from '@/components/ui/Button'
import NotificationBell from '@/components/ui/NotificationBell'
import { UserIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

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
 *
 * 20260824_021: 알림 종 주입 — 우측 슬롯 합성(`rightSlot = <>{호출부 값}{알림 종}</>`).
 * 종을 **뒤에** 붙여야 아바타 바로 왼쪽에 온다. 노출 범위는 화면 목록을 하드코딩하지 않고
 * **"back chevron이 없는 루트 화면"**(`logo` 또는 `showBack={false}`)이라는 규칙으로 판정한다 —
 * 호출부를 손대지 않아도 되고, 나중에 루트 화면이 늘어나도 알아서 따라온다(PRD §6-4).
 *
 * 20260824_010: 전 페이지 3분할 확장 — 이 래퍼가 로그인 유저 컨텍스트(`useTopNavData`,
 * `(main)/layout.tsx`가 주입)를 읽어 중앙 슬롯(스트라바 동기화 버튼)과 우측 아바타
 * 슬롯을 호출부 변경 없이 자동으로 채운다("서비스 래퍼에서 기본 주입" 판정). 호출부는
 * 필요 시 `logo` prop만 추가로 넘기면 된다(탭 최상위 목록 페이지용, 로고로 back+title
 * 대체). `/drops`·본인 프로필처럼 TopNav 자체를 렌더링하지 않는 화면은 영향 없음.
 */
export interface TopNavProps {
  title?: string
  /** 커스텀 뒤로가기 핸들러. 미지정 시 router.back() */
  onBack?: () => void
  /** 명시적 경로가 있으면 router.push로 이동 (onBack보다 우선) */
  backHref?: string
  /** 우측 액션 슬롯 (버튼/링크 등). 44×44pt는 슬롯 내부에서 보장할 것. 아바타보다 앞에 놓인다. */
  rightSlot?: ReactNode
  /**
   * 뒤로가기 노출 여부. 기본 true.
   * 탭바로 직접 진입하는 루트 화면(예: 본인 프로필)에서는 false로 두어
   * 되돌아갈 곳이 없는 chevron이 뜨지 않게 합니다.
   */
  showBack?: boolean
  /** header 엘리먼트에 적용할 인라인 스타일. bg/color 오버라이드에 사용. */
  headerStyle?: React.CSSProperties
  /**
   * true면 좌측에 back+title 대신 Jam 로고를 노출한다(탭 최상위 목록 페이지 전용:
   * 홈/배지/미션/인벤토리). title/showBack/onBack/backHref는 이때 무시된다.
   */
  logo?: boolean
}

export default function TopNav({ title = '', onBack, backHref, rightSlot, showBack = true, headerStyle, logo = false }: TopNavProps) {
  const router = useRouter()
  const { username, avatarUrl, stravaConnected } = useTopNavData()

  const handleBack = backHref ? () => router.push(backHref) : (onBack ?? (() => router.back()))
  const profileHref = username ? `/${username}` : '/profile'

  // 알림 종은 **TopNav가 렌더되는 모든 화면**에 붙는다 (20260825 확정).
  // centerSlot(동기화)·avatarSlot(프로필)이 조건 없이 항상 렌더되므로 종만 화면마다
  // 나타났다 사라지면 우측 구성이 들쭉날쭉해진다. 셋을 한 세트로 묶어 일관되게 둔다.
  // 호출부가 rightSlot을 쓰는 화면(예: 배지 상세 공유 버튼)은 [공유버튼][종][아바타]가 된다.
  // TopNav 자체를 렌더링하지 않는 /drops는 자연히 제외된다.
  const composedRightSlot = (
    <>
      {rightSlot}
      <NotificationBell />
    </>
  )

  // 20260828_1548: 베타테스트 VOC 임시 채널 — 로고 옆에 작은 '문의' 버튼을 붙여 /voc로 이동.
  // 로고가 노출되는 탭 최상위 화면(logo=true)에만 자연히 노출된다.
  const logoSlot = logo ? (
    <>
      <Image src="/jam-logo-white.png" alt="JAM!" width={2238} height={925} className="h-[26px] w-auto" priority />
      <Button variant="outline" surface="main" size="xs" onClick={() => router.push('/voc')}>
        {d.voc.inquiryButton}
      </Button>
    </>
  ) : null

  // 미연동 유저도 동기화 버튼을 항상 본다 — 누르면 스트라바 연결 플로우(OAuth 시작 라우트)로
  // 이동한다. 연동 유저는 기존 SyncButton과 동일하게 수동 동기화를 트리거한다(20260824_010).
  const centerSlot = stravaConnected ? (
    <SyncButton username={username} />
  ) : (
    <Button
      variant="outline"
      surface="sub"
      size="xs"
      style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-base-white)' }}
      onClick={() => {
        window.location.href = '/api/strava/auth'
      }}
    >
      {d.today.syncButton}
    </Button>
  )

  const avatarSlot = (
    <Link
      href={profileHref}
      aria-label={d.profile.title}
      className="w-11 h-11 rounded-[var(--radius-pill)] flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-100"
    >
      {avatarUrl ? (
        <Image src={avatarUrl} alt={d.profile.avatarAlt} width={36} height={36} className="w-9 h-9 rounded-[var(--radius-pill)] object-cover" />
      ) : (
        <span className="w-9 h-9 rounded-[var(--radius-pill)] bg-surface-elevated text-text flex items-center justify-center">
          <UserIcon className="w-4 h-4" />
        </span>
      )}
    </Link>
  )

  return (
    <DsTopNav
      title={title}
      showBack={logo ? false : showBack}
      onBack={handleBack}
      rightSlot={composedRightSlot}
      logoSlot={logoSlot}
      centerSlot={centerSlot}
      avatarSlot={avatarSlot}
      titleSize="var(--text-body)"
      titleWeight="var(--weight-body)"
      titleLineHeight="var(--leading-body)"
      titleTracking="normal"
      style={headerStyle}
    />
  )
}
