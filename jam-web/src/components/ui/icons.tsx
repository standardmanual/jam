import { createElement, useId, type ReactElement, type SVGProps } from 'react'

/**
 * JAM! 아이콘 세트 v2 — 라인·채움 두 벌, 42종 (티켓 20261114_2345)
 *
 * - 사양: docs/assets/prototypes/icon-set-v2/spec.json (좌표는 거기서 그대로 옮김), 완성 그림은 board.png.
 * - 48 격자(viewBox 0 0 48 48), 선 굵기 3(24px 렌더에서 1.5px), 색은 currentColor 하나(제3의 컬러 금지).
 *   색은 호출부 text-* 로만 제어한다. 크기는 className으로, 기본 w-6 h-6.
 * - variant: 'line'(기본) | 'fill'. 채움은 켜진 탭·지도 마커(드랍 있음)에만 쓴다. CoinIcon만 기본이 'fill'.
 *   동작 글리프 7종(Chevron 2·Plus·Minus·Close·Check·Sync)과 MoreIcon은 variant와 무관하게 라인이다.
 * - 비운 면·틈은 배경색 칠이 아니라 SVG mask로 뚫는다. 어떤 배경 위에서도 같은 모양이다.
 * - 이 파일이 아이콘의 정본이다(MODULAR 사본은 정본 단일화로 없앴다). 사양과의 대조는 __tests__/icons.test.tsx가 지킨다.
 */
export type IconVariant = 'line' | 'fill'
type IconProps = SVGProps<SVGSVGElement> & { variant?: IconVariant }
type Role = 'b' | 'g' | 'c' | 'kb' | 'kc' | 'ta' | 'tb' | 'tc' | 'nb' | 'nc' | 'ro' | 'rc'
/** [태그, 역할, 속성, 선 굵기(0이면 선 없음), 변환] */
type RoleNode = readonly [string, Role, Record<string, string>, number, string?]
type Plan = { paint?: 'f' | 's' | 'fs'; erase?: 'f' | 's' | 'fs'; band?: boolean }

/** 역할별로 그리는 규칙. paint는 실제로 칠하는 것, erase는 앞서 그린 것을 투명하게 뚫는 것이다. */
function behavior(role: Role, fill: boolean): Plan {
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

function renderShape(node: RoleNode, key: string, shape: Record<string, string>) {
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
function RoleIcon({ nodes, variant = 'line', lineOnly = false, className = 'w-6 h-6', ...props }: IconProps & { nodes: readonly RoleNode[]; lineOnly?: boolean }) {
  const uid = useId().replace(/:/g, '')
  const fill = !lineOnly && variant === 'fill'
  const plans = nodes.map((n) => behavior(n[1], fill))
  const masks: ReactElement[] = []
  const body = nodes.map((node, j) => {
    const plan = plans[j]
    if (!plan.paint) return null
    const blacks: ReactElement[] = []
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
      aria-hidden="true"
      {...props}
    >
      {masks.length > 0 && <defs>{masks}</defs>}
      {body}
    </svg>
  )
}


const HOME_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M8.5 21.5 L24 9 L39.5 21.5 V37.5 Q39.5 41 36 41 H12 Q8.5 41 8.5 37.5 Z' }, 3],
  ['path', 'c', { d: 'M19 41 V32 A5 5 0 0 1 29 32 V41 Z' }, 3],
]

const MEDAL_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M14.5 26 H33.5 V46 L24 40.5 L14.5 46 Z' }, 3],
  ['path', 'g', { d: 'M20.79 8.02 Q24 2.98 27.21 8.02 Q32.51 5.26 32.77 11.23 Q38.74 11.49 35.98 16.79 Q41.02 20 35.98 23.21 Q38.74 28.51 32.77 28.77 Q32.51 34.74 27.21 31.98 Q24 37.02 20.79 31.98 Q15.49 34.74 15.23 28.77 Q9.26 28.51 12.02 23.21 Q6.98 20 12.02 16.79 Q9.26 11.49 15.23 11.23 Q15.49 5.26 20.79 8.02 Z' }, 3],
  ['circle', 'c', { cx: '24', cy: '20', r: '6' }, 3],
]

const CHECKIN_NODES: readonly RoleNode[] = [
  ['ellipse', 'b', { cx: '24', cy: '41', rx: '11.5', ry: '3.8' }, 3],
  ['path', 'g', { d: 'M24 40 C24 40 10.5 28.5 10.5 18.5 A13.5 13.5 0 0 1 37.5 18.5 C37.5 28.5 24 40 24 40 Z' }, 3],
  ['circle', 'c', { cx: '24', cy: '18.5', r: '5.2' }, 3],
]

const TICKET_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M6.5 15 Q6.5 11 10.5 11 H37.5 Q41.5 11 41.5 15 V19 A5 5 0 0 0 41.5 29 V33 Q41.5 37 37.5 37 H10.5 Q6.5 37 6.5 33 V29 A5 5 0 0 0 6.5 19 Z' }, 3],
  ['path', 'c', { d: 'M24 14.5 Q25.9 22.1 33.5 24 Q25.9 25.9 24 33.5 Q22.1 25.9 14.5 24 Q22.1 22.1 24 14.5 Z' }, 3],
]

