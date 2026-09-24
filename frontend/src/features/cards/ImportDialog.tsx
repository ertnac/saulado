import type { ReactElement } from 'react'
import { PasteToCardsDialog, type PasteToCardsDialogProps } from './import/PasteToCardsDialog'

export {
  PasteToCardsDialog as ImportDialog,
  type PasteToCardsDialogProps as ImportDialogProps,
  PasteToCardsDialog as FileImportDialog,
  type PasteToCardsDialogProps as FileImportDialogProps,
}

export default function ImportDialogDefault(props: PasteToCardsDialogProps): ReactElement {
  return <PasteToCardsDialog {...props} />
}
