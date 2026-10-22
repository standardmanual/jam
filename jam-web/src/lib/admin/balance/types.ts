/**
 * 밸런스 설정 화면의 구역 계약 (티켓 20261022_1132, 운영 로직 19.1절)
 *
 * 구역 하나는 `BalanceSectionBinding` 한 객체로 모인다: 칸 정의(`fields`), 읽기(`read`), 저장(`write`), 칸 사이 검증(`validateTogether`).
 * 공용 저장(`save.ts`)·이력(`history.ts`)·저장 라우트·구역 화면은 이 객체만 보므로 **구역을 더하는 일은 연결 객체 하나와 레지스트리(`sections.tsx`) 한 줄**이다.
 *
 * `BalanceFieldDef`는 서버 컴포넌트에서 클라이언트 폼으로 넘어가므로 함수 없이 **값만** 담는다(검증은 `fields.ts`의 `checkFieldValue`가 같은 값으로 한다).
 * 이 파일은 타입만 있어 클라이언트에서도 쓴다.
 */
import type { createServiceClient } from '@/lib/supabase/server'

export type BalanceServiceClient = ReturnType<typeof createServiceClient>

/** 칸 이름(DB 컬럼 또는 `chapter:3` 같은 행 키) → 숫자 값. */
export type BalanceValues = Record<string, number>

/** 정수 칸이 DB `INTEGER`를 넘치지 않게 하는 상한. */
export const INTEGER_MAX = 2_147_483_647

export interface BalanceFieldDef {
  /** 칸 이름. 저장 본문·이력의 `field`와 같다. */
  key: string
  label: string
  /** 입력 옆 단위(배, 주, 잼, %, 개 등). */
  unit?: string
  /** 칸 아래 안내 한 줄. */
  hint?: string
  /** 화면에서 칸을 묶는 소제목. 같은 소제목이 이어지는 칸끼리 한 묶음이다. */
  group?: string
  /** 소수 자릿수 상한. 0이면 정수 칸이다. */
  decimals: number
  min: number
  max: number
  /** 코드의 기본값(`DEFAULT_*_POLICY`). 칸 옆에 작게 보이고, «기본값으로 되돌리기» 버튼은 만들지 않는다. */
  defaultValue: number
  /** 이 칸을 바꾸면 확률 안내 페이지(`/probability`)에 함께 반영되는지. */
  affectsDisclosure: boolean
}

/** 저장 한 번에서 바뀐 칸 하나. 이력의 `changes` JSON 배열 한 줄이다. (타입 별칭이라야 `Json`에 들어간다) */
export type BalanceChange = { field: string; from: number; to: number }

export interface BalanceSnapshot {
  values: BalanceValues
  /** 화면이 읽은 때의 `updated_at`. 저장 때 그대로 돌려보내 동시 수정을 가른다. */
  updatedAt: string
}

export interface BalanceWriteInput {
  /** 바뀐 칸만 담긴 새 값. */
  values: BalanceValues
  /** 이 값과 같을 때만 갱신한다. */
  expectedUpdatedAt: string
  /** 갱신 뒤의 `updated_at`(갱신 트리거가 없어 저장이 직접 올린다). */
  nextUpdatedAt: string
}

export type BalanceWriteResult =
  | { ok: true; updatedAt: string }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'error'; message: string }

export interface BalanceSectionBinding {
  /** 구역 키. 이력의 `section_key`이고 저장 경로의 `[section]`이다. */
  id: string
  fields: readonly BalanceFieldDef[]
  /** 칸별 추가 검사(`lib/jam/policy.ts`의 `VALIDATORS`처럼 DB CHECK와 같은 기준을 코드로 둔 것). 칸 정의의 범위 검사에 더해 서버가 한 번 더 건다. */
  validators?: Readonly<Record<string, (n: number) => boolean>>
  /** 합쳐진 전체 값으로 칸 사이 관계를 검사한다(등급 확률 합 100 등). 칸 이름 → 문장. 문제가 없으면 빈 객체. */
  validateTogether?: (values: BalanceValues) => Record<string, string>
  /** 현재 값을 읽는다. 읽지 못하면 던진다. */
  read: (service: BalanceServiceClient) => Promise<BalanceSnapshot>
  /** `expectedUpdatedAt`과 같을 때만 갱신한다. 0행이면 `conflict`다. */
  write: (service: BalanceServiceClient, input: BalanceWriteInput) => Promise<BalanceWriteResult>
}
