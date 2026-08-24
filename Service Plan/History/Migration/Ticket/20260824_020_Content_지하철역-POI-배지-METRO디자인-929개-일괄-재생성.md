---
id: 20260824_020
category: Content
status: CLOSED
created: 2026-08-24
closed: 2026-08-24
---

# [Content] 지하철역 POI 배지 이미지 929개 JAM METRO 디자인으로 일괄 재생성

## 배경 / 문제 정의
지하철역 POI 배지는 [[20260806_005]]에서 Figma 디자인(340×340, 파랑/흰색/주황 3중 원 + 역명)
기반으로 973개를 일괄 생성해 반영했다. 이후 Figma에 새 디자인(720×720, 빨강 라운드 배경 +
파란 원 + Jam 로고 + METRO 워드마크 + 하단 파란 밴드에 역명)이 마련되어, **디자인·텍스트 위치·
크기가 전부 바뀌었다.**

새 디자인 기준으로 역명이 들어간 배지 이미지를 다시 일괄 생성해 교체한다.

- 디자인 출처: Figma `UXcBEgFagmO5ARwH5F0mMW` node-id `3-20`
- 대상: `poi.category='transit'` 중 **이름이 '역'으로 끝나는** POI에 연결된 배지 929개
  (이전 작업은 transit 전체 973개가 대상이었으나, 이번 디자인은 METRO 워드마크가 들어가
  지하철역에만 맞으므로 버스정류장·리무진 등 비(非)역 22개는 기존 이미지를 유지한다)

## 상세 요구사항

### 서비스/코드베이스 관점
- Figma MCP로 새 디자인 사양(배경 요소 좌표·색상, 텍스트 x/y/width/height/fontSize/color/align) 추출
- [[20260806_005]]에서 신설한 `scripts/badge-image-gen/` 프레임워크를 그대로 재사용 —
  엔진은 수정하지 않고 config 파일만 추가하는 것이 원래 설계 의도
- 생성 이미지를 `badges.image_url`에 일괄 반영

### 컨텐츠 관점
- 역명 텍스트는 Figma가 지정한 크기(68.082px)를 그대로 유지 — 이름 길이에 따라 임의로 키우거나
  줄이지 않는다 (최장 12자도 밴드 폭 안에 들어감)
- 출력 크기는 이전 작업과 동일하게 256×256

## 구현 계획
1. Figma에서 디자인 사양 추출 → 배경 요소를 원본 좌표 그대로 SVG로 조립
2. `configs/metro-poi-badge.config.js` 신규 작성 (기존 `subway-poi-badge.config.js`는 보존)
3. 대표 케이스(최장/괄호포함/최단) 샘플 생성 후 육안 확인
4. 929개 전체 생성 → `badges.image_url` 일괄 UPDATE

---
## 완료 기록

### 구현 내용 요약
1. Figma MCP(`get_metadata`, `get_design_context`)로 node 3:20 사양 추출 — 720×719,
   배경 `#EE1D23`(rx 121) + 파란 원 `#0D4DA4`(r 195.5) + Jam 로고 + METRO 워드마크 +
   하단 밴드 `#0D4DA4`(h 200), 텍스트 x=28 y=572 w=667 h=81 fontSize=68.082 Pretendard Bold 흰색 중앙정렬
2. 배경 SVG 조립 (`backgrounds/metro-poi-badge.svg`) — Figma가 개별 asset URL로만 내려주는
   Ellipse/Jam Logo/METRO를 원본 좌표계에 배치하고, 순수 도형(라운드 사각형·하단 밴드)은
   동일 좌표로 직접 작성. 출력을 정사각형(256×256)으로 맞추기 위해 배경만 1px 늘려 720×720으로 둠
3. `configs/metro-poi-badge.config.js` 신규 작성 — dataSource는 `poi(category='transit',
   name LIKE '%역')` ↔ `badges(linked_badge_id)` 조인, 소프트삭제 배지 제외
4. **엔진에 폰트 실측 모드 추가** (`text.measure: 'font'`) — 아래 의사결정 참고
5. 엔진의 `ImageResponse` 로더를 `@vercel/og` → `next/og` 폴백 구조로 변경 (next 16 대응)
6. 929개 전체 생성(실패 0) → `badges.image_url` 일괄 UPDATE 반영 확인(929/929)

### 변경된 파일
```
jam-web/scripts/badge-image-gen/lib/measure-text.js (신규 — TTF advance width 측정기)
jam-web/scripts/badge-image-gen/configs/metro-poi-badge.config.js (신규 — METRO 디자인 설정)
jam-web/scripts/badge-image-gen/backgrounds/metro-poi-badge.svg (신규 — 배경 SVG)
jam-web/scripts/badge-image-gen/generate.js (수정 — 실측 모드 + next/og 폴백)
jam-web/scripts/badge-image-gen/README.md (수정 — 실측 모드 사용법 추가)
jam-web/public/badges/poi/metro/*.png (신규 929개 — 배지 이미지)
jam-web/supabase/seed/update_metro-poi-badge_images.sql (신규 — 실행된 UPDATE 문 기록)
```

