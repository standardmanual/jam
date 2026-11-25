'use client'

import { useEffect } from 'react'
import { installAppHistoryTracker } from '@/lib/appHistory'

/**
 * 서비스·어드민 공통 앱 내 히스토리 추적기 (티켓 20261125_1136).
 * 루트 레이아웃(`app/layout.tsx`)에 한 번 마운트되어 화면을 그리지 않고 히스토리 깊이만 기록한다.
 */
export function AppHistoryTracker() {
  useEffect(() => installAppHistoryTracker(), [])
  return null
}
