export const TurboModuleRegistry = {
  get: (): null => null,
  getEnforcing: (): Record<string, unknown> => ({}),
}

export const NativeModules = {}
export const Platform = {
  OS: 'ios',
  select: <T>(objs: { ios?: T; default?: T }): T | undefined => objs.ios ?? objs.default,
}
export const AppState = {
  addEventListener: (): { remove: () => void } => ({ remove: (): void => {} }),
}
export const Dimensions = {
  get: (): { width: number; height: number } => ({ width: 375, height: 812 }),
}
export const StyleSheet = { create: <T>(styles: T): T => styles }

export default {
  TurboModuleRegistry,
  NativeModules,
  Platform,
  AppState,
  Dimensions,
  StyleSheet,
}
