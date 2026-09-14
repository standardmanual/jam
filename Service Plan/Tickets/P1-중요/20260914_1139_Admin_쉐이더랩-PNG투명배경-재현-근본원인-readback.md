---
id: 20260914_1139
category: Admin
priority: P1
status: OPEN
created: 2026-09-14
---

# [Admin] 쉐이더 랩 — PNG 투명배경 여전히 미반영 (티켓 20260914_1045 재발, 새 근본 원인 확인)

## 배경 / 문제 정의

티켓 [20260914_1045](../P1-중요/20260914_1045_Admin_쉐이더랩-PNG투명배경-미반영.md)(CLOSED,
staging 병합됨)가 `@basementstudio/shader-lab` 패키지 렌더러의 opaque 하드코딩 3곳(WebGPU
컨텍스트 `alpha:false`, `baseMesh` 알파 고정, `blend-modes.js`의 `filter` 알파 고정)을 고쳤지만,
게이트 리뷰가 WARN으로 남긴 대로 **실제 시각적 검증을 하지 못한 채 머지됐다.** 사용자가 실제로
배경 알파를 낮춰 PNG를 저장해보니 **여전히 투명하게 저장되지 않는다**고 재보고했다.

오케스트레이터가 로컬 실렌더(`DEV_PROCESS_GUARDRAILS.md` 패턴 13)로 직접 재현·조사한 결과,
20260914_1045가 고친 3곳과는 **별개의, 훨씬 근본적인 새 원인**을 찾았다. 이 원인은 patch로
쉽게 고칠 수 있는 수준이 아니라서 신중한 설계가 필요해 별도 티켓으로 분리한다.

## 사전 조사 결과 (오케스트레이터, 로컬 실렌더 직접 검증)

### 1. 20260914_1045의 패치는 정상 반영돼 있다

`node_modules`에 patch-package로 재적용된 코드를 직접 grep해 3곳 모두 정확히 반영돼 있음을
확인했다(`alpha: true`, `setClearColor(..., 0)`, `blend-modes.js`의 소스-오버 알파 공식).
패치 자체는 문제가 아니다.

### 2. 셰이더 레이어 자신의 알파 계산은 정확하다

리퀴드 메탈의 숨겨진 소스 WebGL 캔버스(`liquid-metal-pass.js`의 `this.container` 안,
`document.body`에 `position:fixed`로 붙는 hidden div)를 브라우저에서 직접
`toDataURL()`로 읽어 픽셀을 확인했다: `colorBack` 알파를 0으로 낮추면 배경 영역은 정확히
`alpha=0`, 패턴이 있는 영역은 `alpha=255`로 나온다. **셰이더 자체와 개별 pass 텍스처 레벨의
알파 계산은 완전히 정상이다.**

### 3. 새로 발견한 진짜 근본 원인 — WebGPU 캔버스의 premultiplied 프레젠테이션과 readback 불일치

메인 컴포지트 캔버스(`ShaderLabViewport`의 실제 `<canvas>`, WebGPU 컨텍스트)에서 직접
`toDataURL()`/`canvas.toBlob()`/`drawImage(mainCanvas, ...)`로 픽셀을 읽으면, 배경 알파를
0으로 낮춰도 **항상 `alpha=255`(완전 불투명)로 고정**된다 — 20260914_1045가 고친 3곳이
모두 반영된 상태에서도 그렇다.

원인으로 추정되는 구조: three.js WebGPU 백엔드는 `alpha:true`로 렌더러를 만들면 캔버스
프레젠테이션 컨텍스트를 `alphaMode: 'premultiplied'`로 구성한다
(`node_modules/three/src/renderers/webgpu/WebGPUBackend.js:281`). 이 모드에서는 캔버스에
**미리 RGB에 alpha를 곱한(premultiplied) 값**이 저장되어 있어야 브라우저가 올바르게
un-premultiply해서 readback할 수 있다. 그런데 셰이더 파이프라인(baseMesh, blend-modes,
각 pass의 `composeColorNode`)은 **straight alpha**로 RGBA를 계산해 그대로 최종 blit
단계(`PipelineManager.blitMaterial`)까지 흘려보낸다 — RGB에 alpha를 곱하는 지점이 파이프라인
어디에도 없다. 그 결과 캔버스에는 "alpha=0인데 RGB는 원래 색 그대로"인, premultiplied 규칙
기준으로는 모순된 값이 저장되고, 브라우저가 이를 readback할 때 어떻게 처리하는지가 실측
결과(화면 표시는 정상, raw readback은 alpha=255 고정)의 원인으로 추정된다.

