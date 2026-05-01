import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context";
import { Layout, ProtectedRoute } from "@/components";
import {
  LoginPage,
  RegisterPage,
  CollectionPage,
  SearchPage,
  UserProfilePage,
  OffersPage,
  OfferDetailPage,
  ScanPage,
} from "@/pages";

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
            <Route path="/search" element={<SearchPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/users/:id" element={<UserProfilePage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/offers/:id" element={<OfferDetailPage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
