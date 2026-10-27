/**
 * 개발·배포 상황판 상수 (티켓 20261026_2028 2회차, 어드민 상황판 PRD §8)
 *
 * 저장소 이름·브랜치·읽는 파일 경로·환경 이름처럼 GitHub 읽기와 보드 계산이 같이 쓰는 값이다.
 * 파일 경로는 `scripts/gen-ticket-index.mjs`의 `TICKET_INDEX_PATH`와 같은 값이다(스크립트는 .mjs라 가져오지 않고 시험이 맞춘다).
 */

export const GITHUB_REPO = 'standardmanual/jam'

export const STAGING_BRANCH = 'staging'
export const MAIN_BRANCH = 'main'

export const TICKET_INDEX_PATH = 'docs/tickets/_index.json'
export const DEPLOY_STATE_PATH = 'docs/operations/deploy-state.json'

/** 서버 전용 읽기 토큰의 환경변수 이름. 없으면 토큰 없이 읽는다(시간당 60번 한도). */
export const GITHUB_TOKEN_ENV = 'GITHUB_READ_TOKEN'

/**
 * 프로덕션 마지막 배포를 찾는 GitHub 환경 이름. 가운뎃줄은 하이픈이 아니라 엔대시(–, U+2013)다.
 * 옛 이름 `Production`은 2026-08-14에서 멈췄다(2026-10-27 실제 응답). 이름이 바뀌면 배포를 못 찾고 main 마지막 커밋 시각으로 대신한다.
 */
export const PROD_DEPLOY_ENVIRONMENT = 'Production – jam'

/** 읽기 결과를 모듈 안에 기억하는 시간(밀리초). */
export const READ_MEMORY_MS = 60_000
/** GitHub 요청 한 번의 제한 시간(밀리초). */
export const GITHUB_TIMEOUT_MS = 10_000

/** 「배포됨」 칸에 세는 기간(일). `closed` 기준, KST 날짜로 센다. */
export const DEPLOYED_WINDOW_DAYS = 14
/** 보드 칸마다 담는 카드 수 상한. 전체 개수는 따로 준다. */
export const BOARD_COLUMN_LIMIT = 30

/** JAM 2.0 상위 티켓. 묶음 티켓은 이 티켓의 하위다. */
export const JAM2_ROOT_ID = '20261016_2335'

export interface Jam2Bundle {
  number: number
  /** 상위 티켓 표의 「묶음」 열 이름(번호와 «(CLOSED …)» 표시는 뺀다). */
  name: string
  ticketId: string
}

/**
 * 묶음 0~7. 번호·이름·티켓 ID는 상위 티켓 `20261016_2335`의 「묶음」 표와 같아야 한다(시험이 대조한다).
 * 「오픈 전」 행은 JAM 2.0 기능 묶음이 아니라서 넣지 않는다.
 */
export const JAM2_BUNDLES: readonly Jam2Bundle[] = [
  { number: 0, name: '정리', ticketId: '20261016_2336' },
  { number: 1, name: '기반', ticketId: '20261016_2337' },
  { number: 2, name: '활동에서 보상까지', ticketId: '20261017_1420' },
  { number: 3, name: '캡슐과 인벤토리', ticketId: '20261018_0050' },
  { number: 4, name: '장소와 배지', ticketId: '20261018_1811' },
  { number: 5, name: '챕터·미션·포인트', ticketId: '20261019_1310' },
  { number: 6, name: '입장과 퇴장', ticketId: '20261021_1246' },
  { number: 7, name: '운영과 컨텐츠', ticketId: '20261022_1131' },
]
