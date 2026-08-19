---
id: 20260819_002
category: Admin
status: CLOSED
created: 2026-08-19
closed: 2026-08-19
---

# [Admin] 배경 제너레이터 스파이크 — 애니메이션 모드 kaleidoscope로 교체

## 배경 / 문제 정의
티켓 [20260819_001](20260819_001_Admin_배경테마-제너레이터-스파이크.md)의 애니메이션 모드는
사용자가 지정한 https://collidingscopes.github.io/ 를 참고 소스로 요구받았으나, jam-developer가
"해당 사이트는 만화경(kaleidoscope) 데모라 '리퀴드 왜곡류'라는 요구 문구와 안 맞는다"고 임의
판단해 자매 리포 `collidingScopes/liquify`(스미어 효과)로 대체 구현했다.

이는 잘못된 판단이었다. 사용자가 실제로 원한 건 정확히 그 URL에 있는 **칼레이도스코프 애니메이션
효과 자체**였고, 이번 확인 결과 만화경 효과는 스파이크에 전혀 구현되지 않았다. liquify는 완전히
제거하고 kaleidoscope로 교체하기로 확정했다(사용자 확인 완료).

## 상세 요구사항

### 서비스/코드베이스 관점
- `jam-web/src/app/spike/background-generator/liquify/` (perlin.ts, engine.ts)와
  `AnimationPanel.tsx`의 liquify 관련 로직을 **전부 제거**한다.
- https://github.com/collidingScopes/collidingScopes.github.io 루트의 `kaleidoscope.js`를 조사해
  핵심 로직을 발췌·TypeScript로 이식한다. 확인된 구조:
  - 정삼각형 타일 기반 대칭·회전 렌더링 (`fn()`, `tile()` — 원본 이미지 + 좌우반전 이미지 사용,
    3섹션마다 -120° 회전 반복)
  - `requestAnimationFrame` 루프 기반 애니메이션, `Math.sin()` 기반 정현파 오프셋으로 왕복 운동
  - 조절 가능 파라미터: `numTiles`(슬라이스/타일 수), 애니메이션 속도
  - 순수 Canvas2D (`ctx.createPattern`/`translate`/`rotate`/`scale`/`getImageData`/`putImageData`),
    Three.js/WebGL 미사용 — 기존 스택 제약과 일치
  - MIT 라이선스 (collidingScopes 계정 소유 리포, 이식 시 출처·라이선스 주석 남길 것 — liquify 이식
    때와 동일한 방식)
- 가져오지 않아도 되는 부분: `videoExportFunctions.js`(mp4-muxer 기반 비디오 녹화)는 이 스파이크
  범위(브라우저 실시간 미리보기)에 불필요하면 제외해도 된다. 단, 정식 기능에서 "어드민이 최종
  결과를 반복 영상으로 굽는다"는 요구사항과 연결될 수 있는 참고 자료이므로, 제외하더라도 완료
  기록에 존재 사실은 남겨둘 것(향후 정식 기능 개발 시 참고).
- 그 외 티켓 20260819_001의 제약(스테이징 전용, 로그인 없이 접근, main 머지 금지, Three.js 등
  금지 의존성 미추가)은 동일하게 유지한다.

### UI/UX 관점 (해당 시)
- 애니메이션 패널에서 numTiles(슬라이스 수)·애니메이션 속도를 조절할 수 있게 하고, 결과가 실제
  만화경 형태(대칭·회전 타일)로 보이는지 바로 확인 가능해야 한다.

### 컨텐츠 관점 (해당 시)
- 해당 없음

## 구현 계획
1. `AnimationPanel.tsx`와 `liquify/` 폴더의 liquify 관련 코드 제거
2. `kaleidoscope.js` 조사 후 핵심 로직만 TypeScript 모듈로 이식 (예: `kaleidoscope/engine.ts`)
3. `AnimationPanel.tsx`를 kaleidoscope 파라미터(numTiles, 속도) 컨트롤로 교체
4. 패턴/애니메이션 배타 선택 및 그 위에 전역 Paper 필터 적용이라는 기존 파이프라인 구조는 그대로
   유지 — 애니메이션 엔진만 교체
