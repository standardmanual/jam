/**
 * 밸런스 평가 결과를 화면이 쓰는 모양으로 바꾼다 (티켓 20260930_1459 조각 A, 순수 함수).
 *
 * 평가(`evaluate.ts`)는 경고·「점검 못 함」·확인한 규칙 수를 돌려주고, 이 파일은 그것을 항목마다 줄로 묶고 행 칩·탭 숫자·묶음 알림
 * 건수를 센다. 같은 값을 같은 방식으로 세므로 행 칩·5번째 탭 숫자·묶음 알림 건수가 서로 어긋나지 않는다(채원 완료 조건).
 * 화면 부품은 이 파일의 결과만 읽고 직접 세지 않는다. 클라이언트 부품이 불러오므로 서버 전용 코드를 끌어오지 않는다
 * (`evaluate.ts`는 타입만 가져온다).
 *
 * 세는 규칙: 주의(`warn`) 줄은 「주의」, 참고(`info`) 수준 줄과 「점검 못 함」 줄은 둘 다 「참고」다. 항목 줄이 있는 항목 수가 탭 숫자이고
 * 묶음 줄(항목 키가 없는 것)은 탭 숫자에 넣지 않는다. 묶음 알림의 건수는 항목 줄과 묶음 줄을 모두 센다.
 */
import type { BalanceEvaluation, BalanceWarning } from './evaluate'

/** 기획 상세가 화면에 넘기는 평가 결과. 평가가 실패하면 `failed`다(기획 상세는 그대로 열린다). */
export type OpsBundleBalance =
  | ({ status: 'ok'; openCollectionsNow: number | null } & BalanceEvaluation)
  | { status: 'failed' }

/** 줄 종류: 주의 · 참고 · 점검 못 함. */
export type BalanceLineKind = 'warn' | 'info' | 'unreadable'

export interface BalanceLine {
  kind: BalanceLineKind
  warning: BalanceWarning
}

export interface BalanceView {
  /** 평가 결과가 화면에 넘어왔는지(없으면 밸런스 표시를 하지 않는다). */
  available: boolean
  failed: boolean
  /** 항목 행 ID → 줄. 주의 → 참고 → 점검 못 함 순이고, 같은 종류 안에서는 규칙 순서다. */
  linesByItem: Record<string, BalanceLine[]>
  /** 항목 키가 없는 줄(R2·R3·R7 경고, 값이 틀린 규칙의 「점검 못 함」). 주의 → 참고 → 점검 못 함 순이다. */
  bundleLines: BalanceLine[]
  /** 묶음 알림 건수. `info`는 참고와 「점검 못 함」을 합친 수다. */
  totals: { warn: number; info: number }
  checkedRuleCountByItem: Record<string, number>
  /** 지금 열린 컬렉션 수(읽지 못했으면 `null`). */
  openCollectionsNow: number | null
}

const KIND_ORDER: Record<BalanceLineKind, number> = { warn: 0, info: 1, unreadable: 2 }

function sortLines(lines: BalanceLine[]): BalanceLine[] {
  // `Array.prototype.sort`는 안정 정렬이라 같은 종류 안의 규칙 순서가 그대로 남는다.
  return [...lines].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}

const EMPTY_VIEW: BalanceView = {
  available: false,
  failed: false,
  linesByItem: {},
  bundleLines: [],
  totals: { warn: 0, info: 0 },
  checkedRuleCountByItem: {},
  openCollectionsNow: null,
}

/** 평가 결과로 화면 모양을 만든다. 결과가 없으면(`undefined`) 밸런스를 표시하지 않는 빈 모양이다. */
export function buildBalanceView(balance: OpsBundleBalance | undefined): BalanceView {
  if (!balance) return EMPTY_VIEW
  if (balance.status === 'failed') return { ...EMPTY_VIEW, available: true, failed: true }

  const all: BalanceLine[] = [
    ...balance.warnings.map((warning): BalanceLine => ({ kind: warning.level === 'warn' ? 'warn' : 'info', warning })),
    ...balance.unreadable.map((warning): BalanceLine => ({ kind: 'unreadable', warning })),
  ]
  const linesByItem: Record<string, BalanceLine[]> = {}
  const bundleLines: BalanceLine[] = []
  for (const line of all) {
    if (line.warning.itemId === null) bundleLines.push(line)
    else (linesByItem[line.warning.itemId] ??= []).push(line)
  }
  for (const id of Object.keys(linesByItem)) linesByItem[id] = sortLines(linesByItem[id])

  const warn = all.filter((line) => line.kind === 'warn').length
  return {
    available: true,
    failed: false,
    linesByItem,
    bundleLines: sortLines(bundleLines),
    totals: { warn, info: all.length - warn },
    checkedRuleCountByItem: balance.checkedRuleCountByItem,
    openCollectionsNow: balance.openCollectionsNow,
  }
}

/** 행 칩: 주의 줄이 있으면 주의 N, 없고 참고·점검 못 함만 있으면 참고 N, 줄이 없으면 `null`이다. */
export function rowChipOf(lines: readonly BalanceLine[] | undefined): { level: 'warn' | 'info'; count: number } | null {
  if (!lines || lines.length === 0) return null
  const warn = lines.filter((line) => line.kind === 'warn').length
  return warn > 0 ? { level: 'warn', count: warn } : { level: 'info', count: lines.length }
}

/** 5번째 탭에 걸리는 항목 ID: 항목 줄이 하나라도 있는 항목이다(묶음 줄은 세지 않는다). */
export function balanceItemIdSet(view: BalanceView): ReadonlySet<string> {
  return new Set(Object.keys(view.linesByItem))
}

/** 항목 상세가 받는 이 항목의 밸런스 정보. */
export interface ItemBalanceInfo {
  failed: boolean
  lines: BalanceLine[]
  checkedRuleCount: number
  openCollectionsNow: number | null
}

/** 한 항목의 밸런스 정보. 결과가 화면에 넘어오지 않았으면 `undefined`(밸런스 표시를 하지 않는다). */
export function itemBalanceInfoOf(view: BalanceView, itemId: string): ItemBalanceInfo | undefined {
  if (!view.available) return undefined
  return {
    failed: view.failed,
    lines: view.linesByItem[itemId] ?? [],
    checkedRuleCount: view.checkedRuleCountByItem[itemId] ?? 0,
    openCollectionsNow: view.openCollectionsNow,
  }
}