const CRATE_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M9.5 19 H38.5 V37 Q38.5 41 34.5 41 H13.5 Q9.5 41 9.5 37 Z' }, 3],
  ['rect', 'g', { x: '6.5', y: '9', width: '35', height: '11', rx: '3.5' }, 3],
  ['rect', 'c', { x: '18', y: '25.5', width: '12', height: '5', rx: '2.5' }, 3],
]

const ARROW_DOWN_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M17.5 7.5 Q17.5 5 20 5 H28 Q30.5 5 30.5 7.5 V20.5 H38 Q41.5 20.5 39.3 23.3 L25.9 40.3 Q24 42.7 22.1 40.3 L8.7 23.3 Q6.5 20.5 10 20.5 H17.5 Z' }, 3, 'translate(0 0.5)'],
]

const ARROW_UP_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M17.5 7.5 Q17.5 5 20 5 H28 Q30.5 5 30.5 7.5 V20.5 H38 Q41.5 20.5 39.3 23.3 L25.9 40.3 Q24 42.7 22.1 40.3 L8.7 23.3 Q6.5 20.5 10 20.5 H17.5 Z' }, 3, 'rotate(180 24 24) translate(0 0.5)'],
]

const FLASK_NODES: readonly RoleNode[] = [
  ['path', 'c', { d: 'M20.5 8 V18.5 L10.8 35.6 Q8.4 40.8 14.2 40.8 H33.8 Q39.6 40.8 37.2 35.6 L27.5 18.5 V8 Z' }, 3],
  ['path', 'b', { d: 'M15.3 27.5 H32.7 L37.2 35.6 Q39.6 40.8 33.8 40.8 H14.2 Q8.4 40.8 10.8 35.6 Z' }, 3],
  ['rect', 'b', { x: '17.5', y: '4.5', width: '13', height: '5', rx: '2.5' }, 3],
  ['circle', 'c', { cx: '21', cy: '34', r: '2.2' }, 3],
  ['circle', 'b', { cx: '35.5', cy: '15', r: '2.6' }, 3],
  ['circle', 'b', { cx: '40', cy: '8.5', r: '1.8' }, 3],
]

const NEWSPAPER_NODES: readonly RoleNode[] = [
  ['rect', 'b', { x: '9', y: '6.5', width: '30', height: '35', rx: '4' }, 3, 'rotate(-6 24 24)'],
  ['rect', 'c', { x: '14', y: '12', width: '20', height: '7', rx: '2.5' }, 3, 'rotate(-6 24 24)'],
  ['path', 'nb', { d: 'M14.5 25.5 H33.5 M14.5 30.5 H33.5 M14.5 35.5 H26' }, 3, 'rotate(-6 24 24)'],
]

