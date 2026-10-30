import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ChangePasswordPage } from '@/features/auth/pages/ChangePasswordPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RequireAuth } from '@/features/auth/components/RequireAuth';
import { useSession } from '@/features/auth/store/session';
import { ChatPage } from '@/features/chat/pages/ChatPage';
import { DocumentDetailPage } from '@/features/files/pages/DocumentDetailPage';
import { DocumentsPage } from '@/features/files/pages/DocumentsPage';
import { FeedPage } from '@/features/social/pages/FeedPage';
import { GroupPage } from '@/features/social/pages/GroupPage';
import { GroupsPage } from '@/features/social/pages/GroupsPage';
import { NotificationsPage } from '@/features/social/pages/NotificationsPage';
import { ProfilePage } from '@/features/social/pages/ProfilePage';
import { AdminShell, RequireAdmin } from '@/features/admin/components/AdminShell';
import { AuditPage } from '@/features/admin/pages/AuditPage';
import { DashboardPage } from '@/features/admin/pages/DashboardPage';
import { DevicesPage } from '@/features/admin/pages/DevicesPage';
import { DocumentsAdminPage } from '@/features/admin/pages/DocumentsAdminPage';
import { NetworkPage } from '@/features/admin/pages/NetworkPage';
import { SessionsPage } from '@/features/admin/pages/SessionsPage';
import { StructurePage } from '@/features/admin/pages/StructurePage';
import { UsersPage } from '@/features/admin/pages/UsersPage';
import { config } from '@/shared/config';
import { AppShell } from './AppShell';
import { DemoPanel } from './DemoPanel';

export function App() {
  const bootstrap = useSession((s) => s.bootstrap);
  useEffect(() => { bootstrap(); }, [bootstrap]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/cambiar-clave" element={<ChangePasswordPage />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route path="/admin" element={<DashboardPage />} />
              <Route path="/admin/usuarios" element={<UsersPage />} />
              <Route path="/admin/estructura" element={<StructurePage />} />
              <Route path="/admin/documentos" element={<DocumentsAdminPage />} />
              <Route path="/admin/dispositivos" element={<DevicesPage />} />
              <Route path="/admin/sesiones" element={<SessionsPage />} />
              <Route path="/admin/red" element={<NetworkPage />} />
              <Route path="/admin/auditoria" element={<AuditPage />} />
            </Route>
          </Route>
          <Route element={<AppShell />}>
            <Route path="/inicio" element={<FeedPage />} />
            <Route path="/grupos" element={<GroupsPage />} />
            <Route path="/grupos/:id" element={<GroupPage />} />
            <Route path="/documentos" element={<DocumentsPage />} />
            <Route path="/documentos/:id" element={<DocumentDetailPage />} />
            <Route path="/mensajes" element={<ChatPage />} />
            <Route path="/mensajes/:id" element={<ChatPage />} />
            <Route path="/notificaciones" element={<NotificationsPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
      {config.useMocks && <DemoPanel />}
    </>
  );
}
