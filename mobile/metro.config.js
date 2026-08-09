const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

/**
 * Metro, taught about the pnpm workspace.
 *
 * Without this the app builds fine until the first `@saulado/shared` import,
 * then fails to resolve it — which is why plan §5 Phase 0 says to prove a shared
 * import before building anything else. Two things are wrong by default:
 *
 * 1. `@saulado/shared` in `mobile/node_modules` is a symlink to `../../shared`.
 *    Metro follows the symlink to read the file, but only watches folders it has
 *    been told about, so an edit to `shared/dist` would not trigger a rebuild.
 *    Watching the repo root fixes that.
 * 2. Resolution has to reach the root `node_modules` as well as this package's,
 *    because pnpm keeps the real packages in the root `.pnpm` store and links
 *    into each workspace package from there.
 *
 * Symlink support itself needs no flag — Metro has followed symlinks by default
 * since RN 0.73, which is what makes this file three lines of config rather than
 * a resolver rewrite.
 */
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
