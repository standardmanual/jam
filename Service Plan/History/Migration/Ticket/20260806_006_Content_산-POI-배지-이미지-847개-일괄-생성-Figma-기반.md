---
id: 20260806_006
category: Content
status: CLOSED
created: 2026-08-06
closed: 2026-08-06
---

# [Content] 산 POI 배지 이미지 847개 일괄 생성 (Figma 디자인 기반) + 배지 이미지 엔진에 autoGrow 추가

## 배경 / 문제 정의
[[20260806_005]]에서 신설한 배지 이미지 자동 생성 프레임워크(`scripts/badge-image-gen/`)를 재사용해
산 POI 배지(847개, `public.poi.category='mountain'`)도 전용 이미지로 교체. Figma 동일 파일의
같은 node-id(1-9) 프레임이 산 배지 디자인(짙은 녹색 원 + 골드 태양광선)으로 교체되어 있었음.

1차 생성 후 사용자 피드백: 산 이름이 대부분 2~5자로 짧아 Figma 기본 폰트 크기(36px)로는
텍스트 상자 폭(258px, 디자인 기준)에 여백이 많이 남아 실제 배지에서 글자가 작아 보임 →
텍스트가 짧을수록 최대 150%까지 확대하는 로직 추가 요청.

## 상세 요구사항

### 서비스/코드베이스 관점
- 기존 `badge-image-gen` 엔진 재사용, `configs/mountain-poi-badge.config.js` 신규 작성
- 엔진에 `autoGrow`/`maxFontSize` 옵션 추가 — 텍스트 길이에 따라 확대/축소를 하나의 계산식으로 통합
- `poi(category='mountain')` ↔ `badges(linked_badge_id)` 조인으로 산 이름 목록 조회 후 이미지 생성
- `badges.image_url` 일괄 반영

### 컨텐츠 관점
- 산 POI 배지 847개 전체 이미지 교체 (플레이스홀더 → 산 이름 포함 개별 이미지)
- 256×256 출력 (subway-poi-badge와 동일 규격)

## 구현 계획
1. Figma MCP로 최신 디자인(같은 node-id 1-9, 내용이 산 배지로 교체됨) 재조회
2. `configs/mountain-poi-badge.config.js` 작성 (배경 SVG 캐시, 텍스트 좌표, dataSource, updateSqlTemplate)
3. 소량 검증(`--ids`) 후 847개 전체 생성 → SQL 반영 → 커밋/푸시/배포 확인
4. 사용자 피드백(텍스트 확대) 반영해 엔진에 `autoGrow` 추가 → 847개 재생성

---
## 완료 기록

### 구현 내용 요약
1. Figma MCP(`get_metadata`, `get_design_context`)로 산 배지 디자인 사양 추출
   (340×340, 배경 SVG 1장으로 원+태양광선 통합, 텍스트 박스 x=40 y=53 w=258 h=86, fontSize=36
   Pretendard Bold 흰색 중앙정렬 — Figma 예시 텍스트가 이미 2줄로 표시돼 있어 오버플로우 시
   2줄 처리가 디자인 의도임을 확인)
2. `configs/mountain-poi-badge.config.js` 신규 작성 — `outputSize:256`, `dataSource`는
   `poi(category='mountain')` ↔ `linked_badge_id` 조인
3. 1차 847개 생성 + `badges.image_url` 847/847 반영 + 배포 확인
4. 사용자 피드백("산 이름 텍스트가 너무 작다, 1행 기준 150% 확대 필요") 반영:
   - `generate.js`의 `resolveLabelLines`를 axis-agnostic 단일 계산식으로 재설계 —
     `ideal = floor(width/length*0.98)`을 `[minFontSize, maxFontSize]`로 클램프해
     텍스트가 짧으면 확대(`autoGrow`+`maxFontSize`), 길면 축소(`autoShrink`+`minFontSize`)가
     하나의 로직으로 자연스럽게 이어지도록 통합
   - `mountain-poi-badge.config.js`에 `autoGrow:true, maxFontSize:54`(=36의 150%) 추가
   - `subway-poi-badge.config.js`는 `autoGrow` 미설정 → 기존 동작 100% 유지(회귀 없음, 검증됨)
