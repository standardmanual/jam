// 티켓 20261103_1351 — 폰트 파일(TTF/OTF)과 글자열을 3D 로고 윤곽(LogoOutline)으로 바꾼다.
// 글자 사이 간격(어드밴스 너비)과 커닝을 반영하고, 곡선은 선분으로 펴서 cleanOutline으로 점 간격을 고르게 한다.
import { parse, type Font } from 'opentype.js';
import { cleanOutline, normalizeOutline, ringArea } from './polygonOps';
import type { LogoOutline, OutlinePolygon, OutlineResult, Point, Ring } from './types';

export type FontOutlineOptions = {
  /** 곡선 하나를 나누는 선분 수. 기본 12 */
  curveSegments?: number;
};

const DEFAULT_CURVE_SEGMENTS = 12;
const MAX_CURVE_SEGMENTS = 64;

const READ_ERROR =
  '글자 윤곽을 만들지 못했어요. 폰트 파일을 읽을 수 없어요(woff2처럼 지원하지 않는 형식일 수 있어요). TTF나 OTF 파일로 다시 시도해 주세요.';

function fail(error: string): OutlineResult {
  return { outline: [], warnings: [], error };
}

type FontPathCommand = {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

/** 경로 명령을 닫힌 고리 목록으로 편다. Y축은 위쪽이 +Y가 되도록 뒤집는다(opentype.js 경로는 아래가 +Y). */
function flattenCommands(commands: FontPathCommand[], segments: number): Ring[] {
  const contours: Ring[] = [];
  let current: Point[] = [];
  let cx = 0;
  let cy = 0;
  const finish = () => {
    if (current.length >= 3) contours.push(current);
    current = [];
  };
  const push = (x: number, y: number) => current.push([x, -y]);
  for (const cmd of commands) {
    const x = cmd.x ?? 0;
    const y = cmd.y ?? 0;
    switch (cmd.type) {
      case 'M':
        finish();
        push(x, y);
        break;
      case 'L':
        push(x, y);
        break;
      case 'Q': {
        const x1 = cmd.x1 ?? 0;
        const y1 = cmd.y1 ?? 0;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const u = 1 - t;
          push(u * u * cx + 2 * u * t * x1 + t * t * x, u * u * cy + 2 * u * t * y1 + t * t * y);
        }
        break;
      }
      case 'C': {
        const x1 = cmd.x1 ?? 0;
        const y1 = cmd.y1 ?? 0;
        const x2 = cmd.x2 ?? 0;
        const y2 = cmd.y2 ?? 0;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const u = 1 - t;
          push(
            u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y
          );
        }
        break;
      }
      case 'Z':
        finish();
        break;
      default:
        break;
    }
    if (cmd.type !== 'Z') {
      cx = x;
      cy = y;
    }
  }
  finish();
  return contours;
}

function pointInRing(p: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 꼭짓점 하나가 경계에 걸릴 수 있어 세 점 중 두 점 이상이 안에 있으면 안쪽으로 본다. */
function ringInside(inner: Ring, outer: Ring): boolean {
  let hits = 0;
  for (let k = 0; k < 3; k++) {
    if (pointInRing(inner[Math.floor((k * inner.length) / 3)], outer)) hits++;
  }
  return hits >= 2;
}

/**
 * 한 글자의 고리들을 바깥/구멍으로 묶는다. 폰트마다 바깥 고리의 감는 방향이 달라(TrueType은 시계, CFF는 반시계)
 * 방향 대신 포함 관계로 가른다 — 아무 고리에도 안 담기면 바깥, 한 겹 담기면 구멍, 두 겹이면 다시 바깥(구멍 속 섬)이다.
 */
function groupGlyphContours(contours: Ring[]): OutlinePolygon[] {
  const areas = contours.map((c) => Math.abs(ringArea(c)));
  const containers = contours.map((inner, i) => {
    const list: number[] = [];
    contours.forEach((outer, j) => {
      if (i !== j && areas[j] > areas[i] && ringInside(inner, outer)) list.push(j);
    });
    return list;
  });
  const polygons = new Map<number, OutlinePolygon>();
  contours.forEach((ring, i) => {
    if (containers[i].length % 2 === 0) polygons.set(i, { outer: ring, holes: [] });
  });
  contours.forEach((ring, i) => {
    if (containers[i].length % 2 === 0) return;
    // 가장 작은 포함 고리가 바로 위 부모다.
    const parent = containers[i].reduce((best, j) => (areas[j] < areas[best] ? j : best));
    polygons.get(parent)?.holes.push(ring);
  });
  return [...polygons.values()];
}

/**
 * 폰트와 글자열을 윤곽으로 바꾼다. 읽기에 실패하면 예외 대신 `error`를 돌려준다.
 * 입력은 TTF/OTF 바이트 또는 이미 읽은 `Font`다. 처음 버전은 고정 굵기 폰트만 다룬다(굵기는 파일을 고를 때 정한다).
 */
export function fontToOutline(font: ArrayBuffer | Font, text: string, options: FontOutlineOptions = {}): OutlineResult {
  let parsed: Font;
  try {
    parsed = font instanceof ArrayBuffer ? parse(font) : font;
    if (!parsed || typeof parsed.stringToGlyphs !== 'function') return fail(READ_ERROR);
  } catch {
    return fail(READ_ERROR);
  }

  const segments = Math.min(
    MAX_CURVE_SEGMENTS,
    Math.max(1, Math.round(options.curveSegments ?? DEFAULT_CURVE_SEGMENTS))
  );
  const warnings: string[] = [];

  const raw: LogoOutline = [];
  try {
    const em = parsed.unitsPerEm || 1000;
    const glyphs = parsed.stringToGlyphs(text);
    let penX = 0;
    let missing = false;
    glyphs.forEach((glyph, i) => {
      if (glyph.index === 0 && text.trim().length > 0) missing = true;
      // 글자 크기를 unitsPerEm과 같게 주면 비율이 1이라 폰트 단위 그대로 나온다.
      const path = glyph.getPath(penX, 0, em);
      raw.push(...groupGlyphContours(flattenCommands(path.commands as FontPathCommand[], segments)));
      penX += glyph.advanceWidth ?? 0;
      const next = glyphs[i + 1];
      if (next) penX += parsed.getKerningValue(glyph, next) || 0;
    });
    if (missing) warnings.push('폰트에 없는 글자는 빈 칸으로 처리했어요. 다른 폰트를 고르면 나올 수 있어요.');
  } catch {
    return fail(READ_ERROR);
  }

  const outline = cleanOutline(normalizeOutline(raw));
  if (outline.length === 0) {
    warnings.push('입력한 글자에서 윤곽을 찾지 못했어요. 공백만 있거나 폰트에 없는 글자예요. 글자를 확인해 주세요.');
  }
  return { outline, warnings, error: null };
}
