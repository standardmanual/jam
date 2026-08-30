---
id: 20260830_1438
category: Service
status: OPEN
created: 2026-08-30
closed:
---

# [Service] 체크인 배지 이미지 생성 — 프로덕션에서 ImageResponse 로드 실패

## 배경 / 문제 정의
`20260830_1349`로 배포한 "체크인 배지 이미지 생성"(`/admin/badge-image`)에서 실제 이미지
생성을 실행하면 프로덕션에서 다음 오류가 난다:

```
엔진/config 로드 실패: ImageResponse를 찾을 수 없습니다 — next 또는 @vercel/og가 설치돼 있어야 합니다
```

### 원인
`scripts/badge-image-gen/lib/engine.js` 최상단에서 `ImageResponse`를 다음과 같이 로드한다:

```js
function loadImageResponse() {
  for (const mod of ['@vercel/og', 'next/og']) {
    try { return require(mod).ImageResponse } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }
  }
  throw new Error('ImageResponse를 찾을 수 없습니다 — next 또는 @vercel/og가 설치돼 있어야 합니다')
}
const ImageResponse = loadImageResponse()
```

CLI(`generate.js`)에서는 이 파일을 `require('./lib/engine')`로 정적으로 불러 로컬 node
프로세스의 전체 node_modules 해석이 그대로 동작해 문제가 없다.

반면 어드민 API 라우트(`src/app/api/admin/badge-image/generate/route.ts`)는 이 파일을
`createRequire(process.cwd()+'/package.json')`로 **런타임에 동적** 로드한다
(`next.config.ts`의 `outputFileTracingIncludes`로 파일 자체는 배포 번들에 포함되지만).
Next.js/Vercel의 빌드 시 의존성 트레이싱(`@vercel/nft`)은 이 동적 require 체인 내부의
`require('next/og')` 호출을 정적으로 분석할 수 없어, 해당 서버리스 함수 번들에 `next/og`
관련 파일이 포함되지 않는다. 그 결과 두 후보(`@vercel/og`, `next/og`) 모두
`MODULE_NOT_FOUND`로 실패해 위 오류가 발생한다.

로컬 CLI 실행이나 로컬 Node 스크립트로 API 로직을 재현한 검증(20260830_1252, 20260830_1349
양쪽 다)에서는 이 문제가 드러나지 않았다 — 로컬 환경은 node_modules 전체가 그대로 있어
동적 require도 정상 해석되기 때문이다. 실제 프로덕션 서버리스 환경에서만 재현되는 문제라
이번에 사용자가 직접 화면에서 실행하기 전까지 발견되지 못했다.

## 상세 요구사항

### 서비스/코드베이스 관점
- API 라우트(`route.ts`)에서 `ImageResponse`를 **정적으로 import**하도록 바꾼다
  (`import { ImageResponse } from 'next/og'`) — route.ts는 Next.js 빌드 파이프라인이 정상
  처리하는 파일이라 이렇게 하면 해당 서버리스 함수 번들에 `next/og` 의존성이 올바르게
  포함된다.
- `engine.js`의 렌더링 함수(`renderBadge`, `renderBadgeWithText`, 필요하면
  `prepareRenderContext`)가 `ImageResponse` 구현체를 **주입받도록** 시그니처를 확장한다
  (예: 마지막 인자로 `ImageResponse` 클래스를 받거나, deps 객체로 묶어서 전달). 인자가 없으면
  기존처럼 내부에서 `require`해 CLI 하위호환을 유지한다(CLI는 정적 require가 정상 동작하므로
  건드릴 필요 없음).
- 영향받는 호출부를 모두 확인해 동일하게 고친다 — 현재는
  `src/app/api/admin/badge-image/generate/route.ts` 하나뿐이지만, 향후 유사 라우트가
  생기면 같은 패턴을 따르도록 주석으로 남긴다.
