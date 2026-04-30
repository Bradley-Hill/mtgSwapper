import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context';
import { Layout, ProtectedRoute } from '@/components';
import { LoginPage, RegisterPage, CollectionPage } from '@/pages';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes — no NavBar */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/*
          Protected routes — ProtectedRoute checks auth, then Layout
          renders NavBar + <Outlet /> so all child pages share the nav.
        */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<CollectionPage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
