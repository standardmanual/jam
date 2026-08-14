import type { CSSProperties } from 'react';

export interface WanderingEyesLoaderProps {
  /** 한 사이클(눈동자 이동 + 깜빡임) 길이 — default "2s" */
  duration?: string;
  /** 흰자 색상 — default "#f8fafc" */
  eyeColor?: string;
  /** 눈동자 색상 — default "#0f172a" */
  pupilColor?: string;
  style?: CSSProperties;
}

export function WanderingEyesLoader(props: WanderingEyesLoaderProps): JSX.Element;
