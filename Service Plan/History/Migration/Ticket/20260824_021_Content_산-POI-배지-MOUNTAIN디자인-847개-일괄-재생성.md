---
id: 20260824_021
category: Content
status: CLOSED
created: 2026-08-24
closed: 2026-08-24
---

# [Content] 산 POI 배지 이미지 847개 JAM MOUNTAIN 디자인으로 일괄 재생성

## 배경 / 문제 정의
[[20260824_020]]에서 지하철역 POI 배지를 새 JAM METRO 디자인으로 교체한 데 이어, 산 POI 배지도
같은 방식으로 새 디자인으로 교체한다.

- 디자인 출처: Figma `UXcBEgFagmO5ARwH5F0mMW` node-id `4-41`
  (짙은 녹색 원 + 베이지 테두리 + MOUNTAIN 아치 + Jam 로고 + 나무 3그루 + 산 이름, 681.32×681.32)
- 대상: `poi.category='mountain'`에 연결된 배지 **847개** (2자 37 / 3자 787 / 4자 21 / 5자 2)
- 이전 디자인은 [[20260806_006]]의 340×340 (짙은 녹색 원 + 골드 태양광선)

## 상세 요구사항

### 서비스/코드베이스 관점
- `scripts/badge-image-gen/` 프레임워크 재사용, config만 신규 작성
- 이미지 파일 경로를 이전과 동일하게 두어 `badges.image_url` UPDATE 없이 파일 교체만으로 전환

### 컨텐츠 관점
- 산 이름은 2~5자로 짧아 텍스트 영역에 여백이 많이 남으므로, 짧을수록 최대 150%까지 확대
- 256×256 출력 (기존 규격 유지)

## 구현 계획
1. Figma에서 디자인 사양 추출 → 배경 SVG 조립
2. `configs/mountain-poi-badge-v2.config.js` 신규 작성 (기존 `mountain-poi-badge`는 보존)
3. 대표 케이스(2/3/4/5자) 샘플 생성 후 텍스트 크기 정책 확인
4. 847개 전체 생성 → 배포

---
## 완료 기록

### 구현 내용 요약
1. Figma MCP로 node 4:41 사양 추출 — 681.32×681.32, 배경은 Layer_1 SVG 한 장
   (원 `#173E27` + 테두리·MOUNTAIN 아치·나무 `#DCD2C8`/white), Jam 로고(5:2)는 별도 노드로
   x=300.32 y=173.32 79.611×32.898, 텍스트 x=188.32 y=450.32 w=308 h=142 fontSize=59.222
   Pretendard Bold 흰색 중앙정렬
2. **디자인 재확인 절차가 실제로 유효했다** — 사용자가 같은 node-id 링크를 다시 제시해 재조회했더니
   Jam 로고(5:2)가 새로 추가되어 있었다. [[20260806_006]]의 "Figma 링크는 매번 재확인" 메모대로
   진행한 덕에 로고 누락을 피했다.
3. 배경 SVG 조립 (`backgrounds/mountain-poi-badge-v2.svg`) — Layer_1 전체 SVG에 Jam 로고를
   원본 좌표로 합성
4. `configs/mountain-poi-badge-v2.config.js` 신규 작성 — `measure: 'font'`(실측 모드),
   `autoGrow: true, maxFontSize: 88.8`(=59.222의 150%)
5. 847개 전체 생성(실패 0), 전부 256×256

### 변경된 파일
```
jam-web/scripts/badge-image-gen/configs/mountain-poi-badge-v2.config.js (신규)
jam-web/scripts/badge-image-gen/backgrounds/mountain-poi-badge-v2.svg (신규 — 배경 SVG)
jam-web/public/badges/poi/mountain/*.png (847개 전부 교체)
jam-web/supabase/seed/update_mountain-poi-badge-v2_images.sql (신규 — 기록용, 실행 불필요)
```

### 테스트 결과
- [x] 대표 4케이스 육안 확인 — 2자(각산) / 3자(북한산) / 4자(가리왕산) / 5자(고루포기산)
- [x] 텍스트 크기 정책은 두 안(원본 고정 vs 확대)을 나란히 렌더해 비교 후 확대안으로 확정
- [x] 847개 전체 생성 성공(실패 0), 전부 256×256, git 기준 847개 전부 교체 확인
- [x] `badges.image_url` 847/847이 이미 `/badges/poi/mountain/{id}.png`와 일치 —
      UPDATE 불필요를 쿼리로 확인

### UX Writing 검증
- 해당 없음 (배지 이미지 내 텍스트는 실제 산 이름을 그대로 표기, 사용자 노출 UI 문구 변경 없음)

### 배포 정보
- 배포일: 2026-08-24
- 환경: staging (프로덕션 승격은 `/jam-ship`으로 별도 처리)
- 커밋: (아래 커밋 해시)

### 주요 의사결정 / 핵심 메모
- **파일 경로를 그대로 두어 이미지 깨짐을 원천 차단**: [[20260824_020]]에서는 새 경로
  (`/badges/poi/metro/`)로 옮기면서 DB를 먼저 UPDATE해, 프로덕션 배포 전까지 서비스·어드민에서
  배지 이미지가 전부 깨졌다. 이번에는 `outputDir`을 이전과 동일한 `badges/poi/mountain`으로 두어
  **파일만 덮어쓰므로 DB 변경이 아예 없다** — 배포 전에는 구 이미지, 배포 후에는 새 이미지가
  보이며 깨지는 구간이 없다. 파일명이 `{badge_id}.png`로 고정인 설계 덕에 가능한 방식이다.
- **텍스트 확대(autoGrow) 재적용**: 산 이름은 2~5자(3자가 93%)라 Figma 원본 크기(59.222px)로는
  폭 308px 영역에 여백이 크게 남는다. 원본 고정안과 확대안을 실제로 렌더해 비교한 뒤 확대안을
  선택했다. [[20260806_006]]에서도 같은 이유로 150% 확대를 채택했던 이력과 일치한다.
  지하철역 배지([[20260824_020]])는 이름 길이 편차가 커서 확대를 켜지 않았다 — 정책이 다른 이유다.
- **기존 config 보존**: `mountain-poi-badge.config.js`(구 디자인)는 수정하지 않고 `-v2`를 신설했다.
  프레임워크가 "디자인 하나 = config 하나"로 설계돼 있어서다.

### 잔여 이슈
- 없음.
