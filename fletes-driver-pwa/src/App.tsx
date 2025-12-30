import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import DriverHome from './pages/DriverHome';
import JobWorkflow from './pages/JobWorkflow';
import AdminJobs from './pages/AdminJobs';
import DriverLogin from './pages/DriverLogin';
export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/driver" replace />} />
          <Route path="/driver" element={<DriverHome />} />
          <Route path="/driver/login" element={<DriverLogin />} />
          <Route path="/job/:id" element={<JobWorkflow />} />
          <Route path="/admin" element={<AdminJobs />} />
          <Route path="/admin/:section" element={<AdminJobs />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
