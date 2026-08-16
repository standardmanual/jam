import type { ReactNode, CSSProperties } from 'react';

export interface CollectionGridCardProps {
  name: string;
  imageUrl?: string | null;
  /** 수집한 슬롯 수. */
  collected: number;
  /** 전체 슬롯 수. */
  total: number;
  /** true → 썸네일 좌상단에 "완성" 뱃지 표시. */
  completed?: boolean;
  /** Link 모드 — <a href> 래핑. onClick과 상호 배타. */
  href?: string;
  /** Button 모드 — <button> 래핑. href와 상호 배타. */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function CollectionGridCard(props: CollectionGridCardProps): JSX.Element;
