---
id: "20260925_0238"
category: API
priority: P3
status: OPEN
created: 2026-09-25
closed:
parent: "20260924_2154"
specs:
  - "docs/specs/prd/asset-generator/PRD.md"
---

# [API] 어드민 API 오류 응답이 Supabase 오류 메시지를 그대로 노출하는 관례를 정리한다

> 티켓 20260924_2159 게이트 리뷰에서 민지가 낸 범위 밖 발견물(`[참고]`)을 3.2절대로 자동 티켓화했다.

## 핵심 요약

- 요구사항: 에셋 제너레이터 프리셋 API(목록·저장·상세·삭제)가 실패 시 Supabase `error.message`를 응답 본문에 그대로 담아 클라이언트에 보낸다. 기존 shader-lab compositions 라우트와 같은 관례라 이번에 새로 생긴 문제는 아니지만, DB 내부 메시지(테이블·컬럼·제약 이름)가 어드민 브라우저까지 내려간다. 사용자에게는 고정 문구를, 상세는 서버 로그에만 남기도록 정리한다.
- 구현 계획: 두 라우트에서 오류 응답을 `{ error: '프리셋을 저장하지 못했어요.' }` 같은 고정 문구로 바꾸고 `console.error`로 원본을 남긴다. shader-lab compositions 라우트도 같은 커밋에서 맞추면 관례가 하나가 된다(선택).
- 관련 파일: `jam-web/src/app/api/admin/asset-generator/presets/route.ts`, `jam-web/src/app/api/admin/asset-generator/presets/[id]/route.ts`, (선택) `jam-web/src/app/api/admin/shader-lab/compositions/route.ts`·`[id]/route.ts`

## 배경 / 문제 정의

어드민 전용 API라 노출 범위는 어드민 계정으로 한정되지만, 오류 문구 관례가 라우트마다 다르면 UX Writing 가이드(오류 = 현상·원인·해결책)와도 어긋난다.

## 완료 조건
- 프리셋 API 4개 핸들러의 오류 응답에 Supabase 원문 메시지가 들어가지 않는다(라우트 테스트로 확인).
- `npm run lint`·`npm test` 통과.

### 추가 위치 (2026-09-26, 티켓 20260926_1241 게이트 발견물)
- `jam-web/src/app/api/admin/badges/list-bulk/route.ts` 47행(`assign_tribe` 조회 오류), 103행(이번에 추가된 deactivate 후보 조회 오류), 116행(`poi_drops` 집계 오류)이 DB 원문 `error.message`를 500 응답에 그대로 싣는다. 같은 파일의 기존 방식이라 이번 묶음에서는 따라갔다. 이 티켓의 관례 정리에 함께 포함한다.

### 배포 전 점검에서 재확인 (2026-09-26, 민지 모드 ②, 확신도 높음)
- `jam-web/src/app/api/admin/badges/list-bulk/route.ts` 51·67·119·224행이 DB 오류 원문을 응답에 그대로 낸다. 같은 diff에서 export·ids·PATCH는 고정 한국어 문장으로 바꿨는데 list-bulk만 남았다. 어드민 인증 뒤에서만 노출된다.

### 진행 상황 (2026-09-26, 티켓 20260926_1345)
- `list-bulk/route.ts`의 DB 오류 응답 6곳(트라이브 지정 조회, 비활성화 사전 조회, 드랍 수 집계, 트라이브 조회, 컬렉션 조회, 삭제)은 고정 한국어 문장으로 바꿨다.
- **남은 곳**: 공용 헬퍼 `updateByIdsAllOrNothing`의 `update.error`를 그대로 응답에 내는 세 곳(`route.ts` 108·146·191행 부근)이 남아 DB 원문이 섞일 수 있다(공용 헬퍼 변경이 필요해 이번에 손대지 않았다). 다른 어드민 라우트의 같은 관례도 이 티켓에서 이어서 정리한다.

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
