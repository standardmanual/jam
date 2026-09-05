import type { CSSProperties, ReactNode } from 'react';

export interface BadgeStatusSectionProps {
  /** 섹션 제목 — 배지 트리는 "다음 목표"·"받은 배지" 둘만 쓴다(설계 분류를 노출하지 않는다) */
  title: string;
  /** 접힘 상태에서도 보이는 개수. `null`이면 감춘다 */
  count?: number | null;
  /** 제어 모드 펼침 상태. 넘기지 않으면 비제어(`defaultOpen`) */
  open?: boolean;
  defaultOpen?: boolean;
  /** 펼쳐질 때 그 섹션의 진행 계산을 요청하는 신호 */
  onOpenChange?: (open: boolean) => void;
  /** 펼쳤는데 내용이 없을 때 보여줄 한 줄 */
  emptyText?: string | null;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * 배지 트리 상태 섹션 하나. 각 섹션이 **독립으로** 접히고(= `Accordion`의 "한 번에 하나만
 * 열림"과 다르다), 펼쳤을 때만 본문을 렌더해 진행 계산량을 줄인다.
 */
export function BadgeStatusSection(props: BadgeStatusSectionProps): JSX.Element;
