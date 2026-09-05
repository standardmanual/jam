import type { ReactNode, CSSProperties } from 'react';

export interface TopNavProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  /** 있으면 뒤로가기 버튼을 `<a href>`로 렌더링한다(onBack보다 우선). */
  backHref?: string;
  /** 우측 액션(+아바타 등) 슬롯. 여러 노드를 이어붙여 넘기면 된다. */
  rightSlot?: ReactNode;
  /** 좌측 영역의 back+title 블록 대신 렌더링할 노드(탭 최상위 페이지의 로고 표시용). */
  logo?: ReactNode;
  /**
   * 좌/우 사이 중앙 고정폭 슬롯(스트라바 동기화 버튼 등 도메인 결합 콘텐츠용).
   * 서비스 래퍼가 내부적으로만 채우는 슬롯이라 서비스 TopNavProps에는 노출되지 않는다.
   */
  centerSlot?: ReactNode;
  /** header 엘리먼트에 적용할 인라인 스타일(배경색 오버라이드 등). */
  headerStyle?: CSSProperties;
}

export function TopNav(props: TopNavProps): JSX.Element;
