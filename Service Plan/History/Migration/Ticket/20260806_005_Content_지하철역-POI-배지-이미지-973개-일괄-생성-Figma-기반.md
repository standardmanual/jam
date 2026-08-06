---
id: 20260806_005
category: Content
status: CLOSED
created: 2026-08-06
closed: 2026-08-06
---

# [Content] 지하철역 POI 배지 이미지 973개 일괄 생성 (Figma 디자인 기반) + 재사용 프레임워크 신설

## 배경 / 문제 정의
지하철역 POI 배지(973개, `public.poi.category='transit'`)가 전부 공용 플레이스홀더
이미지(`/badges/poi/anyway_star.png`)를 쓰고 있었음. Figma에 지하철역 POI 전용 디자인
(파랑/흰색/주황 3중 원 배경 + 역명 텍스트, node-id 1-9)이 이미 마련되어 있어, 이를 기준으로
역명이 들어간 개별 배지 이미지를 자동 생성해 등록하기로 함.

추가로 "앞으로도 디자인이 다른 배지를 계속 자동 생성해서 등록할 예정"이라는 요구사항에 따라,
1회성 스크립트가 아니라 새 디자인마다 config 파일 하나만 추가하면 재사용되는 프레임워크로 설계.

## 상세 요구사항

### 서비스/코드베이스 관점
- Figma MCP로 디자인 사양(배경 SVG, 텍스트 x/y/width/height/fontSize/color/align, 폰트) 추출
- DB(`poi` ↔ `badges.linked_badge_id`)에서 역명 목록을 가져와 각 배지 이미지에 역명 오버레이
- 생성된 이미지를 `badges.image_url`에 반영
- 향후 다른 디자인(아이템배지 등)에도 재사용 가능한 구조로 설계

### 컨텐츠 관점
- 지하철역 POI 배지 973개 전체 이미지 교체 (플레이스홀더 → 역명 포함 개별 이미지)
- 실제 서비스 표시 크기에 맞춰 256×256으로 축소 출력 (Figma 원본은 340×340)

## 구현 계획
`jam-web/scripts/badge-image-gen/` 프레임워크 신설:
- `generate.js`: 범용 엔진 (디자인이 달라져도 수정 안 함) — `@vercel/og`(satori)로 SVG 배경 +
  텍스트 오버레이를 합성해 PNG 생성
- `configs/*.config.js`: 디자인별 설정 (배경, 텍스트 레이아웃, DB 조회 함수, UPDATE SQL 템플릿) —
  새 디자인 추가 시 이 파일만 작성
- `fonts/`, `backgrounds/`: 폰트·배경 SVG 로컬 캐시 (재실행 시 재다운로드 방지, git 커밋)
- CLI: `node scripts/badge-image-gen/generate.js <config-name> [--limit N] [--ids id1,id2] [--dry-run]`

---
## 완료 기록

### 구현 내용 요약
1. Figma MCP(`get_design_context`, `get_metadata`)로 지하철역 POI 배지 디자인 사양 추출
   (340×340, 배경 SVG + "역명" 텍스트 x=45 y=148 w=249 h=43 fontSize=36 Pretendard Bold 흰색 중앙정렬)
2. 배지 이미지 자동 생성 프레임워크 신설 (`scripts/badge-image-gen/`) — 새 디자인은 config 파일
   하나만 추가하면 재사용되도록 엔진/설정 분리
3. `configs/subway-poi-badge.config.js` 작성:
   - `dataSource`: `poi(category='transit')` ↔ `badges(linked_badge_id)` 조인으로 (배지id, 역명) 목록 조회
   - `outputSize: 256` — Figma 원본(340) 좌표를 그대로 쓰고 엔진이 자동 축소 비율 계산
   - `updateSqlTemplate`: 생성 후 `badges.image_url` 반영용 단일 UPDATE 문 자동 저장
4. 역명 길이 대응: 폭 초과 시 폰트 자동 축소 → 최소 폰트에서도 한 줄에 안 들어가면
   자연스러운 경계(공백/괄호/가운뎃점)에서 2줄 중앙정렬로 자동 전환 (27자 이상치 1건 포함 전수 검증)
5. 973개 전체 생성(12.7초) → Supabase(jam-prod) `badges.image_url` 일괄 UPDATE 반영 확인(973/973)
6. git 커밋/푸시 → Vercel 프로덕션 배포 확인 (이미지 URL 직접 접근으로 256×256 렌더링 검증)

