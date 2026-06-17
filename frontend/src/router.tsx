import { Route, Routes } from 'react-router-dom';

import DashboardPage from '@/pages/Dashboard';
import ForgotPasswordPage from '@/pages/ForgotPassword';
import LoginPage from '@/pages/Login';
import NotfoundPage from '@/pages/Notfound';
import RegisterPage from '@/pages/Register';
import Layout from '@/components/Layout';
import RequireAuth from '@/components/RequireAuth';

const Router = () => {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>
      </Route>
      <Route path="login" element={<LoginPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="*" element={<NotfoundPage />} />
    </Routes>
  );
};

export default Router;
