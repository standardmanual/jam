---
id: "20260926_1406"
category: API
priority: P3
status: OPEN
created: 2026-09-26
closed:
specs: []
---

# [API] 어드민 배지 목록 일괄 처리: activate 분기에 DB 오류 원문이 남아 있다

> 발견 경위: 2026-09-26 프로덕션 배포 전 병렬 점검(민지 모드 ②·③, 범위 `origin/main..origin/staging`)의 범위 밖 발견물. 배포를 막는 항목은 아니었다.

## 핵심 요약

- 요구사항: `list-bulk` 라우트의 `activate` 분기가 `update.error ?? '반영에 실패했습니다.'`로 DB 오류 원문을 500 응답에 싣는다. 이번 정리(조회·삭제 분기의 고정 한국어 문장 응답)와 같은 정책으로 맞춘다.
- 구현 계획: `updateByIdsAllOrNothing`(`jam-web/src/lib/admin/bulk/server.ts` 142·156·173·182·185행)이 `error.message`를 그대로 넘기므로 헬퍼에서 원문을 로그로만 남기고 호출부는 고정 문장을 응답한다. 같은 헬퍼를 쓰는 다른 bulk 라우트 6곳도 함께 확인한다.
- 관련 파일: `jam-web/src/app/api/admin/badges/list-bulk/route.ts`(110행), `jam-web/src/lib/admin/bulk/server.ts`

## 배경

어드민 인증(`readBulkRequest`)을 통과한 요청에만 열려 있어 외부 노출은 아니지만, 같은 파일 안에서 분기마다 노출 정책이 갈린다. 일부만 반영된 경우 롤백 실패 원문까지 응답에 담긴다(민지 참고 등급, 확신도 높음).

## 완료 조건

- `activate` 분기의 오류 응답에 DB 오류 원문이 없고 로그에는 남는다(테스트: 오류 경로).
- 같은 헬퍼를 쓰는 다른 bulk 라우트의 응답도 같은 정책이다.

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
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