### 4. 실험 — blit 단계에서 직접 premultiply를 시도했으나 렌더링 자체가 깨짐

`PipelineManager`의 `blitMaterial.colorNode`를 `vec4(rgb.mul(a), a)`(RGB에 alpha를 곱해
premultiply)로 바꾸는 실험을 로컬에서 시도했다. `material.transparent = true` +
`blending = THREE.NoBlending` 조합도 함께 시도했지만, **오히려 캔버스 전체가 완전히
`(0,0,0,0)`(아무것도 안 보임, raw readback 기준)으로 나오는 다른 문제가 발생**했다(다만
화면에 표시되는 이미지 자체는 여전히 정상으로 보임 — 화면 표시와 raw readback의 불일치가
이번에도 반복됨). 정확한 원인은 규명하지 못했다 — TSL 노드 그래프에서 `vec3.mul(float)`
브로드캐스팅이 기대대로 동작하지 않거나, `HalfFloatType` 렌더타겟 값의 범위/정밀도 문제,
혹은 `MeshBasicNodeMaterial`이 `transparent:true`일 때 렌더 파이프라인을 다르게 컴파일하는
것 등이 후보다. 이 실험 코드는 모두 되돌렸다(node_modules를 patch-package로 재적용해 원복,
JAM! 쪽 실험 코드도 커밋하지 않고 삭제).

### 5. 유망해 보이는 해결 경로 — canvas presentation을 우회한 raw pixel readback

`Renderer.js`(three.js 공통 렌더러, WebGPURenderer가 상속)에
`readRenderTargetPixelsAsync(renderTarget, x, y, width, height)` API가 있다
(`node_modules/three/src/renderers/common/Renderer.js:2884`). 이는 캔버스 swap chain
(premultiplied 프레젠테이션)을 완전히 우회하고, **렌더타겟(`PipelineManager`의 `rtA`/`rtB`,
`RENDER_TARGET_OPTIONS.type = THREE.HalfFloatType`)의 raw RGBA 픽셀을 직접 읽는다.** 이
경로라면 premultiplied 캔버스 readback 문제 자체를 피해갈 수 있을 것으로 보인다. 다만
구현 범위가 크다:

1. `pipeline-manager.js`에 `render()` 직후의 최종 텍스처(`lastReadTarget` 또는 그 시점의
   `readTarget`)를 외부에 노출하는 getter/메서드 추가.
2. `create-webgpu-renderer.js`의 반환 객체에 이 렌더타겟에서 `readRenderTargetPixelsAsync`를
   호출해 raw 픽셀(half-float 인코딩)을 받아오는 캡처 메서드 추가.
3. 패키지의 public 훅(`useShaderLabCanvasSource`, `index.js` 등)에서 이 캡처 메서드를
   외부(JAM! 코드)에서 호출 가능하도록 노출.
4. half-float(`Uint16Array` 형태) → 8bit RGBA 변환 로직 작성(정밀도·범위 클램프 주의).
5. 변환된 RGBA를 `ImageData`로 만들어 2D 캔버스에 `putImageData()`한 뒤 그 캔버스에서
   `toBlob()`하도록 JAM! 코드(`useShaderLabPlayback.ts`, `ShaderLabExportPanel.tsx`,
   `ShaderLabApplyTab.tsx`)의 export/적용/미리보기 스냅샷 경로를 리팩토링.

### 6. 20260914_1045의 패치는 유지한다

이번 조사에서 20260914_1045가 고친 3곳(alpha:true, baseMesh 알파=0, blend-modes 알파 공식)이
직접적인 해결책은 아니었음이 드러났지만, **렌더 파이프라인 내부(렌더타겟) 텍스처 자체가
정확한 알파를 담고 있어야 한다**는 전제 조건으로서는 여전히 필요하다고 판단된다(정확히
검증하지는 못했으나, 되돌릴 근거도 없다). 이 패치들을 제거하는 방향으로 접근하지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 위 5번 절의 `readRenderTargetPixelsAsync` 기반 경로를 실측으로 먼저 검증한다(로컬
  실렌더로 half-float→8bit 변환 후 실제로 정확한 alpha가 나오는지 픽셀 단위 확인) — 방향
  자체가 틀렸을 가능성도 배제하지 않는다.
