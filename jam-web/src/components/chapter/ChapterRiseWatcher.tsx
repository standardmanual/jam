'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCapsuleResult } from '@/components/capsule/capsuleResultContext'
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
 * - 합친 연출(`CapsuleResultProvider`, 티켓 20261028_1740 3회)이 진행 중이면(`resultPending`) 같은 방식으로 기다린다. 합친 연출은 띄우기 직전에 보여 준 챕터를
 *   «마지막으로 축하한 챕터»로 저장하므로, 끝난 뒤 이 효과가 다시 돌면 그 챕터는 카드가 뜨지 않고 더 높은 챕터만 뜬다.
 * - 동기화 뒤에는 `SyncButton`이 `router.refresh()`로 레이아웃을 다시 읽히므로 새 `chapterNo`가 내려와 효과가 다시 돈다.
 * - 챕터는 숫자로만 표기한다(2026-10-21 결정). 연출은 읽을 것이 없어 판정 직후 바로 열린다.
 */

interface Props {
  /** 레이아웃이 읽은 지금 챕터 번호(1 이상). 챕터가 없는 유저에게는 이 컴포넌트를 그리지 않는다 */
  chapterNo: number
  userId: string
}

/** `window.localStorage`는 접근만으로 던지는 환경(저장 공간 차단)이 있다 */
export function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export default function ChapterRiseWatcher({ chapterNo, userId }: Props) {
  const tabBarHidden = useTabBarHidden()
  // 합친 연출(`CapsuleResultProvider`)이 끝나기 전에는 기다린다 — 같은 오름이 합친 연출과 이 카드로 두 번 보이면 안 된다
  const { resultPending } = useCapsuleResult()
  // 연출로 띄운 챕터 번호. 닫혀 있으면 null
  const [rise, setRise] = useState<number | null>(null)
  // 이미 판정을 끝낸 챕터 — 연출이 열리면 탭바 숨김이 바뀌어 효과가 다시 돌지만 같은 챕터를 두 번 처리하지 않는다
  const handledRef = useRef<number | null>(null)

  useEffect(() => {
    if (handledRef.current === chapterNo) return
    const claim = claimChapterRise({ storage: getBrowserStorage(), userId, chapterNo, blocked: tabBarHidden || resultPending })
    // 다른 오버레이가 열려 있거나 합친 연출이 남았다 — 닫혀 탭바 숨김이나 연출 진행이 바뀌면 이 효과가 다시 돈다
    if (claim.kind === 'wait') return
    handledRef.current = chapterNo
    if (claim.kind !== 'celebrate') return
    // 이펙트 본문에서 곧바로 setState를 부르면 react-hooks/set-state-in-effect에 걸려 마이크로태스크로 미룬다
    // (PoiCarouselModal.tsx·PresetPanel.tsx와 같은 방식). 페인트 이전에 돌아서 체감 차이는 없다.
    const celebratedNo = claim.chapterNo
    void Promise.resolve().then(() => setRise(celebratedNo))
  }, [chapterNo, userId, tabBarHidden, resultPending])

  const handleClose = useCallback(() => setRise(null), [])

  return <ChapterRiseOverlay open={rise !== null} chapterNo={rise ?? chapterNo} onClose={handleClose} />
}