const PODIUM_NODES: readonly RoleNode[] = [
  ['rect', 'b', { x: '5.5', y: '23', width: '12.5', height: '18.5', rx: '2.5' }, 3],
  ['rect', 'b', { x: '30', y: '28.5', width: '12.5', height: '13', rx: '2.5' }, 3],
  ['rect', 'g', { x: '17.75', y: '15', width: '12.5', height: '26.5', rx: '2.5' }, 3],
  ['path', 'b', { d: 'M24 2 Q25 6 29 7 Q25 8 24 12 Q23 8 19 7 Q23 6 24 2 Z' }, 3],
]

const MAGIC_BOOK_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M10 9.5 Q10 5 14.5 5 H38.5 V43 H14.5 Q10 43 10 38.5 Z' }, 3],
  ['path', 'c', { d: 'M38.5 34 H14.5 Q11.5 34 11.5 37 Q11.5 40 14.5 40 H38.5 Z' }, 3],
  ['path', 'c', { d: 'M24.5 11 Q26.1 17.9 33 19.5 Q26.1 21.1 24.5 28 Q22.9 21.1 16 19.5 Q22.9 17.9 24.5 11 Z' }, 3],
]

const SPARKLE_CIRCLE_NODES: readonly RoleNode[] = [
  ['circle', 'b', { cx: '24', cy: '24', r: '19' }, 3],
  ['path', 'c', { d: 'M24 11.5 Q26.25 21.75 36.5 24 Q26.25 26.25 24 36.5 Q21.75 26.25 11.5 24 Q21.75 21.75 24 11.5 Z' }, 3],
]

const PIN_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M24 43 C24 43 9.5 30.5 9.5 19 A14.5 14.5 0 0 1 38.5 19 C38.5 30.5 24 43 24 43 Z' }, 3],
  ['circle', 'c', { cx: '24', cy: '19', r: '5.5' }, 3],
]

const INFO_NODES: readonly RoleNode[] = [
  ['circle', 'b', { cx: '24', cy: '24', r: '17.5' }, 3],
  ['circle', 'kb', { cx: '24', cy: '15.5', r: '2.4' }, 0],
  ['path', 'tb', { d: 'M24 22.5 V33' }, 4.5],
]

const COIN_NODES: readonly RoleNode[] = [
  ['path', 'b', { fillRule: 'evenodd', d: 'M13.5 42 V7 H26.5 C34.5 7 39.5 11.8 39.5 18.8 C39.5 25.8 34.5 30.5 26.5 30.5 H23.5 V42 Z M23.5 14.8 V22.7 H26 C28.6 22.7 30 21.2 30 18.75 C30 16.3 28.6 14.8 26 14.8 Z' }, 3, 'translate(-2.5 0)'],
  ['path', 'b', { d: 'M39 32 Q40.1 36.4 44.5 37.5 Q40.1 38.6 39 43 Q37.9 38.6 33.5 37.5 Q37.9 36.4 39 32 Z' }, 3],
]

const MIXING_BOWL_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M32 3.5 L26.5 11' }, 4.5],
  ['ellipse', 'nc', { cx: '22.5', cy: '17', rx: '5.5', ry: '9.5' }, 3, 'rotate(28 22.5 17)'],
  ['ellipse', 'nc', { cx: '22.5', cy: '17', rx: '2', ry: '9' }, 3, 'rotate(28 22.5 17)'],
  ['path', 'b', { d: 'M7 24 H41 Q41 41.5 24 41.5 Q7 41.5 7 24 Z' }, 3],
  ['rect', 'g', { x: '4.5', y: '20.5', width: '39', height: '5.5', rx: '2.75' }, 3],
]

const PUZZLE_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M10.2 4.5a1.8 1.8 0 013.6 0V6h2.7a1 1 0 011 1v2.7h1.5a1.8 1.8 0 010 3.6H17.5V17a1 1 0 01-1 1h-2.7v-1.5a1.8 1.8 0 10-3.6 0V18H7.5a1 1 0 01-1-1v-2.7H5a1.8 1.8 0 010-3.6h1.5V7a1 1 0 011-1h2.7V4.5z' }, 1.5, 'translate(0 0.5) scale(2)'],
]

