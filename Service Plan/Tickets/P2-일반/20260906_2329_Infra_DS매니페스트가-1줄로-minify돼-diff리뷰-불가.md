---
id: 20260906_2329
category: Infra
priority: P2
status: OPEN
created: 2026-09-06
closed:
---

# [Infra] DS 매니페스트가 1줄로 minify돼 diff 리뷰가 불가능하다

## 배경 / 문제 정의

`jam-web/scripts/ds-manifest-sync.mjs:164`가 `JSON.stringify(manifest)`를 **들여쓰기 인자
없이** 호출한다. 종전 `_ds_manifest.json`은 사람이 정렬해 둔 pretty-print 상태였는데,
티켓 20260906_2140의 첫 커밋(`5d6e0f00`)에서 이 스크립트가 처음 돌면서 **1148줄 → 1줄**로
통째 재작성됐다.

내용 자체는 정상이었다(신규 컴포넌트 2개 + 토큰 5개 추가). 문제는 **앞으로 매니페스트
diff를 사람이 읽을 수 없다**는 점이다. 컴포넌트를 하나 추가하든 스무 개를 지우든 diff가
「1줄 삭제 / 1줄 추가」로만 보여, 리뷰어가 무엇이 바뀌었는지 확인할 방법이 없다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `ds-manifest-sync.mjs:164`를 `JSON.stringify(manifest, null, 2)`로 바꾼다
- 바꾼 뒤 스크립트를 한 번 돌려 `_ds_manifest.json`을 pretty-print로 되돌린다
  (그 커밋 하나는 다시 전면 재작성 diff가 되지만, 이후로는 의미 있는 diff가 나온다)
- 개행 문자와 파일 끝 개행이 저장소 컨벤션과 맞는지 확인한다

## 구현 계획

한 줄 수정 + 매니페스트 재생성. `npm run ds:manifest`가 idempotent한지(두 번 돌려도
diff가 안 생기는지) 확인할 것.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] `npm run ds:manifest` 두 번 연속 실행 시 두 번째는 diff 없음
- [ ] 컴포넌트 하나를 추가/삭제했을 때 diff가 해당 줄만 보임

### 배포 정보
- 배포일:
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
