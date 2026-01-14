import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const API_BASE_URL = 'http://127.0.0.1:8000';

// Define the shape of the context we'll pass down
export interface ChatContextType {
  chatLog: any[];
  setChatLog: React.Dispatch<React.SetStateAction<any[]>>;
  threadId: string | null;
  setThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  conversationId: number | null;
  setConversationId: React.Dispatch<React.SetStateAction<number | null>>;
}

interface DevAccount {
  id: number;
  username: string;
  full_name: string;
  account_type: 'student' | 'teacher';
}

interface CurrentUser {
  username: string;
  full_name: string;
  email: string;
  account_type: 'student' | 'teacher';
  account_active: boolean;
}

const AuthModal = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onLogin,
  onRegister
}: {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  onLogin: (u: string, p: string, r: boolean) => void;
  onRegister: (f: FormData) => void;
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const modalRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.showModal();
      setMode(initialMode);
    } else if (!isOpen && modalRef.current) {
      modalRef.current.close();
    }
  }, [isOpen, initialMode]);

  const toggleMode = () => setMode(mode === 'login' ? 'register' : 'login');

  return (
    <dialog ref={modalRef} className="modal">
      <div className="modal-box max-w-md">
        {/* Cleaner Header - Removed heavy background color */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">{mode === 'login' ? '🔐' : '🚀'}</div>
          <h3 className="font-bold text-2xl mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h3>
          <p className="text-sm text-gray-500">
            {mode === 'login' ? 'Enter your details to access your account' : 'Start your learning adventure today'}
          </p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const u = (form.elements.namedItem('username') as HTMLInputElement).value;
            const p = (form.elements.namedItem('password') as HTMLInputElement).value;
            const r = (form.elements.namedItem('rememberMe') as HTMLInputElement).checked;
            onLogin(u, p, r);
          }} className="flex flex-col gap-3">
            <input type="text" name="username" placeholder="Username" className="input input-bordered" required />
            <input type="password" name="password" placeholder="Password" className="input input-bordered" required />
            <label className="label cursor-pointer justify-start gap-2">
              <input type="checkbox" name="rememberMe" className="checkbox checkbox-sm" />
              <span className="label-text">Keep me logged in</span>
            </label>
            <button type="submit" className="btn btn-primary">Sign In</button>
          </form>
        ) : (
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            onRegister(formData);
          }} className="flex flex-col gap-3">
            <input type="text" name="username" placeholder="Username" className="input input-bordered" required />
            <input type="text" name="full_name" placeholder="Full Name" className="input input-bordered" required />
            <input type="email" name="email" placeholder="Email" className="input input-bordered" required />
            <input type="password" name="password" placeholder="Password" className="input input-bordered" required />
            <select name="account_type" className="select select-bordered" required>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
            <button type="submit" className="btn btn-primary">Create Account</button>
          </form>
        )}

        {/* Clean Toggle Section */}
        <div className="text-center mt-4">
          {mode === 'login' ? (
            <p className="text-sm">
              New here? <button onClick={toggleMode} className="link link-primary">Create an account</button>
            </p>
          ) : (
            <p className="text-sm">
              Already have an account? <button onClick={toggleMode} className="link link-primary">Log in</button>
            </p>
          )}
        </div>

        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
};

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = location.pathname === '/teacher' ? 'teacher' : 'student';

  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('access_token') || !!sessionStorage.getItem('access_token')
  );

  // Single Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [devAccounts, setDevAccounts] = useState<DevAccount[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Persistent Chat State
  const [chatLog, setChatLog] = useState<any[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);

  const fetchCurrentUser = async () => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/accounts/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
      } else {
        // Token invalid, clear it
        localStorage.removeItem('access_token');
        sessionStorage.removeItem('access_token');
        setIsLoggedIn(false);
        setCurrentUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch current user:', error);
    }
  };

  useEffect(() => {
    fetchDevAccounts();
    if (isLoggedIn) {
      fetchCurrentUser();
    }
  }, [isLoggedIn]);

  const fetchDevAccounts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/accounts/dev/all`);
      if (response.ok) {
        const data = await response.json();
        setDevAccounts(data.accounts);
      }
    } catch (error) {
      console.error('Failed to fetch dev accounts:', error);
    }
  };

  const openLogin = () => {
    setAuthMode('login');
    setAuthModalOpen(true);
  };

  const openRegister = () => {
    setAuthMode('register');
    setAuthModalOpen(true);
  };

  const handleDevSwitch = async (username: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/accounts/dev/switch/${username}`, {
        method: 'POST',
      });

      if (response.ok) {
        const token = await response.json();
        localStorage.setItem('access_token', token.access_token);
        sessionStorage.removeItem('access_token');
        setIsLoggedIn(true);
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to switch account:', error);
    }
  };

  const handleLogin = async (username: string, password: string, rememberMe: boolean) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/accounts/signin/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }),
      });

      if (response.ok) {
        const token = await response.json();
        if (rememberMe) {
          localStorage.setItem('access_token', token.access_token);
        } else {
          sessionStorage.setItem('access_token', token.access_token);
        }
        setIsLoggedIn(true);
        setAuthModalOpen(false); // Close modal
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Login failed' }));
        alert('Login failed: ' + (errorData.detail || 'Invalid credentials'));
      }
    } catch (error) {
      alert('Login error: Server unreachable or network issue.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (formData: FormData) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.get('username'),
          full_name: formData.get('full_name'),
          email: formData.get('email'),
          password: formData.get('password'),
          account_type: formData.get('account_type'),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Switch to login mode automatically after success
        setAuthMode('login');
        alert(result.message || 'Registration successful! Please login.');
      } else {
        try {
          const error = await response.json();
          alert('Registration failed: ' + (error.detail || 'Unknown error'));
        } catch {
          alert('Registration failed: Server error');
        }
      }
    } catch (error) {
      alert('Registration error: Server unreachable.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    sessionStorage.removeItem('access_token');
    setIsLoggedIn(false);
    setCurrentUser(null);
    // Clear chat state
    setChatLog([]);
    setThreadId(null);
    setConversationId(null);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="navbar bg-base-200 shadow-lg px-4">
        <div className="flex-1">
          <span className="text-xl font-bold">📚 StoryTeller AI</span>
        </div>

        <div className="flex-none gap-2">
          {/* Role Indicator Badge */}
          {isLoggedIn && currentUser && (
            <div className="badge badge-primary badge-lg">
              {currentUser.account_type === 'teacher' ? 'T' : 'S'}
            </div>
          )}

          {/* Custom Toggle Switch */}
          <div className="join">
            <button
              className={`btn join-item btn-sm ${currentTab === 'teacher' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => navigate('/teacher')}
            >
              👨‍🏫 Teacher
            </button>
            <button
              className={`btn join-item btn-sm ${currentTab === 'student' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => navigate('/student')}
            >
              👨‍🎓 Student
            </button>
          </div>

          {/* Dev Switcher */}
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-sm btn-circle">
              🛠️
            </label>
            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-200 rounded-box w-64">
              <li className="menu-title">
                <span>DEV TOOLS</span>
              </li>
              <li className="menu-title">
                <span>Quick Switch</span>
              </li>
              {devAccounts.length === 0 ? (
                <li><a className="text-gray-500">No accounts found</a></li>
              ) : (
                devAccounts.map((account) => (
                  <li key={account.id}>
                    <a onClick={() => handleDevSwitch(account.username)} className="flex justify-between items-center py-2">
                      <div>
                        <div className="font-bold">{account.full_name}</div>
                        <div className="text-xs text-gray-500">{account.username}</div>
                      </div>
                      <span className="badge badge-sm">{account.account_type === 'teacher' ? 'Teacher' : 'Student'}</span>
                    </a>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Auth Buttons / User Menu */}
          {isLoggedIn ? (
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-ghost btn-circle avatar placeholder">
                <div className="bg-primary text-primary-content rounded-full w-10">
                  <span className="text-xl">U</span>
                </div>
              </label>
              <ul tabIndex={0} className="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-200 rounded-box w-52">
                <li className="menu-title">
                  <span>{currentUser?.full_name || 'User'}</span>
                </li>
                <li><a>Profile</a></li>
                <li><a>Settings</a></li>
                <li><a onClick={handleLogout}>Logout</a></li>
              </ul>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={openLogin} className="btn btn-ghost btn-sm">
                Log in
              </button>
              <button onClick={openRegister} className="btn btn-primary btn-sm">
                Sign up
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <Outlet context={{ chatLog, setChatLog, threadId, setThreadId, conversationId, setConversationId }} />

      {/* Unified Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    </div>
  );
};

export default App;
