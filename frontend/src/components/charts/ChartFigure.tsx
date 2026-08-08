import type { ReactElement, ReactNode } from 'react'

/**
 * The accessibility contract for every chart (plan §5.2, ADR 0002 §5).
 *
 * A chart is two things saying the same thing: a picture, and a table. The
 * picture is `aria-hidden` because a screen reader reading out a hundred `<div>`s
 * is worse than silence, and the table is `sr-only` because a sighted user
 * already has the picture. Neither is a fallback for the other — they are the
 * same data in the two forms it needs to exist in.
 *
 * This is also how "never encode meaning in colour alone" is satisfied. The
 * colour in a heatmap is genuinely load-bearing for the picture; what makes it
 * acceptable is that the number behind it is available as text, always, to
 * everyone. Doing that here rather than per chart means it cannot be forgotten
 * in the fourth one.
 */

export interface ChartTableData {
  headers: string[]
  /** One array per row, already formatted for reading aloud. */
  rows: string[][]
}

interface ChartFigureProps {
  /** Visible label for the chart. */
  caption: string
  /**
   * Extra context read after the caption — units, window, what the axis means.
   *
   * Optional because a caption like "Reviews per day" needs none, while
   * "Accuracy" needs to say that gaps are rest days rather than zeroes.
   */
  description?: string
  table: ChartTableData
  children: ReactNode
}

export function ChartFigure({
  caption,
  description,
  table,
  children,
}: ChartFigureProps): ReactElement {
  return (
    <figure className="space-y-3">
      <figcaption>
        <span className="text-sm font-medium">{caption}</span>
        {description !== undefined && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        )}
      </figcaption>

      {/*
        Hidden from assistive tech, not from the page. The bars carry no text of
        their own, so there is nothing here for a screen reader to lose.
      */}
      <div aria-hidden="true">{children}</div>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            // The first cell is the row's identity — a day, or a set name. Keyed
            // on it rather than the index so React reuses rows across a range
            // change instead of rewriting every cell.
            <tr key={row[0] ?? ''}>
              {row.map((cell, column) =>
                column === 0 ? (
                  <th key={column} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={column}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/**
 * An honest empty chart.
 *
 * Not a chart of zeroes. A brand-new user looking at 30 empty bars sees a month
 * of failure they had no opportunity to avoid (saulado-ux §5), so the picture is
 * withheld until there is something in it and this stands in its place.
 */
export function ChartEmpty({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-border px-4 py-6">
      <p className="text-center text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
