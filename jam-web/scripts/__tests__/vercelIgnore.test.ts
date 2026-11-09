/**
 * `vercel-ignore.sh` 규칙 ③ — staging push는 커밋 메시지에 표식이 있을 때만 빌드한다 (티켓 20261110_0907)
 *
 * 스크립트를 실제로 실행해 종료 코드(0=건너뜀, 1=빌드)와 출력으로 판정한다. 표식이 있는 경우는 규칙 ②(직전 빌드 마커)로 이어지는데,
 * 마커 파일은 빌드가 남기는 캐시라 로컬에서 있을 수도 없을 수도 있으므로 «건너뛰는 이유가 staging 규칙이 아님»만 단정한다.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../vercel-ignore.sh', import.meta.url))
const SKIP_NOTICE = 'staging push는 커밋 메시지에 [배포]가 있을 때만'

function run(env: Record<string, string>) {
  const cwd = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  // 로컬 셸의 VERCEL_* 값이 시험에 섞이지 않게 걷어 낸다
  const base: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(base)) if (key.startsWith('VERCEL')) delete base[key]
  const result = spawnSync('bash', [SCRIPT], { cwd, encoding: 'utf8', env: { ...base, ...env } })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

const STAGING = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'staging' }

describe('vercel-ignore.sh — staging 표식 규칙', () => {
  it('표식이 없는 staging push는 건너뛴다', () => {
    const r = run({ ...STAGING, VERCEL_GIT_COMMIT_MESSAGE: '잠긴 아이템 배지 상세를 고친다 (티켓 20261110_0001)' })
    expect(r.code).toBe(0)
    expect(r.out).toContain(SKIP_NOTICE)
  })

  it.each(['[배포] 화면 확인용 빌드', '[deploy] stage build', '여러 줄 메시지\n\n본문\n[배포]'])('표식이 있으면 staging 규칙으로는 건너뛰지 않는다: %s', (message) => {
    const r = run({ ...STAGING, VERCEL_GIT_COMMIT_MESSAGE: message })
    expect(r.out).not.toContain(SKIP_NOTICE)
    expect(r.out).toContain('배포 표식이 있습니다')
  })

  it('main 브랜치는 이 규칙의 대상이 아니다', () => {
    const r = run({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_MESSAGE: '표식 없는 main 커밋' })
    expect(r.out).not.toContain(SKIP_NOTICE)
  })

  it('프로덕션 대상이 아닌 배포(review 브랜치 등)는 기존 규칙으로 그대로 건너뛴다', () => {
    const r = run({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'claude/jamwork-x', VERCEL_GIT_COMMIT_MESSAGE: '[배포] 표식이 있어도' })
    expect(r.code).toBe(0)
    expect(r.out).toContain('프로덕션 대상이 아니므로')
  })
})
