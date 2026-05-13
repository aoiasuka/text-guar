import { Navigate, Route, Routes } from 'react-router-dom';
import { BrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/Layout/AppLayout.js';
import { AuthGuard } from '@/components/Layout/AuthGuard.js';
import { LoginPage } from '@/pages/Login/LoginPage.js';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage.js';
import { ContentListPage } from '@/pages/Content/ContentListPage.js';
import { ContentFormPage } from '@/pages/Content/ContentFormPage.js';
import { ContentDetailPage } from '@/pages/Content/ContentDetailPage.js';
import { SensitiveWordsPage } from '@/pages/SensitiveWords/SensitiveWordsPage.js';
import { ReviewListPage } from '@/pages/Review/ReviewListPage.js';
import { ReviewDetailPage } from '@/pages/Review/ReviewDetailPage.js';
import { ReportsPage } from '@/pages/Reports/ReportsPage.js';
import { LogsPage } from '@/pages/Logs/LogsPage.js';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/contents" element={<ContentListPage />} />
            <Route path="/contents/create" element={<ContentFormPage />} />
            <Route path="/contents/:id/edit" element={<ContentFormPage />} />
            <Route path="/contents/:id" element={<ContentDetailPage />} />
            <Route path="/sensitive-words" element={<SensitiveWordsPage />} />
            <Route path="/review" element={<ReviewListPage />} />
            <Route path="/review/:id" element={<ReviewDetailPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/logs" element={<LogsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
