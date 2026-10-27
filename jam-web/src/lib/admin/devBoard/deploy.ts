/**
 * 배포 상태 계산 (티켓 20261026_2028 2회차, 어드민 상황판 PRD §8). 순수 함수만 둔다.
 *
 * 배포 상태 파일 `docs/operations/deploy-state.json`은 동결 결정과 다음 배포 일정의 단일 원천이다.
 */
import type { DeployLabel } from './types'

export interface DeployState {
  frozen: boolean
  reason: string
  nextDeploy: string
}

/**
 * 배포 상태 파일을 읽는다. `frozen`이 불리언이 아니거나 JSON이 깨졌으면 null.
 * `reason`·`nextDeploy`가 없거나 문자열이 아니면 빈 문자열. 모르는 필드(`_comment` 등)는 무시한다.
 */
export function parseDeployState(raw: string): DeployState | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const row = data as Record<string, unknown>
  if (typeof row.frozen !== 'boolean') return null
  return {
    frozen: row.frozen,
    reason: typeof row.reason === 'string' ? row.reason : '',
    nextDeploy: typeof row.nextDeploy === 'string' ? row.nextDeploy : '',
  }
}

/**
 * 상태 글자. 동결이면 「동결」, 아니고 앞선 커밋이 있으면 「배포 가능」, 없으면 「배포할 것 없음」.
 * 파일을 못 읽었거나(`frozen` null), 동결이 아닌데 앞선 커밋 수를 모르면 「확인 안 됨」.
 */
export function deployStateLabel({ frozen, ahead }: { frozen: boolean | null; ahead: number | null }): DeployLabel {
  if (frozen === null) return '확인 안 됨'
  if (frozen) return '동결'
  if (ahead === null) return '확인 안 됨'
  return ahead > 0 ? '배포 가능' : '배포할 것 없음'
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** ISO 시각의 KST 날짜 `YYYY-MM-DD`. 읽을 수 없는 시각이면 null. */
export function kstDateOf(iso: string): string | null {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10)
}
