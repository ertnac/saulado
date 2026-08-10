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

export function SunIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
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
