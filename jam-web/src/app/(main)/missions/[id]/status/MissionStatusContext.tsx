'use client'

import { createContext, useContext } from 'react'
import type { MissionType } from '@/types/database'
import type { StatusResponse } from './missionStatusTypes'

/**
 * 미션 현황 화면의 응답 상태 (티켓 20261127_1145).
 * 티켓 틀(`BadgeTicket`)은 서버 컴포넌트라 «내 요약»(photo 슬롯)과 «목록 카드»(body 슬롯)가 각각 클라이언트 조각이다.
 * 두 조각이 한 번만 fetch하도록 `MissionStatusClient`가 요청을 맡고 이 컨텍스트로 나눠 준다.
 */
export interface MissionStatusState {
  data: StatusResponse | null
  error: string | null
  /** 지연 후 노출 정책(`useDebouncedLoading`)을 지난 로딩 표시 여부 */
  showLoader: boolean
  missionType: MissionType
}

export const MissionStatusContext = createContext<MissionStatusState | null>(null)

export function useMissionStatus(): MissionStatusState {
  const value = useContext(MissionStatusContext)
  if (!value) throw new Error('useMissionStatus는 MissionStatusClient 안에서만 쓸 수 있어요')
  return value
}