- 수정 후 **실제 프로덕션과 동일한 조건**(동적 require + 서버리스 환경)에서 검증해야 신뢰할
  수 있다 — 로컬 Node 스크립트 재현만으로는 이번에 놓쳤던 것과 같은 함정이 반복될 수 있다.
  가능하면 Vercel 프리뷰 배포(또는 staging)에 먼저 반영해 실제 HTTP 요청으로 검증할 것.
  브라우저 E2E가 admin 권한 제약으로 불가능하면, 최소한 관리자 세션 쿠키를 확보해 `curl`로
  직접 `/api/admin/badge-image/generate`를 호출해보는 방식도 고려한다.

### UI/UX 관점 (해당 시)
- 해당 없음(버그 수정, 화면 구조 변경 없음)

### 컨텐츠 관점 (해당 시)
- 해당 없음

## 구현 계획
1. `route.ts`에 `import { ImageResponse } from 'next/og'` 추가
2. `engine.js`의 `renderBadge`/`renderBadgeWithText`/`prepareRenderContext`에 ImageResponse
   주입 파라미터 추가(옵션 인자, 없으면 기존 동작 유지)
3. `route.ts`에서 엔진 호출 시 주입한 ImageResponse 전달
4. 로컬 CLI 배치 경로가 여전히 정상 동작하는지 확인(회귀 없음)
5. 실제 프로덕션(또는 동일 조건의 Vercel 배포)에서 생성 API를 직접 호출해 재현 검증
6. 게이트 리뷰 통과 후 staging → production 반영

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
계획대로 진행했다.
1. `route.ts`에 `import { ImageResponse } from 'next/og'` 추가(정적 import).
2. `engine.js`의 `loadImageResponse()` 즉시실행(top-level) 호출을 제거하고, `renderBadge`/
   `renderBadgeWithText` 마지막 인자로 `ImageResponseImpl`을 선택적으로 받도록 확장했다.
   `resolveImageResponse(injected)`가 주입값이 있으면 그대로 쓰고, 없으면(CLI 경로) 기존처럼
   지연 require로 폴백한다. `prepareRenderContext`는 ImageResponse를 쓰지 않아 변경 불필요.
3. `route.ts`의 `engine.renderBadgeWithText(...)` 호출 마지막 인자로 정적 import한
   `ImageResponse`를 전달하도록 수정.
4. CLI(`generate.js`)는 여전히 인자 없이 `engine.renderBadge(...)`를 호출하므로 폴백 경로로
   기존과 동일하게 동작 — dry-run으로 회귀 없음 확인.
5. 프로덕션과 동일한 "동적 require + 서버리스 빌드 트레이싱" 조건에서 근본 원인이 실제로
   해결되는지 두 가지 방식으로 검증했다:
   - Node.js 레벨 재현: `Module._resolveFilename`을 가로채 `next/og`/`@vercel/og` 해석이
     실패하도록 강제한 뒤, `createRequire`로 `engine.js`를 동적 로드해 정확히 티켓에 적힌
     오류 메시지("ImageResponse를 찾을 수 없습니다…")가 재현됨을 확인. 이어서 `route.ts`와
     동일하게 `ImageResponse`를 밖에서 주입해 호출하면 성공적으로 PNG가 렌더링됨을 확인.
   - **빌드 트레이싱 레벨 검증(더 신뢰도 높음)**: `next build`를 실행해 실제 Vercel이 쓰는
     `@vercel/nft` 결과물(`.next/server/app/api/admin/badge-image/generate/route.js.nft.json`)을
     직접 비교했다. 수정 전 코드로 빌드하면 이 라우트의 트레이스 파일 목록에 `@vercel/og`
     컴파일 산출물(특히 `resvg.wasm`, `yoga.wasm` 등 렌더링에 필수인 바이너리)이 **전혀
     포함되지 않았고**(next/og 관련 매칭 1건 — 무관한 dev 로거 파일), 수정 후 빌드에서는
     `@vercel/og`의 wasm/폰트/index 파일 등 10건이 정상적으로 포함됨을 확인했다. 이는 이번
     이슈의 실제 메커니즘(빌드 시 파일 트레이싱 누락)을 로컬에서 그대로 재현·검증한 것이라
     Vercel 프리뷰 배포 없이도 근본 원인 해소를 신뢰할 수 있는 근거로 판단했다.