### 테스트 결과
- [x] 폰트 실측기 정확도 검증: "국제금융센터·부산은행역" @68.082px = 666.5px 계산 →
      Figma 텍스트 노드 실측 폭 667px과 일치
- [x] 대표 3케이스 육안 확인 — 최장 12자(국제금융센터·부산은행역), 괄호 포함(총신대입구(이수)역),
      최단 3자(강남역) 모두 밴드 안에 정상 배치
- [x] 929개 전체 생성 성공(실패 0), 전부 256×256
- [x] Supabase UPDATE 929/929 반영 확인, 구 경로(`/badges/poi/transit/`) 잔존 0건
- [x] 프로덕션 배포 후 이미지 URL 직접 접근 200 확인, 어드민 배지 목록에서 렌더 확인

### UX Writing 검증
- 해당 없음 (사용자 노출 UI 문구 변경 없음 — 배지 이미지 내 텍스트는 실제 지하철역명을 그대로 표기)

### 배포 정보
- 배포일: 2026-08-24
- 환경: production (jam-rose.vercel.app / standard-manual/jam)
- 커밋: 7a8903b0 (main 승격 70c51b1d)

### 주요 의사결정 / 핵심 메모
- **기존 config를 고치지 않고 새 config로 분리**: 디자인이 전면 교체되었지만
  `subway-poi-badge.config.js`를 수정하면 이전 디자인을 재현할 수 없게 된다. 프레임워크가
  원래 "디자인 하나 = config 하나"로 설계됐으므로 `metro-poi-badge`를 신설했다.
- **폰트 실측 모드 신설 (`text.measure: 'font'`)**: 기존 엔진은 모든 글자를 fontSize와 같은
  정사각형으로 가정해 폭을 계산했는데, Pretendard Bold의 한글 advance는 0.8643em이라 실제보다
  약 16% 과대 계산된다. 그 결과 Figma가 지정한 68.082px이 실제로는 들어가는데도 54px까지
  불필요하게 축소돼 디자인과 어긋났다. cmap(format 4) + hmtx만 읽는 경량 측정기
  (`lib/measure-text.js`, 외부 의존성 없음)를 만들어 실제 advance width로 재도록 했다.
  **기본값은 기존 근사치 그대로**라 이전 config(`subway-poi-badge`)의 동작은 바뀌지 않는다.
- **대상 범위를 '역'으로 끝나는 이름으로 한정**: 새 디자인은 METRO 워드마크가 들어가므로
  버스정류장·자전거대여소·리무진 등 비역(非驛) POI에는 맞지 않는다. transit 951개(삭제 제외)
  중 929개가 대상이고, 나머지 22개는 이전 디자인 이미지를 그대로 유지한다.
- **텍스트 크기를 이름 길이에 따라 키우지 않음**: `autoGrow`를 켜지 않아 짧은 역명("강남역")도
  Figma 원본과 같은 68.082px로 렌더된다. 밴드 안에서 글자 크기가 배지마다 달라지면 컬렉션으로
  나열했을 때 통일감이 깨지기 때문.
- **출력 크기 256×256**: 512/384/256 중 사용자가 이전 작업과 동일한 256을 선택.
  929개 총 11MB.
- **`@vercel/og` → `next/og`**: next 16 업그레이드 과정에서 `@vercel/og` 직접 의존이 빠졌고
  동일 구현이 `next/og`로 내장됐다. 두 경로를 모두 시도하는 폴백 로더로 바꿔 예전 환경에서도
  그대로 동작하게 했다.

### 배포 순서 관련 주의 (다음 작업 때 반복하지 말 것)
DB(`badges.image_url`)를 먼저 새 경로로 바꾸고 이미지 파일은 staging에만 올린 상태였던 탓에,
**프로덕션 배포 전까지 서비스·어드민에서 배지 이미지가 전부 깨져 보였다.** Supabase는 환경별로
분리돼 있지 않은 단일 프로덕션 DB이므로, 이미지 경로를 바꾸는 작업은
**파일을 프로덕션에 먼저 배포하고 그 다음 UPDATE**하는 순서로 진행해야 한다.

### 잔여 이슈
- `jam-web/public/badges/poi/transit/` 의 PNG 951개 중 **929개가 미사용 상태로 남는다**
  (계속 참조되는 것은 비역 POI 22개분). 롤백 여지를 남겨 이번 작업에서는 삭제하지 않았다 —
  정리는 별도 작업으로 판단한다.
