import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '../App';
import Home from '../pages/Home';
import Student from '../pages/Student';
import Teacher from '../pages/Teacher';

// Protected Route wrapper component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = !!localStorage.getItem('access_token') || !!sessionStorage.getItem('access_token');
  
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'student',
        element: (
          <ProtectedRoute>
            <Student />
          </ProtectedRoute>
        ),
      },
      {
        path: 'teacher',
        element: (
          <ProtectedRoute>
            <Teacher />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
