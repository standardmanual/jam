import type { CSSProperties, ReactNode } from 'react';

/** 눈금 하나의 화면 상태. 「조건」 판정은 이 컴포넌트가 하지 않는다 — 호출부가 넘긴다 */
export type BadgeStageRailStopStatus = 'earned' | 'ready' | 'locked' | 'not-reached';

/** 그 눈금 앞을 막고 있는 문 하나 */
export interface BadgeStageRailGate {
  /** 미션(프라이머리 자물쇠) / 교차·선행 배지(중성 별) */
  kind: 'mission' | 'cross';
  /** 이미 통과한 문인가. true면 체크+라임으로 그린다 — 「1단 통과, 2단 대기」가 여기서 읽힌다 */
  met?: boolean;
}

export interface BadgeStageRailStop {
  id: string;
  /** 무한레벨형은 등급이 없다(`null`) — 그 경우 레일이 아니라 `BadgeLevelGauge`를 쓴다 */
  rarity: 'common' | 'rare' | 'epic' | 'mystic' | null;
  imageUrl?: string | null;
  description?: string | null;
  status: BadgeStageRailStopStatus;
  href: string;
  /** 최대 2개까지 그린다(자리 폭 44px). 넘기지 않으면 종류 없는 자물쇠 하나 */
  gates?: BadgeStageRailGate[];
  /**
   * 「무엇이 얼마나 필요한가」 완성 문자열(「4km」·「6일 연속 · 5회」).
   * `not-reached` 눈금의 캡션 자리에만 쓴다 — 없으면 기존 `'—'`.
   * **이 컴포넌트는 조건을 해석하지 않는다**(`src/lib/badgeProgressText.ts`가 조립한다).
   */
  conditionText?: string | null;
}

/** 프런티어 눈금 캡션 + 연결선 비례 채움. `src/lib/badgeProgressText.ts`가 조립한다 */
export interface BadgeStageRailFrontierProgress {
  text: string;
  /** 0~1 */
  fraction: number;
  /** 진행 미지원 — 상태색 대신 중립색 */
  muted?: boolean;
  /** 텍스트가 임시 상태 표기(「진행 표시 준비 중」)다 — 기울임으로 그린다. 조건값은 false */
  pending?: boolean;
}

export interface BadgeStageRailProps {
  familyName: string;
  /**
   * Common→Mystic 순, 존재하는 등급만. **최대 4개** — 넘기면 개발 빌드는 throw하고
   * 프로덕션은 앞 4개만 그린다.
   */
  stops: BadgeStageRailStop[];
  /** 반복형 계열의 누적 획득 횟수 — 헤더 메타 줄 앞 `×N` 칩. `null`이면 그리지 않는다 */
  earnCount?: number | null;
  /**
   * 헤더 우측 진행률(0~1). `null`이면 퍼센트를 적지 않는다(진행 계산 불가).
   * `frontierProgress`와 별도 prop인 이유: 진행 앵커가 없는 계열에서도 헤더는 그려진다.
   */
  headerFraction?: number | null;
  /** 헤더 퍼센트 옆 라벨(보통 다음 등급명 `Epic`). 완성 문자열만 받는다 */
  /** 헤더 2행(메타 줄). `null`이면 그리지 않는다 */
  headerMeta?: ReactNode;
  /** 다음으로 노려야 할 등급 라벨("Epic"). 전부 획득했으면 `null`(기본값 없음 — 항상 명시) */
  nextRarityLabel: string | null;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** ready/locked 눈금(또는 그 앞 게이트) 탭 시 받는 방법 시트 요청 */
  onLockClick: (stopId: string) => void;
  /** 기본값 없음 — 항상 `frontierProgress={... ?? null}` 형태로 명시해 넘긴다 */
  frontierProgress: BadgeStageRailFrontierProgress | null;
  /**
   * 진행 표시를 그릴 눈금 id — 호출부(서버)가 「첫 미충족」 기준으로 정한다.
   * `null`이면 첫 미획득 눈금에 그린다. 게이트 자리·「앞 구간 꽉 채움」은 이 값과 무관하다.
   * 기본값 없음 — 항상 `progressStopId={... ?? null}` 형태로 명시해 넘긴다.
   */
  progressStopId: string | null;
  /** 기록형 "아쉬움 줄" 완성 문장. 기본값 없음 — 항상 명시 */
  regretLine: string | null;
  /**
   * 카드 안쪽 아래에 붙는 보조 구획 — 2축형 게이지(`DualAxisGauge`)가 여기로 들어온다
   * (티켓 20260906_2140: 별도 카드에서 레일 카드 안의 구획으로).
   */
  secondarySection?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * 계열(등급별 눈금) 진행 레일. **등급 4단계 전용**이다 — 무한레벨형은 `BadgeLevelGauge`,
 * 반복형 계열의 카운터 행은 `BadgeStampRow`를 쓴다.
 */
export function BadgeStageRail(props: BadgeStageRailProps): JSX.Element;