5. 847개 전체 재생성(파일명=badge_id 동일 → DB image_url 재반영 불필요, 파일만 교체) → 커밋/푸시/배포 확인

### 변경된 파일
```
jam-web/scripts/badge-image-gen/generate.js (수정 — resolveLabelLines에 autoGrow/maxFontSize 지원 추가)
jam-web/scripts/badge-image-gen/configs/mountain-poi-badge.config.js (신규)
jam-web/scripts/badge-image-gen/backgrounds/mountain-poi-badge.svg (신규 — 배경 SVG 캐시)
jam-web/public/badges/poi/mountain/*.png (신규 847개 — 배지 이미지, 텍스트 확대 반영해 1차 생성 후 재생성)
jam-web/supabase/seed/update_mountain-poi-badge_images.sql (신규 — 실행된 UPDATE 문 기록)
```

### 테스트 결과
- [x] `--ids`로 최단(2자 "배산"), 최장(5자 "고루포기산") 샘플 확인 — autoGrow 전/후 눈으로 직접 비교
- [x] 847개 전체 생성 성공(실패 0), Supabase UPDATE 847/847 반영 확인 (1차)
- [x] autoGrow 추가 후 847개 재생성 성공, 프로덕션 배포 후 이미지 URL 직접 접근해 확대된
      텍스트 크기 렌더링 확인
- [x] subway-poi-badge(973개, 기존 자산)는 이번 변경으로 재생성하지 않았고 로직상으로도
      `autoGrow` 미설정 시 이전과 동일 결과 나오는 것을 계산식으로 확인 — 회귀 없음

### UX Writing 검증
- 해당 없음 (배지 이미지 내 텍스트는 실제 산 이름을 그대로 표기, 사용자 노출 UI 문구 변경 없음)

### 배포 정보
- 배포일: 2026-08-06
- 환경: production (jam-rose.vercel.app / standard-manual/jam)
- 커밋: c0af1ca(1차 생성), f4a1d4d(autoGrow 반영 후 재생성)

### 주요 의사결정 / 핵심 메모
- **같은 Figma node-id 재사용 확인**: 사용자가 지난번과 동일한 URL(node-id=1-9)을 다시 제시해서
  디자인이 바뀌었는지 먼저 재조회로 확인 후 진행 — 실제로 프레임 내용이 산 배지 디자인으로
  교체되어 있었음. Figma 링크가 "고정 URL이 항상 같은 결과"라고 가정하지 않고 매번 재확인하는
  것이 안전함을 확인.
- **확대/축소 통합 계산식**: 처음엔 "축소(autoShrink)"와 "확대(autoGrow)"를 별개 분기로 구현할지
  고민했으나, `ideal = width/length*0.98`을 `[min, max]`로 클램프하는 단일 수식으로 통합하는 게
  더 간결하고, 텍스트 길이 경계에서 부자연스러운 점프 없이 이어짐. `autoGrow` 미설정 시
  `max = fontSize`(기존 값)가 되어 하위 호환이 자동으로 보장되는 것도 이 설계의 장점.
- **배지 이미지 URL 불변성 활용**: 파일명이 `badge_id.png`로 고정이라, 텍스트 크기만 바뀐
  재생성에서는 DB `image_url` UPDATE를 다시 실행할 필요가 없었음 — 파일 교체 + 배포만으로 충분.

### 잔여 이슈
- 없음. 다음 디자인 자동 생성 시에도 `configs/`에 새 config만 추가하면 되고, 텍스트가 짧은
  디자인이면 `autoGrow`/`maxFontSize`를 opt-in으로 켜면 됨.
