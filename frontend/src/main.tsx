import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { App } from './App'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    {/*
      Reduced motion, for the half of the app's animation the stylesheet cannot
      reach. The `prefers-reduced-motion` block in index.css flattens CSS
      transitions and keyframes, which is all CSS can do — framer-motion animates
      in JavaScript and ignores it entirely, so the page transition and every
      `whileTap` kept moving for a user who had asked for stillness.

      `"user"` follows the OS setting and drops transform and layout animation
      while keeping opacity, so nothing ends up invisible.

      Here rather than in `AppShell`: landing and auth render outside the shell
      and animate more than anything inside it does.
    */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
