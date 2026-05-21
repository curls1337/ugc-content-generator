import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppShell from './components/AppShell';
import ScrapePage from './pages/ScrapePage';
import SelectImagesPage from './pages/SelectImagesPage';
import CharacterPage from './pages/CharacterPage';
import GeneratePage from './pages/GeneratePage';
import GalleryPage from './pages/GalleryPage';
import SettingsPage from './pages/SettingsPage';
import LogPanel from './components/LogPanel';
import { useJobPoller } from './hooks/useJobPoller';

export default function App() {
  useJobPoller();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ScrapePage />} />
          <Route path="/select" element={<SelectImagesPage />} />
          <Route path="/character" element={<CharacterPage />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <LogPanel />
    </BrowserRouter>
  );
}
