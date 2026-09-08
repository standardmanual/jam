'use client'

import { useState } from 'react'
import {
  IconDeviceGamepad2,
  IconCircleCheck,
  IconMapPin,
  IconTag,
  IconBook,
  IconCircleX,
} from '@tabler/icons-react'
import VirtualActivityForm, { type VirtualActivityValue } from '@/components/admin/VirtualActivityForm'

/**
 * 가상 활동 입력 폼(GPX 업로드·수치 직접입력·활동 종류·반복 횟수·확장 필드)은
 * `VirtualActivityForm`으로 뽑혀 나갔다(티켓 20260908_1631) — 배지 조건 사전 시뮬레이션의
 * "가상 활동으로 시험" 경로에서도 같은 컴포넌트를 재사용한다. 이 페이지는 대상 유저 선택 +
 * 실행 + 결과 표시만 담당한다.
 */

interface SimulateResult {
  parsed: {
    distanceKm: number
    durationMin: number
    elevationGainM: number
    averageSpeedKmh: number
    trackpointCount: number
    extended?: Partial<Record<string, number>>
  }
  badgesEarned: { id: string; name: string; rarity: string; reason: string }[]
  badgesMissed: { id: string; name: string; reason: string; actual: string; required: string }[]
  poisMatched: { id: string; name: string }[]
  itemDrop: { badgeName: string; rarity: string } | null
  itemBooksCompleted: { bookName: string; rewardBadgeName: string | null }[]
  applied: boolean
}

const EXTENDED_LABEL: Record<string, { label: string; unit: string }> = {
  avgHeartrateBpm: { label: '평균 심박수', unit: 'bpm' },
  avgWatts: { label: '평균 파워', unit: 'W' },
  avgCadence: { label: '평균 케이던스', unit: '' },
  maxSpeedKmh: { label: '최고 속도', unit: 'km/h' },
  maxElevationM: { label: '최고 도달 고도', unit: 'm' },
  elapsedTimeSec: { label: '경과 시간', unit: '초' },
}

const rarityColors: Record<string, string> = {
  common: 'text-foreground',
  rare: 'text-blue-600',
  epic: 'text-violet-600',
  mystic: 'text-amber-600',
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic',
}