const SYNC_CIRCLE_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M40 22 A16 16 0 0 0 11.5 12.5 L8.5 15.5' }, 4.5],
  ['path', 'ta', { d: 'M8 7.5 V16 H16.5' }, 4.5],
  ['path', 'ta', { d: 'M8 26 A16 16 0 0 0 36.5 35.5 L39.5 32.5' }, 4.5],
  ['path', 'ta', { d: 'M40 40.5 V32 H31.5' }, 4.5],
]

const USER_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M8 43 C8 33 15 27.5 24 27.5 C33 27.5 40 33 40 43 Z' }, 3],
  ['circle', 'g', { cx: '24', cy: '16', r: '9' }, 3],
]

const USERS_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M21.5 41 C21.5 33 27 28.5 33.5 28.5 C40 28.5 45.5 33 45.5 41 Z' }, 3],
  ['circle', 'b', { cx: '33.5', cy: '18', r: '6.8' }, 3],
  ['path', 'g', { d: 'M2.5 43 C2.5 34 9 29 17 29 C25 29 31.5 34 31.5 43 Z' }, 3],
  ['circle', 'g', { cx: '17', cy: '17.5', r: '7.8' }, 3],
]

const CHECK_BOLD_NODES: readonly RoleNode[] = [
  ['path', 'ro', { d: 'M11.5 25 L20 33.5 L36.5 15' }, 12],
  ['path', 'rc', { d: 'M11.5 25 L20 33.5 L36.5 15' }, 6],
]

const X_BOLD_NODES: readonly RoleNode[] = [
  ['path', 'ro', { d: 'M14 14 L34 34 M34 14 L14 34' }, 12],
  ['path', 'rc', { d: 'M14 14 L34 34 M34 14 L14 34' }, 6],
]

const LOCK_NODES: readonly RoleNode[] = [
  ['path', 'ro', { d: 'M15.5 21 V15.5 A8.5 8.5 0 0 1 32.5 15.5 V21' }, 10],
  ['path', 'rc', { d: 'M15.5 21 V15.5 A8.5 8.5 0 0 1 32.5 15.5 V21' }, 4],
  ['rect', 'b', { x: '9', y: '20', width: '30', height: '21.5', rx: '5' }, 3],
  ['circle', 'kb', { cx: '24', cy: '29', r: '2.8' }, 0],
  ['path', 'tb', { d: 'M24 30 V35' }, 4.5],
]

const ALERT_TRIANGLE_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M24 6.5 C25.6 6.5 26.7 7.4 27.6 9 L42.2 35 C43.9 38.1 42.2 41.5 38.6 41.5 H9.4 C5.8 41.5 4.1 38.1 5.8 35 L20.4 9 C21.3 7.4 22.4 6.5 24 6.5 Z' }, 3],
  ['path', 'tb', { d: 'M24 18 V28' }, 4.5],
  ['circle', 'kb', { cx: '24', cy: '34.2', r: '2.4' }, 0],
]

const INBOX_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M6 27 L11 11.5 Q12 8.5 15 8.5 H33 Q36 8.5 37 11.5 L42 27 V37 Q42 41 38 41 H10 Q6 41 6 37 Z' }, 3],
  ['path', 'g', { d: 'M6 27 H16 L19 32.5 H29 L32 27 H42 V37 Q42 41 38 41 H10 Q6 41 6 37 Z' }, 3],
  ['path', 'c', { d: 'M24 12.5 Q25.1 16.9 29.5 18 Q25.1 19.1 24 23.5 Q22.9 19.1 18.5 18 Q22.9 16.9 24 12.5 Z' }, 3],
]

const BELL_NODES: readonly RoleNode[] = [
  ['circle', 'b', { cx: '24', cy: '42', r: '3.2' }, 3],
  ['circle', 'b', { cx: '24', cy: '7.5', r: '2.5' }, 3],
  ['path', 'b', { d: 'M24 9.5 C29.5 9.5 34 14.5 34 21 C34 26.5 34.5 30 37.5 33 Q40.5 36.5 36.5 37.5 H11.5 Q7.5 36.5 10.5 33 C13.5 30 14 26.5 14 21 C14 14.5 18.5 9.5 24 9.5 Z' }, 3],
]