- 검증되면 `patches/@basementstudio+shader-lab+3.0.2.patch`에 필요한 파일들을 추가/수정하고,
  JAM! 쪽 export 경로 3곳(export PNG, apply 탭 적용, apply 탭 미리보기 스냅샷)을 새 캡처
  함수를 쓰도록 리팩토링한다.
- 대안이 이 경로로도 막히면, "WebGPU 캔버스 자체의 투명 export가 이 렌더러 아키텍처로는
  기술적으로 매우 어렵다"는 결론과 근거를 사용자에게 보고하고 범위를 재협의한다 — 무리하게
  또 다른 임시방편(예: 검정/흰 배경 합성 후 사용자가 수동으로 배경 제거)으로 덮지 않는다.

## 구현 계획

1. 로컬 실렌더로 `readRenderTargetPixelsAsync` 접근을 최소 스파이크(간단한 콘솔 스크립트나
   임시 코드)로 먼저 검증 — half-float 배열을 읽어 8bit로 변환한 값이 실제 배경(alpha=0)/
   패턴(alpha=255) 영역에서 올바르게 나오는지 확인.
2. 검증되면 패키지 patch 설계를 확정하고 3~5번 절 계획대로 구현.
3. 텍스트 레이어 `textColor` 알파, 리퀴드 메탈 `colorBack` 알파 각각 0/0.5/1 조합으로 export
   PNG의 alpha 채널이 정확히 비례하는지 재측정한다.
4. `ShaderLabApplyTab.tsx`(적용 결과물)·`ShaderLabExportPanel.tsx`(PNG export) 양쪽 모두
   동일하게 정상화됐는지 확인한다.
5. 회귀 확인: 알파를 안 쓰는 나머지 27종 레이어 타입(그라디언트·플루이드 등)의 기존 export
   결과가 이번 변경으로 달라지지 않는지 대표 몇 종을 픽셀 비교로 확인한다.
6. `npx tsc --noEmit`, `npm run lint`, `npx vitest run` 재확인, patch-package 재적용성
   (postinstall) 확인.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

티켓 5번 절 계획대로 `readRenderTargetPixelsAsync` 기반 경로를 구현했다.

1. **`pipeline-manager.js`**: `render()`가 `activePasses.length === 0`일 때도 항상 `rtA`에
   `baseScene`을 렌더링한 뒤 블릿하도록 통일해, `this.lastReadTarget`이 매 프레임 정확한
   렌더타겟(HalfFloatType, straight alpha)을 가리키게 했다. `async readPixelsAsync(x,y,w,h)`를
   추가해 `renderer.readRenderTargetPixelsAsync(this.lastReadTarget, ...)`로 캔버스 swap chain을
   우회한 raw readback을 노출한다.
2. **`create-webgpu-renderer.js`**: half-float(비트패턴 Uint16Array) → 8bit 변환
   (`decodeHalfFloatRgbaToUint8`)을 추가했다. WebGPU `copyTextureToBuffer`가 각 행을 256바이트
   경계로 패딩하는 것(`WebGPUTextureUtils.js`)을 감안해 행 보폭을 직접 계산해 스트리핑하고,
   렌더타겟이 최종 블릿의 UV 플립(`vec2(uv().x, 1-uv().y)`)을 거치지 않은 좌표계라는 점도
   감안해 디코딩 중 행 순서를 뒤집어(Y flip) 최종 화면과 같은 방향이 되게 했다.
   `captureFrame(x,y,w,h)`를 렌더러 반환 객체에 추가.
3. **`shader-lab-canvas-source.js`** / **`use-shader-lab-canvas-source.js`**: `captureFrame`을
   각 계층의 공개 API로 그대로 릴레이(`ShaderLabCanvasSource.captureFrame` →
   `useShaderLabCanvasSource().captureFrame`)했다. 관련 `.d.ts` 4개(`contracts.d.ts`,
   `pipeline-manager.d.ts`, `shader-lab-canvas-source.d.ts`,
   `use-shader-lab-canvas-source.d.ts`)에 타입 선언을 추가했다.
