'use client'

import { createContext, useContext, type ReactNode } from 'react'

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
 */
export interface TopNavData {
  /** 로그인 유저의 username. 프로필 아바타 클릭 시 `/{username}`으로 이동하는 데 사용 */
  username: string | null
  /** 로그인 유저의 프로필 이미지 URL. 없으면 TopNav가 placeholder 아이콘을 보여준다 */
  avatarUrl: string | null
  /** 로그인 유저의 스트라바 연동 여부. false면 동기화 버튼이 연결 플로우로 이동한다 */
  stravaConnected: boolean
}

const defaultValue: TopNavData = {
  username: null,
  avatarUrl: null,
  stravaConnected: false,
}

const TopNavDataContext = createContext<TopNavData>(defaultValue)

export function TopNavDataProvider({ value, children }: { value: TopNavData; children: ReactNode }) {
  return <TopNavDataContext.Provider value={value}>{children}</TopNavDataContext.Provider>
}

export function useTopNavData(): TopNavData {
  return useContext(TopNavDataContext)
}