### 변경된 파일
```
jam-web/scripts/badge-image-gen/generate.js (신규 — 범용 엔진)
jam-web/scripts/badge-image-gen/lib/fetch-all-rows.js (신규 — PostgREST 1000행 제한 페이지네이션 헬퍼)
jam-web/scripts/badge-image-gen/configs/subway-poi-badge.config.js (신규 — 지하철역 배지 설정)
jam-web/scripts/badge-image-gen/README.md (신규 — 프레임워크 사용법)
jam-web/scripts/badge-image-gen/fonts/Pretendard-Bold.ttf (신규 — 폰트 캐시)
jam-web/scripts/badge-image-gen/backgrounds/subway-poi-badge.svg (신규 — 배경 SVG 캐시)
jam-web/public/badges/poi/transit/*.png (신규 973개 — 배지 이미지)
jam-web/supabase/seed/update_subway-poi-badge_images.sql (신규 — 실행된 UPDATE 문 기록)
```

### 테스트 결과
- [x] `--dry-run --limit 3`으로 렌더링 로직 검증
- [x] 짧은 역명("가락시장역"), 중간 길이("학동·증심사입구역", 9자), 최장 이상치
      ("돈암초교입구버스정류장(한성대입구역방면)자전거대여소", 27자) 3가지 케이스 눈으로 직접 확인
- [x] 전체 973개 생성 성공(실패 0), Supabase UPDATE 973/973 반영 확인
- [x] git push → Vercel 프로덕션 배포(Ready) 확인 → 배지 이미지 URL 직접 접근해 256×256 렌더링 확인

### UX Writing 검증
- 해당 없음 (사용자 노출 UI 문구 변경 없음 — 배지 이미지 내 텍스트는 실제 지하철역명을 그대로 표기)

### 배포 정보
- 배포일: 2026-08-06
- 환경: production (jam-rose.vercel.app / standard-manual/jam)
- 커밋: 0e37183

### 주요 의사결정 / 핵심 메모
- **Figma 배경 SVG의 `style="fill:...;fill:color(display-p3 ...)"` 이중 선언 문제**: resvg(WASM)가
  `color(display-p3 ...)` 함수를 파싱하지 못해 배경이 검은색으로 깨짐 → 엔진에서 SVG의 `style` 속성을
  통째로 제거하고 순수 `fill="#hex"` 속성만 남기도록 정제(`sanitizeSvg`). Figma가 내보내는 SVG는
  항상 이 패턴이라 향후 모든 디자인에 범용 적용됨.
- **패키지 설치 대신 기존 의존성 재활용**: `@vercel/og`(이미 설치됨)의 Node 타겟(`ImageResponse`)이
  내부적으로 satori+resvg-wasm을 쓰므로 canvas/sharp 등 신규 패키지 설치 없이 구현. 최초에
  TypeScript(tsx/dotenv) 기반으로 작성했으나, 프로젝트의 기존 스크립트 컨벤션(`scripts/*.js`,
  CommonJS + `.env.local` 수동 파싱)과 불일치해 순수 CommonJS `.js`로 재작성.
- **arbitrary SQL RPC 없음 → supabase-js 쿼리 빌더로 dataSource 설계**: 프로젝트에 `exec_sql` 류
  RPC가 없어(과거 티켓에서도 동일하게 확인됨) config의 `dataSource`를 raw SQL 문자열이 아니라
  `(supabase) => Promise<rows>` 함수로 설계 — 어떤 조인/필터든 supabase-js로 직접 표현 가능해
  재사용성이 오히려 더 높아짐.
- **이미지 해상도**: 초안은 Figma 원본 그대로 340×340으로 생성했으나, 사용자가 실제 서비스 표시
  크기(최대 176px, `BadgeDetailSheet` 기준)에 맞춰 축소를 요청 → 256×256으로 확정(3옵션 중 선택:
  256/180/340/직접입력). 엔진에 `outputSize` 개념을 추가해 Figma 원본 좌표를 그대로 두고 자동
  비례 축소하도록 일반화(향후 디자인마다 좌표 재계산 불필요).
- **역명 오버플로우 처리**: 최초엔 말줄임표(…) 절단 방식으로 구현했으나, 사용자가 "2줄 중앙정렬"로
  변경 요청 → `resolveLabelLines`가 원폰트→축소→2줄(자연스러운 경계에서 분리) 순으로 시도하도록 재설계.

### 잔여 이슈
- 없음. 다음 디자인(예: 아이템배지)을 자동 생성할 때는 `scripts/badge-image-gen/configs/`에
  새 config 파일만 추가하면 됨 ([[README.md]] 참고).