4. **JAM! 쪽**: `useShaderLabPlayback.ts`가 `captureFrame`을 그대로 노출하도록 하고,
   신규 `captureShaderLabFrameToBlob.ts`(2D 캔버스에 `putImageData()` 후 `toBlob()` — 2D
   캔버스는 premultiplied swap chain 문제와 무관하다)를 추가했다. `ShaderLabViewport.tsx`가
   `captureFrameRef`(부모가 주는 ref)에 `captureFrame`을 채워 넣고, `page.tsx`가 이 ref를
   `ShaderLabExportPanel`/`ShaderLabApplyTab`에 전달한다. 두 컴포넌트의 PNG export·미리보기
   스냅샷·적용 3개 경로 모두 `canvas.toDataURL()`/`toBlob()`(WebGPU 캔버스 직접 읽기) 대신
   `captureShaderLabFrameToBlob()`을 쓰도록 교체했다. `ShaderLabApplyTab`의 미리보기는
   `toDataURL()` 결과 대신 `Blob`의 Object URL을 쓰므로, 재스냅샷마다 이전 URL을 `revokeObjectURL`
   하는 누수 방지 로직도 함께 추가했다.
5. 20260914_1045의 패치 3곳(alpha:true, baseMesh 알파=0, blend-modes 알파 공식)은 그대로 유지했다
   (티켓 6번 절대로 — 렌더타겟 자체의 알파 계산이 정확해야 한다는 전제 조건).

**최소 스파이크 검증에 대한 중요한 한계 (반드시 읽을 것)**: 이 작업을 수행한 서브에이전트 실행
환경(격리 워크트리, 샌드박스)은 `navigator.gpu`가 존재하지 않는다 — playwright(headless/headful
둘 다)로 직접 확인했다(`chromium.launch({ args: ['--enable-unsafe-webgpu'] })` 후
`navigator.gpu` 존재 여부 체크, 결과: "no navigator.gpu"). 즉 **이 구현은 실제 WebGPU 렌더로
"alpha가 이제 정확히 비례한다"는 것을 브라우저에서 직접 확인하지 못한 상태**다. 대신 다음 두
가지로 최대한 간접 검증했다:
- three.js 소스(`WebGPUBackend.js`, `WebGPUTextureUtils.js`)를 직접 읽어
  `readRenderTargetPixelsAsync` → `copyTextureToBuffer`가 `RGBA16Float` 포맷에 대해
  `Uint16Array`(half-float 비트패턴, 행 256바이트 정렬 패딩 포함)를 반환함을 코드 레벨로 확인.
- half-float→float 변환 함수를 Node.js에서 알려진 비트패턴(0x0000→0, 0x3C00→1, 0x3800→0.5,
  최소 subnormal)으로 단위 검증했고, 행 패딩 스트리핑 + Y flip 로직도 합성 데이터(width=100,
  2행, 각 행 다른 색+알파)로 재현해 정확히 분리·반전됨을 확인했다. 참고로 실제 출력 크기
  1920×1920에서는 1920×8bytes=15360이 이미 256의 배수라 패딩이 발생하지 않는다(우연이지만
  실사용 경로에서는 패딩 스트리핑 로직이 사실상 no-op에 가깝다 — 그래도 일반성을 위해 로직은
  유지).
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run`(93개 파일 1473개 테스트 전부 통과) 확인.

**따라서 이 구현은 "방향과 저수준 산술은 코드 레벨·단위 테스트로 검증됨" 상태이고, 티켓이
요구한 "half-float→8bit 변환 후 실제로 정확한 alpha가 나오는지 픽셀 단위 확인"(브라우저
실측)은 아직 수행되지 못했다.** 실제 WebGPU 하드웨어가 있는 환경(오케스트레이터의 로컬 머신,
이전 티켓 20260914_1045/1139 조사를 직접 수행한 환경)에서 다음을 반드시 재확인해야 한다:
1. 텍스트 레이어 `textColor` 알파, 리퀴드 메탈 `colorBack` 알파 0/0.5/1 조합으로 export PNG의
   alpha 채널이 실제로 비례하는지.
2. 이미지가 좌우/상하로 뒤집히지 않았는지(Y flip 로직이 실제 렌더 결과와 맞는지).
3. 알파를 안 쓰는 나머지 레이어 타입들의 기존 export 결과가 이번 변경으로 달라지지 않았는지
   (특히 `render()`의 활성 패스 0개 특수 경로 제거가 시각적으로 동일한지).

### 변경된 파일
```
jam-web/patches/@basementstudio+shader-lab+3.0.2.patch (재생성 — pipeline-manager.js,
  create-webgpu-renderer.js, shader-lab-canvas-source.js, use-shader-lab-canvas-source.js와
  대응 .d.ts 4개, contracts.d.ts에 readPixelsAsync/captureFrame 추가)
