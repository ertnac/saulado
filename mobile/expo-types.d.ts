/// <reference types="expo/types" />

// Pulls in Expo's Metro environment typings, which is what gives `process.env` a
// real type (`string | undefined` per key) instead of `any`. Without it,
// `services/config.ts` reads an untyped global and every use of the result is an
// unsafe-any lint error.
//
// SDK 54 and earlier generated an `expo-env.d.ts` holding this reference; 57 no
// longer does, and that file is gitignored anyway. Kept here rather than in
// `tsconfig.json#compilerOptions.types` because Expo rewrites the tsconfig on
// start and would drop the entry.
