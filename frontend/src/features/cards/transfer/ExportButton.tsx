import { useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { DownloadIcon } from '@/components/ui/icons'
import { downloadJsonFile, exportSingleSetAsJson } from '@/services/transfer/json-export'

export interface ExportButtonProps {
  setId: string
  setTitle: string
  className?: string
}

export function ExportButton({ setId, setTitle, className }: ExportButtonProps): ReactElement {
  const [exporting, setExporting] = useState(false)

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    try {
      const json = await exportSingleSetAsJson(setId)
      const cleanTitle = setTitle.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
      downloadJsonFile(`${cleanTitle}_export.json`, json)
    } catch (err) {
      console.error('Failed to export set:', err)
      alert('Could not export this set. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={exporting}
      onClick={() => {
        void handleExport()
      }}
      className={className}
      title="Export this set and all its cards as JSON"
    >
      <DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
      {exporting ? 'Exporting…' : 'Export JSON'}
    </Button>
  )
}
