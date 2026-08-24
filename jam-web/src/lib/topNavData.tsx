'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * TopNav 3분할 확장(20260824_010)에서 서비스 래퍼 `src/components/ui/TopNav.tsx`가
 * 중앙 슬롯(스트라바 동기화 버튼)·우측 슬롯(프로필 아바타)을 채우는 데 필요한 로그인
 * 유저 데이터.
 *
 * `TopNav`는 페이지 트리 깊숙한 곳(배지 상세, 미션 상세 등 서버 컴포넌트) 여러 곳에서
 * 호출된다. 호출부마다 avatar_url·username·스트라바 연동 여부를 각각 조회해 prop으로
 * 내려주게 하면 호출부 전부를 고쳐야 하므로, `(main)/layout.tsx`(서버 컴포넌트, 이미
 * 로그인 유저를 조회 중)가 한 번만 조회해 이 컨텍스트로 감싸고 `TopNav`는 여기서
 * 읽어 스스로 채운다("서비스 래퍼에서 기본 주입" — 20260824_010 1.5단계 판정).
 *
 * 20260824_021: 알림 종의 빨간 버블(`hasUnreadNotifications`)도 같은 경로로 내려준다.
 */
export interface TopNavData {
  /** 로그인 유저의 username. 프로필 아바타 클릭 시 `/{username}`으로 이동하는 데 사용 */
  username: string | null
  /** 로그인 유저의 프로필 이미지 URL. 없으면 TopNav가 placeholder 아이콘을 보여준다 */
  avatarUrl: string | null
  /** 로그인 유저의 스트라바 연동 여부. false면 동기화 버튼이 연결 플로우로 이동한다 */
  stravaConnected: boolean
  /** `bumps_badge=true`인 안 읽은 소식이 하나라도 있는가 — 알림 종의 빨간 버블 */
  hasUnreadNotifications: boolean
}

export interface TopNavContextValue extends TopNavData {
  /**
   * 알림함 진입 시 버블을 끈다.
   *
   * (main) 레이아웃은 클라이언트 내비게이션에서 다시 렌더되지 않으므로(라우터 캐시),
   * 서버가 내려준 초기값만으로는 "종을 눌러 다 읽었는데 버블이 남아 있는" 상태가 된다.
   */
  clearNotificationDot: () => void
  /**
   * 버블을 서버가 내려준 값으로 되돌린다.
   *
   * 종을 누른 순간 낙관적으로 껐는데(clearNotificationDot) 알림함 조회가 실패하면,
   * 보여주지도 못한 소식이 읽음 처리된 것처럼 보인다. 서버 seen_at은 그대로라
   * 다음 하드 로드에서 자가 복구되지만, 클라이언트 내비게이션에서는
   * `serverDot !== value.hasUnreadNotifications` 조건이 성립하지 않아
   * (양쪽 다 true로 안 바뀜) 버블이 계속 꺼진 채 남는다. 실패 지점이 직접 되돌린다.
   */
  restoreNotificationDot: () => void
}

const defaultValue: TopNavContextValue = {
  username: null,
  avatarUrl: null,
  stravaConnected: false,
  hasUnreadNotifications: false,
  clearNotificationDot: () => {},
  restoreNotificationDot: () => {},
}

const TopNavDataContext = createContext<TopNavContextValue>(defaultValue)

export function TopNavDataProvider({ value, children }: { value: TopNavData; children: ReactNode }) {
  const [dot, setDot] = useState(value.hasUnreadNotifications)
  const [serverDot, setServerDot] = useState(value.hasUnreadNotifications)

  // 서버가 새 값을 내려주면(하드 내비게이션·router.refresh) 그 값으로 되돌린다.
  // 렌더 중 파생 상태 갱신 — 이펙트로 미루면 한 프레임 동안 옛 값이 보인다.
  if (serverDot !== value.hasUnreadNotifications) {
    setServerDot(value.hasUnreadNotifications)
    setDot(value.hasUnreadNotifications)
  }

  const clearNotificationDot = useCallback(() => setDot(false), [])
  const restoreNotificationDot = useCallback(
    () => setDot(value.hasUnreadNotifications),
    [value.hasUnreadNotifications]
  )

  const ctx = useMemo<TopNavContextValue>(
    () => ({
      username: value.username,
      avatarUrl: value.avatarUrl,
      stravaConnected: value.stravaConnected,
      hasUnreadNotifications: dot,
      clearNotificationDot,
      restoreNotificationDot,
    }),
    [
      value.username,
      value.avatarUrl,
      value.stravaConnected,
      dot,
      clearNotificationDot,
      restoreNotificationDot,
    ]
  )

  return <TopNavDataContext.Provider value={ctx}>{children}</TopNavDataContext.Provider>
}

export function useTopNavData(): TopNavContextValue {
  return useContext(TopNavDataContext)
}
