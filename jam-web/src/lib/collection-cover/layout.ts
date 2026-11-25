/**
 * 표지 배치 계산 — 글자 측정 함수를 주입받는 순수 함수 (티켓 20261124_1743).
 * 규칙 수치는 상위 티켓 20261124_1741 «표지 규칙».
 */

export const COVER_SIZE = 1024;

/** 글자 `px` 크기에서 잉크 경계(canvas `actualBoundingBox*` 값, textAlign left 기준) */
export interface InkMetrics {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}
export type MeasureFn = (text: string, px: number) => InkMetrics;

const W = COVER_SIZE;
const H = COVER_SIZE;
const TITLE_W = W * 0.9;
const TITLE_TOP = 64;
const TITLE_MAX_H = 540;
const LEAD = 0.86;
const inkW = (m: InkMetrics) => m.left + m.right;

interface TitleLine {
  text: string;
  /** textAlign left로 그릴 시작 x(잉크 폭 기준 가운데 정렬) */
  x: number;
  /** 기준선 y */
  y: number;
  inkWidth: number;
}
export interface TitleLayout {
  lines: TitleLine[];
  fontPx: number;
  /** 제목 잉크 아래 끝 y */
  bottom: number;
  /** 가장 긴 줄 잉크 폭 / 캔버스 폭 */
  inkWidthRatio: number;
}

/** 모든 1~3줄 나눔 중 높이 540 안에서 글자가 가장 큰 것을 고른다. 모두 넘치면 높이에 맞춰 줄인다 */
export function layoutTitle(measure: MeasureFn, titleEn: string): TitleLayout {
  const words = titleEn.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) throw new Error('제목이 비어 있어요');
  const parts: string[][] = [];
  const rec = (i: number, acc: string[]) => {
    if (i === words.length) {
      parts.push(acc);
      return;
    }
    if (acc.length === 2) {
      parts.push([...acc, words.slice(i).join(' ')]);
      return;
    }
    for (let j = i + 1; j <= words.length; j++) rec(j, [...acc, words.slice(i, j).join(' ')]);
  };
  rec(0, []);
  const blockH = (ls: string[], f: number) =>
    (ls.length - 1) * f * LEAD + Math.max(...ls.map((t) => measure(t, f).ascent));
  const cands = parts.map((ls) => {
    const f = (100 * TITLE_W) / Math.max(...ls.map((t) => inkW(measure(t, 100))));
    return { ls, f, h: blockH(ls, f) };
  });
  const fits = cands.filter((c) => c.h <= TITLE_MAX_H).sort((p, q) => q.f - p.f);
  const best =
    fits[0] ?? cands.map((c) => ({ ...c, f: (c.f * TITLE_MAX_H) / c.h })).sort((p, q) => q.f - p.f)[0];
  const fontPx = best.f;
  const metrics = best.ls.map((t) => measure(t, fontPx));
  const firstAsc = Math.max(...metrics.map((m) => m.ascent));
  const lines = best.ls.map((text, i) => ({
    text,
    x: (W - inkW(metrics[i])) / 2 + metrics[i].left,
    y: TITLE_TOP + firstAsc + i * fontPx * LEAD,
    inkWidth: inkW(metrics[i]),
  }));
  return {
    lines,
    fontPx,
    bottom: lines[lines.length - 1].y + Math.max(...metrics.map((m) => m.descent)),
    inkWidthRatio: Math.max(...metrics.map(inkW)) / W,
  };
}

export const JOIN_TEXT = 'JOIN AND MOVE';

export interface BottomLayout {
  joinPx: number;
  tribePx: number;
  /** textAlign center로 그릴 기준선 y */
  joinY: number;
  tribeY: number;
  /** 하단 글씨 덩어리의 위 끝 y */
  top: number;
}

export function layoutBottom(measure: MeasureFn, tribeEn: string): BottomLayout {
  const joinPx = (100 * (W * 0.385)) / inkW(measure(JOIN_TEXT, 100));
  const tribePx = Math.min(joinPx * 1.875, (100 * (W * 0.9)) / inkW(measure(tribeEn, 100)));
  const joinY = H - 64;
  const tribeY = joinY - joinPx * 0.75 - joinPx * 0.42;
  return { joinPx, tribePx, joinY, tribeY, top: tribeY - tribePx * 0.75 };
}

export interface BadgePlacement {
  width: number;
  height: number;
  x: number;
  y: number;
  overlapsTitle: boolean;
}

const BADGE_MAX = 450;
const BADGE_PAD = 36;

/** 배지 투명 여백을 자른 뒤 긴 변 450px에 맞춘 표시 크기 */
export function badgeDisplaySize(trimW: number, trimH: number): { width: number; height: number } {
  const k = BADGE_MAX / Math.max(trimW, trimH);
  return { width: Math.round(trimW * k), height: Math.round(trimH * k) };
}

/** 제목·하단 사이에 들어가면 가운데, 아니면 하단 글씨 위에 붙여 제목을 가린다 */
export function placeBadge(trimW: number, trimH: number, titleBottom: number, bottomTop: number): BadgePlacement {
  const { width, height } = badgeDisplaySize(trimW, trimH);
  const zoneTop = titleBottom + BADGE_PAD;
  const zoneBottom = bottomTop - BADGE_PAD;
  const y = Math.round(height <= zoneBottom - zoneTop ? (zoneTop + zoneBottom) / 2 - height / 2 : zoneBottom - height);
  return { width, height, x: Math.round((W - width) / 2), y, overlapsTitle: y < titleBottom };
}
