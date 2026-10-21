'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/admin/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import {
  CHAPTER_NAME_MAX_LENGTH,
  cellKey,
  diffChapterNameCells,
  type ChapterNameCell,
  type ChapterNamesTribe,
} from '@/lib/chapter/names-table'

interface Props {
  tribes: ChapterNamesTribe[]
  chapterNos: number[]
  /** 이름이 있는 칸만 */
  cells: ChapterNameCell[]
}

/**
 * 트라이브 × 챕터 이름 표 한 화면 편집 (티켓 20261019_1318 2회).
 * 바뀐 칸만 `PUT /api/admin/chapter-names`로 보낸다 — 전체 표를 보내면 다른 운영자가 방금 고친 칸을 낡은 값으로 덮는다.
 * 빈 칸으로 저장하면 그 칸의 이름이 지워진다(이름 없음). 저장 결과 문구는 `AdjacencyEditor`처럼 표 아래에 보인다.
 */
export function ChapterNamesTable({ tribes, chapterNos, cells }: Props) {
  const initial = useMemo(() => Object.fromEntries(cells.map((c) => [cellKey(c.tribeId, c.chapterNo), c.name])), [cells])
  /** 서버에 저장돼 있다고 아는 값 */
  const [baseline, setBaseline] = useState<Record<string, string>>(initial)
  /** 지금 입력칸의 값 */
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const changes = useMemo(() => diffChapterNameCells(baseline, values), [baseline, values])

  const handleSave = async () => {
    if (changes.length === 0) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/chapter-names', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: changes.map((c) => ({ tribe_id: c.tribeId, chapter_no: c.chapterNo, name: c.name })) }),
      })
      const json = (await res.json()) as { error?: string; saved?: number; cleared?: number }
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' })
        return
      }
      // 저장한 칸은 공백을 지운 값으로 맞춘다. 비운 칸은 «이름 없음»이라 불러온 값에서도 뺀다
      const nextBaseline = { ...baseline }
      const nextValues = { ...values }
      for (const c of changes) {
        const key = cellKey(c.tribeId, c.chapterNo)
        if (c.name === '') delete nextBaseline[key]
        else nextBaseline[key] = c.name
        nextValues[key] = c.name
      }
      setBaseline(nextBaseline)
      setValues(nextValues)
      setMessage({ type: 'ok', text: `이름 ${json.saved ?? 0}칸을 저장하고 ${json.cleared ?? 0}칸을 비웠어요.` })
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류로 저장하지 못했어요. 다시 시도해 주세요.' })
    } finally {
      setSaving(false)
    }
  }

  if (tribes.length === 0 || chapterNos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm break-keep wrap-break-word">
        {tribes.length === 0 ? '등록된 트라이브가 없어요. 트라이브를 먼저 등록해 주세요.' : '등록된 챕터가 없어요.'}
      </p>
    )
  }

  return (
    <section className="bg-white border border-border rounded-2xl p-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">트라이브</TableHead>
            {chapterNos.map((no) => (
              <TableHead key={no} className="whitespace-nowrap">
                챕터 {no}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tribes.map((tribe) => (
            <TableRow key={tribe.id}>
              <TableCell className="min-w-32 align-middle font-medium break-keep wrap-break-word">
                {tribe.name}
                {!tribe.isActive && <span className="ml-1 text-xs font-normal text-muted-foreground">(비활성)</span>}
              </TableCell>
              {chapterNos.map((no) => {
                const key = cellKey(tribe.id, no)
                return (
                  <TableCell key={no} className="align-middle">
                    <Input
                      value={values[key] ?? ''}
                      maxLength={CHAPTER_NAME_MAX_LENGTH}
                      disabled={saving}
                      aria-label={`${tribe.name} 챕터 ${no} 이름`}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="h-8 min-w-28 text-sm"
                    />
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-muted-foreground text-xs mt-4 break-keep wrap-break-word text-pretty">
        이름은 앞뒤 공백을 지우고 {CHAPTER_NAME_MAX_LENGTH}자까지 저장돼요. 칸을 비우고 저장하면 이름이 지워져요. 바뀐 칸만 저장돼요.
      </p>

      <div className="flex items-center gap-4 mt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || changes.length === 0}
          className="bg-primary text-white font-bold px-5 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? '저장 중…' : '이름 저장'}
        </button>
        <p className="text-muted-foreground text-sm break-keep wrap-break-word">바뀐 칸 {changes.length}개</p>
        {message && (
          <p className={`text-sm break-keep wrap-break-word ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
