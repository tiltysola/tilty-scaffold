import { Route, Routes } from 'react-router-dom';

import { SystemPermission } from '@tilty/shared/access-control';

import DashboardPage from '@/pages/Dashboard';
import ForgotPasswordPage from '@/pages/ForgotPassword';
import LoginPage from '@/pages/Login';
import NotFoundPage from '@/pages/NotFound';
import RegisterPage from '@/pages/Register';
import SetupPage from '@/pages/Setup';
import UsersPage from '@/pages/Users';
import Layout from '@/components/Layout';
import RequireAuth from '@/components/RequireAuth';
import RequirePermission from '@/components/RequirePermission';

const Index = () => {
  return (
    <Routes>
      <Route path="setup" element={<SetupPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route element={<RequirePermission permission={SystemPermission.UserList} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="login" element={<LoginPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default Index;
