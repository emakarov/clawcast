import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'
import { BrowsePage } from '@/pages/browse'
import { WatchPage } from '@/pages/watch'
import { HowToPage } from '@/pages/how-to'
import { AboutPage } from '@/pages/about'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<BrowsePage />} />
        <Route path="how-to" element={<HowToPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="watch/:streamId" element={<WatchPage />} />
      </Route>
    </Routes>
  </BrowserRouter>,
)
