import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExportButton } from './ExportButton'

describe('ExportButton', () => {
  it('renders export button with proper accessible label', () => {
    render(<ExportButton setId="set-1" setTitle="Biology" />)

    const btn = screen.getByRole('button', { name: /Export JSON/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('title', 'Export this set and all its cards as JSON')
  })
})
