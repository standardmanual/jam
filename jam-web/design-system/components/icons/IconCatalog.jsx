import React, { createElement, useId } from 'react';

/**
 * IconCatalog — 아이콘 세트 v2(라인·채움 39종) + 카탈로그 격자 (티켓 20261114_2345).
 *
 * 서비스 `src/components/ui/icons.tsx`와 같은 조각·같은 규칙의 병존 사본이다(서비스는 이 파일을 import하지 않는다).
 * 사양: docs/assets/prototypes/icon-set-v2/spec.json. 한쪽만 고치지 않는다 — 두 사본 동일성은
 * `src/components/ui/__tests__/icons.test.tsx`가 지킨다.
 *
 * 48 격자, 선 굵기 3(24px에서 1.5px), 색은 currentColor 하나. variant 'line'(기본)·'fill'.
 * 동작 글리프 7종은 variant와 무관하게 라인이다. 비운 면·틈은 배경색 칠이 아니라 SVG mask로 뚫는다.
 * 크기는 className 또는 width/height prop으로 지정, 기본 24×24.
 */

/** 역할별로 그리는 규칙. paint는 실제로 칠하는 것, erase는 앞서 그린 것을 투명하게 뚫는 것이다. */
function behavior(role, fill) {
  switch (role) {
    case 'b':
      return fill ? { paint: 'fs' } : { paint: 's', erase: 'f' }
    case 'g':
      return fill ? { paint: 'f', band: true, erase: 'fs' } : { paint: 's', erase: 'f' }
    case 'c':
      return { paint: 's', erase: 'f' }
    case 'kb':
      return fill ? { erase: 'f' } : { paint: 'f' }
    case 'kc':
      return { paint: 'f' }
    case 'tb':
    case 'nb':
      return fill ? { erase: 's' } : { paint: 's' }
    case 'rc':
      return fill ? { paint: 's' } : { erase: 's' }
    default:
      // ta · tc · nc · ro
      return { paint: 's' }
  }
}

const MASK_BOX = { x: -24, y: -24, width: 96, height: 96 }

function renderShape(node, key, shape) {
  const [tag, , attrs, w, transform] = node
  return createElement(tag, {
    key,
    ...attrs,
    ...(transform ? { transform } : {}),
    ...shape,
    strokeWidth: w || undefined,
  })
}

/**
 * RoleIcon — 사양(icon-set-v2/spec.json)의 역할 조각을 라인·채움으로 그리는 렌더러.
 * 비운 면·틈은 배경색을 칠하지 않고 SVG mask로 앞선 그림을 실제로 뚫는다.
 * mask 안의 white·black는 «보임/가림» 신호일 뿐 화면에 칠해지지 않는다.
 */
function RoleIcon({ nodes, variant = 'line', lineOnly = false, className, width = 24, height = 24, ...props }) {
  const uid = useId().replace(/:/g, '')
  const fill = !lineOnly && variant === 'fill'
  const plans = nodes.map((n) => behavior(n[1], fill))
  const masks = []
  const body = nodes.map((node, j) => {
    const plan = plans[j]
    if (!plan.paint) return null
    const blacks = []
    if (plan.band) {
      blacks.push(renderShape(node, 'band', { fill: 'none', stroke: 'black' }))
    }
    for (let k = j + 1; k < nodes.length; k++) {
      const e = plans[k].erase
      if (!e) continue
      blacks.push(
        renderShape(nodes[k], 'e' + k, {
          fill: e.includes('f') ? 'black' : 'none',
          stroke: e.includes('s') ? 'black' : 'none',
        }),
      )
    }
    const el = renderShape(node, 'p' + j, {
      fill: plan.paint.includes('f') ? 'currentColor' : 'none',
      stroke: plan.paint.includes('s') ? 'currentColor' : 'none',
    })
    if (blacks.length === 0) return el
    const id = 'ic' + uid + 'm' + j
    masks.push(
      <mask key={id} id={id} maskUnits="userSpaceOnUse" {...MASK_BOX}>
        <path d="M-24 -24H72V72H-24Z" fill="white" stroke="none" />
        <g strokeLinecap="round" strokeLinejoin="round">
          {blacks}
        </g>
      </mask>,
    )
    return (
      <g key={'g' + j} mask={'url(#' + id + ')'}>
        {el}
      </g>
    )
  })
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width={className ? undefined : width}
      height={className ? undefined : height}
      aria-hidden="true"
      {...props}
    >
      {masks.length > 0 && <defs>{masks}</defs>}
      {body}
    </svg>
  )
}