export default function SimulatorPage() {
  // Select 드롭다운(Radix Portal)은 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다 (4단계a `BadgeForm.tsx`와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [activity, setActivity] = useState<VirtualActivityValue | null>(null)
  const [userId, setUserId] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [users, setUsers] = useState<{ id: string; email: string; username: string | null }[]>([])
  const [userLoading, setUserLoading] = useState(false)
  const [firstSync, setFirstSync] = useState(false)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

  const handleUserSearch = async () => {
    if (!userSearch.trim()) return
    setUserLoading(true)
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(userSearch)}`)
      const data = await res.json()
      setUsers(data.users ?? [])
    } finally {
      setUserLoading(false)
    }
  }

  const runSimulate = async (dryRun: boolean) => {
    if (!activity) return
    if (!userId) {
      setSimError('대상 유저를 선택하세요.')
      return
    }
    setSimError(null)
    setSimLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          dryRun,
          firstSync,
          activity: {
            activityType: activity.activityType,
            distanceKm: activity.distanceKm,
            movingTimeSec: activity.movingTimeSec,
            elevationGainM: activity.elevationGainM,
            averageSpeedKmh: activity.averageSpeedKmh,
            startDate: activity.startDate,
            route: activity.route,
            ...activity.extended,
          },
          repeatCount: activity.repeatCount,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '시뮬레이션 실패')
      setResult(data)
    } catch (err) {
      setSimError(err instanceof Error ? err.message : '시뮬레이션 중 오류가 발생했습니다.')
    } finally {
      setSimLoading(false)
    }
  }

  const selectedUser = users.find((u) => u.id === userId)

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-8">시뮬레이터</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* 입력 패널 */}
        <div className="space-y-5">
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">대상 유저</h2>
            <div className="flex gap-2">
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUserSearch()}
                placeholder="이메일 또는 이름 검색"
                className="flex-1 bg-white border border-border rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={handleUserSearch}
                disabled={userLoading}
                className="bg-muted text-foreground px-4 py-2 rounded-xl text-sm hover:bg-accent disabled:opacity-50 transition-colors"
              >
                {userLoading ? '...' : '검색'}
              </button>
            </div>
            {users.length > 0 && (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setUserId(u.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      userId === u.id
                        ? 'bg-primary/20 text-foreground'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <p className="font-medium">{u.username ?? u.email}</p>
                    <p className="text-xs opacity-60">{u.email}</p>
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
                <p className="text-sm font-medium text-foreground">선택됨: {selectedUser.username ?? selectedUser.email}</p>
                <p className="text-xs text-foreground/60">{selectedUser.email}</p>
              </div>
            )}
          </div>

          {/* 가상 활동 입력 (GPX 업로드 또는 수치 직접입력) */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">가상 활동</h2>
            <VirtualActivityForm onActivityChange={setActivity} themeContainer={themeContainer} />
            <label className="flex items-center gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={firstSync}
                onChange={(e) => setFirstSync(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <span className="text-sm text-foreground">첫 싱크 모드 (Common 배지만 발급)</span>
            </label>
          </div>

          {simError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {simError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => runSimulate(true)}
              disabled={!activity || !userId || simLoading}
              className="flex-1 bg-muted text-foreground font-bold py-3 rounded-xl hover:bg-accent disabled:opacity-40 transition-colors"
            >
              {simLoading ? '실행 중...' : '미리보기 (Dry Run)'}
            </button>
            <button
              onClick={() => runSimulate(false)}
              disabled={!activity || !userId || simLoading}
              className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {simLoading ? '실행 중...' : '실제 적용 (Apply)'}
            </button>
          </div>
        </div>

        {/* 결과 패널 */}
        <div>
          {!result && !simLoading && (
            <div className="h-full flex items-center justify-center text-center">
              <div className="text-muted-foreground">
                <IconDeviceGamepad2 className="mx-auto mb-3 h-12 w-12" />
                <p>가상 활동을 입력하고 유저를 선택한 뒤<br />시뮬레이션을 실행하세요</p>
              </div>
            </div>
          )}

          {simLoading && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p>시뮬레이션 실행 중...</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-white border border-border rounded-2xl p-5 space-y-5 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">시뮬레이션 결과</h2>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  result.applied
                    ? 'bg-primary/20 text-foreground'
                    : 'bg-muted text-foreground'
                }`}>
                  {result.applied ? '실제 적용됨' : 'Dry Run — DB 반영 없음'}
                </span>
              </div>

              {/* 평가에 실린 확장 필드 — 입력이 실제로 반영됐는지 확인한다 */}
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                  확장 필드
                </p>
                {!result.parsed.extended || Object.keys(result.parsed.extended).length === 0 ? (
                  <p className="text-muted-foreground text-xs">입력한 확장 필드 없음</p>
                ) : (
                  <ul className="space-y-1 font-mono text-xs">
                    {Object.entries(result.parsed.extended).map(([key, value]) => (
                      <li key={key}>
                        <span className="text-muted-foreground">
                          {EXTENDED_LABEL[key]?.label ?? key}:
                        </span>{' '}
                        <span className="text-foreground">
                          {value}
                          {EXTENDED_LABEL[key]?.unit ?? ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 배지 획득 */}
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                  배지 획득 ({result.badgesEarned.length}개)
                </p>
                {result.badgesEarned.length === 0 ? (
                  <p className="text-muted-foreground text-xs">획득 가능한 배지 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {result.badgesEarned.map((b) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <IconCircleCheck className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">{b.name}</span>
                        <span className={`text-xs ${rarityColors[b.rarity] ?? 'text-muted-foreground'}`}>
                          ({RARITY_LABEL[b.rarity] ?? b.rarity})
                        </span>
                        <span className="text-muted-foreground text-xs ml-auto">{b.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* POI 매칭 */}
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                  POI 매칭 ({result.poisMatched.length}개)
                </p>
                {result.poisMatched.length === 0 ? (
                  <p className="text-muted-foreground text-xs">통과한 POI 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {result.poisMatched.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <IconMapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 아이템 드랍 */}
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                  아이템 드랍
                </p>
                {result.itemDrop ? (
                  <div className="flex items-center gap-2">
                    <IconTag className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{result.itemDrop.badgeName}</span>
                    <span className={`text-xs ${rarityColors[result.itemDrop.rarity] ?? 'text-muted-foreground'}`}>
                      ({RARITY_LABEL[result.itemDrop.rarity] ?? result.itemDrop.rarity})
                    </span>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">드랍 없음</p>
                )}
              </div>

              {/* 아이템북 완성 */}
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                  컬렉션 완성 ({result.itemBooksCompleted.length}개)
                </p>
                {result.itemBooksCompleted.length === 0 ? (
                  <p className="text-muted-foreground text-xs">완성된 컬렉션 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {result.itemBooksCompleted.map((book, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <IconBook className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{book.bookName}</span>
                        {book.rewardBadgeName && (
                          <span className="text-foreground text-xs">→ {book.rewardBadgeName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 미획득 배지 */}
              {result.badgesMissed.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">
                    미획득 배지 ({result.badgesMissed.length}개)
                  </p>
                  <div className="space-y-1.5">
                    {result.badgesMissed.map((b) => (
                      <div key={b.id} className="flex items-start gap-2">
                        <IconCircleX className="h-4 w-4 shrink-0 text-red-600" />
                        <div>
                          <span className="font-medium text-foreground">{b.name}</span>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {b.reason}: {b.actual} / {b.required} 필요
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
