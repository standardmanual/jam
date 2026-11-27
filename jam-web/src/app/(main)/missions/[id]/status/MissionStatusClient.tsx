'use client'

import { useEffect, useState, type ReactNode } from 'react'
import TopNav from '@/components/ui/TopNav'
import { d } from '@/lib/i18n'
import type { MissionType } from '@/types/database'
import { useDebouncedLoading } from '@/hooks/useDebouncedLoading'
import { MissionStatusContext } from './MissionStatusContext'
import type { StatusResponse } from './missionStatusTypes'
import styles from './MissionStatus.module.css'

interface Props {
  missionId: string
  missionTitle: string
  displayType: string
  missionType: MissionType
  /** 서버가 그린 티켓 틀(`BadgeTicket`) — photo·body 슬롯의 클라이언트 조각이 이 컨텍스트를 읽는다 */
  children: ReactNode
}

/**
 * 미션 현황 화면의 클라이언트 래퍼 (티켓 20261127_1145) — «fetch + 컨텍스트 + 상단 바»만 맡는다.
 * 화면 모양은 서버가 그리는 `BadgeTicket`과 그 슬롯의 `MissionSummary`·`MissionBoard`가 정한다.
 * 페이지 바탕은 검정 반전 면이고 글자는 --snow다(상단 바가 읽는다). 로딩·오류 중에도 이 바탕이 깔려 번쩍임이 없다.
 */
export default function MissionStatusClient({ missionId, missionType, children }: Props) {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}/status`)
        const json = await res.json()
        if (!alive) return
        if (!res.ok) { setError(json.error ?? d.missions.statusLoadError); return }
        setData(json as StatusResponse)
      } catch {
        if (alive) setError(d.missions.statusLoadError)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [missionId])

  // 빠르게 끝나는 요청(예: 150ms)에도 매번 로더가 스치듯 보이지 않도록 디바운스 적용
  // (NavigationLoader와 동일한 SHOW_DELAY_MS/MIN_VISIBLE_MS/MAX_VISIBLE_MS 정책, 20260908_0544)
  const showLoader = useDebouncedLoading(loading)

  return (
    <MissionStatusContext.Provider value={{ data, error, showLoader, missionType }}>
      <div className={styles.page}>
        <TopNav title={d.missions.backToDetail} headerStyle={{ background: 'transparent' }} />
        {children}
      </div>
    </MissionStatusContext.Provider>
  )
}
