import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import TasksPage from './pages/TasksPage';
import TaskDetailPage from './pages/TaskDetailPage';
import OrganizationsPage from './pages/OrganizationsPage';
import OrganizationDetailPage from './pages/OrganizationDetailPage';
import MembersPage from './pages/MembersPage';
import InvitePage from './pages/InvitePage';
import WorkCalendarPage from './pages/WorkCalendarPage';
import ResourcesPage from './pages/ResourcesPage';
import ResourceDetailPage from './pages/ResourceDetailPage';
import GanttPage from './pages/GanttPage';
import PertPage from './pages/PertPage';
import CriticalPathPage from './pages/CriticalPathPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat sesi...</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/acara"
        element={
          <ProtectedRoute>
            <Layout>
              <EventsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/acara/:eventId"
        element={
          <ProtectedRoute>
            <Layout>
              <EventDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tugas"
        element={
          <ProtectedRoute>
            <Layout>
              <TasksPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tugas/:taskId"
        element={
          <ProtectedRoute>
            <Layout>
              <TaskDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/organisasi"
        element={
          <ProtectedRoute>
            <Layout>
              <OrganizationsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/organisasi/:orgId"
        element={
          <ProtectedRoute>
            <Layout>
              <OrganizationDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/organisasi/:orgId/anggota"
        element={
          <ProtectedRoute>
            <Layout>
              <MembersPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/organisasi/:orgId/undangan"
        element={
          <ProtectedRoute>
            <Layout>
              <InvitePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/kalender"
        element={
          <ProtectedRoute>
            <Layout>
              <WorkCalendarPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sumber-daya"
        element={
          <ProtectedRoute>
            <Layout>
              <ResourcesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sumber-daya/:resourceId"
        element={
          <ProtectedRoute>
            <Layout>
              <ResourceDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/gantt/:eventId"
        element={
          <ProtectedRoute>
            <Layout>
              <GanttPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pert/:eventId"
        element={
          <ProtectedRoute>
            <Layout>
              <PertPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jalur-kritis/:eventId"
        element={
          <ProtectedRoute>
            <Layout>
              <CriticalPathPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analitik"
        element={
          <ProtectedRoute>
            <Layout>
              <AnalyticsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profil"
        element={
          <ProtectedRoute>
            <Layout>
              <ProfilePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pengaturan"
        element={
          <ProtectedRoute>
            <Layout>
              <SettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
