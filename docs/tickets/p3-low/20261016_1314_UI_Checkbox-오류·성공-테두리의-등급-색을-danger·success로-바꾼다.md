---
id: "20261016_1314"
category: UI
priority: P3
status: OPEN
created: 2026-10-16
parent: "20261015_2133"
---

# [UI] Checkbox 오류·성공 테두리의 등급 색을 danger·success로 바꾼다

## 핵심 요약

- 요구사항: `jam-web/design-system/components/forms/Checkbox.jsx:35-36`이 오류·성공 테두리에 `--rarity-mystic`·`--rarity-rare`를 쓴다. 2133 2회에서 `Input`·`Select`·`Textarea`만 `--danger`·`--success`로 바꿨고 같은 상태 규칙이 `Checkbox`에 남았다. 성공 상태가 색만으로 전달되므로(`--success` 2.19:1) 성공 스토리에 `aria-describedby`로 연결한 문구 예시도 넣는다.
- 구현 계획: `Checkbox` 상태 색을 바꾸고 스토리를 갱신한다. 미도입 컴포넌트라 서비스 영향은 없다.
- 근거: 티켓 20261015_2133 2회 민지·채원② 발견물.

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

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
