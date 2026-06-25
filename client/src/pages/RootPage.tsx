import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import LandingPage from './LandingPage';
import StatusPage from './StatusPage';
import { isDesktopApp, isCapacitorApp } from '../lib/platform';

export default function RootPage() {
  const token = useAuthStore(state => state.token);
  const isDesktop = isDesktopApp();
  const isCapacitor = isCapacitorApp();

  if (typeof window !== 'undefined' && window.location.hostname === 'api.softspace.cc') {
    return <StatusPage />;
  }

  if (token) {
    return <Navigate to="/app" replace />;
  }

  if (isDesktop || isCapacitor) {
    return <Navigate to="/auth" replace />;
  }

  return <LandingPage />;
}

