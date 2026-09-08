'use client'

/**
 * 판정 시뮬레이션 패널 — 저장 전 실제 발급/달성 엔진으로 조건을 미리 돌려본다.
 * 배지 폼(`BadgeForm.tsx`, 티켓 20260908_1554)에서 처음 만들었고, 미션 폼
 * (`mission_type='engine_condition'` 전용, 티켓 20260908_1632)이 같은 UI를 재사용하도록
 * 이 컴포넌트로 뽑았다 — 어드민이 배지·미션에서 서로 다른 UI를 다시 학습하지 않는다.
 *
 * 대상은 "기존 유저로 시험" 또는 "가상 활동으로 시험"(`VirtualActivityForm` 재사용, 티켓
 * 20260908_1631) 중 하나로 고른다 — 배지 폼이 쓰던 대상 선택 UI를 그대로 옮겼다. 이 패널을
 * 재사용하는 화면은 모두 자동으로 두 방식을 다 갖게 된다(의도된 부수 효과 — 호출하는 API
 * 라우트가 `virtualActivity` 바디를 처리하지 못하면 그 탭에서 에러만 날 뿐, 별도로 막지 않는다).
 *
 * 저장 버튼과 완전히 별개이며 저장하지 않아도 언제든 실행할 수 있다. DB에는 아무것도
 * 쓰지 않는다(dry run 전용, 호출하는 API 라우트 쪽 계약).
 */
import { useCallback, useState } from 'react'
import VirtualActivityForm, { type VirtualActivityValue } from '@/components/admin/VirtualActivityForm'

/** 배지·미션 시뮬레이션 API 공통 응답 (`@/lib/admin/conditionSimulation`의 `SimulateConditionResult`) */
interface SimulateConditionResult {
  result: { pass: boolean; reason: string; actual: string; required: string }
  kind: 'pass' | 'blocked' | 'unmet'
  fieldBlockedReason: string | null
  activityCount: number
  anchorDate: string | null
  /** 미션 라우트 전용 — 이 조건에 미션 전용 어휘(주간/월간 연속 등)가 섞여 있으면 그 키 목록.
   *  있으면 이 시뮬레이션이 그 부분을 평가하지 않았다는 뜻이라 결과가 실제 판정과 다를 수 있다. */
  missionOnlyKeysPresent?: string[]
}

interface ConditionSimulationPanelProps {
  /** 저장하지 않은 현재 조건값 그대로 서버에 보낸다(JSON 직렬화 가능한 값) */
  condition: unknown
  /** 호출할 시뮬레이션 API 경로 — 배지/미션이 각자의 라우트를 넘긴다 */
  apiPath: string
  /** Radix Select 포털 컨테이너 — 가상 활동 폼 안의 Select를 상위 테마 스코프에 렌더링하기 위함
   *  (BadgeForm 등 shadcn 테마 스코프가 있는 화면에서 넘긴다. 없으면 기본 body에 렌더링) */
  themeContainer?: HTMLElement | null
}