const HOME_NODES = [
  ['path', 'b', { d: 'M8.5 21.5 L24 9 L39.5 21.5 V37.5 Q39.5 41 36 41 H12 Q8.5 41 8.5 37.5 Z' }, 3],
  ['path', 'c', { d: 'M19 41 V32 A5 5 0 0 1 29 32 V41 Z' }, 3],
]

const MEDAL_NODES = [
  ['path', 'b', { d: 'M14.5 26 H33.5 V46 L24 40.5 L14.5 46 Z' }, 3],
  ['path', 'g', { d: 'M20.79 8.02 Q24 2.98 27.21 8.02 Q32.51 5.26 32.77 11.23 Q38.74 11.49 35.98 16.79 Q41.02 20 35.98 23.21 Q38.74 28.51 32.77 28.77 Q32.51 34.74 27.21 31.98 Q24 37.02 20.79 31.98 Q15.49 34.74 15.23 28.77 Q9.26 28.51 12.02 23.21 Q6.98 20 12.02 16.79 Q9.26 11.49 15.23 11.23 Q15.49 5.26 20.79 8.02 Z' }, 3],
  ['circle', 'c', { cx: '24', cy: '20', r: '6' }, 3],
]

const CHECKIN_NODES = [
  ['ellipse', 'b', { cx: '24', cy: '41', rx: '11.5', ry: '3.8' }, 3],
  ['path', 'g', { d: 'M24 40 C24 40 10.5 28.5 10.5 18.5 A13.5 13.5 0 0 1 37.5 18.5 C37.5 28.5 24 40 24 40 Z' }, 3],
  ['circle', 'c', { cx: '24', cy: '18.5', r: '5.2' }, 3],
]

const TICKET_NODES = [
  ['path', 'b', { d: 'M6.5 15 Q6.5 11 10.5 11 H37.5 Q41.5 11 41.5 15 V19 A5 5 0 0 0 41.5 29 V33 Q41.5 37 37.5 37 H10.5 Q6.5 37 6.5 33 V29 A5 5 0 0 0 6.5 19 Z' }, 3],
  ['path', 'c', { d: 'M24 14.5 Q25.9 22.1 33.5 24 Q25.9 25.9 24 33.5 Q22.1 25.9 14.5 24 Q22.1 22.1 24 14.5 Z' }, 3],
]

const CRATE_NODES = [
  ['path', 'b', { d: 'M9.5 19 H38.5 V37 Q38.5 41 34.5 41 H13.5 Q9.5 41 9.5 37 Z' }, 3],
  ['rect', 'g', { x: '6.5', y: '9', width: '35', height: '11', rx: '3.5' }, 3],
  ['rect', 'c', { x: '18', y: '25.5', width: '12', height: '5', rx: '2.5' }, 3],
]

const ARROW_DOWN_NODES = [
  ['path', 'b', { d: 'M17.5 7.5 Q17.5 5 20 5 H28 Q30.5 5 30.5 7.5 V20.5 H38 Q41.5 20.5 39.3 23.3 L25.9 40.3 Q24 42.7 22.1 40.3 L8.7 23.3 Q6.5 20.5 10 20.5 H17.5 Z' }, 3, 'translate(0 0.5)'],
]

const ARROW_UP_NODES = [
  ['path', 'b', { d: 'M17.5 7.5 Q17.5 5 20 5 H28 Q30.5 5 30.5 7.5 V20.5 H38 Q41.5 20.5 39.3 23.3 L25.9 40.3 Q24 42.7 22.1 40.3 L8.7 23.3 Q6.5 20.5 10 20.5 H17.5 Z' }, 3, 'rotate(180 24 24) translate(0 0.5)'],
]

const FLASK_NODES = [
  ['path', 'c', { d: 'M20.5 8 V18.5 L10.8 35.6 Q8.4 40.8 14.2 40.8 H33.8 Q39.6 40.8 37.2 35.6 L27.5 18.5 V8 Z' }, 3],
  ['path', 'b', { d: 'M15.3 27.5 H32.7 L37.2 35.6 Q39.6 40.8 33.8 40.8 H14.2 Q8.4 40.8 10.8 35.6 Z' }, 3],
  ['rect', 'b', { x: '17.5', y: '4.5', width: '13', height: '5', rx: '2.5' }, 3],
  ['circle', 'c', { cx: '21', cy: '34', r: '2.2' }, 3],
  ['circle', 'b', { cx: '35.5', cy: '15', r: '2.6' }, 3],
  ['circle', 'b', { cx: '40', cy: '8.5', r: '1.8' }, 3],
]

