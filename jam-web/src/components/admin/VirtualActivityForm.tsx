'use client'

/**
 * 가상 활동 입력(GPX 업로드 또는 수치 직접입력) — `/admin/simulator`의 입력 폼을 공용 컴포넌트로
 * 뽑아 배지 조건 사전 시뮬레이션의 "가상 활동으로 시험" 경로에서도 재사용한다(티켓 20260908_1631).
 * 새로 디자인하지 않고 시뮬레이터 화면의 필드 구성·스타일을 그대로 옮겼다.
 *
 * 완성된 가상 활동이 있을 때만 `onActivityChange`로 상위에 알린다 — 상위는 이 콜백의 최신 값을
 * 그대로 시뮬레이션 API 호출에 실어 보내면 된다(값 자체는 이 컴포넌트가 들고 있지 않는다).
 */
import { useRef, useState } from 'react'
import { IconFolder } from '@tabler/icons-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { parseGpx, downsampleRoute, formatDuration, ACTIVITY_TYPES, type ActivityType, type GpxParsed } from '@/lib/admin/gpxParse'

/** v5 확장 6필드 (티켓 20260905_0029) — 시뮬레이터와 동일한 목록. */
const EXTENDED_FIELDS = [
  { key: 'avgHeartrateBpm', label: '평균 심박수', unit: 'bpm', step: 1 },
  { key: 'avgWatts', label: '평균 파워', unit: 'W', step: 1 },
  { key: 'avgCadence', label: '평균 케이던스', unit: '', step: 1 },
  { key: 'maxSpeedKmh', label: '최고 속도', unit: 'km/h', step: 0.1 },
  { key: 'maxElevationM', label: '최고 도달 고도', unit: 'm', step: 10 },
  { key: 'elapsedTimeSec', label: '경과 시간', unit: '초', step: 1 },
] as const

type ExtendedFieldKey = (typeof EXTENDED_FIELDS)[number]['key']

export interface VirtualActivityValue {
  activityType: ActivityType
  distanceKm: number
  movingTimeSec: number
  elevationGainM: number
  averageSpeedKmh: number
  startDate: string
  route: [number, number][] | null
  repeatCount: number
  extended: Partial<Record<ExtendedFieldKey, number>>
}

interface VirtualActivityFormProps {
  /** 값이 유효하지 않으면(입력 미완료) `null`을 받는다 — 상위는 이 시점엔 실행 버튼을 비활성화한다 */
  onActivityChange: (value: VirtualActivityValue | null) => void
  /** Radix Select 포털 컨테이너 — shadcn 어드민 테마 스코프에 렌더링하기 위함 (BadgeForm과 동일 패턴) */
  themeContainer?: HTMLElement | null
}

function buildExtendedPayload(extended: Record<ExtendedFieldKey, string>): Partial<Record<ExtendedFieldKey, number>> {
  const payload: Partial<Record<ExtendedFieldKey, number>> = {}
  for (const { key } of EXTENDED_FIELDS) {
    const raw = extended[key].trim()
    if (raw === '') continue
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    payload[key] = value
  }
  return payload
}

