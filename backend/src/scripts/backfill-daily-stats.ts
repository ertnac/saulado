import { backfillDailyStats } from '../progress/backfill.js'
import { prisma } from '../db/client.js'

/**
 * CLI for the `user_daily_stats` rebuild (plan §5.1).
 *
 * A thin argument parser over `backfillDailyStats`, kept separate so the logic
 * can be tested without spawning a process or capturing stdout.
 *
 *   pnpm --filter @saulado/backend db:backfill              # dry run, all users
 *   pnpm --filter @saulado/backend db:backfill -- --apply   # write it
 *   pnpm --filter @saulado/backend db:backfill -- --user <uuid>
 *
 * **Dry run is the default.** This script deletes rollup rows it finds no
 * reviews behind, and the safe direction for a destructive default is off. An
 * operator who has read the dry-run output and typed `--apply` has consented to
 * the deletions; one who typed the command to see what it does has not.
 */

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')

  const userFlag = args.indexOf('--user')
  const userId = userFlag === -1 ? undefined : args[userFlag + 1]

  if (userFlag !== -1 && (userId === undefined || userId.startsWith('--'))) {
    console.error('--user needs a user id')
    process.exitCode = 1
    return
  }

  console.log(apply ? 'Backfilling user_daily_stats…' : 'Dry run — nothing will be written.')

  const report = await backfillDailyStats({ apply, ...(userId === undefined ? {} : { userId }) })

  console.log(
    `\n${String(report.usersScanned)} users, ${String(report.reviewsScanned)} reviews scanned\n` +
      `  ${String(report.daysCreated)} rows missing\n` +
      `  ${String(report.daysCorrected)} rows disagreeing with the log\n` +
      `  ${String(report.daysOrphaned)} rows with no reviews behind them`,
  )

  if (!apply && report.daysCreated + report.daysCorrected + report.daysOrphaned > 0) {
    console.log('\nRe-run with --apply to write these changes.')
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