const NEWSPAPER_NODES = [
  ['rect', 'b', { x: '9', y: '6.5', width: '30', height: '35', rx: '4' }, 3, 'rotate(-6 24 24)'],
  ['rect', 'c', { x: '14', y: '12', width: '20', height: '7', rx: '2.5' }, 3, 'rotate(-6 24 24)'],
  ['path', 'nb', { d: 'M14.5 25.5 H33.5 M14.5 30.5 H33.5 M14.5 35.5 H26' }, 3, 'rotate(-6 24 24)'],
]

const PODIUM_NODES = [
  ['rect', 'b', { x: '5.5', y: '23', width: '12.5', height: '18.5', rx: '2.5' }, 3],
  ['rect', 'b', { x: '30', y: '28.5', width: '12.5', height: '13', rx: '2.5' }, 3],
  ['rect', 'g', { x: '17.75', y: '15', width: '12.5', height: '26.5', rx: '2.5' }, 3],
  ['path', 'b', { d: 'M24 2 Q25 6 29 7 Q25 8 24 12 Q23 8 19 7 Q23 6 24 2 Z' }, 3],
]

const MAGIC_BOOK_NODES = [
  ['path', 'b', { d: 'M10 9.5 Q10 5 14.5 5 H38.5 V43 H14.5 Q10 43 10 38.5 Z' }, 3],
  ['path', 'c', { d: 'M38.5 34 H14.5 Q11.5 34 11.5 37 Q11.5 40 14.5 40 H38.5 Z' }, 3],
  ['path', 'c', { d: 'M24.5 11 Q26.1 17.9 33 19.5 Q26.1 21.1 24.5 28 Q22.9 21.1 16 19.5 Q22.9 17.9 24.5 11 Z' }, 3],
]

const SPARKLE_CIRCLE_NODES = [
  ['circle', 'b', { cx: '24', cy: '24', r: '19' }, 3],
  ['path', 'c', { d: 'M24 11.5 Q26.25 21.75 36.5 24 Q26.25 26.25 24 36.5 Q21.75 26.25 11.5 24 Q21.75 21.75 24 11.5 Z' }, 3],
]

const PIN_NODES = [
  ['path', 'b', { d: 'M24 43 C24 43 9.5 30.5 9.5 19 A14.5 14.5 0 0 1 38.5 19 C38.5 30.5 24 43 24 43 Z' }, 3],
  ['circle', 'c', { cx: '24', cy: '19', r: '5.5' }, 3],
]

const INFO_NODES = [
  ['circle', 'b', { cx: '24', cy: '24', r: '17.5' }, 3],
  ['circle', 'kb', { cx: '24', cy: '15.5', r: '2.4' }, 0],
  ['path', 'tb', { d: 'M24 22.5 V33' }, 4.5],
]

const COIN_NODES = [
  ['path', 'b', { fillRule: 'evenodd', d: 'M13.5 42 V7 H26.5 C34.5 7 39.5 11.8 39.5 18.8 C39.5 25.8 34.5 30.5 26.5 30.5 H23.5 V42 Z M23.5 14.8 V22.7 H26 C28.6 22.7 30 21.2 30 18.75 C30 16.3 28.6 14.8 26 14.8 Z' }, 3, 'translate(-2.5 0)'],
  ['path', 'b', { d: 'M39 32 Q40.1 36.4 44.5 37.5 Q40.1 38.6 39 43 Q37.9 38.6 33.5 37.5 Q37.9 36.4 39 32 Z' }, 3],
]

const MIXING_BOWL_NODES = [
  ['path', 'ta', { d: 'M32 3.5 L26.5 11' }, 4.5],
  ['ellipse', 'nc', { cx: '22.5', cy: '17', rx: '5.5', ry: '9.5' }, 3, 'rotate(28 22.5 17)'],
  ['ellipse', 'nc', { cx: '22.5', cy: '17', rx: '2', ry: '9' }, 3, 'rotate(28 22.5 17)'],
  ['path', 'b', { d: 'M7 24 H41 Q41 41.5 24 41.5 Q7 41.5 7 24 Z' }, 3],
  ['rect', 'g', { x: '4.5', y: '20.5', width: '39', height: '5.5', rx: '2.75' }, 3],
]

