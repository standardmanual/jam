'use client'

import { useState, useRef } from 'react'

type ActivityType = 'cycling' | 'running' | 'road_running' | 'trail_running' | 'hiking' | 'walking'

interface GpxParsed {
  distanceKm: number
  durationMin: number
  elevationGainM: number
  averageSpeedKmh: number
  trackpointCount: number
  startDate: string
  startLat: number
  startLng: number
  route: [number, number][]
  fileName: string
}

interface SimulateResult {
  parsed: {
    distanceKm: number
    durationMin: number
    elevationGainM: number
    averageSpeedKmh: number
    trackpointCount: number
  }
  badgesEarned: { id: string; name: string; rarity: string; reason: string }[]
  badgesMissed: { id: string; name: string; reason: string; actual: string; required: string }[]
  poisMatched: { id: string; name: string }[]
  itemDrop: { badgeName: string; rarity: string } | null
  itemBooksCompleted: { bookName: string; rewardBadgeName: string | null }[]
  applied: boolean
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function parseGpx(text: string, fileName: string): GpxParsed {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')
  const trkpts = Array.from(doc.querySelectorAll('trkpt'))

  if (trkpts.length === 0) throw new Error('트랙포인트가 없습니다. 유효한 GPX 파일인지 확인하세요.')

  const route: [number, number][] = trkpts.map((pt) => [
    parseFloat(pt.getAttribute('lat') ?? '0'),
    parseFloat(pt.getAttribute('lon') ?? '0'),
  ])

  // 거리 계산 (Haversine 누적)
  let distanceM = 0
  for (let i = 1; i < route.length; i++) {
    distanceM += haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1])
  }
  const distanceKm = Math.round(distanceM / 10) / 100

  // 이동 시간 계산
  const firstTime = trkpts[0].querySelector('time')?.textContent
  const lastTime = trkpts[trkpts.length - 1].querySelector('time')?.textContent
  let durationMin = 0
  let startDate = new Date().toISOString()
  if (firstTime && lastTime) {
    startDate = firstTime
    durationMin = Math.round((new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 60000)
  }

  // 고도 상승 계산
  let elevationGainM = 0
  const eles = trkpts.map((pt) => {
    const ele = pt.querySelector('ele')?.textContent
    return ele ? parseFloat(ele) : null
  })
  for (let i = 1; i < eles.length; i++) {
    const prev = eles[i - 1]
    const curr = eles[i]
    if (prev !== null && curr !== null && curr > prev) {
      elevationGainM += curr - prev
    }
  }
  elevationGainM = Math.round(elevationGainM)

  // 평균 속도
  const averageSpeedKmh =
    durationMin > 0 ? Math.round((distanceKm / (durationMin / 60)) * 10) / 10 : 0

  return {
    distanceKm,
    durationMin,
    elevationGainM,
    averageSpeedKmh,
    trackpointCount: trkpts.length,
    startDate,
    startLat: route[0][0],
    startLng: route[0][1],
    route,
    fileName,
  }
}

function downsampleRoute(route: [number, number][], maxPoints: number): [number, number][] {
  if (route.length <= maxPoints) return route
  const step = Math.ceil(route.length / maxPoints)
  const sampled: [number, number][] = []
  for (let i = 0; i < route.length; i += step) sampled.push(route[i])
  if (sampled[sampled.length - 1] !== route[route.length - 1]) sampled.push(route[route.length - 1])
  return sampled
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}

const rarityColors: Record<string, string> = {
  common: 'text-white/60',
  rare: 'text-blue-400',
  legendary: 'text-purple-400',
  mythic: 'text-yellow-400',
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', legendary: 'Legend', mythic: 'Mythic',
}

