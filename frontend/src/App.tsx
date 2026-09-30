import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import DashboardLayout from './components/DashboardLayout';
import ScheduledEmails from './pages/ScheduledEmails';
import SentEmails from './pages/SentEmails';
import ComposeEmail from './pages/ComposeEmail';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/scheduled" replace />} />
            <Route path="scheduled" element={<ScheduledEmails />} />
            <Route path="sent" element={<SentEmails />} />
            <Route path="dashboard" element={<Navigate to="/scheduled" replace />} />
          </Route>
          <Route path="/compose" element={
            <ProtectedRoute>
              <ComposeEmail />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
