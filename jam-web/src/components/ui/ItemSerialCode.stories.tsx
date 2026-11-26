import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ItemSerialCode } from './ItemSerialCode';

const meta: Meta<typeof ItemSerialCode> = {
  title: 'UI/Patterns/ItemSerialCode',
  component: ItemSerialCode,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '앞 4자(알파벳)는 카드 1장씩, 나머지(숫자)는 하나의 박스로 렌더링하는 일련번호 스탬프. ' +
          '숫자 자리는 마운트 시 transitions.dev "Spinning counter"(.t-reel)로 0-9를 스핀한 뒤 ' +
          '목표 숫자에 착지한다(20260903_1611). 알파벳 prefix 카드는 정적 텍스트 그대로 유지. ' +
          'prefers-reduced-motion에서는 스핀 없이 즉시 최종 값을 표시한다. ' +
          'animate={false}를 넘기면 같은 정적 렌더 경로를 강제한다(20260907_2059).',
      },
    },
  },
  argTypes: {
    code: { control: 'text' },
    height: { control: { type: 'range', min: 40, max: 400, step: 4 } },
    animate: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof ItemSerialCode>;

/** 아이템 배지 상세 페이지(설명과 획득 이력 사이)와 잠긴 아이템 배지를 연 뒤의 상세에서 나오는 일련번호 */
export const Default: Story = {
  name: '배지 상세 — height 50',
  args: { code: 'ABCD000042', height: 50 },
};

/** 지도 드랍 바텀시트(`BadgeDetailSheet`)에서 나오는 일련번호. 이 크기에서는 자간이 자동으로 풀린다. */
export const DropSheetScale: Story = {
  name: '드랍 바텀시트 — height 40',
  args: { code: 'ABCD000042', height: 40 },
};
