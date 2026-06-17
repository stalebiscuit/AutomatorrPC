import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { queryClient } from './lib/queryClient.js';
import { ComparePage } from './pages/ComparePage.js';
import { AdminLogin } from './pages/AdminLogin.js';
import { AdminDashboard } from './pages/AdminDashboard.js';
import './styles/app.css';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ComparePage />} />
          <Route path="/compare/:category/:pair" element={<ComparePage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
