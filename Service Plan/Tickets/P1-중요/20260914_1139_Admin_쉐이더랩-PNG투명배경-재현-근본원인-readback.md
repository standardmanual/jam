---
id: 20260914_1139
category: Admin
priority: P1
status: CLOSED
created: 2026-09-14
closed: 2026-09-14
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
## 완료 기록

### 구현 내용 요약

jam-developer가 5번 절 설계대로 `readRenderTargetPixelsAsync` 기반 캡처 경로를 구현했다
(`pipeline-manager.js`에 `readPixelsAsync()`, `create-webgpu-renderer.js`에 half-float→8bit
디코딩을 포함한 `captureFrame()`, JAM! 쪽에 `captureShaderLabFrameToBlob.ts` 신규 및 export
3경로 리팩토링). 다만 이 서브에이전트 환경에 실제 GPU가 없어 시각적 검증을 못 한 채
`confidence: low`로 제출했고, 게이트 리뷰도 이를 이유로 **FAIL** 판정했다.

**오케스트레이터가 실제 GPU 환경(로컬 실렌더)에서 review 브랜치를 직접 검증**한 결과,
게이트의 우려가 실제 실패로 확인됐다 — `captureFrame()` 자체(half-float 디코딩, 256바이트
행 패딩 스트리핑, Y flip)는 정확했으나(raw 값을 half-float 비트 패턴 단위로 직접 확인),
**렌더타겟(rtA/rtB)에 저장되는 실제 알파값이 애초에 항상 1.0(0x3C00)으로 고정**되어 있었다.

추가 조사로 새 근본 원인을 확정했다: three.js WebGPU `NodeMaterial`이 `material.transparent
=== false && material.blending === NormalBlending && material.alphaToCoverage === false`
(=`isOpaque()`)일 때 GPU 셰이더 컴파일 단계에서 `diffuseColor.a.assign(1.0)`을 강제한다.
baseMesh·각 레이어 pass·blit 단계 모두 이 조건에 해당했다. `transparent=true`,
`blending=NoBlending`, `alphaToCoverage=true`, `material.outputNode` 직접 지정(이론상
`isOpaque()` 체크를 완전히 우회하는 경로) 네 가지를 순서대로 로컬 실측 시도했으나 전부
렌더타겟 레벨에서는 실패했다 — `outputNode`가 swap chain(화면 표시, `drawImage`로 읽었을 때)
에서는 효과가 있는 것처럼 보였지만, `readRenderTargetPixelsAsync`가 읽는 rtA/rtB는
`blitMaterial`(swap chain 담당)과 무관한 별개 렌더타겟이라는 것을 재확인했을 뿐, 실제
데이터는 여전히 alpha=1.0이었다.

사용자와 논의해 "알파를 별도 그레이스케일 채널로 병행 렌더링"하는 새 설계로 방향을 바꿨다 —
후속 티켓 [20260914_1227](20260914_1227_Admin_쉐이더랩-PNG투명배경-알파마스크병행렌더설계.md)에서
이어간다.

### 변경된 파일
```
(review 브랜치 claude/jamwork-20260914_1139-shader-lab-readback-spike에 남아있으나
staging에 머지하지 않음 — 시각적 검증 실패로 폐기)
jam-web/patches/@basementstudio+shader-lab+3.0.2.patch (스파이크, 미채택)
jam-web/src/lib/admin/shaderLab/useShaderLabPlayback.ts (스파이크, 미채택)
jam-web/src/lib/admin/shaderLab/captureShaderLabFrameToBlob.ts (스파이크, 신규, 미채택)
jam-web/src/app/admin/shader-lab/ShaderLabViewport.tsx (스파이크, 미채택)
jam-web/src/app/admin/shader-lab/page.tsx (스파이크, 미채택)
jam-web/src/app/admin/shader-lab/ShaderLabExportPanel.tsx (스파이크, 미채택)
jam-web/src/app/admin/shader-lab/ShaderLabApplyTab.tsx (스파이크, 미채택)
```

### 테스트 결과
- [x] jam-developer: `npx tsc --noEmit`, `npm run lint`(전체, 0 errors/14 warnings),
      `npx vitest run`(93 파일/1473 테스트 통과) — 정적 검증은 클린
- [x] 오케스트레이터: 실제 GPU 로컬 실렌더로 `readRenderTargetPixelsAsync` 캡처 결과 직접
      확인 — **alpha 채널이 레이어 알파값과 무관하게 항상 1.0으로 고정됨을 재현·확정**
      (텍스트 불투명도 슬라이더 0/0.5/1, 리퀴드 메탈 `colorBack` 알파 0 각각 테스트)
- [ ] 실제 export PNG의 alpha 채널 정확도 — **이 설계로는 달성 실패**

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 해당 없음 — 사용자 노출 텍스트 변경 없음(렌더링 파이프라인 내부 스파이크)

### 배포 정보
- 배포일: 해당 없음 — staging에 머지하지 않음(시각적 검증 실패)
- 환경: 해당 없음
- 커밋: 해당 없음(review 브랜치 `claude/jamwork-20260914_1139-shader-lab-readback-spike`에만
  존재, 폐기)

### 주요 의사결정 / 핵심 메모

- **`readRenderTargetPixelsAsync` 기반 raw readback 접근 자체는 유효하고 재사용 가능하다** —
  실패한 것은 "렌더타겟에 저장되는 데이터"이지 "그 데이터를 읽어오는 메커니즘"이 아니다.
  `decodeHalfFloatRgbaToUint8()`(half-float 디코딩·행 패딩·Y flip)는 실측으로 정확함이
  확인됐으므로, 후속 티켓(20260914_1227)의 알파 마스크 렌더타겟을 읽을 때도 그대로
  재사용한다.
- **`isOpaque()` 강제는 material 속성 조정으로 우회 불가능하다는 결론**: `transparent`·
  `blending`·`alphaToCoverage`·`outputNode` 네 가지 공식 우회 경로를 모두 실측 시도했음에도
  실패했다는 사실은, 이 최적화가 three.js WebGPU 백엔드 내부에 문서화되지 않은 방식으로
  더 깊이 박혀 있음을 시사한다. 정확한 내부 메커니즘(파이프라인 캐시 키 계산 문제인지, 다른
  강제 지점이 있는지)은 규명하지 못했다 — 더 깊은 조사(예: three.js 자체 patch)는 유지보수
  부담이 크다고 판단해 배제하고, "알파 개념 자체를 우회하는" 새 설계로 방향을 바꿨다.
- **swap chain(`drawImage`) readback은 절대 신뢰하면 안 된다는 교훈이 재확인됐다** —
  `outputNode` 실험에서 swap chain 표시 결과만으로 "성공했다"고 오판할 뻔했다. 검증은
  반드시 `readRenderTargetPixelsAsync`(또는 그에 준하는 렌더타�터 직접 readback)로만
  해야 한다.

### 잔여 이슈
- 후속 티켓 [20260914_1227](20260914_1227_Admin_쉐이더랩-PNG투명배경-알파마스크병행렌더설계.md)
  (알파 그레이스케일 마스크 병행 렌더 설계)로 이어간다.
