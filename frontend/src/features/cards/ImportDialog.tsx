import type { ReactElement } from 'react'
import { FileImportDialog, type FileImportDialogProps } from './import/FileImportDialog'

export { FileImportDialog as ImportDialog, type FileImportDialogProps as ImportDialogProps }
export { FileImportDialog }

export default function ImportDialogDefault(props: FileImportDialogProps): ReactElement {
  return <FileImportDialog {...props} />
}
