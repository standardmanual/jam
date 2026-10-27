/**
 * 개발·배포 상황판 화면 계산 (티켓 20261026_2028 3회차, 어드민 상황판 PRD §8). 순수 함수만 둔다.
 *
 * 링크 주소, 시각·커밋 글자, 묶음 막대 비율, 읽기 안내 줄을 만든다. 서버 모듈(`github.ts`·`load.ts`)은 가져오지 않는다.
 */
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import { GITHUB_REPO, GITHUB_TOKEN_ENV, STAGING_BRANCH } from './constants'
import type { BoardColumnKey, BundleProgress, DevBoardSnapshot, SourceKey, SourceState } from './types'

/** 보드 칸 이름 */
export const BOARD_COLUMN_TITLES: Record<BoardColumnKey, string> = {
  waiting: '대기',
  progress: '진행',
  staged: 'staging 반영',
  deployed: '배포됨',
}

/** GitHub의 티켓 파일 주소. 경로를 `/`로 나눠 조각마다 인코딩한다(한글·특수문자가 든 파일 이름). */
export function ticketUrl(path: string): string {
  const encoded = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://github.com/${GITHUB_REPO}/blob/${STAGING_BRANCH}/${encoded}`
}

/** `YYYY.MM.DD HH:mm`(KST). 읽을 수 없는 시각이면 빈 문자열 */
export function formatKstDateTime(iso: string): string {
  if (Number.isNaN(Date.parse(iso))) return ''
  return formatKstYmdHm(iso)
}

/** 커밋 7자리. 없으면 빈 문자열 */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : ''
}

export interface BundleBar {
  /** 끝남·진행·남음 비율(0~100, 소수 둘째 자리). 합이 100이 되도록 남음이 나머지를 받는다 */
  done: number
  active: number
  remaining: number
}

function percent(part: number, total: number): number {
  return Math.round((part / total) * 10_000) / 100
}

/** 묶음 막대의 비율. 하위 티켓이 없으면(합계 0) null */
export function bundleBarOf(bundle: Pick<BundleProgress, 'done' | 'active' | 'remaining' | 'total'>): BundleBar | null {
  if (bundle.total <= 0) return null
  const done = percent(bundle.done, bundle.total)
  const active = percent(bundle.active, bundle.total)
  return { done, active, remaining: Math.round((100 - done - active) * 100) / 100 }
}

/** 읽기 안내 줄 하나. [현상] → [원인] → [해결] */
export interface ReadNotice {
  key: string
  summary: string
  cause: string
  fix: string
}

const SOURCE_ORDER: readonly SourceKey[] = ['compare', 'deployment', 'mainIndex', 'deployState', 'requests']

function isFailed(state: SourceState): boolean {
  return state === 'error' || state === 'rate_limited'
}

/**
 * 문제가 있는 읽기만 안내 줄로 만든다. 문제가 없으면 빈 배열.
 * - 한도 초과(`rate_limited`)는 어느 출처든 한 줄로 합쳐 맨 앞에 둔다(토큰 안내).
 * - `mainIndex`가 `missing`이면 정상이라 안내하지 않는다(추정 표시만 쓴다). `deployment`가 `missing`이면 main 마지막 커밋 시각으로 대신해 안내하지 않는다.
 * - `stagingIndex`는 보드·묶음 자리의 안내 카드가 말하므로(`indexUnavailableDescription`) 여기서는 한도 초과 합침에만 센다.
 */
export function noticesOf(snapshot: Pick<DevBoardSnapshot, 'sources'>): ReadNotice[] {
  const { sources } = snapshot
  const notices: ReadNotice[] = []

  const limited = (Object.keys(sources) as SourceKey[]).some((key) => sources[key] === 'rate_limited')
  if (limited) {
    notices.push({
      key: 'rate_limited',
      summary: 'GitHub에서 일부를 불러오지 못했어요',
      cause: '읽기 한도를 넘었어요',
      fix: `서버에 ${GITHUB_TOKEN_ENV}를 설정하면 한도가 늘어요`,
    })
  }

  for (const key of SOURCE_ORDER) {
    const state = sources[key]
    if (state === 'rate_limited') continue
    if (key === 'compare' && isFailed(state)) {
      notices.push({
        key,
        summary: '앞선 커밋 수를 불러오지 못했어요',
        cause: 'GitHub 응답을 받지 못했어요',
        fix: '잠시 뒤 새로 고쳐 주세요',
      })
    } else if (key === 'deployment' && isFailed(state)) {
      notices.push({
        key,
        summary: '마지막 프로덕션 배포를 불러오지 못했어요',
        cause: 'GitHub 응답을 받지 못했어요',
        fix: '잠시 뒤 새로 고쳐 주세요',
      })
    } else if (key === 'mainIndex' && isFailed(state)) {
      notices.push({
        key,
        summary: '배포됨은 임시 추정이에요',
        cause: 'main의 티켓 색인을 읽지 못했어요',
        fix: '잠시 뒤 새로 고쳐 주세요',
      })
    } else if (key === 'deployState' && state !== 'ok') {
      notices.push({
        key,
        summary: '배포 상태가 「확인 안 됨」이에요',
        cause: state === 'missing' ? 'staging에 배포 상태 파일이 아직 없어요' : '배포 상태 파일을 읽지 못했어요',
        fix: state === 'missing' ? '파일이 staging에 올라간 뒤 새로 고쳐 주세요' : '파일 형식을 확인하고 새로 고쳐 주세요',
      })
    } else if (key === 'requests' && isFailed(state)) {
      notices.push({
        key,
        summary: '개발 요청을 불러오지 못했어요',
        cause: '저장된 요청을 읽지 못했어요',
        fix: '잠시 뒤 새로 고쳐 주세요',
      })
    }
  }
  return notices
}

/** staging 색인을 못 읽었을 때 보드·묶음 자리 안내 카드의 설명 */
export function indexUnavailableDescription(state: SourceState): string {
  if (state === 'rate_limited') return `GitHub 읽기 한도를 넘었어요. 서버에 ${GITHUB_TOKEN_ENV}를 설정하면 한도가 늘어요`
  if (state === 'missing') return 'staging에 티켓 색인 파일이 없어요. 색인이 올라간 뒤 새로 고쳐 주세요'
  return 'GitHub에서 티켓 색인을 읽지 못했어요. 잠시 뒤 새로 고쳐 주세요'
}
