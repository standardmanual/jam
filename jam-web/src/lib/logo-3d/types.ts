// 티켓 20261103_1350 — 3D 로고 제너레이터 형상 엔진의 입출력 형식.
// 모든 길이는 로고 높이를 1로 둔 비율이다.

export type Point = readonly [number, number];

/** 닫힌 고리. 마지막 점을 첫 점과 중복해서 넣지 않는다. */
export type Ring = Point[];

/** 바깥 윤곽 하나와 그 안의 구멍들. */
export type OutlinePolygon = { outer: Ring; holes: Ring[] };

/** 글자마다 하나. 높이 1, 가로·세로 중앙 정렬. */
export type LogoOutline = OutlinePolygon[];

export type Logo3DParams = {
  /** 압출 두께(틀의 윗면에서 아랫면까지) */
  depth: number;
  /** 틀 폭 */
  frameWidth: number;
  /** 틀이 타일보다 앞(위)으로 튀어나온 양 */
  frameFrontProtrusion: number;
  /** 틀 모서리 베벨 반지름 */
  frameBevelRadius: number;
  /** 타일 모서리 베벨 반지름 */
  tileBevelRadius: number;
  /** 타일 두께 */
  tileThickness: number;
  /** 바깥 윤곽 모서리의 평면 반지름 */
  cornerRadiusOuter: number;
  /** 틀 안쪽 윤곽 모서리의 평면 반지름 */
  cornerRadiusInner: number;
  /** 타일과 틀 안쪽 벽 사이의 틈 */
  gap: number;
};

export const DEFAULT_LOGO3D_PARAMS: Logo3DParams = {
  depth: 0.3,
  frameWidth: 0.03,
  frameFrontProtrusion: 0.016,
  frameBevelRadius: 0.0145,
  tileBevelRadius: 0.016,
  tileThickness: 0.036,
  cornerRadiusOuter: 0.05,
  cornerRadiusInner: 0.04,
  gap: 0.0012
};

export type Logo3DParamRange = { min: number; max: number; step: number };

/** 슬라이더 범위. 화면이 그대로 쓴다. */
export const LOGO3D_PARAM_RANGES: Record<keyof Logo3DParams, Logo3DParamRange> = {
  depth: { min: 0.1, max: 0.6, step: 0.01 },
  frameWidth: { min: 0.01, max: 0.08, step: 0.001 },
  frameFrontProtrusion: { min: 0, max: 0.05, step: 0.001 },
  frameBevelRadius: { min: 0.002, max: 0.04, step: 0.0005 },
  tileBevelRadius: { min: 0.002, max: 0.03, step: 0.0005 },
  tileThickness: { min: 0.01, max: 0.1, step: 0.001 },
  cornerRadiusOuter: { min: 0.005, max: 0.12, step: 0.001 },
  cornerRadiusInner: { min: 0.005, max: 0.1, step: 0.001 },
  gap: { min: 0, max: 0.01, step: 0.0001 }
};
