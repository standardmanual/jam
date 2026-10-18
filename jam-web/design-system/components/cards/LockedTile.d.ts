import type { CSSProperties } from 'react';

export interface LockedTileProps {
  /** 한 변(px). 기본 90. 부모가 더 좁으면 정사각형을 유지한 채 줄어든다 */
  size?: number;
  /** 배치용 클래스. 색·테두리는 컴포넌트가 정한다 */
  className?: string;
  style?: CSSProperties;
}

/**
 * 잠긴 아이템 배지의 잠금 타일. 한 변 `size`, `--radius-2xl`, 면 `--background`, 1px `--border`, 가운데 `LockIcon`(`--muted`).
 * 장식이라 `aria-hidden`이다. 등급 색·그라데이션·글로우는 없다.
 */
export function LockedTile(props: LockedTileProps): JSX.Element;