const SEARCH_NODES: readonly RoleNode[] = [
  ['path', 'ro', { d: 'M31 31 L40.5 40.5' }, 10],
  ['path', 'rc', { d: 'M31 31 L40.5 40.5' }, 4],
  ['circle', 'b', { cx: '20.5', cy: '20.5', r: '13' }, 3],
  ['path', 'nb', { d: 'M13.5 18 A7.5 7.5 0 0 1 18.5 13' }, 3],
]

const PENCIL_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M12.5 30.5 L32 11 L37 16 L17.5 35.5 Z' }, 3],
  ['path', 'g', { d: 'M32 11 L34.5 8.5 Q36 7 37.5 8.5 L39.5 10.5 Q41 12 39.5 13.5 L37 16 Z' }, 3],
  ['path', 'c', { d: 'M12.5 30.5 L17.5 35.5 L8.5 39.5 Z' }, 3],
  ['path', 'kc', { d: 'M10.4 35 L8.5 39.5 L13 37.6 Z' }, 0],
]

const CHEVRON_RIGHT_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M18 10.5 L31.5 24 L18 37.5' }, 4.5],
]

const CHEVRON_DOWN_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M10.5 18 L24 31.5 L37.5 18' }, 4.5],
]

const PLUS_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M24 11 V37 M11 24 H37' }, 4.5],
]

const MINUS_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M11 24 H37' }, 4.5],
]

const CLOSE_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M13.5 13.5 L34.5 34.5 M34.5 13.5 L13.5 34.5' }, 4.5],
]

const CHECK_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M10 25.5 L19.5 34.5 L38 14' }, 4.5],
]

const SYNC_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M40 22 A16 16 0 0 0 11.5 12.5 L8.5 15.5' }, 4.5],
  ['path', 'ta', { d: 'M8 7.5 V16 H16.5' }, 4.5],
  ['path', 'ta', { d: 'M8 26 A16 16 0 0 0 36.5 35.5 L39.5 32.5' }, 4.5],
  ['path', 'ta', { d: 'M40 40.5 V32 H31.5' }, 4.5],
]

const TREASURE_BOX_NODES: readonly RoleNode[] = [
  ['rect', 'c', { x: '12', y: '13.5', width: '24', height: '21', rx: '2.5' }, 3],
  ['rect', 'c', { x: '12', y: '13.5', width: '5.5', height: '21', rx: '2' }, 3],
  ['rect', 'c', { x: '30.5', y: '13.5', width: '5.5', height: '21', rx: '2' }, 3],
  ['circle', 'b', { cx: '24', cy: '24', r: '3.4' }, 3],
]

const LOCATE_NODES: readonly RoleNode[] = [
  ['path', 'ta', { d: 'M24 4.5 V10 M24 38 V43.5 M4.5 24 H10 M38 24 H43.5' }, 4.5],
  ['circle', 'b', { cx: '24', cy: '24', r: '13' }, 3],
  ['circle', 'kb', { cx: '24', cy: '24', r: '5' }, 0],
]

const ALERT_CIRCLE_NODES: readonly RoleNode[] = [
  ['circle', 'b', { cx: '24', cy: '24', r: '17.5' }, 3],
  ['path', 'tb', { d: 'M24 15.5 V26' }, 4.5],
  ['circle', 'kb', { cx: '24', cy: '32.5', r: '2.4' }, 0],
]

const BAN_NODES: readonly RoleNode[] = [
  ['circle', 'b', { cx: '24', cy: '24', r: '18' }, 3],
  ['circle', 'c', { cx: '24', cy: '24', r: '11.5' }, 3],
  ['path', 'tc', { d: 'M16.5 16.5 L31.5 31.5' }, 7.2],
]

