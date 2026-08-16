import type { ReactNode, CSSProperties } from 'react';

export interface ListRowCardProps {
  /** 좌측 40×40 아이콘 영역 — 크기·형태·배경 모두 호출부에서 결정. */
  icon?: ReactNode;
  title?: string;
  subtitle?: ReactNode;
  /** 우측 슬롯 (화살표 아이콘, 팔로우 버튼, 상태 칩 등). */
  trailing?: ReactNode;
  /** 텍스트 영역 전체 커스텀 렌더링 — 제공 시 title/subtitle 무시. */
  children?: ReactNode;
  /** Link 모드 — <a href> 래핑. onClick과 상호 배타. */
  href?: string;
  /** Button 모드 — <button> 래핑. href와 상호 배타. */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function ListRowCard(props: ListRowCardProps): JSX.Element;
