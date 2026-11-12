# SlotOutline

슬롯 칸의 «점선 외곽선». 티켓 20261112_1627 신규.

이미지를 그리지 않는다. 배지 이미지의 알파 윤곽을 따라가는 점선 SVG 한 장만 그린다.

```jsx
// 비어 있는 칸 — 이미지 없이 점선만. 추적에 실패하면 둥근 사각형 점선
<SlotOutline src={tracedSrc} fallback="box" />

// 넣을 수 있는 칸 — 회색 이미지 위에 겹친다(이미지 래퍼 밖의 형제로). 실패하면 아무것도 안 그린다
<div style={{ position: 'relative' }}>
  <img … style={{ opacity: 0.4, filter: 'grayscale(1)' }} />
  <SlotOutline src={tracedSrc} fallback="none" style={{ position: 'absolute', inset: 0 }} />
</div>
```

## 쓰이는 곳

- `BadgeGridCard` — `undiscovered`(점선만)와 `outlined`(회색 이미지 위 점선). 서비스 사본과 DS 사본이 함께 쓴다.

## 규칙

- 점선: `stroke var(--muted)` 불투명 100%, 굵기 2, 선 3 · 간격 4, `stroke-linejoin: round`, `stroke-linecap: butt`, `fill: none`.
  `vector-effect: non-scaling-stroke`라 칸이 줄어도 굵기와 점선 길이가 같다.
- **움직이지 않는다.** 마칭 앤츠 같은 dashoffset 애니메이션을 쓰지 않는다. 등장은 150ms 페이드 인(reduced-motion이면 바로).
- 색을 등급색·강조색으로 바꾸지 않는다. 그라디언트·글로우·그림자도 얹지 않는다.
- 이미지 `opacity`의 영향을 받지 않게 반드시 이미지 래퍼의 **형제**로 둔다. 래퍼 안에 넣으면 점선도 흐려진다.
- 사각형 대체는 추적 실패·주소 없음일 때만 쓴다. 정상일 때 모든 칸을 사각형으로 통일하지 않는다(배지마다 자기 윤곽).
- `src`는 있는 그대로 쓴다. 서비스는 `isOptimizableImageSrc`가 참이면 `/_next/image?url=<인코딩>&w=256&q=75`를 만든다(`slotOutlineTraceSrc`).
  **w=256, q=75를 지킨다** — 폭 90 이미지의 2x 후보(next/image srcset은 1x=96, 2x=256)와 같아 새 변환본이 생기지 않는다.
  다른 폭은 이미지마다 변환본이 늘어 비용이 늘고, w=192는 next 기본 sizes에 없어 400이다.
- 추적은 `new Image()` → 180px 캔버스(inset 4, contain) → alpha 128 이상 마칭 스퀘어 → 바깥 윤곽만 → Douglas-Peucker ε 0.35 → 소수 1자리.
  잔 조각(전체 면적 0.5% 미만)과 안쪽 구멍은 버린다. 시작점은 맨 위 맨 왼쪽이다.
- 같은 이미지는 모듈 캐시로 한 번만 추적하고 실패도 기억한다. 화면 근처(rootMargin 200px)에 들어올 때만 시작한다.
- `traceAlphaOutline(rgba, width, height)`은 순수 함수로 export한다. 시험은 canvas 없이 합성 RGBA 배열로 한다.
