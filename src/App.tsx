import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import { Toaster } from '@/components/ui/sonner';
import HomePage from './pages/HomePage';
import CharterPage from './pages/CharterPage';
import ContactPage from './pages/ContactPage';
import MapPage from './pages/MapPage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import AuthConfirmPage from './pages/AuthConfirmPage';
import AuthErrorPage from './pages/AuthErrorPage';
import LogoutPage from './pages/LogoutPage';
import UsersPage from './pages/UsersPage';
import PendingApprovalPage from './pages/PendingApprovalPage';
import RequireAdmin from './components/RequireAdmin';

function App() {
  const location = useLocation();
  const isMapPage = location.pathname === '/map';

  return (
    <>
      <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900">
        <main className="flex-1 flex flex-col">
          <Header />
          <div className="flex flex-col flex-1">
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/charter" element={<CharterPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/sign-up" element={<SignUpPage />} />
                <Route
                  path="/forgot-password"
                  element={<ForgotPasswordPage />}
                />
                <Route
                  path="/update-password"
                  element={<UpdatePasswordPage />}
                />
                <Route path="/auth/confirm" element={<AuthConfirmPage />} />
                <Route path="/auth/error" element={<AuthErrorPage />} />
                <Route path="/logout" element={<LogoutPage />} />
                <Route
                  path="/pending-approval"
                  element={<PendingApprovalPage />}
                />
                <Route
                  path="/users"
                  element={
                    <RequireAdmin>
                      <UsersPage />
                    </RequireAdmin>
                  }
                />
              </Routes>
            </div>
            {isMapPage ? (
              <div className="bg-slate-800 text-slate-300 py-2 px-4 text-center text-xs">
                © 2026 Ladysmith Trail Stewards. All rights reserved.
              </div>
            ) : (
              <Footer />
            )}
          </div>
        </main>
      </div>
      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default App;