const PUZZLE_NODES = [
  ['path', 'b', { d: 'M10.2 4.5a1.8 1.8 0 013.6 0V6h2.7a1 1 0 011 1v2.7h1.5a1.8 1.8 0 010 3.6H17.5V17a1 1 0 01-1 1h-2.7v-1.5a1.8 1.8 0 10-3.6 0V18H7.5a1 1 0 01-1-1v-2.7H5a1.8 1.8 0 010-3.6h1.5V7a1 1 0 011-1h2.7V4.5z' }, 1.5, 'translate(0 0.5) scale(2)'],
]

const SYNC_CIRCLE_NODES = [
  ['path', 'ta', { d: 'M40 22 A16 16 0 0 0 11.5 12.5 L8.5 15.5' }, 4.5],
  ['path', 'ta', { d: 'M8 7.5 V16 H16.5' }, 4.5],
  ['path', 'ta', { d: 'M8 26 A16 16 0 0 0 36.5 35.5 L39.5 32.5' }, 4.5],
  ['path', 'ta', { d: 'M40 40.5 V32 H31.5' }, 4.5],
]

const USER_NODES = [
  ['path', 'b', { d: 'M8 43 C8 33 15 27.5 24 27.5 C33 27.5 40 33 40 43 Z' }, 3],
  ['circle', 'g', { cx: '24', cy: '16', r: '9' }, 3],
]

const USERS_NODES = [
  ['path', 'b', { d: 'M21.5 41 C21.5 33 27 28.5 33.5 28.5 C40 28.5 45.5 33 45.5 41 Z' }, 3],
  ['circle', 'b', { cx: '33.5', cy: '18', r: '6.8' }, 3],
  ['path', 'g', { d: 'M2.5 43 C2.5 34 9 29 17 29 C25 29 31.5 34 31.5 43 Z' }, 3],
  ['circle', 'g', { cx: '17', cy: '17.5', r: '7.8' }, 3],
]

const CHECK_BOLD_NODES = [
  ['path', 'ro', { d: 'M11.5 25 L20 33.5 L36.5 15' }, 12],
  ['path', 'rc', { d: 'M11.5 25 L20 33.5 L36.5 15' }, 6],
]

const X_BOLD_NODES = [
  ['path', 'ro', { d: 'M14 14 L34 34 M34 14 L14 34' }, 12],
  ['path', 'rc', { d: 'M14 14 L34 34 M34 14 L14 34' }, 6],
]

const LOCK_NODES = [
  ['path', 'ro', { d: 'M15.5 21 V15.5 A8.5 8.5 0 0 1 32.5 15.5 V21' }, 10],
  ['path', 'rc', { d: 'M15.5 21 V15.5 A8.5 8.5 0 0 1 32.5 15.5 V21' }, 4],
  ['rect', 'b', { x: '9', y: '20', width: '30', height: '21.5', rx: '5' }, 3],
  ['circle', 'kb', { cx: '24', cy: '29', r: '2.8' }, 0],
  ['path', 'tb', { d: 'M24 30 V35' }, 4.5],
]

const ALERT_TRIANGLE_NODES = [
  ['path', 'b', { d: 'M24 6.5 C25.6 6.5 26.7 7.4 27.6 9 L42.2 35 C43.9 38.1 42.2 41.5 38.6 41.5 H9.4 C5.8 41.5 4.1 38.1 5.8 35 L20.4 9 C21.3 7.4 22.4 6.5 24 6.5 Z' }, 3],
  ['path', 'tb', { d: 'M24 18 V28' }, 4.5],
  ['circle', 'kb', { cx: '24', cy: '34.2', r: '2.4' }, 0],
]

const INBOX_NODES = [
  ['path', 'b', { d: 'M6 27 L11 11.5 Q12 8.5 15 8.5 H33 Q36 8.5 37 11.5 L42 27 V37 Q42 41 38 41 H10 Q6 41 6 37 Z' }, 3],
  ['path', 'g', { d: 'M6 27 H16 L19 32.5 H29 L32 27 H42 V37 Q42 41 38 41 H10 Q6 41 6 37 Z' }, 3],
  ['path', 'c', { d: 'M24 12.5 Q25.1 16.9 29.5 18 Q25.1 19.1 24 23.5 Q22.9 19.1 18.5 18 Q22.9 16.9 24 12.5 Z' }, 3],
]

