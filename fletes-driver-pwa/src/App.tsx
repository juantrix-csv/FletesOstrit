import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import DriverHome from './pages/DriverHome';
import JobWorkflow from './pages/JobWorkflow';
import AdminJobs from './pages/AdminJobs';
export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DriverHome />} />
          <Route path="/job/:id" element={<JobWorkflow />} />
          <Route path="/admin" element={<AdminJobs />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}