export default function ConditionSimulationPanel({ condition, apiPath, themeContainer }: ConditionSimulationPanelProps) {
  const [simOpen, setSimOpen] = useState(false)
  const [simTargetMode, setSimTargetMode] = useState<'user' | 'virtual'>('user')
  const [simUserQuery, setSimUserQuery] = useState('')
  const [simUsers, setSimUsers] = useState<{ id: string; email: string; username: string | null }[]>([])
  const [simUserId, setSimUserId] = useState('')
  const [simUserLoading, setSimUserLoading] = useState(false)
  const [simVirtualActivity, setSimVirtualActivity] = useState<VirtualActivityValue | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)
  const [simResult, setSimResult] = useState<SimulateConditionResult | null>(null)

  const searchSimUsers = useCallback(async () => {
    const q = simUserQuery.trim()
    if (!q) return
    setSimUserLoading(true)
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSimUsers(data.users ?? [])
    } finally {
      setSimUserLoading(false)
    }
  }, [simUserQuery])

  const runConditionSimulation = async () => {
    if (simTargetMode === 'user' && !simUserId) {
      setSimError('먼저 대상 유저를 선택해주세요.')
      return
    }
    if (simTargetMode === 'virtual' && !simVirtualActivity) {
      setSimError('먼저 가상 활동을 입력해주세요.')
      return
    }
    setSimError(null)
    setSimLoading(true)
    setSimResult(null)
    try {
      const body =
        simTargetMode === 'user'
          ? { condition, userId: simUserId }
          : {
              condition,
              virtualActivity: simVirtualActivity
                ? {
                    activityType: simVirtualActivity.activityType,
                    distanceKm: simVirtualActivity.distanceKm,
                    movingTimeSec: simVirtualActivity.movingTimeSec,
                    elevationGainM: simVirtualActivity.elevationGainM,
                    averageSpeedKmh: simVirtualActivity.averageSpeedKmh,
                    startDate: simVirtualActivity.startDate,
                    route: simVirtualActivity.route,
                    ...simVirtualActivity.extended,
                  }
                : null,
              repeatCount: simVirtualActivity?.repeatCount ?? 1,
            }
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '시뮬레이션 실패')
      setSimResult(data as SimulateConditionResult)
    } catch (err) {
      setSimError(err instanceof Error ? err.message : '시뮬레이션 중 오류가 발생했습니다.')
    } finally {
      setSimLoading(false)
    }
  }

  const selectedSimUser = simUsers.find((u) => u.id === simUserId)

  return (
    <div className="border border-border rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">판정 시뮬레이션</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            저장하지 않은 지금 조건값 그대로, 선택한 대상에 대입해 발급 엔진 판정 결과를
            미리 확인해요. 저장은 되지 않아요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSimOpen((v) => !v)}
          className="shrink-0 bg-muted text-foreground text-sm px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
        >
          {simOpen ? '접기' : '시뮬레이션 실행'}
        </button>
      </div>

      {simOpen && (
        <div className="space-y-3">
          {/* 대상 선택 방식 — 기존 유저 검색 / 가상 활동 입력(티켓 20260908_1631) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSimTargetMode('user')}
              className={`flex-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                simTargetMode === 'user' ? 'bg-primary text-white font-semibold' : 'bg-muted text-foreground hover:bg-accent'
              }`}
            >
              기존 유저로 시험
            </button>
            <button
              type="button"
              onClick={() => setSimTargetMode('virtual')}
              className={`flex-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                simTargetMode === 'virtual' ? 'bg-primary text-white font-semibold' : 'bg-muted text-foreground hover:bg-accent'
              }`}
            >
              가상 활동으로 시험
            </button>
          </div>

          {simTargetMode === 'user' && (
            <>
              <div className="flex gap-2">
                <input
                  value={simUserQuery}
                  onChange={(e) => setSimUserQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      searchSimUsers()
                    }
                  }}
                  placeholder="이메일 또는 이름으로 대상 유저 검색"
                  className="flex-1 bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
                <button
                  type="button"
                  onClick={searchSimUsers}
                  disabled={simUserLoading || !simUserQuery.trim()}
                  className="bg-muted text-foreground text-sm px-3 py-2 rounded-lg hover:bg-accent disabled:opacity-50 transition-colors shrink-0"
                >
                  {simUserLoading ? '검색 중...' : '검색'}
                </button>
              </div>

              {simUsers.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {simUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSimUserId(u.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        simUserId === u.id ? 'bg-primary/20 text-foreground' : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <span className="font-medium">{u.username ?? u.email}</span>
                      <span className="text-xs text-foreground/60 ml-2">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedSimUser && (
                <p className="text-xs text-foreground">
                  대상 유저: <strong>{selectedSimUser.username ?? selectedSimUser.email}</strong> ({selectedSimUser.email})
                </p>
              )}
            </>
          )}

          {simTargetMode === 'virtual' && (
            <VirtualActivityForm onActivityChange={setSimVirtualActivity} themeContainer={themeContainer} />
          )}

          <button
            type="button"
            onClick={runConditionSimulation}
            disabled={simLoading || (simTargetMode === 'user' ? !simUserId : !simVirtualActivity)}
            className="bg-primary text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {simLoading
              ? '판정 중...'
              : simTargetMode === 'user'
                ? '이 유저로 판정하기'
                : '이 가상 활동으로 판정하기'}
          </button>

          {simError && <p className="text-sm text-red-600">{simError}</p>}

          {simResult && (
            <div
              className={`rounded-xl border p-3 space-y-1.5 ${
                simResult.kind === 'pass'
                  ? 'border-green-300 bg-green-50'
                  : simResult.kind === 'blocked'
                    ? 'border-red-300 bg-red-50'
                    : 'border-amber-300 bg-amber-50'
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  simResult.kind === 'pass'
                    ? 'text-green-900'
                    : simResult.kind === 'blocked'
                      ? 'text-red-900'
                      : 'text-amber-900'
                }`}
              >
                {simResult.kind === 'pass'
                  ? '판정 통과 — 이 유저는 이 조건으로 발급 가능해요'
                  : simResult.kind === 'blocked'
                    ? '구조적으로 차단됨 — 활동과 무관하게 영원히 발급될 수 없어요'
                    : '조건 미충족 — 아직 활동이 이 조건에 못 미쳐요'}
              </p>
              <p className="text-xs text-foreground/80">사유: {simResult.result.reason}</p>
              {simResult.fieldBlockedReason && (
                <p className="text-xs text-red-800">{simResult.fieldBlockedReason}</p>
              )}
              <p className="text-xs text-foreground/80">
                실제값: {simResult.result.actual} / 필요값: {simResult.result.required}
              </p>
              <p className="text-xs text-muted-foreground">
                대입한 활동 {simResult.activityCount}건
                {simResult.anchorDate && ` · 가입 앵커 ${simResult.anchorDate.slice(0, 10)} 이후`}
              </p>
              {simResult.missionOnlyKeysPresent && simResult.missionOnlyKeysPresent.length > 0 && (
                <p className="text-xs text-amber-800">
                  이 조건에는 미션 전용 어휘({simResult.missionOnlyKeysPresent.join(', ')})가 포함돼 있어
                  이 시뮬레이션이 그 부분을 평가하지 못해요 — 실제 미션 판정 결과와 다를 수 있어요.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
