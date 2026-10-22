import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SearchProvider } from '@/components/search/SearchProvider';
import { HomePage } from '@/pages/HomePage';
import { ToolsPage } from '@/pages/ToolsPage';
import { CategoryPage } from '@/pages/CategoryPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { RecentPage } from '@/pages/RecentPage';
import { AboutPage } from '@/pages/AboutPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ToolPage } from '@/pages/ToolPage';

export function App() {
  return (
    <SearchProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="tools/:toolId" element={<ToolPage />} />
          <Route path="category/:categoryId" element={<CategoryPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="recent" element={<RecentPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SearchProvider>
  );
}
