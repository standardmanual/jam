/**
 * 아이콘 mask id를 고정해 주는 renderToStaticMarkup 대용 (티켓 20261114_2345)
 *
 * 아이콘(`ui/icons.tsx`)은 비운 면·틈을 SVG mask로 뚫고, mask id에 `useId` 값이 들어간다.
 * 그래서 «아이콘 하나를 따로 그린 마크업이 화면 마크업 안에 들어 있는가» 식의 시험은
 * 렌더 뿌리가 달라 id가 달라지면 어긋난다. 이 함수는 `ic…m<번호>` 꼴 id를 `icm<번호>`로 접어 비교할 수 있게 한다.
 */
import { renderToStaticMarkup as render } from 'react-dom/server'

export function renderToStaticMarkup(element: Parameters<typeof render>[0]): string {
  return render(element).replace(/ic[\w-]*?m(\d+)(?=["')])/g, 'icm$1')
}
