import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<div>Browse (coming soon)</div>} />
          <Route path="s/:streamId" element={<div>Watch (coming soon)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