5. 완료 기록에 이식 범위(가져온 것/가져오지 않은 것), 포팅 난이도, 실제 동작 확인 결과를 정리

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `jam-web/src/app/spike/background-generator/liquify/`(perlin.ts, engine.ts)를 완전히 삭제하고,
  `github.com/collidingScopes/collidingScopes.github.io`의 `kaleidoscope.js`를 조사해 핵심 렌더링
  로직을 `kaleidoscope/engine.ts`(`KaleidoscopeEngine`)로 이식했다.
- **이식 범위 (가져온 것)**: `resizeImage()`/`generateFlippedImage()`(numTiles에 맞춰 이미지를 축소하고
  좌우반전 이미지를 만드는 로직, DOM `<img>` 대신 오프스크린 `<canvas>`로 대체), `createAnimation()`
  내부의 `fn()`(정삼각형 타일을 패턴으로 채우고 -120도 회전을 반복해 6각 대칭을 만드는 로직 — 변수명·
  연산 순서까지 원본 그대로), `tile()`(그려진 스트립을 `getImageData`/`putImageData`로 캔버스 전체에
  복제), `loop()`(정현파 오프셋으로 패턴이 왕복 운동하는 rAF 루프). 애니메이션 속도 산식
  (`8000/speed * numTiles/2.5`)과 numTiles/speed 입력 범위(2~25 / 1~15, 원본 index.html의 min/max/
  기본값과 동일)도 그대로 가져왔다.
- **가져오지 않은 것**: HTML 컨트롤 패널 DOM 배선(sticky table, 스크롤 토글), 파일 업로드 이벤트
  리스너, 브라우저 UA 분기, PNG 저장 단축키(`saveImage`), 비디오 녹화
  (`recordVideoMuxer`/`mp4-muxer` 기반 `videoExportFunctions.js`)는 제외했다. `videoExportFunctions.js`는
  이 스파이크 범위(브라우저 실시간 미리보기) 밖이라 이식하지 않았지만, 향후 정식 기능에서 "어드민이
  최종 결과를 반복 영상으로 굽는다"는 요구사항과 연결될 수 있는 참고 자료로 존재 사실을 남겨둔다
  (mp4-muxer 기반, 같은 저장소 루트에 위치).
- `AnimationPanel.tsx`를 `KaleidoscopeEngine` 기반으로 교체하고, 컨트롤을 브러시 크기/밀도/불투명도/
  속도(liquify 파라미터)에서 슬라이스 수(numTiles)·애니메이션 속도 2개로 교체했다. numTiles 변경 시
  엔진이 이미지 재스케일·패턴 재생성을 포함한 전체 재구성(`rebuild()`)을 수행하고, speed 변경은
  가벼운 갱신만 수행하도록 분리했다.
- 패턴/애니메이션 배타 선택 + 그 위 전역 Paper 필터 적용이라는 기존 파이프라인 구조(`page.tsx`,
  `FilterPreview.tsx`)는 변경하지 않았다. 스냅샷 캡처(400ms 스로틀) 로직도 그대로 유지했다.
- 출처(MIT, Alan Ang)와 이식 범위를 `kaleidoscope/engine.ts` 상단 주석에 남겼다 (liquify 이식 때와
  동일한 방식).

### 포팅 난이도
- 중간. 좌표계·변환(translate/rotate/scale) 순서를 한 글자도 틀리지 않게 옮겨야 육각 대칭이 정확히
  맞물리는 구조라, 원본 `fn()`/`tile()`의 연산 순서를 그대로 보존하는 데 주의가 필요했다.
  DOM `<img>` 로드 콜백 체인(`resizeImage → setTimeout → generateFlippedImage → setTimeout →
  createAnimation`)은 오프스크린 캔버스로 대체하면서 동기 코드로 단순화했다(이미지 로드 자체는 이미
  상위 `page.tsx`에서 완료된 상태로 넘어오므로 문제 없음).
- `canvas.width/height` 대입이 브라우저 스펙상 캔버스 변환을 초기화한다는 점을 활용해 원본의
  `ctx.translate(-0.5*patDim, 0)` 1회성 초기 변환을 `rebuild()`에서 `setTransform` 리셋 후 재적용하는
  방식으로 이식했다.

