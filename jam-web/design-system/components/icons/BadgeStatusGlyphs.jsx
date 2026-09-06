import React from 'react';

/**
 * BadgeStatusGlyphs — 배지 화면의 상태 글리프 단일 소스. 티켓 20260906_2140 (F-2).
 *
 * ## 왜 모았나
 *
 * 같은 자물쇠·체크 SVG가 `BadgeStageRail.jsx`와 `BadgeProgressRingCard.jsx`에 **각각
 * 선언**돼 있었다. 두 벌이면 한쪽만 고쳐도 아무도 눈치채지 못한 채 화면에서 갈라진다 —
 * 실제로 두 파일의 기본 크기가 11px / 10px로 이미 달랐다.
 *
 * ## 스타일 규칙 (바꾸지 않는다)
 *
 * TabBar와 **같은 Material Symbols 채움 스타일**이다: `viewBox="0 -960 960 960"` +
 * `fill="currentColor"`. 색은 부모의 `color`로만 제어한다.
 *
 * ⚠️ 서비스 `src/components/ui/icons.tsx`의 `LockIcon`은 **stroke 아웃라인**이라 다른
 * 물건이다 — 배지 화면에서 그걸 쓰지 않는다(같은 자물쇠가 두 가지 굵기로 보인다).
 * ⚠️ 이모지(🔒 등)를 도입하지 않는다. 플랫폼마다 다른 그림이 그려지고 색을 못 맞춘다.
 */

/** 잠김 — 미획득 눈금 마커·게이트 버튼. 미션 게이트는 부모가 `--color-primary`를 준다 */
export function LockGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z" />
    </svg>
  );
}

/** 획득·통과 — 획득 눈금 마커, 이미 열린 게이트, 충족된 축 */
export function CheckGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
    </svg>
  );
}

/**
 * 교차 게이트(다른 계열의 선행 배지) 표식. 미션 게이트(자물쇠 + `--color-primary`)와
 * **형태로도** 갈라 둔다 — 미션 자물쇠의 대비가 4.18:1로 텍스트 기준에는 못 미쳐(비텍스트
 * 기준 3:1은 통과) 색 하나에만 의존하면 구분이 위태롭다.
 */
export function StarGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="m354-247 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z" />
    </svg>
  );
}

/** 펼침/접힘 표시 — `BadgeFamilyCardHeader`의 「자세히」에 붙는다 */
export function ChevronDownGlyph({ size = 20 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
  );
}
