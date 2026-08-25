/**
 * 스테이징/로컬 전용 테스트 계정을 프로덕션 공개 화면에서 제외하기 위한 공용 헬퍼.
 *
 * staging과 production은 동일한 Supabase DB를 공유한다(이 프로젝트의 알려진 제약).
 * `/api/dev-login`이 만드는 고정 테스트 유저는 staging에서 로그인 우회 확인용으로
 * 계속 존재해야 하므로 DB에서 삭제할 수 없다 — 대신 프로덕션의 랭킹/팔로잉·팔로워/
 * 유저 검색 등 "공개 유저 목록" 조회에서만 조건부로 제외한다.
 * (Service Plan/History/Migration/Ticket/20260825_027 참고)
 *
 * 환경 판별은 `/api/dev-login`의 isAllowedEnv()와 동일 기준이다 — 이중 구현 금지.
 */

/** 스테이징 또는 로컬 개발 환경인지 (dev-login 라우트와 동일 판별) */
export function isStagingOrDevEnv(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.STAGING_MODE === 'true'
  )
}

/**
 * 스테이징 전용 테스트 계정 user_id 목록.
 * 새 테스트 계정이 생기면 이 배열에만 추가하면 된다 (하드코딩 위치 단일화).
 */
export const TEST_ACCOUNT_USER_IDS: readonly string[] = [
  // dev-login이 생성하는 고정 스테이징 테스트 유저 (username: 589132427_stage)
  '00000000-0000-0000-0000-000000000001',
  // 알림(소식) 기능 QA용으로 수동 시드된 팔로잉/팔로워 상대 계정 3종
  // (username: jiwon.kim / minjun.park / sora.lee, 이메일 전부 @jam.local,
  // 생성일 2026-08-15. 이 파일 도입(027) 당시 존재를 놓쳤던 계정 — 티켓 20260825_030 후속)
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
]

/**
 * 프로덕션 공개 유저 목록(랭킹/팔로잉·팔로워/피드/검색 등)에서 제외해야 할
 * 테스트 계정 user_id 목록을 반환한다.
 *
 * staging/로컬 개발 환경에서는 빈 배열을 반환한다 — 테스트 계정 자체를 확인하는
 * 용도이므로 그 환경에서는 필터링하지 않는다.
 */
export function excludedTestUserIds(): readonly string[] {
  return isStagingOrDevEnv() ? [] : TEST_ACCOUNT_USER_IDS
}
