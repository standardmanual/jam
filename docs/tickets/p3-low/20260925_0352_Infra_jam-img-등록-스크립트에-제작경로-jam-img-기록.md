---
id: "20260925_0352"
category: Infra
priority: P3
status: OPEN
created: 2026-09-25
closed:
parent: "20260924_2154"
specs:
  - "docs/specs/prd/asset-generator/PRD.md"
---

# [Infra] `/jam-img` 등록 스크립트가 `badges.image_source = 'jam-img'`를 함께 기록하게 한다

> 티켓 20260924_2200 후속 범위(카리나)로 만든 티켓이다. 상위 티켓 20260924_2154의 성공 기준 5(제작 경로 라벨 구분)를 세 경로 모두에서 채우려면
> 기존 아이콘 파이프라인도 값을 남겨야 한다.

## 핵심 요약

- 요구사항: `/jam-img` 파이프라인의 등록 단계(`jam-web/scripts/recraft/register-badge-images.js`)가 `badges.image_url`을 갱신할 때
  `image_source = 'jam-img'`를 함께 쓴다. 미리보기용 SQL 출력에도 같은 컬럼을 포함한다.
- 구현 계획: 스크립트의 `.update({ image_url: publicUrl })`(65~66줄)에 `image_source: 'jam-img'`를 더하고, 드라이런 SQL 문자열(76줄)에도 컬럼을
  추가한다. `.claude/skills/jam-img/SKILL.md`의 등록 단계 설명에 제작 경로 기록을 한 줄 덧붙인다.
- 관련 파일: `jam-web/scripts/recraft/register-badge-images.js`(85줄, update 65~66줄·SQL 문자열 76줄), `.claude/skills/jam-img/SKILL.md`,
  라벨 단일 출처 `jam-web/src/lib/admin/badgeImageSource.ts`(값 상수 참고)

## 배경 / 문제 정의

2200에서 배지 목록·상세에 제작 경로 라벨(수동 제작 / 윤진 자동 / 아이콘 파이프라인 / 미상)이 생겼다. 아이콘 파이프라인으로 만든 배지는 지금
NULL(미상)로 남아 라벨이 원인 추적 수단으로 완성되지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 등록 스크립트 갱신 페이로드와 드라이런 SQL에 `image_source = 'jam-img'` 포함.
- 기존 배지의 소급 채우기(어느 배지가 `/jam-img` 산출물인지)는 상위 티켓 「열린 질문」에 있으므로 이 티켓 범위 밖이다.

## 완료 조건
- 스크립트를 드라이런하면 출력 SQL에 `image_source = 'jam-img'`가 포함된다.
- 실제 등록 1건 뒤 해당 배지의 `image_source`가 `jam-img`다(카리나 실렌더 또는 다음 `/jam-img` 실행 때 확인).
- `npm run lint` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
