/**
 * Babel, with one deviation from the Expo default.
 *
 * `jsxImportSource: 'nativewind'` is what makes `className` a real prop on a
 * React Native `<View>`. It routes every JSX element through NativeWind's
 * runtime, which reads the class list, resolves it against the compiled Tailwind
 * output and hands the resulting style object to the underlying component.
 * Without it `className` is an unknown prop that React Native silently drops —
 * the app renders, unstyled, with no error to explain why.
 *
 * `nativewind/babel` is the second half: it teaches Babel about the CSS import
 * so `global.css` becomes something Metro can bundle rather than a syntax error.
 *
 * The Reanimated worklets plugin is deliberately absent. `babel-preset-expo`
 * adds it itself when `react-native-worklets` resolves (see its
 * `configs/expo.js`), and listing it again here would run the transform twice.
 */
module.exports = function babelConfig(api) {
  api.cache(true)

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  }
}
