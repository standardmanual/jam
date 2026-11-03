// 티켓 20261103_1351 — SVG 문자열(업로드 파일 내용)을 3D 로고 윤곽(LogoOutline)으로 바꾼다.
// 채움이 있는 도형만 윤곽이 되고, 구멍은 SVG의 채움 규칙(even-odd/non-zero)을 따라 SVGLoader가 가른다.
// 변환(transform)은 SVGLoader가 경로에 반영한다. 결과를 높이 1로 맞추므로 viewBox의 크기는 따로 쓰지 않는다.
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { cleanOutline, normalizeOutline } from './polygonOps';
import type { LogoOutline, OutlinePolygon, OutlineResult, Point } from './types';

export type SvgOutlineOptions = {
  /** 곡선 하나를 나누는 선분 수. 기본 12 */
  curveSegments?: number;
};

const DEFAULT_CURVE_SEGMENTS = 12;
const MAX_CURVE_SEGMENTS = 64;

// 어드민 업로드라도 입력은 신뢰하지 않는다. 외부 리소스를 부르거나 코드를 실행할 수 있는 요소는 읽기 전에 지운다.
// `use`는 같은 문서 안의 도형을 가리키지만 SVGLoader가 브라우저 전용 속성에 기대므로 함께 뺀다.
const BLOCKED_ELEMENTS = ['script', 'image', 'use', 'foreignObject', 'iframe', 'object', 'embed'];

const PARSE_ERROR =
  'SVG를 읽지 못했어요. 파일이 올바른 SVG 형식이 아니에요. 디자인 도구에서 SVG로 다시 내보내 올려 주세요.';
const ENV_ERROR =
  'SVG를 읽지 못했어요. 이 환경에서는 SVG 해석 기능을 쓸 수 없어요. 브라우저에서 다시 시도해 주세요.';

function fail(error: string): OutlineResult {
  return { outline: [], warnings: [], error };
}

/** 막아 둔 요소를 지우고 다시 문자열로 만든다. 지운 요소 이름 목록을 함께 돌려준다. */
function sanitizeSvg(svgText: string): { text: string; removed: string[] } | null {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) return null;
  const removed: string[] = [];
  for (const name of BLOCKED_ELEMENTS) {
    const found = Array.from(doc.getElementsByTagName(name));
    for (const el of found) {
      el.parentNode?.removeChild(el);
    }
    if (found.length > 0) removed.push(name);
  }
  return { text: new XMLSerializer().serializeToString(doc), removed };
}

type PathStyle = { fill?: string; fillOpacity?: number; stroke?: string };

export function svgToOutline(svgText: string, options: SvgOutlineOptions = {}): OutlineResult {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return fail(ENV_ERROR);

  const divisions = Math.min(
    MAX_CURVE_SEGMENTS,
    Math.max(1, Math.round(options.curveSegments ?? DEFAULT_CURVE_SEGMENTS))
  );
  const warnings: string[] = [];
  const raw: LogoOutline = [];

  try {
    const clean = sanitizeSvg(svgText);
    if (!clean) return fail(PARSE_ERROR);
    if (clean.removed.length > 0) {
      warnings.push(
        `${clean.removed.map((n) => `<${n}>`).join(', ')} 요소는 읽지 않고 건너뛰었어요. 글자 모양은 path 같은 도형으로 올려 주세요.`
      );
    }

    const { paths } = new SVGLoader().parse(clean.text);
    let skippedNoFill = 0;
    let skippedStrokeOnly = 0;
    for (const shapePath of paths) {
      const style = ((shapePath.userData as { style?: PathStyle } | undefined)?.style ?? {}) as PathStyle;
      const noFill = style.fill === undefined || style.fill === 'none' || style.fillOpacity === 0;
      if (noFill) {
        if (style.stroke !== undefined && style.stroke !== 'none') skippedStrokeOnly++;
        else skippedNoFill++;
        continue;
      }
      for (const shape of SVGLoader.createShapes(shapePath)) {
        const { shape: outerPoints, holes } = shape.extractPoints(divisions);
        // SVG는 Y축이 아래로 향하므로 위쪽이 +Y가 되도록 뒤집는다.
        const flip = (pts: { x: number; y: number }[]): Point[] => pts.map((p): Point => [p.x, -p.y]);
        const polygon: OutlinePolygon = { outer: flip(outerPoints), holes: holes.map(flip) };
        if (polygon.outer.length >= 3) raw.push(polygon);
      }
    }
    if (skippedStrokeOnly > 0) {
      warnings.push(
        `선(stroke)만 있는 도형 ${skippedStrokeOnly}개는 건너뛰었어요. 선은 윤곽이 없어요. 디자인 도구에서 선을 도형으로 바꾼 뒤(윤곽선 확장) 다시 올려 주세요.`
      );
    }
    if (skippedNoFill > 0) {
      warnings.push(`채움이 없는 도형 ${skippedNoFill}개는 건너뛰었어요. 채움이 있는 도형만 윤곽이 돼요.`);
    }
  } catch {
    return fail(PARSE_ERROR);
  }

  const outline = cleanOutline(normalizeOutline(raw));
  if (outline.length === 0 && warnings.length === 0) {
    warnings.push('SVG에서 윤곽이 될 도형을 찾지 못했어요. 채움이 있는 path가 들어 있는지 확인해 주세요.');
  }
  return { outline, warnings, error: null };
}
