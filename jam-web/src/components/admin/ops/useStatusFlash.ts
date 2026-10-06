import { useEffect, useState } from 'react'

/**
 * 상태가 바뀐 행·칸의 1.2초 잔상 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 모션 「결정으로 바뀐 행·칸은 1.2초 `bg-muted` 잔상」).
 *
 * 받은 기획함 상세(S3, `OpsBundleWorkspace`)와 일정표(S4, `OpsScheduleBoard`)가 함께 쓴다. 키마다 상태를 담은 객체를 받아, 이전 렌더와 **상태가 달라진** 키를 1.2초 동안 돌려준다.
 * 렌더 중에 이전 값과 비교한다(effect 안에서 setState하지 않는다). 처음 그릴 때와 새로 나타난 키는 잔상이 없다. 같은 객체를 다시 받으면(`useMemo` 결과) 비교하지 않는다.
 */

export const FLASH_MS = 1200
const EMPTY_KEYS: ReadonlySet<string> = new Set()

/** 이전과 다른 상태를 가진 키들. 이전에 없던 키는 바뀐 것으로 세지 않는다. */
export function changedStatusKeys(previous: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): string[] {
  return Object.keys(next).filter((key) => previous[key] !== undefined && previous[key] !== next[key])
}

export function useStatusFlash(statusByKey: Readonly<Record<string, string>>): ReadonlySet<string> {
  const [seenStatus, setSeenStatus] = useState(statusByKey)
  const [flashingKeys, setFlashingKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS)
  if (seenStatus !== statusByKey) {
    setSeenStatus(statusByKey)
    const changed = changedStatusKeys(seenStatus, statusByKey)
    if (changed.length > 0) setFlashingKeys(new Set(changed))
  }
  useEffect(() => {
    if (flashingKeys.size === 0) return
    const timer = setTimeout(() => setFlashingKeys(EMPTY_KEYS), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashingKeys])
  return flashingKeys
}
