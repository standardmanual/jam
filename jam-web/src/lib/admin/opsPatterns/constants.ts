/**
 * 운영 패턴 사전의 고정 값 (티켓 20261001_2056, 상위 20260930_1503 ①, 순수 상수).
 *
 * 값의 정본은 `docs/specs/prd/ops-tool/PRD.md` §10.1이고, 테이블은 마이그레이션 `210_ops_patterns.sql`이다.
 * DB CHECK와 이 상수가 어긋나면 `__tests__/migration.test.ts`가 실패한다.
 *
 * 화면(클라이언트 부품)이 이름표를 읽을 수 있도록 **서버 전용 모듈을 끌어오지 않는다.**
 */

/** 패턴 상태 3값. `ops_patterns.status` CHECK와 같다. */
export const OPS_PATTERN_STATUSES = ['active', 'paused', 'archived'] as const
export type OpsPatternStatus = (typeof OPS_PATTERN_STATUSES)[number]

/** 사용 중(조합 뽑기에 나온다) · 쉬는 중(조합 뽑기에서만 빠진다) · 보관(읽기 응답 기본 제외). */
export const OPS_PATTERN_STATUS_LABELS: Record<OpsPatternStatus, string> = {
  active: '사용 중',
  paused: '쉬는 중',
  archived: '보관',
}

/** 패턴 번호 형식: `P01`~. 홈피드 유형 번호 T01과 구분한다. `ops_patterns.pattern_no` CHECK와 같다. */
export const OPS_PATTERN_NO_PATTERN = /^P[0-9]{2,}$/

/** 패턴이 사전에 들어온 경로. `ops_patterns.origin` CHECK와 같다. */
export const OPS_PATTERN_ORIGINS = ['seed', 'manual', 'proposal'] as const
export type OpsPatternOrigin = (typeof OPS_PATTERN_ORIGINS)[number]

/** 취향 신호의 근거 상태: 추정 · 확정. `ops_pattern_taste_signals.basis` CHECK와 같다. */
export const OPS_TASTE_BASES = ['estimate', 'confirmed'] as const
export type OpsTasteBasis = (typeof OPS_TASTE_BASES)[number]

/** 손잡이 5종. 조건·장소·시간·보상은 `{ open, closed }`, 트라이브는 `{ rule, example }`을 가진다(`ops_patterns.knobs`). */
export const OPS_PATTERN_KNOB_KEYS = ['condition', 'place', 'time', 'reward', 'tribe'] as const
export type OpsPatternKnobKey = (typeof OPS_PATTERN_KNOB_KEYS)[number]

/** 샘플이 패턴에서 맡는 역할: 주 · 보조 장치 · 걸침(`ops_patterns.samples[].role`). DB CHECK는 없고 앱이 검사한다. */
export const OPS_PATTERN_SAMPLE_ROLES = ['main', 'aux', 'related'] as const
export type OpsPatternSampleRole = (typeof OPS_PATTERN_SAMPLE_ROLES)[number]
