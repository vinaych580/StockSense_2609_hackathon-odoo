import { Navigate, Route, Routes, useLocation } from 'react-router';
import { loginPath, useAuth } from './auth/AuthProvider';
import { Mark, Shell } from './components/Shell';
import { TYPE_META, TYPES } from './lib/domain';
import { LoginPage, ResetPage, SignupPage } from './pages/AuthPages';
import { FloorPage } from './pages/FloorPage';
import { ContactsPage, WarehousesPage } from './pages/MasterPages';
import { MovesPage } from './pages/MovesPage';
import { OperationDetailPage, OperationFormPage, OperationListPage } from './pages/OperationPages';
import { ProductRecordPage, StockTrayPage } from './pages/StockPages';
import { TeamPage } from './pages/TeamPages';

function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center" role="status" aria-label="Loading">
        <Mark className="size-10 animate-pulse" />
      </div>
    );
  if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return <Shell />;
}

function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'MANAGER' ? children : <Navigate to="/" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<FloorPage />} />
        <Route path="stock" element={<StockTrayPage />} />
        <Route path="stock/:productId" element={<ProductRecordPage />} />
        <Route path="ledger" element={<MovesPage />} />
        <Route path="moves" element={<Navigate to="/ledger" replace />} />
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="team" element={<ManagerOnly><TeamPage /></ManagerOnly>} />
        {TYPES.map((t) => (
          <Route key={t} path={TYPE_META[t].path}>
            <Route index element={<OperationListPage key={t} type={t} />} />
            <Route path="new" element={<OperationFormPage key={`${t}-new`} type={t} />} />
            <Route path=":id" element={<OperationDetailPage />} />
            <Route path=":id/edit" element={<OperationFormPage key={`${t}-edit`} type={t} />} />
          </Route>
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
