import type { CSSProperties, ReactNode } from 'react';

export interface MixerSlotProps {
  status?: 'empty' | 'locked' | 'filled';
  /** empty/locked일 때 보여줄 타입 아이콘 */
  icon?: ReactNode;
  /** empty/locked일 때 보여줄 안내 문구(필요 배지 이름 등) */
  label?: string;
  /** filled일 때 배지 썸네일 URL */
  imageUrl?: string | null;
  /** filled일 때 배지 이름 */
  name?: string;
  /** 슬롯 탭 핸들러 */
  onClick?: () => void;
  /** filled일 때만 렌더되는 제거 버튼 핸들러 — 없으면 제거 버튼을 그리지 않는다 */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function MixerSlot(props: MixerSlotProps): JSX.Element;
