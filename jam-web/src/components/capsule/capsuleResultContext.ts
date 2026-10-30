'use client'

import { createContext, useContext } from 'react'

/**
 * 합친 연출이 화면에 내려주는 문맥 (티켓 20261028_1740 3회)
 *
 * `CapsuleResultProvider`(레이아웃)가 값을 내리고, 게이지(`CapsuleGauge`)와 챕터 오름 카드(`ChapterRiseWatcher`)가 읽는다.
 * 프로바이더와 게이지가 서로를 가져오지 않도록(게이지가 원 크기 함수를 내보내고 프로바이더가 그것을 가져온다) 문맥만 이 파일에 따로 둔다.
 * 프로바이더 밖(시험·다른 화면)에서는 아래 기본값이라 아무 일도 일어나지 않는다.
 */
export interface CapsuleResultContextValue {
  /** 결과가 있고 연출이 아직 끝나지 않았다. 챕터 오름 카드는 이 동안 기다린다 */
  resultPending: boolean
  /** 게이지를 2% 원에 붙들어야 한다(연출이 뜨기 전과 떠 있는 동안) */
  gaugeHeld: boolean
  /** 게이지의 채움 요소를 알린다. 연출이 이 자리에서 번져 나간다. 게이지가 사라질 때 null로 부른다 */
  registerGaugeFill: (element: HTMLElement | null) => void
}

const NOOP = () => {}

export const DEFAULT_CAPSULE_RESULT_CONTEXT: CapsuleResultContextValue = {
  resultPending: false,
  gaugeHeld: false,
  registerGaugeFill: NOOP,
}

export const CapsuleResultContext = createContext<CapsuleResultContextValue>(DEFAULT_CAPSULE_RESULT_CONTEXT)

export function useCapsuleResult(): CapsuleResultContextValue {
  return useContext(CapsuleResultContext)
}
