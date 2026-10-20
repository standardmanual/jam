'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ChapterRiseOverlay from '@/components/chapter/ChapterRiseOverlay'
import { claimChapterRise, type StorageLike } from '@/lib/chapter/celebrate'
import { useTabBarHidden } from '@/lib/uiOverlay'

/**
 * 챕터 오름 감시 (티켓 20261019_1317 1회, 사용자 결정 1 «다음에 앱을 열 때 한 번»)
 *
 * `(main)/layout.tsx`가 화면을 열 때마다 읽은 지금 챕터 번호(`chapterNo`)를 받아, 기기에 저장된 «마지막으로 축하한 챕터»보다 높으면
 * `ChapterRiseOverlay`를 한 번 띄운다. 판정과 저장은 `lib/chapter/celebrate.ts`의 `claimChapterRise`가 한다(저장소 읽기·쓰기는 모두 try/catch,
 * 막혀 있으면 연출하지 않는다).
 *
 * - 다른 전체화면 오버레이(배지 획득 연출 등)가 열려 있으면(`useTabBarHidden`) 닫힐 때까지 기다린다. 기다리는 동안은 저장하지 않는다.
 * - 동기화 뒤에는 `SyncButton`이 `router.refresh()`로 레이아웃을 다시 읽히므로 새 `chapterNo`가 내려와 효과가 다시 돈다.
 * - 이름은 연출을 띄울 때만 `GET /api/chapter/me`로 읽는다(레이아웃은 화면을 열 때마다 돌아 번호만 읽는다). 읽지 못하면 이름 없이 보인다.
 */

interface Props {
  /** 레이아웃이 읽은 지금 챕터 번호(1 이상). 챕터가 없는 유저에게는 이 컴포넌트를 그리지 않는다 */
  chapterNo: number
  userId: string
}

/** 이름을 기다리는 최대 시간. 넘기면 이름 없이 연출한다(연출이 이름 읽기에 갇히지 않게) */
const NAME_TIMEOUT_MS = 4000

/** `window.localStorage`는 접근만으로 던지는 환경(저장 공간 차단)이 있다 */
export function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * 연출에 쓸 챕터 이름을 읽는다. 어떤 실패든 null이다(이름 없이 연출).
 * 읽는 사이 챕터가 또 올라 응답의 번호가 다르면 다른 챕터의 이름이므로 쓰지 않는다.
 */
export async function fetchRiseName(chapterNo: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NAME_TIMEOUT_MS)
  try {
    const res = await fetchImpl('/api/chapter/me', { cache: 'no-store', signal: controller.signal })
    if (!res.ok) return null
    const body = (await res.json()) as { chapterNo?: unknown; name?: unknown }
    if (body.chapterNo !== chapterNo) return null
    return typeof body.name === 'string' && body.name.length > 0 ? body.name : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default function ChapterRiseWatcher({ chapterNo, userId }: Props) {
  const tabBarHidden = useTabBarHidden()
  const [rise, setRise] = useState<{ chapterNo: number; name: string | null } | null>(null)
  // 이미 판정을 끝낸 챕터 — 연출이 열리면 탭바 숨김이 바뀌어 효과가 다시 돌지만 같은 챕터를 두 번 처리하지 않는다
  const handledRef = useRef<number | null>(null)

  useEffect(() => {
    if (handledRef.current === chapterNo) return
    const claim = claimChapterRise({ storage: getBrowserStorage(), userId, chapterNo, blocked: tabBarHidden })
    // 다른 오버레이가 열려 있다 — 닫혀 탭바 숨김이 바뀌면 이 효과가 다시 돈다
    if (claim.kind === 'wait') return
    handledRef.current = chapterNo
    if (claim.kind !== 'celebrate') return
    void fetchRiseName(claim.chapterNo).then((name) => setRise({ chapterNo: claim.chapterNo, name }))
  }, [chapterNo, userId, tabBarHidden])

  const handleClose = useCallback(() => setRise(null), [])

  return <ChapterRiseOverlay open={rise !== null} chapterNo={rise?.chapterNo ?? chapterNo} name={rise?.name ?? null} onClose={handleClose} />
}
