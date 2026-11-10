/**
 * 캡슐 알약 아이콘 — 캡슐 게이지 채움 오른쪽 끝 원 안에 붙는다 (티켓 20261110_1346, 사용자 요청 2026-11-10)
 *
 * 인라인 SVG 두 조각으로 그린다. 왼쪽 반쪽은 속이 찬 면, 오른쪽 반쪽은 테두리만 있는 알약이다. 번개 아이콘(`JamBolt`)을 대신한다.
 * 게이지가 가득 차 `open`이 켜지면 가운데가 갈라진다. 두 반쪽이 위쪽 가운데 점을 축으로 45°씩 벌어져 아래가 열린 V자가 되고, `open`이 꺼지면 같은 길로 닫힌다.
 * 갈라진 틈으로 떨어지는 알갱이는 그리지 않는다(사용자 지시 2026-11-10).
 * 회전은 이 컴포넌트가 아니라 바깥 상자(`CapsuleGauge`)가 맡는다: 채움이 차오르는 동안 같은 시간·같은 곡선으로 돈다.
 *
 * 좌표는 24×12 상자 기준이다. 갈라지면 반쪽이 상자 밖으로 나오므로 `overflow: visible`이다.
 * 모션 줄이기에서는 전환 없이 바로 갈라진 모양이 된다.
 */

/** 흰색 */
const PILL_COLOR = '#FFFFFF'
/** 갈라질 때 반쪽이 벌어지는 각도(°) */
const SPLIT_ANGLE_DEG = 45
/** 두 반쪽이 맞닿는 위쪽 가운데 점(회전 축) */
const HINGE = '12px 0px'
/** 갈라지는 시간(ms). 곡선은 살짝 넘쳤다가 돌아오는 `--ease-bounce`다 */
const SPLIT_MS = 520

/** 갈라지면 반쪽이 위로 솟아 원 위쪽에 치우치므로, 열릴 때 전체를 이만큼(24×12 상자 단위) 내려 가운데에 맞춘다 */
const OPEN_SHIFT_Y = 6

interface Props {
  /** 아이콘 너비(px). 높이는 너비의 절반이다 */
  width: number
  /** 켜면 가운데가 갈라진다 */
  open: boolean
}

export default function CapsulePillIcon({ width, open }: Props) {
  const moveClass = 'transition-transform ease-[var(--ease-bounce)] motion-reduce:transition-none'
  const halfStyle = { transitionDuration: `${SPLIT_MS}ms`, transformOrigin: HINGE } as const
  return (
    <svg
      width={width}
      height={width / 2}
      viewBox="0 0 24 12"
      aria-hidden="true"
      focusable="false"
      data-capsule-pill={open ? 'open' : 'closed'}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g className={moveClass} style={{ transitionDuration: `${SPLIT_MS}ms`, transform: `translateY(${open ? OPEN_SHIFT_Y : 0}px)` }}>
        {/* 왼쪽 반쪽: 속이 찬 면. 갈라지면 시계 방향으로 벌어져 왼쪽 위를 향한다 */}
        <g className={moveClass} style={{ ...halfStyle, transform: `rotate(${open ? SPLIT_ANGLE_DEG : 0}deg)` }}>
          <path d="M12 0H6a6 6 0 0 0 0 12h6Z" fill={PILL_COLOR} />
        </g>
        {/* 오른쪽 반쪽: 테두리만 있는 면. 갈라지면 반시계 방향으로 벌어져 오른쪽 위를 향한다 */}
        <g className={moveClass} style={{ ...halfStyle, transform: `rotate(${open ? -SPLIT_ANGLE_DEG : 0}deg)` }}>
          <path d="M12 1H18a5 5 0 0 1 0 10H12Z" fill="none" stroke={PILL_COLOR} strokeWidth={2} />
        </g>
      </g>
    </svg>
  )
}
