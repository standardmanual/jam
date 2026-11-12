import type { ReactNode } from 'react';

export interface LoadMoreButtonProps {
  /** true면 스피너와 함께 비활성(중복 탭 차단) */
  loading?: boolean;
  onClick: () => void;
  /** 레이블 — «더보기», 오류 뒤에는 «다시 시도» 등 호출부가 정한다 */
  children: ReactNode;
}

export function LoadMoreButton(props: LoadMoreButtonProps): JSX.Element;
