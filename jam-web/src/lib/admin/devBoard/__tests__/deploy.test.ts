/**
 * 배포 상태 계산 (티켓 20261026_2028 2회차)
 *
 * 지키는 것:
 * - 배포 상태 파일: frozen은 불리언만, 모르는 필드(_comment)는 무시, 저장소의 실제 파일을 읽을 수 있음
 * - 상태 글자 네 가지, KST 날짜 변환(날짜 경계), 상수가 색인 생성기·환경 이름과 어긋나지 않음
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/deploy.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { DEPLOY_STATE_PATH, PROD_DEPLOY_ENVIRONMENT, TICKET_INDEX_PATH } from '../constants'
import { deployStateLabel, kstDateOf, parseDeployState } from '../deploy'

const REPO_ROOT = resolve(__dirname, '../../../../../..')

describe('parseDeployState', () => {
  it('필드를 읽고 _comment 같은 모르는 필드는 무시한다', () => {
    const raw = JSON.stringify({ _comment: ['x'], frozen: true, reason: '사유', nextDeploy: '다음', extra: 1 })
    expect(parseDeployState(raw)).toEqual({ frozen: true, reason: '사유', nextDeploy: '다음' })
  })

  it('reason·nextDeploy가 없으면 빈 문자열이다', () => {
    expect(parseDeployState('{"frozen":false}')).toEqual({ frozen: false, reason: '', nextDeploy: '' })
  })

  it('frozen이 불리언이 아니거나 JSON이 깨졌으면 null이다', () => {
    expect(parseDeployState('{"frozen":"true"}')).toBeNull()
    expect(parseDeployState('{}')).toBeNull()
    expect(parseDeployState('[]')).toBeNull()
    expect(parseDeployState('{')).toBeNull()
  })

  it('저장소의 실제 배포 상태 파일을 읽을 수 있다', () => {
    const state = parseDeployState(readFileSync(resolve(REPO_ROOT, DEPLOY_STATE_PATH), 'utf-8'))
    expect(state).not.toBeNull()
    expect(state?.reason).not.toBe('')
  })
})

describe('deployStateLabel', () => {
  it('동결이면 앞선 커밋과 상관없이 「동결」이다', () => {
    expect(deployStateLabel({ frozen: true, ahead: 1273 })).toBe('동결')
    expect(deployStateLabel({ frozen: true, ahead: null })).toBe('동결')
  })

  it('동결이 아니면 앞선 커밋 유무로 가른다', () => {
    expect(deployStateLabel({ frozen: false, ahead: 3 })).toBe('배포 가능')
    expect(deployStateLabel({ frozen: false, ahead: 0 })).toBe('배포할 것 없음')
  })

  it('상태 파일을 못 읽었거나 동결이 아닌데 앞선 수를 모르면 「확인 안 됨」이다', () => {
    expect(deployStateLabel({ frozen: null, ahead: 5 })).toBe('확인 안 됨')
    expect(deployStateLabel({ frozen: false, ahead: null })).toBe('확인 안 됨')
  })
})

describe('kstDateOf', () => {
  it('UTC 15:00 이후는 KST 다음 날이다', () => {
    expect(kstDateOf('2026-10-14T07:31:59Z')).toBe('2026-10-14')
    expect(kstDateOf('2026-10-14T14:59:59Z')).toBe('2026-10-14')
    expect(kstDateOf('2026-10-14T15:00:00Z')).toBe('2026-10-15')
  })

  it('읽을 수 없는 시각이면 null이다', () => {
    expect(kstDateOf('아님')).toBeNull()
  })
})

describe('상수', () => {
  it('프로덕션 환경 이름의 가운뎃줄은 엔대시(U+2013)다', () => {
    expect(PROD_DEPLOY_ENVIRONMENT).toBe('Production – jam')
    expect(PROD_DEPLOY_ENVIRONMENT).not.toContain('-')
  })

  it('색인 경로가 생성기의 상수와 같다', () => {
    const script = readFileSync(resolve(REPO_ROOT, 'scripts/gen-ticket-index.mjs'), 'utf-8')
    expect(script).toContain(`TICKET_INDEX_PATH = '${TICKET_INDEX_PATH}'`)
  })
})
