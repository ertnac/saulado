import type { ReactElement } from 'react'
import type { ColorValue } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

/**
 * The icons, ported from `frontend/src/components/ui/icons.tsx`.
 *
 * Only the ones Phase 2 renders — the three tab glyphs and the alert used by the
 * form banner. The rest come across as the phases that need them land, because
 * a `react-native-svg` element per unused path is bundle weight with no screen
 * behind it.
 *
 * Two differences from the web set, both forced by the platform:
 *
 * `currentColor` does not exist here. React Native has no inherited text colour
 * for a non-text element to read, so every icon takes an explicit `color`. The
 * callers pass a resolved token rather than a class, which is why this file
 * imports no styling at all.
 *
 * `em` sizing does not exist either, so `size` is in points and defaults to the
 * 20 the tab bar and the form banner both want.
 */
export interface IconProps {
  /**
   * `ColorValue`, not `string`. Every caller here passes a resolved token, which
   * is a string — but the tab bar hands its icons a `ColorValue`, and narrowing
   * to `string` would make the one caller that cannot choose the odd one out.
   */
  color: ColorValue
  size?: number
}

function Icon({
  color,
  size = 20,
  children,
}: IconProps & {
  /**
   * `JSX.Element`, not `ReactNode`.
   *
   * `react-native-svg` has no `@types/react` of its own, so TypeScript resolves
   * the copy hoisted for the frontend — React 18's, whose `ReactNode` predates
   * `bigint` being a valid child. React 19's `ReactNode` is not assignable to
   * it, but `JSX.Element` is, because its props and type are `any`. Every caller
   * passes SVG elements, so this is both accurate and portable.
   */
  children: React.JSX.Element | React.JSX.Element[]
}): ReactElement {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  )
}

export function HomeIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M3 10.5 12 3l9 7.5" />
      <Path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    </Icon>
  )
}

export function LayersIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <Path d="m3 12.5 9 4.5 9-4.5" />
    </Icon>
  )
}

export function ChartIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 20V10" />
      <Path d="M10 20V4" />
      <Path d="M16 20v-7" />
      <Path d="M22 20H2" />
    </Icon>
  )
}

export function AlertIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <Path d="M12 10v4" />
      <Path d="M12 17.5h.01" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m9 5 7 7-7 7" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m15 5-7 7 7 7" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m16 16 4.5 4.5" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2.5v2.2M12 19.3v2.2M4.2 7.2l1.9 1.1M17.9 15.7l1.9 1.1M4.2 16.8l1.9-1.1M17.9 8.3l1.9-1.1" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 7h16" />
      <Path d="M9 7V4.5h6V7" />
      <Path d="M6 7l1 13h10l1-13" />
    </Icon>
  )
}

export function SunIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

export function ImageIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 5.5h16v13H4z" />
      <Circle cx={9} cy={10} r={1.5} />
      <Path d="m4 16 4.5-4.5 3.5 3.5 3-2.5L20 17" />
    </Icon>
  )
}

/**
 * Four viewfinder corners around a line of text.
 *
 * A camera body was the other candidate and it is the wrong picture: the tab does
 * not take photographs, it reads a page, and the corner brackets are the gesture
 * the user is about to perform.
 */
export function ScanIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5" />
      <Path d="M15.5 4H18a2 2 0 0 1 2 2v2.5" />
      <Path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5" />
      <Path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
      <Path d="M7.5 12h9" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </Icon>
  )
}

export function ZapIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m5 9 7 7 7-7" />
    </Icon>
  )
}

export function UserIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M20 21a8 8 0 0 0-16 0" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 3" />
    </Icon>
  )
}

export function FlameIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M8.5 14.5A3.5 3.5 0 0 0 12 18a3.5 3.5 0 0 0 3.5-3.5c0-2-1.5-3.5-2.5-4.5-.5-1-1-2.5-.5-4-2.5 1.5-5 5-5 8.5Z" />
    </Icon>
  )
}

export function BookOpenIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Icon>
  )
}

export function SparklesIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </Icon>
  )
}

export function TrophyIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
      <Path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
      <Path d="M6 3h12v7a6 6 0 0 1-12 0V3Z" />
      <Path d="M12 16v5" />
      <Path d="M8 21h8" />
    </Icon>
  )
}

export function TargetIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={12} r={5} />
      <Circle cx={12} cy={12} r={1.5} />
    </Icon>
  )
}

export function EditIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <Path d="m15 5 4 4" />
    </Icon>
  )
}

export function ArchiveIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M21 8v13H3V8" />
      <Path d="M1 3h22v5H1z" />
      <Path d="M10 12h4" />
    </Icon>
  )
}

export function MoreVerticalIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={1.5} />
      <Circle cx={12} cy={5} r={1.5} />
      <Circle cx={12} cy={19} r={1.5} />
    </Icon>
  )
}

export function ShareIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </Icon>
  )
}

export function UploadIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="m17 8-5-5-5 5" />
      <Path d="M12 3v12" />
    </Icon>
  )
}

export function FileTextIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Path d="M14 2v6h6" />
      <Path d="M16 13H8" />
      <Path d="M16 17H8" />
      <Path d="M10 9H8" />
    </Icon>
  )
}