jam-web/src/lib/admin/shaderLab/useShaderLabPlayback.ts (captureFrame 노출)
jam-web/src/lib/admin/shaderLab/captureShaderLabFrameToBlob.ts (신규 — half-float 캡처 → Blob)
jam-web/src/app/admin/shader-lab/ShaderLabViewport.tsx (captureFrameRef prop 추가)
jam-web/src/app/admin/shader-lab/page.tsx (captureFrameRef 생성·전달)
jam-web/src/app/admin/shader-lab/ShaderLabExportPanel.tsx (PNG export를 captureFrame 기반으로 교체)
jam-web/src/app/admin/shader-lab/ShaderLabApplyTab.tsx (미리보기 스냅샷·적용을 captureFrame 기반으로 교체)
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 오류 0건
- [x] `npm run lint` — 오류 0건, 경고 14건(전부 이번 변경과 무관한 기존 경고 —
      design-system stories/foundations, scripts/recraft)
- [x] `npx vitest run` — 93개 파일, 1473개 테스트 전부 통과
- [x] half-float 디코드 로직 Node.js 단위 검증(알려진 비트패턴 4종 + 행 패딩/Y flip 합성 데이터)
- [x] `rm -rf node_modules/@basementstudio && npm install` — patch-package 재적용 성공 확인
- [ ] **미수행(환경 제약)**: 실제 WebGPU 브라우저 실렌더로 alpha 채널 픽셀 단위 확인 — 위
      "최소 스파이크 검증에 대한 중요한 한계" 절 참고

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
사용자 노출 텍스트 변경 없음(기존 에러 메시지 문구·구조 그대로 유지, 호출 경로만 교체).

### 배포 정보
- 배포일: (미배포 — review 브랜치 push까지만)
- 환경: -
- 커밋: (아래 push한 브랜치 참고)

### 주요 의사결정 / 핵심 메모
- `render()`의 "activePasses 0개" 특수 경로(블릿 없이 baseScene을 화면에 직접 렌더)를
  제거하고 항상 rtA→블릿 경로로 통일했다 — `lastReadTarget`을 모든 프레임에서 일관되게
  채우기 위한 목적. GPU 패스가 레이어 없는 상태에서 1회 늘지만(블릿 1회 추가), 60fps
  에디터 미리보기 용도에서 성능 영향은 무시 가능하다고 판단했다. 검증 안 됨(하드웨어 접근
  불가) — 시각적으로 동일한지 실측 필요.
- half-float→float 변환을 직접 구현(수동 비트 연산)하고 `Float16Array`(최근 브라우저가
  지원하기 시작한 표준 타입) 사용을 선택하지 않았다 — 사용자 브라우저의 실제 Chrome 버전을
  알 수 없어 호환성 리스크를 피했다.
- 미리보기(`ShaderLabApplyTab`)는 기존 `canvas.toDataURL()`(data URL) 대신 Blob +
  `URL.createObjectURL()`로 바꿨다 — `captureFrame()`이 만드는 오프스크린 2D 캔버스가
  `toDataURL()`보다 `toBlob()`이 더 자연스러운 API(비동기, 메모리 효율)라 판단했다. 이 때문에
  Object URL revoke 누수 방지 로직이 새로 필요해졌다(추가함).

### 잔여 이슈
- 위 "최소 스파이크 검증에 대한 중요한 한계" 절의 3가지 실측 확인이 필수로 남아있다.
  실제 WebGPU 브라우저 환경(오케스트레이터 로컬 머신 등)에서 확인 전까지는 "방향이 맞다"는
  코드 레벨 추론일 뿐, "실제로 고쳐졌다"는 확정된 사실이 아니다.
- 만약 실측 결과 여전히 문제가 있거나(예: Y flip 반대, 다른 레이어 타입 회귀) 새로운 문제가
  발견되면, 이 티켓을 재오픈하거나 후속 티켓으로 분리해야 한다.