### 실제 동작 확인 결과
- Playwright로 스파이크 페이지에 테스트 이미지(그라디언트+원)를 업로드하고 애니메이션 모드로
  전환해 스크린샷을 확인함 — 정삼각형 타일이 6각 대칭·회전 구조로 맞물려 만화경 패턴이 정상
  렌더링됨을 확인했다 (liquify의 스미어 효과가 아닌, 사용자가 원한 kaleidoscope 대칭 타일 효과).
- 슬라이스 수(numTiles) 슬라이더 조작 시 콘솔 에러 없이 패턴이 재구성됨을 확인했다.
- `npx tsc --noEmit`, `npx eslint`로 변경 파일에 타입/린트 에러가 없음을 확인했다 (기존
  `src/lib/points/__tests__/reasons.test.ts`의 사전 존재 에러는 본 작업과 무관).

### 변경된 파일
```
jam-web/src/app/spike/background-generator/AnimationPanel.tsx (수정 — kaleidoscope 컨트롤로 교체)
jam-web/src/app/spike/background-generator/kaleidoscope/engine.ts (신규 — KaleidoscopeEngine)
jam-web/src/app/spike/background-generator/liquify/engine.ts (삭제)
jam-web/src/app/spike/background-generator/liquify/perlin.ts (삭제)
jam-web/src/app/spike/background-generator/types.ts (수정 — AnimationParams을 numTiles/speed로 교체)
```
> 같은 디렉터리의 `PatternPanel.tsx`/`patternTile.ts`/`types.ts`(PatternParams 부분)에 동시에 진행
> 중이던 다른 작업(패턴 모드 오프셋 파라미터 명칭 변경 `offsetX/offsetY→rowGap/colGap`, `gap` 제거로
> 추정)의 미커밋 변경이 있어, `git add -p`로 애니메이션 모드 관련 변경분만 정확히 분리해 커밋했다.
> 해당 변경은 이 티켓 범위가 아니므로 건드리지 않았다.

### 테스트 결과
- [x] `npx tsc --noEmit -p tsconfig.json` — 변경 파일 기준 에러 없음
- [x] `npx eslint` (변경 파일 대상) — 에러 없음
- [x] Playwright 헤드리스 스크린샷으로 실제 kaleidoscope 렌더링 확인 (수동 브라우저 확인은 로그인
      필요 없는 `/spike` 라우트라 가능했으나, 본 확인은 자동화 스크립트로 대체)

### 배포 정보
- 배포일: 2026-08-19
- 환경: staging 전용 (production 배포 금지)
- 커밋: staging에 머지 완료 (원 리뷰 브랜치 `claude/jamwork-20260819_002-kaleidoscope`)

### 주요 의사결정 / 핵심 메모
- liquify는 요구사항과 무관한 오판이었다는 사용자 확인에 따라 코드에서 완전히 제거했다(자료로도
  남기지 않음 — videoExportFunctions.js와 달리 liquify는 향후 참고 가치가 없다고 판단).
- numTiles·speed 슬라이더의 min/max/기본값은 원본 `index.html`의 `numTilesInput`(2~25, 기본 5),
  `speedInput`(1~15, 기본 3) 값을 그대로 사용해 원본과 동일한 체감 범위를 유지했다.
- "다시 시작" 버튼 라벨은 기존 "원본 이미지로 리셋"(liquify는 누적 왜곡을 초기화하는 의미였음)을
  대체한 것 — kaleidoscope는 누적 왜곡이 없고 엔진을 재생성해 카운터를 초기화하는 것뿐이라
  UX_WRITING_GUIDELINE의 예측 가능한 행동 동사 규칙에 맞춰 새로 이름 붙였다.

### 잔여 이슈
- 같은 페이지의 패턴 모드(`PatternPanel.tsx`/`patternTile.ts`) 쪽에 동시 진행 중인 미커밋 변경이
  남아 있다 — 이 티켓 범위 밖이므로 그대로 두었고, 별도 프로세스가 이어서 커밋할 것으로 보인다.
- `videoExportFunctions.js`(mp4-muxer 기반 비디오 녹화)는 참고 자료로만 남겨두고 이식하지 않았다.
  정식 기능에서 "결과를 반복 영상으로 굽기" 요구사항이 확정되면 별도 검토가 필요하다.
