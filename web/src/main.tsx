import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'
import { BrowsePage } from '@/pages/browse'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<BrowsePage />} />
          <Route path="s/:streamId" element={<div>Watch (coming soon)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