const BELL_NODES = [
  ['circle', 'b', { cx: '24', cy: '42', r: '3.2' }, 3],
  ['circle', 'b', { cx: '24', cy: '7.5', r: '2.5' }, 3],
  ['path', 'b', { d: 'M24 9.5 C29.5 9.5 34 14.5 34 21 C34 26.5 34.5 30 37.5 33 Q40.5 36.5 36.5 37.5 H11.5 Q7.5 36.5 10.5 33 C13.5 30 14 26.5 14 21 C14 14.5 18.5 9.5 24 9.5 Z' }, 3],
]

const SEARCH_NODES = [
  ['path', 'ro', { d: 'M31 31 L40.5 40.5' }, 10],
  ['path', 'rc', { d: 'M31 31 L40.5 40.5' }, 4],
  ['circle', 'b', { cx: '20.5', cy: '20.5', r: '13' }, 3],
  ['path', 'nb', { d: 'M13.5 18 A7.5 7.5 0 0 1 18.5 13' }, 3],
]

const PENCIL_NODES = [
  ['path', 'b', { d: 'M12.5 30.5 L32 11 L37 16 L17.5 35.5 Z' }, 3],
  ['path', 'g', { d: 'M32 11 L34.5 8.5 Q36 7 37.5 8.5 L39.5 10.5 Q41 12 39.5 13.5 L37 16 Z' }, 3],
  ['path', 'c', { d: 'M12.5 30.5 L17.5 35.5 L8.5 39.5 Z' }, 3],
  ['path', 'kc', { d: 'M10.4 35 L8.5 39.5 L13 37.6 Z' }, 0],
]

const CHEVRON_RIGHT_NODES = [
  ['path', 'ta', { d: 'M18 10.5 L31.5 24 L18 37.5' }, 4.5],
]

const CHEVRON_DOWN_NODES = [
  ['path', 'ta', { d: 'M10.5 18 L24 31.5 L37.5 18' }, 4.5],
]

const PLUS_NODES = [
  ['path', 'ta', { d: 'M24 11 V37 M11 24 H37' }, 4.5],
]

const MINUS_NODES = [
  ['path', 'ta', { d: 'M11 24 H37' }, 4.5],
]

const CLOSE_NODES = [
  ['path', 'ta', { d: 'M13.5 13.5 L34.5 34.5 M34.5 13.5 L13.5 34.5' }, 4.5],
]

const CHECK_NODES = [
  ['path', 'ta', { d: 'M10 25.5 L19.5 34.5 L38 14' }, 4.5],
]

const SYNC_NODES = [
  ['path', 'ta', { d: 'M40 22 A16 16 0 0 0 11.5 12.5 L8.5 15.5' }, 4.5],
  ['path', 'ta', { d: 'M8 7.5 V16 H16.5' }, 4.5],
  ['path', 'ta', { d: 'M8 26 A16 16 0 0 0 36.5 35.5 L39.5 32.5' }, 4.5],
  ['path', 'ta', { d: 'M40 40.5 V32 H31.5' }, 4.5],
]

const TREASURE_BOX_NODES = [
  ['rect', 'c', { x: '12', y: '13.5', width: '24', height: '21', rx: '2.5' }, 3],
  ['rect', 'c', { x: '12', y: '13.5', width: '5.5', height: '21', rx: '2' }, 3],
  ['rect', 'c', { x: '30.5', y: '13.5', width: '5.5', height: '21', rx: '2' }, 3],
  ['circle', 'b', { cx: '24', cy: '24', r: '3.4' }, 3],
]

const LOCATE_NODES = [
  ['path', 'ta', { d: 'M24 4.5 V10 M24 38 V43.5 M4.5 24 H10 M38 24 H43.5' }, 4.5],
  ['circle', 'b', { cx: '24', cy: '24', r: '13' }, 3],
  ['circle', 'kb', { cx: '24', cy: '24', r: '5' }, 0],
]

const ALERT_CIRCLE_NODES = [
  ['circle', 'b', { cx: '24', cy: '24', r: '17.5' }, 3],
  ['path', 'tb', { d: 'M24 15.5 V26' }, 4.5],
  ['circle', 'kb', { cx: '24', cy: '32.5', r: '2.4' }, 0],
]

const BAN_NODES = [
  ['circle', 'b', { cx: '24', cy: '24', r: '18' }, 3],
  ['circle', 'c', { cx: '24', cy: '24', r: '11.5' }, 3],
  ['path', 'tc', { d: 'M16.5 16.5 L31.5 31.5' }, 7.2],
]

