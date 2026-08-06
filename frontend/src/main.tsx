import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TextHighlighter } from './spike/TextHighlighter'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

// The Phase 1.4 spike hangs off a hash so it is reachable on a phone without
// pulling React Router forward from Phase 2. Delete both this branch and
// src/spike/ once docs/adr/0001-editor.md records the decision.
const isSpike = window.location.hash === '#spike'

createRoot(rootElement).render(<StrictMode>{isSpike ? <TextHighlighter /> : <App />}</StrictMode>)
