import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout, RequireAuth } from "./components/Layout";
import { MediaProvider } from "./hooks/media";
import { AuthProvider } from "./lib/auth";
import Analysis from "./pages/Analysis";
import AuthPage from "./pages/AuthPage";
import Configure from "./pages/Configure";
import Dashboard from "./pages/Dashboard";
import DeviceCheck from "./pages/DeviceCheck";
import History from "./pages/History";
import InterviewRoom from "./pages/InterviewRoom";
import Landing from "./pages/Landing";
import { JobUpload, ResumeUpload } from "./pages/NewInterview";
import Report from "./pages/Report";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <AuthProvider>
      <MediaProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />
              <Route element={<RequireAuth />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/new" element={<ResumeUpload />} />
                <Route path="/new/job" element={<JobUpload />} />
                <Route path="/analysis/:id" element={<Analysis />} />
                <Route path="/analysis/:id/configure" element={<Configure />} />
                <Route path="/interviews/:id/check" element={<DeviceCheck />} />
                <Route path="/interviews/:id/report" element={<Report />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
            <Route element={<RequireAuth />}>
              <Route path="/interviews/:id/room" element={<main className="mx-auto max-w-6xl px-4 py-5"><InterviewRoom /></main>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </MediaProvider>
    </AuthProvider>
  );
}
