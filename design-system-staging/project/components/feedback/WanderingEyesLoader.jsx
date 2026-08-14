import React, { useMemo } from 'react';

/**
 * WanderingEyesLoader — 눈 안에서 눈동자가 돌아다니다가 주기적으로 깜빡이는 대기 표시.
 * 소스: jam-web/src/components/ui/WanderingEyesLoader.tsx (1:1 재현)
 *
 * 이동 경로는 마운트마다 새로 랜덤 생성 — 매번 다르게 움직인다.
 * 두 눈은 같은 경로를 공유해 "같은 곳을 보는" 느낌을 유지한다.
 */

const STATIC_CSS = `.wandering-eyes{display:flex;align-items:center;justify-content:center;gap:12px}.wandering-eyes-eye{position:relative;width:48px;height:48px;border-radius:9999px;background-color:var(--eye-color,#f8fafc);overflow:hidden;flex-shrink:0;animation:wandering-eyes-blink var(--duration,2s) ease-in-out infinite}.wandering-eyes-eye:nth-child(2){animation-delay:-60ms}.wandering-eyes-pupil{position:absolute;inset:0;margin:auto;width:68%;height:68%;border-radius:9999px;background-color:var(--pupil-color,#0f172a);animation:wandering-eyes-move var(--duration,2s) ease-in-out infinite}@keyframes wandering-eyes-blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(0.06)}97%{transform:scaleY(1)}}@media(prefers-reduced-motion:reduce){.wandering-eyes-eye,.wandering-eyes-pupil{animation:none}}`;

// 눈동자 이동 키프레임의 중간 정지 지점(%) — 깜빡임 키프레임과 리듬을 맞춘 값 (소스 동일)
const MOVE_STOPS = [15, 30, 45, 60, 75, 88];

function randomOffset(maxPercent) {
  const angle = Math.random() * Math.PI * 2;
  const radius = maxPercent * (0.55 + Math.random() * 0.45);
  return { x: Math.round(Math.cos(angle) * radius * 100) / 100, y: Math.round(Math.sin(angle) * radius * 100) / 100 };
}

let _uid = 0;

export function WanderingEyesLoader({ duration = '2s', eyeColor = '#f8fafc', pupilColor = '#0f172a', style = {} }) {
  const animName = useMemo(() => `wem-${++_uid}`, []);
  const keyframesCss = useMemo(() => {
    const start = randomOffset(34);
    const stops = MOVE_STOPS.map(stop => ({ stop, ...randomOffset(38) }));
    const body = stops.map(({ stop, x, y }) => `${stop}%{transform:translate(${x}%,${y}%)}`).join(' ');
    return `@keyframes ${animName}{0%,100%{transform:translate(${start.x}%,${start.y}%)} ${body}}`;
  }, [animName]);

  return (
    <div
      className="wandering-eyes"
      style={{ '--duration': duration, '--eye-color': eyeColor, '--pupil-color': pupilColor, ...style }}
      role="status"
      aria-label="로딩 중"
    >
      <style>{STATIC_CSS + keyframesCss}</style>
      <span className="wandering-eyes-eye">
        <span className="wandering-eyes-pupil" style={{ animationName: animName }} />
      </span>
      <span className="wandering-eyes-eye">
        <span className="wandering-eyes-pupil" style={{ animationName: animName }} />
      </span>
    </div>
  );
}
