'use client'

/**
 * 판정 시뮬레이션 패널 — 저장 전 실제 발급/달성 엔진으로 조건을 미리 돌려본다.
 * 배지 폼(`BadgeForm.tsx`, 티켓 20260908_1554)에서 처음 만들었고, 미션 폼
 * (`mission_type='engine_condition'` 전용, 티켓 20260908_1632)이 같은 UI를 재사용하도록
 * 이 컴포넌트로 뽑았다 — 어드민이 배지·미션에서 서로 다른 UI를 다시 학습하지 않는다.
 *
 * 저장 버튼과 완전히 별개이며 저장하지 않아도 언제든 실행할 수 있다. DB에는 아무것도
 * 쓰지 않는다(dry run 전용, 호출하는 API 라우트 쪽 계약).
 */
import { useCallback, useState } from 'react'

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
}

export default function ConditionSimulationPanel({ condition, apiPath }: ConditionSimulationPanelProps) {
  const [simOpen, setSimOpen] = useState(false)
  const [simUserQuery, setSimUserQuery] = useState('')
  const [simUsers, setSimUsers] = useState<{ id: string; email: string; username: string | null }[]>([])
  const [simUserId, setSimUserId] = useState('')
  const [simUserLoading, setSimUserLoading] = useState(false)
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
    if (!simUserId) {
      setSimError('먼저 대상 유저를 선택해주세요.')
      return
    }
    setSimError(null)
    setSimLoading(true)
    setSimResult(null)
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition, userId: simUserId }),
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
            저장하지 않은 지금 조건값 그대로, 선택한 유저의 실제 활동 이력에 대입해
            발급 엔진 판정 결과를 미리 확인해요. 저장은 되지 않아요.
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

          <button
            type="button"
            onClick={runConditionSimulation}
            disabled={simLoading || !simUserId}
            className="bg-primary text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {simLoading ? '판정 중...' : '이 유저로 판정하기'}
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
