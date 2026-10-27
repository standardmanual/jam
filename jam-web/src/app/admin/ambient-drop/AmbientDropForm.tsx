'use client'

import { useState, type ReactNode } from 'react'
import type { AmbientAxisPatch, AmbientDropConfig } from '@/lib/ambient-drop/config'
import type { AmbientDropAxisMode } from '@/types/database'
import type { AmbientDropBatchResult } from '@/lib/ambient-drop'
import { formatAmbientBatchSummary } from '@/lib/ambient-drop/scheduleView'
import { Switch } from '@/components/admin/ui/switch'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { formatAmbientDropScheduleOption, formatAmbientDropScheduleTime } from '@/lib/ambient-drop/schedule'

export interface AmbientDropHistoryEntry {
  id: string
  created_at: string
  payload: Record<string, unknown>
}

interface AmbientDropFormProps {
  initial: AmbientDropConfig
  categories: { slug: string; label: string }[]
  books: { id: string; name: string }[]
  history: AmbientDropHistoryEntry[]
  initialBlocked: boolean
  /** 「날짜 예약」 구역(티켓 20261001_2154). 최근 실행 이력 앞에 그린다 */
  scheduleSection?: ReactNode
}

const ALL_CATEGORY_VALUE = '__ALL__'

/** 밸런스 설정이 바꾸는 칸 안내(링크 없이 글자만, 사용자 결정) */
export const BALANCE_ONLY_NOTICE = '배포 시각과 상호 배제 창은 밸런스 설정에서 바꿔요.'
export const RARITY_BALANCE_NOTICE = '저장된 등급 비율대로 정해요. 비율은 밸런스 설정에서 바꿔요.'

/**
 * 저장 본문 — 스위치와 세 축 고르기 여섯 칸만 보낸다. 숫자 칸(배포 시각, 상호 배제 창, 배치 규모, 지점당 한도, 등급 비율)은 이 화면에서 바꾸지 않고
 * 밸런스 설정이 바꾼다. 화면이 들고 있는 낡은 숫자를 함께 보내면 서버가 받지 않더라도 뜻이 흐려져서 처음부터 싣지 않는다 (티켓 20261022_1134 3회).
 */
export function axisSettingsPayload(values: AmbientDropConfig): AmbientAxisPatch {
  return {
    auto_enabled: values.auto_enabled,
    category_mode: values.category_mode,
    category_slug: values.category_slug,
    rarity_mode: values.rarity_mode,
    collection_mode: values.collection_mode,
    collection_ids: values.collection_ids,
  }
}

/** 명시(explicit)/무작위(random) 2단 토글 — 어드민 전용 세그먼트 컨트롤(MODULAR 대상 아님) */
function AxisModeToggle({
  value,
  onChange,
}: {
  value: AmbientDropAxisMode
  onChange: (mode: AmbientDropAxisMode) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-border p-0.5 bg-white">
      {(['explicit', 'random'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            value === mode ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {mode === 'explicit' ? '명시' : '무작위'}
        </button>
      ))}
    </div>
  )
}

