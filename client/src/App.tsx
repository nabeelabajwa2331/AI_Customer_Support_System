import { Compass } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider, STAFF_ROLES, useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { EmptyState } from './components/Feedback';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { AssistantPage } from './pages/AssistantPage';
import { homePathFor } from './lib/routes';
import { KnowledgePage } from './pages/KnowledgePage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { ThemeProvider } from './theme/ThemeContext';

/** "/app" goes to the right workspace for the signed-in role. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      action={
        <Link to="/app" className="button button-secondary">
          Go to dashboard
        </Link>
      }
    >
      This page does not exist or you don't have access to it.
    </EmptyState>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="app" element={<HomeRedirect />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="overview"
          element={
            <RequireAuth roles={STAFF_ROLES}>
              <OverviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="knowledge"
          element={
            <RequireAuth roles={STAFF_ROLES}>
              <KnowledgePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

/** Everything except the router, so tests can supply a MemoryRouter. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}
