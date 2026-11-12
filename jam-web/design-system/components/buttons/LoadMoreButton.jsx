import React from 'react';
import { Button } from './Button.jsx';

/**
 * LoadMoreButton — 목록 아래의 «더보기» 버튼. 알림·포인트 내역·친구 피드가 함께 쓴다.
 *
 * 서비스 `src/components/ui/LoadMoreButton.tsx`와 병존하는 쌍이다. 자체 색·치수를 갖지 않고
 * `Button variant="outline" fullWidth`(폭 전체 · 52px · --btn-secondary 알약)에 위 간격 16px만 얹는다.
 * 모양을 호출부가 덮어쓰지 못하도록 className을 받지 않는다.
 */
export function LoadMoreButton({ loading = false, onClick, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <Button variant="outline" fullWidth loading={loading} onClick={onClick}>
        {children}
      </Button>
    </div>
  );
}
