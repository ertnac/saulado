const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

/**
 * Metro, taught about the pnpm workspace.
 *
 * Without this the app builds fine until the first `@saulado/shared` import,
 * then fails to resolve it — which is why plan §5 Phase 0 says to prove a shared
 * import before building anything else. Two things are wrong by default:
 *
 * 1. `@saulado/shared` in `mobile/node_modules` is a symlink to `../../shared`.
 *    Metro follows the symlink to read the file, but only serves and watches
 *    folders it has been told about, so an edit to `shared/dist` would not
 *    trigger a rebuild.
 * 2. Resolution has to reach the root `node_modules` as well as this package's,
 *    because pnpm keeps the real packages in the root `.pnpm` store and links
 *    into each workspace package from there.
 *
 * Symlink support itself needs no flag — Metro has followed symlinks by default
 * since RN 0.73, which is what makes this file three lines of config rather than
 * a resolver rewrite.
 *
 * The two folders are named individually rather than watching the repo root,
 * which is what this originally did. The root also holds `frontend`, `backend`,
 * `docs`, `.git` and `.claude` — and `.claude/worktrees` can contain an entire
 * second checkout with its own `node_modules`. None of that is reachable from a
 * mobile import, but Metro crawls and watches every file it is pointed at before
 * it serves the first bundle, which on Windows is slow enough to look like a
 * hang.
 */
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [
  path.resolve(workspaceRoot, 'shared'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = withNativeWind(config, { input: './global.css' })
