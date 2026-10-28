'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconPlus } from '@tabler/icons-react'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Switch } from '@/components/admin/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { formatKstDayTime } from '@/lib/admin/opsInbox/labels'
import {
  OPS_TREND_SOURCE_KINDS,
  OPS_TREND_SOURCE_KIND_LABELS,
  OPS_TREND_SOURCE_MAX_LOCATION,
  OPS_TREND_SOURCE_MAX_NAME,
  type OpsTrendSourceKind,
} from '@/lib/admin/opsTrends/constants'
import { createTrendSourceRequest, setTrendSourceEnabledRequest } from './sourceClient'

/**
 * 내가 등록한 출처 (티켓 20261026_2033 2회차, 어드민 상황판 PRD §6.4). 트렌드 레이더 위쪽 구역이다.
 *
 * - 표: 이름 · 종류 · 위치 · 마지막으로 읽은 시각(KST) · 켜짐 스위치. 스위치를 누르면 `PATCH`로 바로 켜고 끈다.
 *   요청 중에는 그 줄 스위치만 잠기고, 실패하면 되돌리고 표 위에 한 줄 오류를 보인다.
 * - 출처 추가: 이름 · 종류 · 위치. 직접 올린 자료는 위치를 비워도 된다. 서버가 돌려준 오류 문장(400 `details`·409)을 그대로 한 줄로 보인다.
 * - 목록을 바꾸면 `router.refresh()`로 서버 화면을 다시 읽는다. 삭제는 없다(옛 묶음의 출처 번호가 남아 있어서 끄기로 대신한다).
 */

export interface OpsTrendSourceRow {
  id: string
  no: number
  name: string
  kind: OpsTrendSourceKind
  location: string
  enabled: boolean
  lastReadAt: string | null
}

export const TREND_SOURCE_NEVER_READ = '아직 읽지 않았어요'
export const TREND_SOURCE_MANUAL_HINT = '파일 목록은 루틴이 제출에 싣는 값으로 보여요'
export const TREND_SOURCE_EMPTY = '등록한 출처가 없어요. 출처를 추가하면 루틴이 켜진 출처만 읽어요'
const SWITCH_STATE = { on: '켜짐', off: '꺼짐' } as const
const KIND_PLACEHOLDERS: Record<OpsTrendSourceKind, string> = {
  hashtag: '예: #러닝크루',
  channel: '예: 채널 주소',
  search_trend: '예: 러닝화 추천',
  manual_upload: '비워도 돼요',
  repo_folder: '목록에서 골라요',
}

function locationRequired(kind: OpsTrendSourceKind): boolean {
  return kind !== 'manual_upload'
}

function SourceAddForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<OpsTrendSourceKind>('hashtag')
  const [location, setLocation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missing = name.trim() === '' || (locationRequired(kind) && location.trim() === '')

  const submit = async () => {
    setPending(true)
    setError(null)
    const result = await createTrendSourceRequest({ name, kind, location })
    setPending(false)
    if (result.ok) onDone()
    else setError(result.message)
  }

  return (
    <form
      aria-label="출처 추가"
      className="space-y-3 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!missing && !pending) void submit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,3fr)]">
        <label className="block space-y-1 text-sm font-medium">
          <span className="break-keep wrap-break-word">이름</span>
          <Input
            value={name}
            maxLength={OPS_TREND_SOURCE_MAX_NAME}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 러닝 해시태그"
          />
        </label>
        <div className="block space-y-1 text-sm font-medium">
          <span id="trend-source-kind-label" className="break-keep wrap-break-word">
            종류
          </span>
          <Select value={kind} disabled={pending} onValueChange={(value) => setKind(value as OpsTrendSourceKind)}>
            <SelectTrigger aria-labelledby="trend-source-kind-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPS_TREND_SOURCE_KINDS.map((key) => (
                <SelectItem key={key} value={key}>
                  {OPS_TREND_SOURCE_KIND_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="block space-y-1 text-sm font-medium">
          <span className="break-keep wrap-break-word">위치</span>
          <Input
            value={location}
            maxLength={OPS_TREND_SOURCE_MAX_LOCATION}
            disabled={pending}
            onChange={(event) => setLocation(event.target.value)}
            placeholder={KIND_PLACEHOLDERS[kind]}
          />
        </label>
      </div>
      {kind === 'manual_upload' && (
        <p className="text-sm text-muted-foreground break-keep wrap-break-word text-pretty">{TREND_SOURCE_MANUAL_HINT}</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="break-keep wrap-break-word">{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={missing || pending}>
          {pending ? '추가하는 중' : '추가하기'}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          취소
        </Button>
      </div>
    </form>
  )
}

export function OpsTrendSources({ sources }: { sources: readonly OpsTrendSourceRow[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [lockedIds, setLockedIds] = useState<ReadonlySet<string>>(new Set())
  const [toggleError, setToggleError] = useState<string | null>(null)

  const toggle = async (source: OpsTrendSourceRow, next: boolean) => {
    setToggleError(null)
    setOverrides((current) => ({ ...current, [source.id]: next }))
    setLockedIds((current) => new Set(current).add(source.id))
    const result = await setTrendSourceEnabledRequest(source.id, next)
    setLockedIds((current) => {
      const rest = new Set(current)
      rest.delete(source.id)
      return rest
    })
    if (result.ok) {
      router.refresh()
      return
    }
    setOverrides((current) => {
      const rest = { ...current }
      delete rest[source.id]
      return rest
    })
    setToggleError(result.message)
  }

  const addButton = !adding && (
    <Button type="button" variant="outline" onClick={() => setAdding(true)}>
      <IconPlus aria-hidden="true" />
      출처 추가
    </Button>
  )

  return (
    <div className="space-y-3">
      {toggleError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="break-keep wrap-break-word">{toggleError}</AlertDescription>
        </Alert>
      )}

      {sources.length === 0 ? (
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <p className="min-w-0 text-sm text-muted-foreground break-keep wrap-break-word text-pretty">{TREND_SOURCE_EMPTY}</p>
          {addButton}
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">번호</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="whitespace-nowrap">종류</TableHead>
                  <TableHead>위치</TableHead>
                  <TableHead className="whitespace-nowrap">마지막으로 읽은 시각</TableHead>
                  <TableHead className="whitespace-nowrap">사용</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => {
                  const enabled = overrides[source.id] ?? source.enabled
                  const lastRead = formatKstDayTime(source.lastReadAt)
                  return (
                    <TableRow key={source.id} className={enabled ? undefined : 'text-muted-foreground'}>
                      <TableCell className="tabular-nums whitespace-nowrap">{source.no}</TableCell>
                      <TableCell className="font-medium break-keep wrap-break-word">{source.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{OPS_TREND_SOURCE_KIND_LABELS[source.kind]}</TableCell>
                      <TableCell className="break-keep wrap-break-word">
                        {source.location !== '' ? (
                          source.location
                        ) : source.kind === 'manual_upload' ? (
                          <span className="text-muted-foreground">{TREND_SOURCE_MANUAL_HINT}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{lastRead ?? TREND_SOURCE_NEVER_READ}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={enabled}
                            disabled={lockedIds.has(source.id)}
                            aria-label={`${source.name} 사용`}
                            onCheckedChange={(value) => void toggle(source, value)}
                          />
                          <span aria-hidden="true" className="min-w-8 whitespace-nowrap text-sm">
                            {enabled ? SWITCH_STATE.on : SWITCH_STATE.off}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
          {addButton}
        </>
      )}

      {adding && (
        <SourceAddForm
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
