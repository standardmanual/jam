import React, { useId } from 'react';

/**
 * BadgeFrame — clips a badge image into one of 7 decorative frame shapes.
 * shape: 'circle' | 'ticket-v' | 'ticket-h' | 'scallop' | 'corner-cut' | 'tab-notch' | 'dumbbell'
 * Pass the badge image / icon as children.
 */

/**
 * shape별 clip path(SVG path data)를 만든다.
 *
 * export하는 이유: 어드민 액티비티 배지 이미지 생성기(티켓 20260902_1613)가 같은 실루엣을
 * Canvas 2D `Path2D`로 그려야 한다. 노치 path를 캔버스용으로 따로 다시 그리면 MODULAR와
 * 어긋난 두 번째 정의가 생기므로, 여기서 만든 path 문자열을 그대로 재사용한다.
 * (`BadgeFrame` 자체의 동작은 바뀌지 않는다 — 접근 범위만 넓힌 순수 추가 변경)
 */
export function makePath(shape, w, h) {
  switch (shape) {
    case 'ticket-v': {
      const r = Math.min(w * 0.07, 13);
      const cx = w / 2;
      return `M0,0 L${cx-r},0 A${r},${r} 0 0,0 ${cx+r},0 L${w},0 V${h} L${cx+r},${h} A${r},${r} 0 0,0 ${cx-r},${h} L0,${h} Z`;
    }
    case 'ticket-h': {
      const r = Math.min(h * 0.07, 13);
      const cy = h / 2;
      return `M0,0 L${w},0 V${cy-r} A${r},${r} 0 0,0 ${w},${cy+r} V${h} L0,${h} V${cy+r} A${r},${r} 0 0,0 0,${cy-r} Z`;
    }
    case 'scallop': {
      const sx = w / 3, sy = h / 3;
      const r = Math.min(sx, sy) * 0.78;
      return [
        `M0,0`,
        `A${r},${r} 0 0,0 ${sx},0`, `A${r},${r} 0 0,0 ${sx*2},0`, `A${r},${r} 0 0,0 ${w},0`,
        `A${r},${r} 0 0,0 ${w},${sy}`, `A${r},${r} 0 0,0 ${w},${sy*2}`, `A${r},${r} 0 0,0 ${w},${h}`,
        `A${r},${r} 0 0,0 ${sx*2},${h}`, `A${r},${r} 0 0,0 ${sx},${h}`, `A${r},${r} 0 0,0 0,${h}`,
        `A${r},${r} 0 0,0 0,${sy*2}`, `A${r},${r} 0 0,0 0,${sy}`, `A${r},${r} 0 0,0 0,0`,
        'Z',
      ].join(' ');
    }
    case 'corner-cut': {
      const oy = h * 0.42, dr = h * 0.9;
      const bump = dr - Math.sqrt(dr * dr - oy * oy);
      const xl = bump, xr = w - bump;
      return `M${xl},0 L${xr},0 V${h/2-oy} A${dr},${dr} 0 0,1 ${xr},${h/2+oy} V${h} L${xl},${h} V${h/2+oy} A${dr},${dr} 0 0,1 ${xl},${h/2-oy} Z`;
    }
    case 'tab-notch': {
      const n = Math.min(w, h) * 0.1, nr = n / 2;
      return `M${n},0 L${w-n},0 L${w-n},${n-nr} A${nr},${nr} 0 0,1 ${w-n+nr},${n} L${w},${n} L${w},${h-n} L${w-n+nr},${h-n} A${nr},${nr} 0 0,1 ${w-n},${h-n+nr} L${w-n},${h} L${n},${h} L${n},${h-n+nr} A${nr},${nr} 0 0,1 ${n-nr},${h-n} L0,${h-n} L0,${n} L${n-nr},${n} A${nr},${nr} 0 0,1 ${n},${n-nr} Z`;
    }
    case 'dumbbell': {
      const oy = h * 0.42;
      const dr = h * 0.9;
      return `M0,0 L${w},0 V${h/2-oy} A${dr},${dr} 0 0,0 ${w},${h/2+oy} V${h} L0,${h} V${h/2+oy} A${dr},${dr} 0 0,0 0,${h/2-oy} Z`;
    }
    default: return null;
  }
}

export function BadgeFrame({ shape = 'circle', width = 200, height = 200, color = 'var(--color-primary)', children, style = {} }) {
  const isCircle = shape === 'circle';
  const pathD = isCircle ? null : makePath(shape, width, height);
  return (
    <div style={{
      width, height, flexShrink: 0,
      background: color,
      borderRadius: isCircle ? '50%' : undefined,
      clipPath: pathD ? `path('${pathD}')` : undefined,
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      {children}
    </div>
  );
}