const COPY_NODES: readonly RoleNode[] = [
  ['rect', 'b', { x: '17.5', y: '6.5', width: '24', height: '24', rx: '5.5' }, 3],
  ['rect', 'g', { x: '6.5', y: '17.5', width: '24', height: '24', rx: '5.5' }, 3],
]

const DOWNLOAD_NODES: readonly RoleNode[] = [
  ['path', 'b', { d: 'M20 8.5 Q20 6 22.5 6 H25.5 Q28 6 28 8.5 V17.5 H32.5 Q35.8 17.5 33.8 20.1 L26 30.3 Q24 32.9 22 30.3 L14.2 20.1 Q12.2 17.5 15.5 17.5 H20 Z' }, 3],
  ['path', 'ta', { d: 'M8.5 31 V35.5 Q8.5 40.5 13.5 40.5 H34.5 Q39.5 40.5 39.5 35.5 V31' }, 4.5],
]

const MORE_NODES: readonly RoleNode[] = [
  ['circle', 'kc', { cx: '11', cy: '24', r: '3.8' }, 0],
  ['circle', 'kc', { cx: '24', cy: '24', r: '3.8' }, 0],
  ['circle', 'kc', { cx: '37', cy: '24', r: '3.8' }, 0],
]

/** 투데이 */
export function HomeIcon(props: IconProps) {
  return <RoleIcon nodes={HOME_NODES} {...props} />
}

/** 배지 */
export function MedalIcon(props: IconProps) {
  return <RoleIcon nodes={MEDAL_NODES} {...props} />
}

/** 체크인 */
export function CheckinIcon(props: IconProps) {
  return <RoleIcon nodes={CHECKIN_NODES} {...props} />
}

/** 미션 */
export function TicketIcon(props: IconProps) {
  return <RoleIcon nodes={TICKET_NODES} {...props} />
}

/** 인벤토리 */
export function CrateIcon(props: IconProps) {
  return <RoleIcon nodes={CRATE_NODES} {...props} />
}

/** 아이템 드랍 */
export function ArrowDownIcon(props: IconProps) {
  return <RoleIcon nodes={ARROW_DOWN_NODES} {...props} />
}

/** 아이템 픽업 */
export function ArrowUpIcon(props: IconProps) {
  return <RoleIcon nodes={ARROW_UP_NODES} {...props} />
}

/** 믹스 레시피 */
export function FlaskIcon(props: IconProps) {
  return <RoleIcon nodes={FLASK_NODES} {...props} />
}

/** 기사 */
export function NewspaperIcon(props: IconProps) {
  return <RoleIcon nodes={NEWSPAPER_NODES} {...props} />
}

/** 랭킹 */
export function PodiumIcon(props: IconProps) {
  return <RoleIcon nodes={PODIUM_NODES} {...props} />
}

/** 컬렉션·아이템북 */
export function MagicBookIcon(props: IconProps) {
  return <RoleIcon nodes={MAGIC_BOOK_NODES} {...props} />
}

/** 진행 알림 */
export function SparkleCircleIcon(props: IconProps) {
  return <RoleIcon nodes={SPARKLE_CIRCLE_NODES} {...props} />
}

/** 지역·드랍 위치 */
export function PinIcon(props: IconProps) {
  return <RoleIcon nodes={PIN_NODES} {...props} />
}

/** 컨텐츠 소개 */
export function InfoIcon(props: IconProps) {
  return <RoleIcon nodes={INFO_NODES} {...props} />
}

/** 포인트 — 기본 variant가 'fill'이다(포인트 숫자 옆이 꽉 찬 P로 보이게). */
export function CoinIcon({ variant = 'fill', ...props }: IconProps) {
  return <RoleIcon nodes={COIN_NODES} variant={variant} {...props} />
}

/** 믹스하기 */
export function MixingBowlIcon(props: IconProps) {
  return <RoleIcon nodes={MIXING_BOWL_NODES} {...props} />
}

/** 마지막 파편 */
export function PuzzleIcon(props: IconProps) {
  return <RoleIcon nodes={PUZZLE_NODES} {...props} />
}