export default function SimulatorPage() {
  const [gpx, setGpx] = useState<GpxParsed | null>(null)
  const [gpxError, setGpxError] = useState<string | null>(null)
  const [activityType, setActivityType] = useState<ActivityType>('cycling')
  const [repeatCount, setRepeatCount] = useState<number>(1)
  const [userId, setUserId] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [users, setUsers] = useState<{ id: string; email: string; username: string | null }[]>([])
  const [userLoading, setUserLoading] = useState(false)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setGpxError(null)
    setGpx(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseGpx(ev.target?.result as string, file.name)
        setGpx(parsed)
      } catch (err) {
        setGpxError(err instanceof Error ? err.message : 'GPX 파싱 실패')
      }
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || !file.name.endsWith('.gpx')) {
      setGpxError('.gpx 파일만 업로드할 수 있습니다.')
      return
    }
    setGpxError(null)
    setGpx(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseGpx(ev.target?.result as string, file.name)
        setGpx(parsed)
      } catch (err) {
        setGpxError(err instanceof Error ? err.message : 'GPX 파싱 실패')
      }
    }
    reader.readAsText(file)
  }

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
    if (!gpx) return
    if (!userId) {
      setSimError('대상 유저를 선택하세요.')
      return
    }
    setSimError(null)
    setSimLoading(true)
    setResult(null)

    try {
      const movingTimeSec = gpx.durationMin * 60

      const res = await fetch('/api/admin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          dryRun,
          activity: {
            activityType,
            distanceKm: gpx.distanceKm,
            movingTimeSec,
            elevationGainM: gpx.elevationGainM,
            averageSpeedKmh: gpx.averageSpeedKmh,
            startDate: gpx.startDate,
            route: downsampleRoute(gpx.route, 5000),
          },
          repeatCount,
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
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">대상 유저</h2>
            <div className="flex gap-2">
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUserSearch()}
                placeholder="이메일 또는 이름 검색"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
              />
              <button
                onClick={handleUserSearch}
                disabled={userLoading}
                className="bg-white/10 text-white px-4 py-2 rounded-xl text-sm hover:bg-white/15 disabled:opacity-50 transition-colors"
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
                        ? 'bg-[#AEEA00]/20 text-[#AEEA00]'
                        : 'hover:bg-white/5 text-white/70'
                    }`}
                  >
                    <p className="font-medium">{u.username ?? u.email}</p>
                    <p className="text-xs opacity-60">{u.email}</p>
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="bg-[#AEEA00]/10 border border-[#AEEA00]/20 rounded-xl px-3 py-2">
                <p className="text-sm font-medium text-[#AEEA00]">선택됨: {selectedUser.username ?? selectedUser.email}</p>
                <p className="text-xs text-[#AEEA00]/60">{selectedUser.email}</p>
              </div>
            )}
          </div>

          {/* GPX 업로드 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">GPX 파일</h2>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-white/40 transition-colors"
            >
              <p className="text-3xl mb-2">📁</p>
              <p className="text-sm text-white/50">
                드래그앤드롭 또는 클릭해서 .gpx 파일 선택
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".gpx"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {gpxError && (
              <p className="text-red-400 text-sm">{gpxError}</p>
            )}

            {gpx && (
              <div className="bg-black/30 rounded-xl p-4 font-mono text-xs space-y-1">
                <p className="text-white/40 mb-2">{gpx.fileName}</p>
                <p><span className="text-white/40">거리:</span> <span className="text-white">{gpx.distanceKm} km</span></p>
                <p><span className="text-white/40">이동 시간:</span> <span className="text-white">{formatDuration(gpx.durationMin)}</span></p>
                <p><span className="text-white/40">고도 상승:</span> <span className="text-white">{gpx.elevationGainM} m</span></p>
                <p><span className="text-white/40">평균 속도:</span> <span className="text-white">{gpx.averageSpeedKmh} km/h</span></p>
                <p><span className="text-white/40">시작 시각:</span> <span className="text-white">{new Date(gpx.startDate).toLocaleString('ko-KR')}</span></p>
                <p><span className="text-white/40">트랙포인트:</span> <span className="text-white">{gpx.trackpointCount.toLocaleString()}개</span></p>
                <p><span className="text-white/40">시작점:</span> <span className="text-white">{gpx.startLat.toFixed(4)}° N, {gpx.startLng.toFixed(4)}° E</span></p>
              </div>
            )}
          </div>

          {/* 활동 설정 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">활동 설정</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-white/60">활동 종류</span>
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as ActivityType)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
                >
                  {(['cycling', 'running', 'road_running', 'trail_running', 'hiking', 'walking'] as ActivityType[]).map((t) => (
                    <option key={t} value={t} className="bg-[#1a1a1a]">{t}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-white/60">활동 횟수 배수</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(parseInt(e.target.value, 10) || 1)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
                />
              </label>
            </div>
          </div>

          {simError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {simError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => runSimulate(true)}
              disabled={!gpx || !userId || simLoading}
              className="flex-1 bg-white/10 text-white font-bold py-3 rounded-xl hover:bg-white/15 disabled:opacity-40 transition-colors"
            >
              {simLoading ? '실행 중...' : '미리보기 (Dry Run)'}
            </button>
            <button
              onClick={() => runSimulate(false)}
              disabled={!gpx || !userId || simLoading}
              className="flex-1 bg-[#AEEA00] text-black font-bold py-3 rounded-xl hover:bg-[#c6ff00] disabled:opacity-40 transition-colors"
            >
              {simLoading ? '실행 중...' : '실제 적용 (Apply)'}
            </button>
          </div>
        </div>

        {/* 결과 패널 */}
        <div>
          {!result && !simLoading && (
            <div className="h-full flex items-center justify-center text-center">
              <div className="text-white/20">
                <p className="text-5xl mb-3">🎮</p>
                <p>GPX를 업로드하고 유저를 선택한 뒤<br />시뮬레이션을 실행하세요</p>
              </div>
            </div>
          )}

          {simLoading && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-white/40">
                <div className="w-8 h-8 border-2 border-[#AEEA00] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p>시뮬레이션 실행 중...</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-5 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">시뮬레이션 결과</h2>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  result.applied
                    ? 'bg-[#AEEA00]/20 text-[#AEEA00]'
                    : 'bg-white/10 text-white/60'
                }`}>
                  {result.applied ? '실제 적용됨' : 'Dry Run — DB 반영 없음'}
                </span>
              </div>

              {/* 배지 발급 */}
              <div>
                <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">
                  배지 발급 ({result.badgesEarned.length}개)
                </p>
                {result.badgesEarned.length === 0 ? (
                  <p className="text-white/30 text-xs">발급 가능한 배지 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {result.badgesEarned.map((b) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <span className="text-green-400">✅</span>
                        <span className="font-medium">{b.name}</span>
                        <span className={`text-xs ${rarityColors[b.rarity] ?? 'text-white/50'}`}>
                          ({RARITY_LABEL[b.rarity] ?? b.rarity})
                        </span>
                        <span className="text-white/30 text-xs ml-auto">{b.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* POI 매칭 */}
              <div>
                <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">
                  POI 매칭 ({result.poisMatched.length}개)
                </p>
                {result.poisMatched.length === 0 ? (
                  <p className="text-white/30 text-xs">통과한 POI 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {result.poisMatched.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span>📍</span>
                        <span className="font-medium">{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 아이템 드랍 */}
              <div>
                <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">
                  아이템 드랍
                </p>
                {result.itemDrop ? (
                  <div className="flex items-center gap-2">
                    <span>🏷️</span>
                    <span className="font-medium">{result.itemDrop.badgeName}</span>
                    <span className={`text-xs ${rarityColors[result.itemDrop.rarity] ?? 'text-white/50'}`}>
                      ({RARITY_LABEL[result.itemDrop.rarity] ?? result.itemDrop.rarity})
                    </span>
                  </div>
                ) : (
                  <p className="text-white/30 text-xs">드랍 없음</p>
                )}
              </div>

              {/* 아이템북 완성 */}
              <div>
                <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">
                  아이템북 완성 ({result.itemBooksCompleted.length}개)
                </p>
                {result.itemBooksCompleted.length === 0 ? (
                  <p className="text-white/30 text-xs">완성된 아이템북 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {result.itemBooksCompleted.map((book, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span>📖</span>
                        <span className="font-medium">{book.bookName}</span>
                        {book.rewardBadgeName && (
                          <span className="text-[#AEEA00] text-xs">→ {book.rewardBadgeName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 미발급 배지 */}
              {result.badgesMissed.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-2">
                    미발급 배지 ({result.badgesMissed.length}개)
                  </p>
                  <div className="space-y-1.5">
                    {result.badgesMissed.map((b) => (
                      <div key={b.id} className="flex items-start gap-2">
                        <span className="text-red-400 shrink-0">❌</span>
                        <div>
                          <span className="font-medium text-white/70">{b.name}</span>
                          <p className="text-white/30 text-xs mt-0.5">
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
