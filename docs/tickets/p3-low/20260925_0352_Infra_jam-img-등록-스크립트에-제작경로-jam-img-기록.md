---
id: "20260925_0352"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-26
parent: "20260924_2154"
specs:
  - "docs/service/prd/asset-generator/PRD.md"
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
- `register-badge-images.js`: `IMAGE_SOURCE = 'jam-img'` 상수를 두고 `badges` UPDATE 페이로드를 `{ image_url, image_source }`로 바꿨다.
  컬렉션 폴더에 저장되는 SQL 기록(`seed_{collection_id}_badge_images.sql`)의 UPDATE문에도 `image_source = 'jam-img'`를 넣었다.
  스크립트에 별도 드라이런 모드는 없고, 이 SQL 기록이 티켓의 "미리보기용 SQL 출력"에 해당한다. 파일 머리 주석도 갱신했다.
- `.claude/skills/jam-img/SKILL.md` ⑩ 단계에 `image_source = 'jam-img'` 함께 기록한다는 한 줄을 덧붙였다.

### 변경된 파일
```
jam-web/scripts/recraft/register-badge-images.js
.claude/skills/jam-img/SKILL.md
```

### 테스트 결과
- [x] Supabase 클라이언트·`.env.local`을 스텁으로 바꾼 임시 실행(임시 폴더, 실제 DB·Storage 접근 없음): UPDATE 페이로드에 `image_source: 'jam-img'`가
  들어가고, 생성된 SQL에 `UPDATE badges SET image_url = '...', image_source = 'jam-img' WHERE id IN (...)`가 출력됨
- [ ] 실제 등록 1건 뒤 해당 배지의 `image_source = 'jam-img'` 확인: 미확인(카리나 실렌더 또는 다음 `/jam-img` 실행 때 확인, 실제 DB 쓰기라 하지 않음)
- [x] lint는 `scripts/verify.sh`로 마지막에 실행(최종 보고 참조)

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
- 값 문자열은 `contentImageSource.ts`(TS)를 CommonJS 스크립트에서 가져올 수 없어 상수로 다시 적었다. 같은 값이 마이그레이션 186의 CHECK·`contentImageSource.ts`에도 있다.
- 다른 배지 갱신 경로(`register-badge-images.js` 외)는 이 티켓 범위 밖이라 손대지 않았다.

### 잔여 이슈
- 기존 배지의 소급 채우기는 상위 티켓 「열린 질문」 소관(이 티켓 범위 밖).

---
## 종료 기록 (2026-09-26, 카리나)

- 묶음 실행(티켓 2237·0347·0352·1625)의 일부다. 병합 커밋 9640551c, 게이트 결과와 묶음의 경위는 티켓 20260924_2237 종료 기록에 있다.
- 이 티켓의 판정: `register-badge-images.js`가 UPDATE 페이로드와 SQL 기록에 `image_source = 'jam-img'`를 함께 쓰고 `.claude/skills/jam-img/SKILL.md` ⑩ 단계에 한 줄이 추가됐다. 아현이 스텁 Supabase로 임시 실행해 값이 페이로드와 SQL에 들어가는 것을 확인했다.
- **확인하지 못한 것**: 실제 등록 뒤 DB의 `image_source` 값. 티켓이 「카리나 실렌더 또는 다음 실행 때」로 미룬 항목이고 이번에 배지 이미지를 등록하지 않았다. 다음 `/jam-img` 등록 때 확인해야 한다.
- [참고] 스크립트의 `IMAGE_SOURCE` 상수가 `contentImageSource.ts`·마이그레이션 186 CHECK와 값이 중복돼 드리프트 가능성이 있다(티켓 완료 기록에 이미 명시).

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차(2237·0347·0352·1625 묶음) | 아현·민지 | 131,884 | 77,170 / 7,842 | 9분 33초 | 82 |
| 재판정(카리나 번들 재생성·스크립트 패치 뒤) | 민지 | 42,497 | 0 / 12,806 | 4분 1초 | 9 |
| 합계 | 아현·민지 | 174,381 | 77,170 / 20,648 | 13분 34초 | 91 |

(네 티켓을 한 번의 실행으로 처리해 지표는 묶음 전체 값이다. 네 티켓 모두 같은 값을 적었다.)