/** Strava 연동 */
export function SyncCircleIcon(props: IconProps) {
  return <RoleIcon nodes={SYNC_CIRCLE_NODES} {...props} />
}

/** 아바타 자리 */
export function UserIcon(props: IconProps) {
  return <RoleIcon nodes={USER_NODES} {...props} />
}

/** 팔로워·팔로잉 */
export function UsersIcon(props: IconProps) {
  return <RoleIcon nodes={USERS_NODES} {...props} />
}

/** 미션 완료 */
export function CheckBoldIcon(props: IconProps) {
  return <RoleIcon nodes={CHECK_BOLD_NODES} {...props} />
}

/** 미션 취소 */
export function XBoldIcon(props: IconProps) {
  return <RoleIcon nodes={X_BOLD_NODES} {...props} />
}

/** 잠김 */
export function LockIcon(props: IconProps) {
  return <RoleIcon nodes={LOCK_NODES} {...props} />
}

/** 경고 */
export function AlertTriangleIcon(props: IconProps) {
  return <RoleIcon nodes={ALERT_TRIANGLE_NODES} {...props} />
}

/** 피드 빈 상태 */
export function InboxIcon(props: IconProps) {
  return <RoleIcon nodes={INBOX_NODES} {...props} />
}

/** 알림함 */
export function BellIcon(props: IconProps) {
  return <RoleIcon nodes={BELL_NODES} {...props} />
}

/** 검색 */
export function SearchIcon(props: IconProps) {
  return <RoleIcon nodes={SEARCH_NODES} {...props} />
}

/** 프로필 편집 */
export function PencilIcon(props: IconProps) {
  return <RoleIcon nodes={PENCIL_NODES} {...props} />
}

/** 이동 */
export function ChevronRightIcon(props: IconProps) {
  return <RoleIcon nodes={CHEVRON_RIGHT_NODES} lineOnly {...props} />
}

/** 펼침 */
export function ChevronDownIcon(props: IconProps) {
  return <RoleIcon nodes={CHEVRON_DOWN_NODES} lineOnly {...props} />
}

/** 칸 추가 */
export function PlusIcon(props: IconProps) {
  return <RoleIcon nodes={PLUS_NODES} lineOnly {...props} />
}

/** 칸 빼기 */
export function MinusIcon(props: IconProps) {
  return <RoleIcon nodes={MINUS_NODES} lineOnly {...props} />
}

/** 닫기 */
export function CloseIcon(props: IconProps) {
  return <RoleIcon nodes={CLOSE_NODES} lineOnly {...props} />
}

/** 성공 */
export function CheckIcon(props: IconProps) {
  return <RoleIcon nodes={CHECK_NODES} lineOnly {...props} />
}

/** 동기화 */
export function SyncIcon(props: IconProps) {
  return <RoleIcon nodes={SYNC_NODES} lineOnly {...props} />
}

/** 지도 마커 */
export function TreasureBoxIcon(props: IconProps) {
  return <RoleIcon nodes={TREASURE_BOX_NODES} {...props} />
}

/** 현재 위치 버튼 */
export function LocateIcon(props: IconProps) {
  return <RoleIcon nodes={LOCATE_NODES} {...props} />
}

/** 오류 화면 */
export function AlertCircleIcon(props: IconProps) {
  return <RoleIcon nodes={ALERT_CIRCLE_NODES} {...props} />
}

/** 접근 불가 (어드민) */
export function BanIcon(props: IconProps) {
  return <RoleIcon nodes={BAN_NODES} {...props} />
}

/** 공유 시트 · 복사하기 */
export function CopyIcon(props: IconProps) {
  return <RoleIcon nodes={COPY_NODES} {...props} />
}

/** 공유 시트 · 저장하기 */
export function DownloadIcon(props: IconProps) {
  return <RoleIcon nodes={DOWNLOAD_NODES} {...props} />
}

/** 공유 시트 · 더보기 */
export function MoreIcon(props: IconProps) {
  return <RoleIcon nodes={MORE_NODES} lineOnly {...props} />
}
