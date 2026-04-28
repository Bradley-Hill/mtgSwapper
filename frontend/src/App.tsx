import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context';
import { ProtectedRoute } from '@/components';
import { LoginPage, RegisterPage, CollectionPage } from '@/pages';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes — accessible without authentication */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/*
          Protected routes — ProtectedRoute renders <Outlet /> if logged in,
          or <Navigate to="/login" replace /> if not.
          Any route nested here requires authentication.
        */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<CollectionPage />} />
        </Route>

        {/* Catch-all: unknown paths go to home (which re-applies the auth check) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