/** 투데이 */
export function HomeIcon(props) {
  return <RoleIcon nodes={HOME_NODES} {...props} />;
}

/** 배지 */
export function MedalIcon(props) {
  return <RoleIcon nodes={MEDAL_NODES} {...props} />;
}

/** 체크인 */
export function CheckinIcon(props) {
  return <RoleIcon nodes={CHECKIN_NODES} {...props} />;
}

/** 미션 */
export function TicketIcon(props) {
  return <RoleIcon nodes={TICKET_NODES} {...props} />;
}

/** 인벤토리 */
export function CrateIcon(props) {
  return <RoleIcon nodes={CRATE_NODES} {...props} />;
}

/** 아이템 드랍 */
export function ArrowDownIcon(props) {
  return <RoleIcon nodes={ARROW_DOWN_NODES} {...props} />;
}

/** 아이템 픽업 */
export function ArrowUpIcon(props) {
  return <RoleIcon nodes={ARROW_UP_NODES} {...props} />;
}

/** 믹스 레시피 */
export function FlaskIcon(props) {
  return <RoleIcon nodes={FLASK_NODES} {...props} />;
}

/** 기사 */
export function NewspaperIcon(props) {
  return <RoleIcon nodes={NEWSPAPER_NODES} {...props} />;
}

/** 랭킹 */
export function PodiumIcon(props) {
  return <RoleIcon nodes={PODIUM_NODES} {...props} />;
}

/** 컬렉션·아이템북 */
export function MagicBookIcon(props) {
  return <RoleIcon nodes={MAGIC_BOOK_NODES} {...props} />;
}

/** 진행 알림 */
export function SparkleCircleIcon(props) {
  return <RoleIcon nodes={SPARKLE_CIRCLE_NODES} {...props} />;
}

/** 지역·드랍 위치 */
export function PinIcon(props) {
  return <RoleIcon nodes={PIN_NODES} {...props} />;
}

/** 컨텐츠 소개 */
export function InfoIcon(props) {
  return <RoleIcon nodes={INFO_NODES} {...props} />;
}

/** 포인트 — 기본 variant가 'fill'이다. */
export function CoinIcon({ variant = 'fill', ...props }) {
  return <RoleIcon nodes={COIN_NODES} variant={variant} {...props} />;
}

/** 믹스하기 */
export function MixingBowlIcon(props) {
  return <RoleIcon nodes={MIXING_BOWL_NODES} {...props} />;
}

/** 마지막 파편 */
export function PuzzleIcon(props) {
  return <RoleIcon nodes={PUZZLE_NODES} {...props} />;
}

/** Strava 연동 */
export function SyncCircleIcon(props) {
  return <RoleIcon nodes={SYNC_CIRCLE_NODES} {...props} />;
}

/** 아바타 자리 */
export function UserIcon(props) {
  return <RoleIcon nodes={USER_NODES} {...props} />;
}

/** 팔로워·팔로잉 */
export function UsersIcon(props) {
  return <RoleIcon nodes={USERS_NODES} {...props} />;
}

/** 미션 완료 */
export function CheckBoldIcon(props) {
  return <RoleIcon nodes={CHECK_BOLD_NODES} {...props} />;
}

/** 미션 취소 */
export function XBoldIcon(props) {
  return <RoleIcon nodes={X_BOLD_NODES} {...props} />;
}

/** 잠김 */
export function LockIcon(props) {
  return <RoleIcon nodes={LOCK_NODES} {...props} />;
}

/** 경고 */
export function AlertTriangleIcon(props) {
  return <RoleIcon nodes={ALERT_TRIANGLE_NODES} {...props} />;
}

/** 피드 빈 상태 */
export function InboxIcon(props) {
  return <RoleIcon nodes={INBOX_NODES} {...props} />;
}

/** 알림함 */
export function BellIcon(props) {
  return <RoleIcon nodes={BELL_NODES} {...props} />;
}

/** 검색 */
export function SearchIcon(props) {
  return <RoleIcon nodes={SEARCH_NODES} {...props} />;
}

/** 프로필 편집 */
export function PencilIcon(props) {
  return <RoleIcon nodes={PENCIL_NODES} {...props} />;
}

/** 이동 */
export function ChevronRightIcon(props) {
  return <RoleIcon nodes={CHEVRON_RIGHT_NODES} lineOnly {...props} />;
}