export default function VirtualActivityForm({ onActivityChange, themeContainer }: VirtualActivityFormProps) {
  const [mode, setMode] = useState<'gpx' | 'manual'>('gpx')
  const [activityType, setActivityType] = useState<ActivityType>('cycling')
  const [repeatCount, setRepeatCount] = useState<number>(1)
  const [extended, setExtended] = useState<Record<ExtendedFieldKey, string>>({
    avgHeartrateBpm: '',
    avgWatts: '',
    avgCadence: '',
    maxSpeedKmh: '',
    maxElevationM: '',
    elapsedTimeSec: '',
  })

  // GPX 업로드
  const [gpx, setGpx] = useState<GpxParsed | null>(null)
  const [gpxError, setGpxError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 수치 직접입력
  const [manualDistanceKm, setManualDistanceKm] = useState('')
  const [manualDurationMin, setManualDurationMin] = useState('')
  const [manualElevationGainM, setManualElevationGainM] = useState('')
  const [manualStartDate, setManualStartDate] = useState('')

  const emit = (next: {
    distanceKm: number
    durationMin: number
    elevationGainM: number
    startDate: string
    route: [number, number][] | null
  } | null, nextActivityType = activityType, nextRepeatCount = repeatCount, nextExtended = extended) => {
    if (!next) {
      onActivityChange(null)
      return
    }
    const { distanceKm, durationMin, elevationGainM, startDate, route } = next
    if (!(distanceKm > 0) || !(durationMin > 0) || !startDate) {
      onActivityChange(null)
      return
    }
    const movingTimeSec = durationMin * 60
    const averageSpeedKmh = Math.round((distanceKm / (durationMin / 60)) * 10) / 10
    onActivityChange({
      activityType: nextActivityType,
      distanceKm,
      movingTimeSec,
      elevationGainM,
      averageSpeedKmh,
      startDate: new Date(startDate).toISOString(),
      route: route ? downsampleRoute(route, 5000) : null,
      repeatCount: nextRepeatCount > 0 ? nextRepeatCount : 1,
      extended: buildExtendedPayload(nextExtended),
    })
  }

  const currentSource = () => {
    if (mode === 'gpx') {
      if (!gpx) return null
      return {
        distanceKm: gpx.distanceKm,
        durationMin: gpx.durationMin,
        elevationGainM: gpx.elevationGainM,
        startDate: gpx.startDate,
        route: gpx.route,
      }
    }
    const distanceKm = Number(manualDistanceKm)
    const durationMin = Number(manualDurationMin)
    const elevationGainM = Number(manualElevationGainM) || 0
    if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMin) || !manualStartDate) return null
    return {
      distanceKm,
      durationMin,
      elevationGainM,
      startDate: manualStartDate,
      route: null,
    }
  }

  const reemit = (
    overrides: Partial<{ activityType: ActivityType; repeatCount: number; extended: Record<ExtendedFieldKey, string> }> = {}
  ) => {
    emit(
      currentSource(),
      overrides.activityType ?? activityType,
      overrides.repeatCount ?? repeatCount,
      overrides.extended ?? extended
    )
  }

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.gpx')) {
      setGpxError('.gpx 파일만 업로드할 수 있습니다.')
      return
    }
    setGpxError(null)
    setGpx(null)
    onActivityChange(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseGpx(ev.target?.result as string, file.name)
        setGpx(parsed)
        emit({
          distanceKm: parsed.distanceKm,
          durationMin: parsed.durationMin,
          elevationGainM: parsed.elevationGainM,
          startDate: parsed.startDate,
          route: parsed.route,
        })
      } catch (err) {
        setGpxError(err instanceof Error ? err.message : 'GPX 파싱 실패')
      }
    }
    reader.readAsText(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const switchMode = (next: 'gpx' | 'manual') => {
    if (next === mode) return
    setMode(next)
    onActivityChange(null)
  }

  return (
    <div className="space-y-3">
      {/* 입력 방식 전환 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => switchMode('gpx')}
          className={`flex-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
            mode === 'gpx' ? 'bg-primary text-white font-semibold' : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          GPX 업로드
        </button>
        <button
          type="button"
          onClick={() => switchMode('manual')}
          className={`flex-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
            mode === 'manual' ? 'bg-primary text-white font-semibold' : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          수치 직접입력
        </button>
      </div>

      {mode === 'gpx' && (
        <div className="space-y-2">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-foreground/30 transition-colors"
          >
            <IconFolder className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">드래그앤드롭 또는 클릭해서 .gpx 파일 선택</p>
            <input ref={fileRef} type="file" accept=".gpx" onChange={handleFileChange} className="hidden" />
          </div>

          {gpxError && <p className="text-red-600 text-xs">{gpxError}</p>}

          {gpx && (
            <div className="bg-muted border border-border rounded-xl p-3 font-mono text-xs space-y-1">
              <p className="text-muted-foreground mb-1">{gpx.fileName}</p>
              <p><span className="text-muted-foreground">거리:</span> <span className="text-foreground">{gpx.distanceKm} km</span></p>
              <p><span className="text-muted-foreground">이동 시간:</span> <span className="text-foreground">{formatDuration(gpx.durationMin)}</span></p>
              <p><span className="text-muted-foreground">고도 상승:</span> <span className="text-foreground">{gpx.elevationGainM} m</span></p>
              <p><span className="text-muted-foreground">시작 시각:</span> <span className="text-foreground">{new Date(gpx.startDate).toLocaleString('ko-KR')}</span></p>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground">거리 (km)</span>
            <input
              type="number"
              step={0.1}
              value={manualDistanceKm}
              onChange={(e) => {
                setManualDistanceKm(e.target.value)
                reemit()
              }}
              className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground">이동 시간 (분)</span>
            <input
              type="number"
              step={1}
              value={manualDurationMin}
              onChange={(e) => {
                setManualDurationMin(e.target.value)
                reemit()
              }}
              className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground">고도 상승 (m)</span>
            <input
              type="number"
              step={1}
              value={manualElevationGainM}
              onChange={(e) => {
                setManualElevationGainM(e.target.value)
                reemit()
              }}
              className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground">시작 시각</span>
            <input
              type="datetime-local"
              value={manualStartDate}
              onChange={(e) => {
                setManualStartDate(e.target.value)
                reemit()
              }}
              className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
        </div>
      )}

      {/* 활동 종류 · 반복 횟수 */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground">활동 종류</span>
          <Select
            value={activityType}
            onValueChange={(v) => {
              const next = v as ActivityType
              setActivityType(next)
              reemit({ activityType: next })
            }}
          >
            <SelectTrigger aria-label="활동 종류">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground">반복 횟수(회차)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={repeatCount}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10) || 1
              setRepeatCount(next)
              reemit({ repeatCount: next })
            }}
            className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
          />
        </label>
      </div>

      {/* 확장 필드 */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          확장 필드 — 비워 두면 «데이터 없음»으로 처리돼요.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {EXTENDED_FIELDS.map(({ key, label, unit, step }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs text-foreground">{label}{unit ? ` (${unit})` : ''}</span>
              <input
                type="number"
                step={step}
                value={extended[key]}
                onChange={(e) => {
                  const nextExtended = { ...extended, [key]: e.target.value }
                  setExtended(nextExtended)
                  reemit({ extended: nextExtended })
                }}
                placeholder="입력 안 함"
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
