import type { SVGProps, ComponentType, CSSProperties } from 'react';

type IconProps = SVGProps<SVGSVGElement>;
type IconComponent = ComponentType<IconProps>;

export function UserIcon(props: IconProps): JSX.Element;
export function UsersIcon(props: IconProps): JSX.Element;
export function MedalIcon(props: IconProps): JSX.Element;
export function BookIcon(props: IconProps): JSX.Element;
export function PackageIcon(props: IconProps): JSX.Element;
export function GiftIcon(props: IconProps): JSX.Element;
export function TargetIcon(props: IconProps): JSX.Element;
export function CheckCircleIcon(props: IconProps): JSX.Element;
export function XCircleIcon(props: IconProps): JSX.Element;
export function PuzzleIcon(props: IconProps): JSX.Element;
export function InboxIcon(props: IconProps): JSX.Element;
export function ActivityIcon(props: IconProps): JSX.Element;
export function CoinIcon(props: IconProps): JSX.Element;
export function ChevronRightIcon(props: IconProps): JSX.Element;
export function CloseIcon(props: IconProps): JSX.Element;
export function HourglassIcon(props: IconProps): JSX.Element;
export function PinIcon(props: IconProps): JSX.Element;
export function FlaskIcon(props: IconProps): JSX.Element;
export function NewspaperIcon(props: IconProps): JSX.Element;
export function SearchIcon(props: IconProps): JSX.Element;
export function CheckIcon(props: IconProps): JSX.Element;
export function InfoIcon(props: IconProps): JSX.Element;
export function PencilIcon(props: IconProps): JSX.Element;
export function BellIcon(props: IconProps): JSX.Element;
export function AlertTriangleIcon(props: IconProps): JSX.Element;
export function LockIcon(props: IconProps): JSX.Element;

export interface IconEntry {
  name: string;
  Icon: IconComponent;
}

/** 카탈로그 그리드에 노출할 전체 아이콘 목록 (원본 icons.tsx 등장 순서 유지). */
export const ICON_ENTRIES: IconEntry[];

export interface IconCatalogProps {
  className?: string;
  style?: CSSProperties;
}

/** 전체 아이콘 그리드 — Storybook 카탈로그 전용 컴포넌트. */
export function IconCatalog(props: IconCatalogProps): JSX.Element;