/** 펼침 */
export function ChevronDownIcon(props) {
  return <RoleIcon nodes={CHEVRON_DOWN_NODES} lineOnly {...props} />;
}

/** 칸 추가 */
export function PlusIcon(props) {
  return <RoleIcon nodes={PLUS_NODES} lineOnly {...props} />;
}

/** 칸 빼기 */
export function MinusIcon(props) {
  return <RoleIcon nodes={MINUS_NODES} lineOnly {...props} />;
}

/** 닫기 */
export function CloseIcon(props) {
  return <RoleIcon nodes={CLOSE_NODES} lineOnly {...props} />;
}

/** 성공 */
export function CheckIcon(props) {
  return <RoleIcon nodes={CHECK_NODES} lineOnly {...props} />;
}

/** 동기화 */
export function SyncIcon(props) {
  return <RoleIcon nodes={SYNC_NODES} lineOnly {...props} />;
}

/** 지도 마커 */
export function TreasureBoxIcon(props) {
  return <RoleIcon nodes={TREASURE_BOX_NODES} {...props} />;
}

/** 현재 위치 버튼 */
export function LocateIcon(props) {
  return <RoleIcon nodes={LOCATE_NODES} {...props} />;
}

/** 오류 화면 */
export function AlertCircleIcon(props) {
  return <RoleIcon nodes={ALERT_CIRCLE_NODES} {...props} />;
}

/** 접근 불가 (어드민) */
export function BanIcon(props) {
  return <RoleIcon nodes={BAN_NODES} {...props} />;
}

/** 카탈로그에 노출할 전체 아이콘 — 사양(spec.json) 순서. role은 쓰임 한 줄 설명이다. */
export const ICON_ENTRIES = [
  { name: 'HomeIcon', Icon: HomeIcon, role: '투데이', section: '하단 탭바', lineOnly: false },
  { name: 'MedalIcon', Icon: MedalIcon, role: '배지', section: '하단 탭바', lineOnly: false },
  { name: 'CheckinIcon', Icon: CheckinIcon, role: '체크인', section: '하단 탭바', lineOnly: false },
  { name: 'TicketIcon', Icon: TicketIcon, role: '미션', section: '하단 탭바', lineOnly: false },
  { name: 'CrateIcon', Icon: CrateIcon, role: '인벤토리', section: '하단 탭바', lineOnly: false },
  { name: 'ArrowDownIcon', Icon: ArrowDownIcon, role: '아이템 드랍', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'ArrowUpIcon', Icon: ArrowUpIcon, role: '아이템 픽업', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'FlaskIcon', Icon: FlaskIcon, role: '믹스 레시피', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'NewspaperIcon', Icon: NewspaperIcon, role: '기사', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'PodiumIcon', Icon: PodiumIcon, role: '랭킹', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'MagicBookIcon', Icon: MagicBookIcon, role: '컬렉션·아이템북', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'SparkleCircleIcon', Icon: SparkleCircleIcon, role: '진행 알림', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'PinIcon', Icon: PinIcon, role: '지역·드랍 위치', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'InfoIcon', Icon: InfoIcon, role: '컨텐츠 소개', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'CoinIcon', Icon: CoinIcon, role: '포인트', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'MixingBowlIcon', Icon: MixingBowlIcon, role: '믹스하기', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'PuzzleIcon', Icon: PuzzleIcon, role: '마지막 파편', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'SyncCircleIcon', Icon: SyncCircleIcon, role: 'Strava 연동', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'UserIcon', Icon: UserIcon, role: '아바타 자리', section: '사람·상태 10종', lineOnly: false },
  { name: 'UsersIcon', Icon: UsersIcon, role: '팔로워·팔로잉', section: '사람·상태 10종', lineOnly: false },
  { name: 'CheckBoldIcon', Icon: CheckBoldIcon, role: '미션 완료', section: '사람·상태 10종', lineOnly: false },
  { name: 'XBoldIcon', Icon: XBoldIcon, role: '미션 취소', section: '사람·상태 10종', lineOnly: false },
  { name: 'LockIcon', Icon: LockIcon, role: '잠김', section: '사람·상태 10종', lineOnly: false },
  { name: 'AlertTriangleIcon', Icon: AlertTriangleIcon, role: '경고', section: '사람·상태 10종', lineOnly: false },
  { name: 'InboxIcon', Icon: InboxIcon, role: '피드 빈 상태', section: '사람·상태 10종', lineOnly: false },
  { name: 'BellIcon', Icon: BellIcon, role: '알림함', section: '사람·상태 10종', lineOnly: false },
  { name: 'SearchIcon', Icon: SearchIcon, role: '검색', section: '사람·상태 10종', lineOnly: false },
  { name: 'PencilIcon', Icon: PencilIcon, role: '프로필 편집', section: '사람·상태 10종', lineOnly: false },
  { name: 'ChevronRightIcon', Icon: ChevronRightIcon, role: '이동', section: '동작 글리프 7종', lineOnly: true },
  { name: 'ChevronDownIcon', Icon: ChevronDownIcon, role: '펼침', section: '동작 글리프 7종', lineOnly: true },
  { name: 'PlusIcon', Icon: PlusIcon, role: '칸 추가', section: '동작 글리프 7종', lineOnly: true },
  { name: 'MinusIcon', Icon: MinusIcon, role: '칸 빼기', section: '동작 글리프 7종', lineOnly: true },
  { name: 'CloseIcon', Icon: CloseIcon, role: '닫기', section: '동작 글리프 7종', lineOnly: true },
  { name: 'CheckIcon', Icon: CheckIcon, role: '성공', section: '동작 글리프 7종', lineOnly: true },
  { name: 'SyncIcon', Icon: SyncIcon, role: '동기화', section: '동작 글리프 7종', lineOnly: true },
  { name: 'TreasureBoxIcon', Icon: TreasureBoxIcon, role: '지도 마커', section: '지도와 화면 전용', lineOnly: false },
  { name: 'LocateIcon', Icon: LocateIcon, role: '현재 위치 버튼', section: '지도와 화면 전용', lineOnly: false },
  { name: 'AlertCircleIcon', Icon: AlertCircleIcon, role: '오류 화면', section: '지도와 화면 전용', lineOnly: false },
  { name: 'BanIcon', Icon: BanIcon, role: '접근 불가 (어드민)', section: '지도와 화면 전용', lineOnly: false },
];

