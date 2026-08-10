/// <reference types="nativewind/types" />

// Gives `className` a type on every React Native component, by declaration
// merging into RN's own prop types. Without it the components render correctly
// at runtime but every `className` is a TypeScript error.
//
// The filename matters. NativeWind's docs are explicit that this file must not
// be named after a sibling file or directory (`app.d.ts` beside `app/`) or after
// a package in `node_modules` — TypeScript resolves the name to that other thing
// and the reference is never loaded. `nativewind-env.d.ts` collides with
// neither.
