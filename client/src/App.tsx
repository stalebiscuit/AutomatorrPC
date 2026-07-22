import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { queryClient } from './lib/queryClient.js';
import { ComparePage } from './pages/ComparePage.js';
import { AdminLogin } from './pages/AdminLogin.js';
import { AdminDashboard } from './pages/AdminDashboard.js';
import { AllowedDomainsPage } from './pages/AllowedDomainsPage.js';
import { AdminUsersPage } from './pages/AdminUsersPage.js';
import { AdminFeedbackPage } from './pages/AdminFeedbackPage.js';
import { PcBuilder } from './pages/PcBuilder.js';
import { LegalPage } from './pages/LegalPage.js';
import { AboutPage } from './pages/AboutPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ConsentModal } from './components/ConsentModal.js';
import { FeedbackHost } from './components/FeedbackModal.js';
import { AdminAuthProvider, AuthGate } from './lib/adminAuth.js';
import './styles/app.css';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ComparePage />} />
          <Route path="/compare/:category/:pair" element={<ComparePage />} />
          <Route path="/pc-builder" element={<PcBuilder />} />
          <Route path="/pc-builder/:shortId" element={<PcBuilder />} />
          <Route path="/legal/:doc" element={<LegalPage />} />
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/about" element={<AboutPage />} />

          {/* Admin area — one AdminAuthProvider wraps every /admin route (incl. login,
              which reads the auth context) via the layout route's <Outlet />. */}
          <Route
            path="/admin"
            element={
              <AdminAuthProvider>
                <Outlet />
              </AdminAuthProvider>
            }
          >
            <Route path="login" element={<AdminLogin />} />
            <Route
              index
              element={
                <AuthGate>
                  <AdminDashboard />
                </AuthGate>
              }
            />
            <Route
              path="domains"
              element={
                <AuthGate requireSuperadmin>
                  <AllowedDomainsPage />
                </AuthGate>
              }
            />
            <Route
              path="users"
              element={
                <AuthGate requireSuperadmin>
                  <AdminUsersPage />
                </AuthGate>
              }
            />
            <Route
              path="feedback"
              element={
                <AuthGate>
                  <AdminFeedbackPage />
                </AuthGate>
              }
            />
          </Route>

          {/* Catch-all 404 (review fix) — unknown URLs used to render blank. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        {/* Global chrome: first-visit terms acknowledgement + feedback modal. */}
        <ConsentModal />
        <FeedbackHost />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
