'use client'

import { useState, useRef } from 'react'
import {
  IconFolder,
  IconDeviceGamepad2,
  IconCircleCheck,
  IconMapPin,
  IconTag,
  IconBook,
  IconCircleX,
} from '@tabler/icons-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'

type ActivityType = 'cycling' | 'running' | 'trail_running' | 'hiking' | 'walking'

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

/**
 * v5 확장 6필드 (티켓 20260905_0029). Strava Summary 응답에서 오는 값과 같은 것들을
 * 어드민이 손으로 넣어 신규 조건 배지를 검증한다.
 *
 * **비워 두면 서버로 보내지 않는다** — `null`을 보내지 않고 키 자체를 만들지 않는다.
 * 심박계 없는 유저의 활동(키 없음)을 그대로 재현할 수 있어야 하기 때문이다.
 */
const EXTENDED_FIELDS = [
  { key: 'avgHeartrateBpm', label: '평균 심박수', unit: 'bpm', step: 1 },
  { key: 'avgWatts', label: '평균 파워', unit: 'W', step: 1 },
  { key: 'avgCadence', label: '평균 케이던스', unit: '', step: 1 },
  { key: 'maxSpeedKmh', label: '최고 속도', unit: 'km/h', step: 0.1 },
  { key: 'maxElevationM', label: '최고 도달 고도', unit: 'm', step: 10 },
  { key: 'elapsedTimeSec', label: '경과 시간', unit: '초', step: 1 },
] as const

type ExtendedFieldKey = (typeof EXTENDED_FIELDS)[number]['key']

const EXTENDED_LABEL: Record<string, { label: string; unit: string }> = Object.fromEntries(
  EXTENDED_FIELDS.map((f) => [f.key, { label: f.label, unit: f.unit }])
)

interface SimulateResult {
  parsed: {
    distanceKm: number
    durationMin: number
    elevationGainM: number
    averageSpeedKmh: number
    trackpointCount: number
    /** 실제로 평가에 실린 확장 필드만 담긴다 — 입력이 무시됐으면 여기 없다 */
    extended?: Partial<Record<ExtendedFieldKey, number>>
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

  const [gpx, setGpx] = useState<GpxParsed | null>(null)
  const [gpxError, setGpxError] = useState<string | null>(null)
  const [activityType, setActivityType] = useState<ActivityType>('cycling')
  const [repeatCount, setRepeatCount] = useState<number>(1)
  const [userId, setUserId] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [users, setUsers] = useState<{ id: string; email: string; username: string | null }[]>([])
  const [userLoading, setUserLoading] = useState(false)
  const [firstSync, setFirstSync] = useState(false)
  /** 확장 6필드 원시 입력(문자열). 빈 문자열은 «입력 안 함»이라 전송에서 제외된다 */
  const [extended, setExtended] = useState<Record<ExtendedFieldKey, string>>({
    avgHeartrateBpm: '',
    avgWatts: '',
    avgCadence: '',
    maxSpeedKmh: '',
    maxElevationM: '',
    elapsedTimeSec: '',
  })
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

      // 비워 둔 확장 필드는 키 자체를 만들지 않는다 (서버의 «없으면 키 없음» 규칙과 동일)
      const extendedPayload: Partial<Record<ExtendedFieldKey, number>> = {}
      for (const { key } of EXTENDED_FIELDS) {
        const raw = extended[key].trim()
        if (raw === '') continue
        const value = Number(raw)
        if (!Number.isFinite(value)) continue
        extendedPayload[key] = value
      }

      const res = await fetch('/api/admin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          dryRun,
          firstSync,
          activity: {
            activityType,
            distanceKm: gpx.distanceKm,
            movingTimeSec,
            elevationGainM: gpx.elevationGainM,
            averageSpeedKmh: gpx.averageSpeedKmh,
            startDate: gpx.startDate,
            route: downsampleRoute(gpx.route, 5000),
            ...extendedPayload,
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

          {/* GPX 업로드 */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">GPX 파일</h2>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-foreground/30 transition-colors"
            >
              <IconFolder className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
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
              <p className="text-red-600 text-sm">{gpxError}</p>
            )}

            {gpx && (
              <div className="bg-muted border border-border rounded-xl p-4 font-mono text-xs space-y-1">
                <p className="text-muted-foreground mb-2">{gpx.fileName}</p>
                <p><span className="text-muted-foreground">거리:</span> <span className="text-foreground">{gpx.distanceKm} km</span></p>
                <p><span className="text-muted-foreground">이동 시간:</span> <span className="text-foreground">{formatDuration(gpx.durationMin)}</span></p>
                <p><span className="text-muted-foreground">고도 상승:</span> <span className="text-foreground">{gpx.elevationGainM} m</span></p>
                <p><span className="text-muted-foreground">평균 속도:</span> <span className="text-foreground">{gpx.averageSpeedKmh} km/h</span></p>
                <p><span className="text-muted-foreground">시작 시각:</span> <span className="text-foreground">{new Date(gpx.startDate).toLocaleString('ko-KR')}</span></p>
                <p><span className="text-muted-foreground">트랙포인트:</span> <span className="text-foreground">{gpx.trackpointCount.toLocaleString()}개</span></p>
                <p><span className="text-muted-foreground">시작점:</span> <span className="text-foreground">{gpx.startLat.toFixed(4)}° N, {gpx.startLng.toFixed(4)}° E</span></p>
              </div>
            )}
          </div>

          {/* 활동 설정 */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">활동 설정</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">활동 종류</span>
                <Select value={activityType} onValueChange={(v) => setActivityType(v as ActivityType)}>
                  <SelectTrigger aria-label="활동 종류">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={themeContainer ?? undefined}>
                    {(['cycling', 'running', 'trail_running', 'hiking', 'walking'] as ActivityType[]).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">활동 횟수 배수</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(parseInt(e.target.value, 10) || 1)}
                  className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:border-primary/50"
                />
              </label>
            </div>
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

          {/* 확장 필드 — GPX에 없는 심박·파워 등을 손으로 넣어 v5 신규 조건 배지를 검증한다 */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="font-semibold">확장 필드</h2>
              <p className="text-xs text-muted-foreground mt-1">
                비워 두면 «데이터 없음»으로 처리돼요. 심박계가 없는 활동을 그대로 재현할 수 있어요.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {EXTENDED_FIELDS.map(({ key, label, unit, step }) => (
                <label key={key} className="flex flex-col gap-1.5">
                  <span className="text-sm text-foreground">
                    {label}
                    {unit ? ` (${unit})` : ''}
                  </span>
                  <input
                    type="number"
                    step={step}
                    value={extended[key]}
                    onChange={(e) => setExtended((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="입력 안 함"
                    className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                </label>
              ))}
            </div>
          </div>

          {simError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {simError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => runSimulate(true)}
              disabled={!gpx || !userId || simLoading}
              className="flex-1 bg-muted text-foreground font-bold py-3 rounded-xl hover:bg-accent disabled:opacity-40 transition-colors"
            >
              {simLoading ? '실행 중...' : '미리보기 (Dry Run)'}
            </button>
            <button
              onClick={() => runSimulate(false)}
              disabled={!gpx || !userId || simLoading}
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
                <p>GPX를 업로드하고 유저를 선택한 뒤<br />시뮬레이션을 실행하세요</p>
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