const SECTION_ORDER = ['하단 탭바', '컨텐츠·자원 15종', '사람·상태 10종', '동작 글리프 7종', '지도와 화면 전용'];

/**
 * IconCatalog — 전체 아이콘 격자. Storybook 카탈로그 전용 컴포넌트.
 * 섹션별 격자이고, 칸 하나는 이름(코드 폰트) · 라인과 채움 나란히 · 쓰임 한 줄이다.
 * 동작 글리프(lineOnly)는 채움 칸에도 라인을 그대로 두고 «라인 전용»을 붙인다.
 */
export function IconCatalog({ className = '', style = {} }) {
  return (
    <div className={className} style={{ color: 'var(--foreground)', ...style }}>
      <h2
        style={{
          margin: '0 0 var(--spacing-16)',
          fontSize: 'var(--text-lg)',
          lineHeight: 'var(--text-lg--line-height)',
          fontWeight: 700,
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
          textWrap: 'balance',
        }}
      >
        아이콘 {ICON_ENTRIES.length}종 · 라인과 채움
      </h2>
      {SECTION_ORDER.map((section) => {
        const entries = ICON_ENTRIES.filter((e) => e.section === section);
        return (
          <section key={section} style={{ marginBottom: 'var(--spacing-24)' }}>
            <h3
              style={{
                margin: '0 0 var(--spacing-12)',
                fontSize: 'var(--text-sm)',
                lineHeight: 'var(--text-sm--line-height)',
                fontWeight: 600,
                color: 'var(--muted)',
                wordBreak: 'keep-all',
                overflowWrap: 'break-word',
              }}
            >
              {section}
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
                gap: 'var(--spacing-12)',
              }}
            >
              {entries.map(({ name, Icon, role, lineOnly }) => (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 'var(--spacing-8)',
                    padding: 'var(--spacing-12)',
                    borderRadius: 'var(--radius-2xl)',
                    background: 'var(--background)',
                  }}
                >
                  <code style={{ fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)' }}>{name}</code>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-16)' }}>
                    <Icon width={32} height={32} variant="line" />
                    <Icon width={32} height={32} variant="fill" />
                    {lineOnly && (
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          lineHeight: 'var(--text-xs--line-height)',
                          color: 'var(--muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        라인 전용
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      lineHeight: 'var(--text-xs--line-height)',
                      color: 'var(--muted)',
                      wordBreak: 'keep-all',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {role}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