export default function AmbientDropForm({
  initial,
  categories,
  books,
  history,
  initialBlocked,
  scheduleSection,
}: AmbientDropFormProps) {
  // Select 드롭다운(Radix Portal)은 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다 (4단계a `BadgeForm.tsx`와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [values, setValues] = useState<AmbientDropConfig>(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [deploying, setDeploying] = useState(false)
  const [deployBlocked, setDeployBlocked] = useState(initialBlocked)
  const [deployResult, setDeployResult] = useState<AmbientDropBatchResult | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  const set = <K extends keyof AmbientDropConfig>(key: K, value: AmbientDropConfig[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const toggleCollection = (id: string, checked: boolean) => {
    setValues((v) => ({
      ...v,
      collection_ids: checked ? [...v.collection_ids, id] : v.collection_ids.filter((x) => x !== id),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/ambient-drop/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(axisSettingsPayload(values)),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      } else {
        setValues(json.config)
        setMessage({ type: 'ok', text: '저장했어요. 다음 배포부터 적용돼요.' })
      }
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeploy = async () => {
    setDeploying(true)
    setDeployError(null)
    setDeployResult(null)
    try {
      const res = await fetch('/api/admin/ambient-drop/deploy', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setDeployError(json.error ?? '배포 실패')
        if (res.status === 409) setDeployBlocked(true)
      } else {
        setDeployResult(json.result)
      }
    } catch {
      setDeployError('네트워크 오류')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* 배포 트리거 — 예약 배포 스위치. 시각과 상호 배제 창은 밸런스 설정에서 바꾸고 여기서는 읽기만 한다 */}
      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-bold mb-1">배포 트리거</h2>
        <p className="text-muted-foreground text-xs mb-4 break-keep wrap-break-word text-pretty">
          배포는 세 갈래예요. <strong className="text-foreground">예약 배포</strong>는 정해 둔
          시각에 매일 저절로 배포하고, <strong className="text-foreground">즉시 배포</strong>는 「지금
          배포」를 누른 그 자리에서 1회 배포해요. 두 갈래는 저장된 같은 설정값을 써요.{' '}
          <strong className="text-foreground">날짜 예약</strong>은 아래 「날짜 예약」에서 날짜·장소·아이템을
          정해 한 번만 드랍하고, 이 설정을 바꾸지 않아요. 날짜 대신 「지금」을 고르면 바로 한 번 드랍해요.
        </p>

        <div className="flex items-center gap-3">
          <Switch checked={values.auto_enabled} onCheckedChange={(checked) => set('auto_enabled', checked)} />
          <span className="text-sm">예약 배포 켜기</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 mb-4 break-keep wrap-break-word text-pretty">
          켜면 저장된 설정값으로 매일 배포 시각에 자동 배포해요. 끄면 「지금 배포」로만 배포돼요.
        </p>

        <p className="text-sm text-foreground break-keep wrap-break-word text-pretty">
          배포 시각{' '}
          <span className="font-semibold">{formatAmbientDropScheduleOption(values.schedule_hour_kst)}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1 break-keep wrap-break-word text-pretty">{BALANCE_ONLY_NOTICE}</p>
      </section>

      {/* 축 1: 카테고리 */}
      <section className="bg-white border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">축 1 — 카테고리</h2>
          <AxisModeToggle value={values.category_mode} onChange={(mode) => set('category_mode', mode)} />
        </div>
        {values.category_mode === 'explicit' ? (
          <Select
            value={values.category_slug ?? ALL_CATEGORY_VALUE}
            onValueChange={(value) => set('category_slug', value === ALL_CATEGORY_VALUE ? null : value)}
          >
            <SelectTrigger className="w-auto min-w-[10rem]" aria-label="카테고리 선택">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              <SelectItem value={ALL_CATEGORY_VALUE}>전체 카테고리</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">실행 시점에 카테고리 하나를 무작위로 선택해요.</p>
        )}
      </section>

      {/* 축 2: 등급 비율 */}
      <section className="bg-white border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">축 2 — 등급 비율</h2>
          <AxisModeToggle value={values.rarity_mode} onChange={(mode) => set('rarity_mode', mode)} />
        </div>
        {values.rarity_mode === 'explicit' ? (
          <p className="text-xs text-muted-foreground break-keep wrap-break-word text-pretty">{RARITY_BALANCE_NOTICE}</p>
        ) : (
          <p className="text-xs text-muted-foreground break-keep wrap-break-word text-pretty">실행 시점에 등급 분포 자체를 무작위로 생성해요.</p>
        )}
      </section>

      {/* 축 3: 대상 컬렉션 */}
      <section className="bg-white border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">축 3 — 대상 컬렉션</h2>
          <AxisModeToggle value={values.collection_mode} onChange={(mode) => set('collection_mode', mode)} />
        </div>
        {values.collection_mode === 'explicit' ? (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              선택하지 않으면 전체 컬렉션에서 배치해요. 여러 개 선택 가능해요.
            </p>
            <div className="max-h-56 overflow-y-auto space-y-1.5 border border-border rounded-xl p-3">
              {books.map((b) => (
                <label key={b.id} className="flex items-center gap-2.5 text-sm py-1">
                  <Checkbox
                    checked={values.collection_ids.includes(b.id)}
                    onCheckedChange={(checked) => toggleCollection(b.id, checked === true)}
                  />
                  {b.name}
                </label>
              ))}
              {books.length === 0 && <p className="text-xs text-muted-foreground">활성 컬렉션이 없어요.</p>}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">실행 시점에 컬렉션 1개를 무작위로 선택해요.</p>
        )}
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
        )}
      </div>

      {/* 즉시 배포 */}
      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-bold mb-1">즉시 배포</h2>
        <p className="text-muted-foreground text-xs mb-4">
          저장된 설정값으로 지금 1회 배포해요. 아직 저장하지 않은 변경사항은 반영되지 않아요.
          장소·아이템을 정해 한 번만 드랍하려면 아래 날짜 예약에서 「지금」을 고르세요. 이 버튼은 저장된 설정으로
          배포해요.
        </p>
        <button
          onClick={handleDeploy}
          disabled={deploying || deployBlocked}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {deploying ? '배포 중…' : '지금 배포'}
        </button>
        {deployBlocked && !deployError && (
          <p className="text-xs text-muted-foreground mt-2">
            지금은 배포할 수 없어요. 예약 배포 시각{' '}
            {formatAmbientDropScheduleTime(values.schedule_hour_kst)} 전후{' '}
            {values.exclusion_window_minutes}분이라 배포가 겹칠 수 있어요.
          </p>
        )}
        {deployError && <p className="text-sm text-red-600 mt-2">{deployError}</p>}
        {deployResult && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mt-3">
            {formatAmbientBatchSummary(deployResult as unknown as Record<string, unknown>)}
          </div>
        )}
      </section>

      {/* 날짜 예약 — 서버 페이지가 주입한다 */}
      {scheduleSection}

      {/* 최근 실행 이력 */}
      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-bold mb-3">최근 실행 이력</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 실행 이력이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-foreground flex flex-col gap-0.5">
                <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString('ko-KR')}</span>
                <span>{formatAmbientBatchSummary(h.payload)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
