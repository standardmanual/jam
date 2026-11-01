'use client'

/**
 * 승인 전 카드의 이미지를 저장 없이 브라우저에서 바로 그린다 (티켓 20261101_2149).
 *
 * `image_spec`이 있고 저장된 이미지가 없는 카드를 호출부가 요청 목록으로 넘기면, 한 번에 한 장씩 그려 blob 주소로 돌려준다.
 * 저장소·DB·카드 데이터는 만지지 않는다(저장 API를 부르지 않는다). 렌더가 실패하면 `failed`로 남고 던지지 않는다.
 * 입력(프리셋·색·문구·시드)을 키로 캐시하고, 이미 아는 항목의 입력이 바뀌면 400ms 뒤에 다시 그린다. 쓰지 않게 된 blob 주소는 해제한다.
 *
 * 저장소에 jsdom이 없어(`vitest.config.ts` `environment: 'node'`) 상태 관리를 `DraftImagePreviewController`로 떼어 시험한다. 훅은 얇은 연결이다.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { renderPresetToPngBlob, type RenderPresetToPngArgs } from '@/lib/admin/opsInbox/imageRender.client'

export const DRAFT_IMAGE_DEBOUNCE_MS = 400

export type DraftImageStatus = 'rendering' | 'ready' | 'failed'

export interface DraftImageState {
  status: DraftImageStatus
  /** `ready`일 때만 있는 blob 주소 */
  url: string | null
  /** 색이 비어 임시 색으로 그린 것인가 */
  tempColor: boolean
}

export interface DraftImageRequest {
  /** 화면에서 이 그림을 찾는 키(항목 ID) */
  id: string
  args: RenderPresetToPngArgs
  tempColor: boolean
}

export type DraftImageSnapshot = ReadonlyMap<string, DraftImageState>

/** 입력이 같으면 같은 문자열이다. 값의 순서가 달라도 같다. */
export function draftImageKey(args: RenderPresetToPngArgs): string {
  const values = Object.entries(args.values ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify([args.presetId, args.bg, args.end, values, args.seed])
}

export interface DraftImageDeps {
  render: (args: RenderPresetToPngArgs) => Promise<Blob>
  createUrl: (blob: Blob) => string
  revokeUrl: (url: string) => void
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  debounceMs: number
}

const browserDeps: DraftImageDeps = {
  render: (args) => renderPresetToPngBlob(args),
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  debounceMs: DRAFT_IMAGE_DEBOUNCE_MS,
}

type CacheEntry = { status: 'ready'; url: string } | { status: 'failed' }

export class DraftImagePreviewController {
  private readonly deps: DraftImageDeps
  private requests: DraftImageRequest[] = []
  private readonly keyById = new Map<string, string>()
  private readonly cache = new Map<string, CacheEntry>()
  private snapshot: DraftImageSnapshot = new Map()
  private readonly listeners = new Set<() => void>()
  private timer: unknown = null
  private running = false
  /** `reset` 때 올라가 이전 세대의 진행 중 렌더 결과를 버린다 */
  private generation = 0

  constructor(deps: Partial<DraftImageDeps> = {}) {
    this.deps = { ...browserDeps, ...deps }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): DraftImageSnapshot => this.snapshot

  /**
   * 지금 보여야 할 그림 목록을 알린다. 목록에 없는 항목의 그림은 해제한다.
   * 이미 키가 있던 항목의 입력이 바뀌었으면 마지막 호출 400ms 뒤에, 새 항목뿐이면 바로 그린다.
   */
  update(requests: readonly DraftImageRequest[]): void {
    const changedKnown = requests.some((r) => {
      const prev = this.keyById.get(r.id)
      return prev !== undefined && prev !== draftImageKey(r.args)
    })
    this.requests = [...requests]
    this.keyById.clear()
    for (const r of this.requests) this.keyById.set(r.id, draftImageKey(r.args))
    this.evictUnused()
    this.publish()
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer)
      this.timer = null
    }
    if (changedKnown) {
      this.timer = this.deps.setTimer(() => {
        this.timer = null
        void this.pump()
      }, this.deps.debounceMs)
    } else {
      void this.pump()
    }
  }

  /** 대기 중인 그리기를 멈추고 모든 blob 주소를 해제한다. 이어서 `update`를 부르면 다시 쓸 수 있다. */
  reset(): void {
    this.generation += 1
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer)
      this.timer = null
    }
    for (const entry of this.cache.values()) if (entry.status === 'ready') this.deps.revokeUrl(entry.url)
    this.cache.clear()
    this.requests = []
    this.keyById.clear()
    this.running = false
    this.snapshot = new Map()
    this.notify()
  }

  private evictUnused(): void {
    const wanted = new Set(this.keyById.values())
    for (const [key, entry] of this.cache) {
      if (wanted.has(key)) continue
      if (entry.status === 'ready') this.deps.revokeUrl(entry.url)
      this.cache.delete(key)
    }
  }

  private publish(): void {
    const next = new Map<string, DraftImageState>()
    for (const r of this.requests) {
      const entry = this.cache.get(draftImageKey(r.args))
      if (!entry) next.set(r.id, { status: 'rendering', url: null, tempColor: r.tempColor })
      else if (entry.status === 'ready') next.set(r.id, { status: 'ready', url: entry.url, tempColor: r.tempColor })
      else next.set(r.id, { status: 'failed', url: null, tempColor: r.tempColor })
    }
    this.snapshot = next
    this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }

  /** 아직 그리지 않은 요청을 앞에서부터 한 장씩 그린다. 이미 돌고 있으면 그 루프가 이어서 처리한다. */
  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    const generation = this.generation
    try {
      for (;;) {
        if (generation !== this.generation) return
        const next = this.requests.find((r) => !this.cache.has(draftImageKey(r.args)))
        if (!next) return
        const key = draftImageKey(next.args)
        let entry: CacheEntry
        try {
          const blob = await this.deps.render(next.args)
          entry = { status: 'ready', url: this.deps.createUrl(blob) }
        } catch {
          entry = { status: 'failed' }
        }
        if (generation !== this.generation) {
          if (entry.status === 'ready') this.deps.revokeUrl(entry.url)
          return
        }
        // 그리는 사이에 입력이 바뀌어 더 이상 쓰지 않는 그림이면 버린다.
        if (![...this.keyById.values()].includes(key)) {
          if (entry.status === 'ready') this.deps.revokeUrl(entry.url)
          continue
        }
        this.cache.set(key, entry)
        this.publish()
      }
    } finally {
      if (generation === this.generation) this.running = false
    }
  }
}

/**
 * 요청 목록을 그려 항목 ID별 상태를 돌려준다. 요청이 없는 항목은 맵에 없다.
 * 요청 내용(ID·입력)이 같으면 다시 그리지 않는다 — 호출부가 매 렌더에 새 배열을 넘겨도 된다.
 */
export function useDraftImagePreview(requests: readonly DraftImageRequest[]): DraftImageSnapshot {
  const [controller] = useState(() => new DraftImagePreviewController())
  const signature = useMemo(() => JSON.stringify(requests.map((r) => [r.id, draftImageKey(r.args), r.tempColor])), [requests])
  // 서명이 같으면 같은 요청이다. 효과는 서명이 바뀔 때만 돌게 하고 최신 요청 배열은 서명에서 되살린다.
  const stable = useMemo(() => requests, [signature]) // eslint-disable-line react-hooks/exhaustive-deps -- 서명이 같으면 요청 내용이 같다

  useEffect(() => {
    controller.update(stable)
  }, [controller, stable])

  useEffect(() => () => controller.reset(), [controller])

  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}
