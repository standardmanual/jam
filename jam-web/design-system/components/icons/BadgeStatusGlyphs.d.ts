export interface BadgeStatusGlyphProps {
  /** px. 기본 11 (chevron만 20) */
  size?: number;
}

/** 잠김 — Material Symbols 채움 스타일(`viewBox="0 -960 960 960"`, `fill="currentColor"`) */
export function LockGlyph(props: BadgeStatusGlyphProps): JSX.Element;
/** 획득·통과 */
export function CheckGlyph(props: BadgeStatusGlyphProps): JSX.Element;
/** 교차 게이트(선행 배지) — 자물쇠와 형태로 갈라 둔다 */
export function StarGlyph(props: BadgeStatusGlyphProps): JSX.Element;
/** 펼침/접힘 */
export function ChevronDownGlyph(props: BadgeStatusGlyphProps): JSX.Element;