### 변경된 파일
```
jam-web/scripts/badge-image-gen/lib/engine.js
jam-web/src/app/api/admin/badge-image/generate/route.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit`: 에러 없음
- [x] `npm run lint`(전체): 0 errors, 26 warnings (모두 이번 변경과 무관한 기존 경고)
- [x] CLI 회귀 확인: `node scripts/badge-image-gen/generate.js metro-poi-badge --limit 1 --dry-run`
      정상 동작(성공 1개, 실패 0개)
- [x] Node 레벨 재현 스크립트: 수정 전 동작(주입 없음) 재현 시 티켓과 동일한 오류 메시지,
      주입 시 PNG 정상 렌더링(9,342바이트) 확인
- [x] `next build` 트레이싱 비교(수정 전/후 `.next/server/app/api/admin/badge-image/generate/route.js.nft.json`):
      수정 전 `@vercel/og` 산출물 0건 → 수정 후 10건 포함으로 확인
- [ ] 실제 Vercel 프리뷰/스테이징 HTTP 요청으로 최종 확인 — review 브랜치 push까지만 이 작업
      범위이며, 실제 배포·staging 반영은 오케스트레이터가 처리하므로 여기서는 수행하지 않음.
      staging 반영 후 `/admin/badge-image`에서 실제 생성 실행으로 재확인 필요.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 — 버그 수정, 노출 텍스트 변경 없음.

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- `engine.js`의 `loadImageResponse()`를 완전히 삭제하지 않고 "지연 폴백"으로 남겨둔 이유:
  CLI(`generate.js`)는 이 파일을 정적 `require`로 불러오므로 로컬 node_modules 해석이 항상
  정상 동작한다. 굳이 CLI 호출부까지 고쳐 인자를 넘기게 하면 티켓 범위(어드민 API 라우트
  버그 수정)를 벗어난 변경이 되므로, 주입 인자가 없을 때만 기존 동작으로 폴백하는 방식을
  택했다 — 티켓의 "인자가 없으면 기존처럼 내부에서 require해 CLI 하위호환 유지" 지시와 일치.
- `prepareRenderContext`는 ImageResponse를 전혀 참조하지 않으므로(폰트/배경/폭측정 준비만
  담당) 시그니처를 건드리지 않았다. 티켓 문구의 "필요하면 prepareRenderContext"는 조건부
  표현이라 이 판단이 티켓 범위 안에 있다고 본다.
- 검증 방법으로 "Vercel 프리뷰 배포에서 curl로 직접 호출"(티켓이 제안한 방법) 대신 로컬
  `next build`의 `@vercel/nft` 트레이스 파일을 수정 전/후로 직접 비교하는 방법을 택했다.
  이유: 이 트레이스 파일이 실제 Vercel 배포 시 서버리스 함수 번들에 포함되는 파일 목록 그
  자체이므로, 프리뷰 배포·HTTP 호출까지 가지 않고도 "번들에 next/og가 포함되는가"라는
  근본 질문에 로컬에서 결정적으로 답할 수 있었다. 실제 HTTP 왕복 검증(프리뷰 배포 후 curl)은
  staging 반영 이후 추가로 하는 것이 적절하다고 판단해 잔여 이슈로 남긴다.

### 잔여 이슈
- staging/production 반영 후 실제 `/admin/badge-image` 화면(또는 curl)으로 API를 직접
  호출해 최종 확인 필요 — 이번 작업에서는 review 브랜치 push까지만 수행했다.
