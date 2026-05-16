import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App.tsx'
import { T_BASE } from './lib/motion'
import { initRangeInputs } from './utils/initRangeInputs'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={T_BASE}>
      <App />
    </MotionConfig>
  </StrictMode>,
)

initRangeInputs()
