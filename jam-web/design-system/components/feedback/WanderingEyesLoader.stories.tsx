import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WanderingEyesLoader } from './WanderingEyesLoader';

const meta: Meta<typeof WanderingEyesLoader> = {
  title: 'MODULAR/Feedback/WanderingEyesLoader',
  component: WanderingEyesLoader,
  parameters: { layout: 'centered' },
  argTypes: {
    duration: { control: 'text' },
    eyeColor: { control: 'text' },
    pupilColor: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof WanderingEyesLoader>;

export const Default: Story = {
  args: {},
};

export const Slow: Story = {
  name: '느린 속도 (3s)',
  args: { duration: '3s' },
};

export const Fast: Story = {
  name: '빠른 속도 (1s)',
  args: { duration: '1s' },
};

export const CustomColors: Story = {
  name: '커스텀 색상 (Primary)',
  args: {
    eyeColor: 'var(--color-primary)',
    pupilColor: 'var(--color-text-on-primary)',
  },
};

export const LargeSize: Story = {
  name: '큰 사이즈 (scale 2x)',
  args: { style: { transform: 'scale(2)', transformOrigin: 'center' } },
};
