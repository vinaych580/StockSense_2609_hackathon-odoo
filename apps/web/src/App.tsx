import { Navigate, Route, Routes } from 'react-router';

import { RequireAuth } from '@/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { OperationDetailPlaceholder } from '@/pages/operations/OperationDetailPlaceholder';
import { OperationListPage } from '@/pages/operations/OperationListPage';
import { OPERATION_TYPE_INFO } from '@/pages/operations/operationTypes';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { SignupPage } from '@/pages/SignupPage';
import { ForbiddenPage, NotFoundPage } from '@/pages/StatusPage';

// Pages later tasks replace. `task` is the task-list id that builds each one.
const PLACEHOLDERS = [
  { path: '/dashboard', title: 'Dashboard', task: 'C10' },
  { path: '/stock', title: 'Stock', task: 'D2' },
  { path: '/products', title: 'Products', task: 'D4' },
  { path: '/moves', title: 'Move History', task: 'C10' },
  { path: '/settings', title: 'Settings', task: 'D5' },
];

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/operations" element={<Navigate to="/operations/receipts" replace />} />
          {OPERATION_TYPE_INFO.map((info) => (
            <Route key={info.slug} path={`/operations/${info.slug}`} element={<OperationListPage key={info.type} type={info.type} />} />
          ))}
          <Route path="/operations/:slug/new" element={<OperationDetailPlaceholder isNew />} />
          <Route path="/operations/:slug/:id" element={<OperationDetailPlaceholder />} />
          {PLACEHOLDERS.map((p) => (
            <Route key={p.path} path={p.path} element={<PlaceholderPage title={p.title} task={p.task} />} />
          ))}
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
