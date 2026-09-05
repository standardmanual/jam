import type { CSSProperties } from 'react';

export interface UnlockConditionRequirement {
  kind: 'mission' | 'badge';
  name: string;
  href: string;
  imageUrl?: string | null;
  /**
   * 항목 부제를 덮어쓴다. 기본값은 미션 → "미션", 배지 → **"배지"**.
   * (예전 기본값 "배지 · 어느 등급이든 1개"는 등급 없는 계열에서 거짓이 됐다 — 티켓 20260905_0037)
   */
  note?: string | null;
  /** 이미 충족한 항목인가. true면 라임 링 + 체크로 그린다 */
  met?: boolean;
}

export interface UnlockConditionGroup {
  /** 그룹 제목. 없으면 `met`에 따라 "통과"/"대기"로 그린다 */
  title?: string | null;
  /** 그룹 **안** 항목 결합. 기본 'or' */
  relation?: 'or' | 'and';
  /** 이 그룹이 이미 열렸는지 — 「1단 통과, 2단 대기」가 이 값으로 드러난다 */
  met?: boolean;
  /** 「이 중 2개 이상 필요해요」처럼 OR/AND로 못 담는 요구 한 줄 */
  note?: string | null;
  requirements: UnlockConditionRequirement[];
}

export interface UnlockConditionSheetContentProps {
  badgeName: string;
  rarity: 'common' | 'rare' | 'epic' | 'mystic' | null;
  /** 무한레벨형 배지의 레벨. 넘기면 등급 칩 대신 `BadgeLevelChip`을 그린다 */
  level?: number | null;
  imageUrl?: string | null;
  /** 수치 조건은 이미 채운 상태 — "조건을 다 채웠어요" 확인 줄 */
  conditionMet?: boolean;
  /** 평면 목록(구 호출부). `groups`를 넘기면 무시된다 */
  requirements: UnlockConditionRequirement[];
  /** 평면 목록의 항목 사이 관계. 기본 'or' */
  relation?: 'or' | 'and';
  /**
   * 다단계 게이트. **그룹 안은 `relation`, 그룹 사이는 언제나 AND**다 —
   * 「미션 AND (배지 A OR 배지 B)」가 이 구조로만 표현된다.
   */
  groups?: UnlockConditionGroup[] | null;
  className?: string;
  style?: CSSProperties;
}

/**
 * 잠금 해제 조건 시트의 본문. 서비스 `src/components/ui/BottomSheet.tsx` 위에 얹는다
 * (병존 구현 중 실제 화면은 서비스 쪽 시트를 쓴다).
 */
export function UnlockConditionSheetContent(props: UnlockConditionSheetContentProps): JSX.Element;
