import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Lock, Rocket, X, BookOpen, GraduationCap, Sparkles } from 'lucide-react';

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
  const [mode, setMode] = useState<'login' | 'register' | 'quick-start'>(initialMode);
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
      <div className="modal-box max-w-md bg-[#FFF8F0] border-2 border-[#8B9D83]/20">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center text-[#8B4F47]">
            {mode === 'login' ? <Lock className="w-12 h-12" /> : <Rocket className="w-12 h-12" />}
          </div>
          <h3 className="font-bold text-2xl text-[#4A4A4A] mb-2">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h3>
          <p className="text-sm text-[#4A4A4A]/70">
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
            <input
              type="text"
              name="username"
              placeholder="Username"
              className="input input-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A] placeholder:text-[#4A4A4A]/50"
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              className="input input-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A] placeholder:text-[#4A4A4A]/50"
              required
            />
            <label className="label cursor-pointer justify-start gap-2">
              <input type="checkbox" name="rememberMe" className="checkbox checkbox-sm border-[#8B9D83]" />
              <span className="label-text text-[#4A4A4A]">Keep me logged in</span>
            </label>
            <button type="submit" className="btn bg-[#8B4F47] hover:bg-[#A0605A] text-white border-none">
              Sign In
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Quick vs Standard Toggle */}
            <div className="flex p-1 bg-[#8B9D83]/10 rounded-lg">
              <button
                className={`flex-1 py-1 text-sm font-medium rounded-md transition-all ${mode === 'quick-start' ? 'bg-white text-[#8B4F47] shadow-sm' : 'text-[#4A4A4A]/60 hover:text-[#4A4A4A]'}`}
                onClick={() => setMode('quick-start')}
              >
                Quick Start
              </button>
              <button
                className={`flex-1 py-1 text-sm font-medium rounded-md transition-all ${mode === 'register' ? 'bg-white text-[#8B4F47] shadow-sm' : 'text-[#4A4A4A]/60 hover:text-[#4A4A4A]'}`}
                onClick={() => setMode('register')}
              >
                Full Register
              </button>
            </div>

            {mode === 'quick-start' ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                // quick start logic: auto-fill dummy data
                const username = formData.get('username') as string;

                const fullFormData = new FormData();
                fullFormData.append('username', username);
                fullFormData.append('full_name', username); // Use username as name
                fullFormData.append('email', `${username}@example.com`);
                fullFormData.append('password', 'password123'); // Default dummy password
                fullFormData.append('account_type', 'student'); // Default to student

                onRegister(fullFormData);
              }} className="flex flex-col gap-3">
                <div className="bg-[#DAA520]/10 p-3 rounded-lg text-xs text-[#A67C4D] flex gap-2">
                  <Sparkles className="w-4 h-4 flex-shrink-0" />
                  <span>Great for testing! Just pick a username.</span>
                </div>
                <input
                  type="text"
                  name="username"
                  placeholder="Choose a Username"
                  className="input input-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A] placeholder:text-[#4A4A4A]/50"
                  required
                />
                <button type="submit" className="btn bg-[#8B4F47] hover:bg-[#A0605A] text-white border-none mt-2">
                  Start Adventure
                </button>
              </form>
            ) : (
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                onRegister(formData);
              }} className="flex flex-col gap-3">
                <input
                  type="text"
                  name="username"
                  placeholder="Username"
                  className="input input-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A] placeholder:text-[#4A4A4A]/50"
                  required
                />
                <input
                  type="text"
                  name="full_name"
                  placeholder="Full Name"
                  className="input input-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A] placeholder:text-[#4A4A4A]/50"
                  required
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  className="input input-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A] placeholder:text-[#4A4A4A]/50"
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  className="input input-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A] placeholder:text-[#4A4A4A]/50"
                  required
                />
                <select
                  name="account_type"
                  className="select select-bordered bg-white border-[#8B9D83]/30 focus:border-[#8B4F47] text-[#4A4A4A]"
                  required
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
                <button type="submit" className="btn bg-[#8B4F47] hover:bg-[#A0605A] text-white border-none">
                  Create Account
                </button>
              </form>
            )}
          </div>
        )}

        {/* Toggle Section */}
        <div className="divider text-[#4A4A4A]/50">or</div>
        {mode === 'login' ? (
          <p className="text-center text-sm text-[#4A4A4A]/70">
            New here? <button onClick={toggleMode} className="text-[#8B4F47] font-semibold hover:underline">Create an account</button>
          </p>
        ) : (
          <p className="text-center text-sm text-[#4A4A4A]/70">
            Already have an account? <button onClick={toggleMode} className="text-[#8B4F47] font-semibold hover:underline">Log in</button>
          </p>
        )}

        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 text-[#4A4A4A]"><X className="w-4 h-4" /></button>
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
  const currentPath = location.pathname;
  const isHomePage = currentPath === '/';

  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('access_token') || !!sessionStorage.getItem('access_token')
  );

  // Single Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [devAccounts, setDevAccounts] = useState<DevAccount[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Teacher viewing as student state
  const [viewingAsStudent, setViewingAsStudent] = useState(false);

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

  // Listen for custom auth modal events from Home page
  useEffect(() => {
    const handleOpenAuth = (e: CustomEvent) => {
      const mode = e.detail as 'login' | 'register';
      setAuthMode(mode);
      setAuthModalOpen(true);
    };

    window.addEventListener('openAuthModal', handleOpenAuth as EventListener);
    return () => window.removeEventListener('openAuthModal', handleOpenAuth as EventListener);
  }, []);

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

        // Fetch user data to determine redirect - same as login flow
        const userResponse = await fetch(`${API_BASE_URL}/accounts/me`, {
          headers: { 'Authorization': `Bearer ${token.access_token}` }
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUser(userData);
          setViewingAsStudent(false); // Reset view mode
          // Clear any existing chat state
          setChatLog([]);
          setThreadId(null);
          setConversationId(null);
          // Redirect based on account type
          navigate(userData.account_type === 'teacher' ? '/teacher' : '/student');
        } else {
          // Fallback: reload page if can't fetch user data
          window.location.reload();
        }
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
        setAuthModalOpen(false);

        // Fetch user data to determine redirect
        const userResponse = await fetch(`${API_BASE_URL}/accounts/me`, {
          headers: { 'Authorization': `Bearer ${token.access_token}` }
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUser(userData);
          // Redirect based on account type
          navigate(userData.account_type === 'teacher' ? '/teacher' : '/student');
        }
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
        // Switch to login mode automatically after success
        // If it was a quick start (using default password), verify and auto-login
        const wasQuickStart = formData.get('password') === 'password123';
        if (wasQuickStart) {
          await handleLogin(
            formData.get('username') as string,
            'password123',
            true // Remember me
          );
        } else {
          setAuthMode('login');
          alert(result.message || 'Registration successful! Please login.');
        }
      } else {
        try {
          // If user already exists and it was a quick start, try logging in
          const error = await response.json();
          if (formData.get('password') === 'password123' && error.detail?.includes('already exists')) {
            await handleLogin(
              formData.get('username') as string,
              'password123',
              true
            );
            return;
          }
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
    setViewingAsStudent(false);
    // Clear chat state
    setChatLog([]);
    setThreadId(null);
    setConversationId(null);
    navigate('/');
  };

  // Determine what to show based on viewing mode
  const effectiveAccountType = viewingAsStudent && currentUser?.account_type === 'teacher'
    ? 'student'
    : currentUser?.account_type;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F1E8] to-[#E8DFD0]">
      {/* Header - Only show on student/teacher pages when logged in */}
      {!isHomePage && (
        <header className="bg-white/60 backdrop-blur-md shadow-sm border-b border-[#8B9D83]/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div><img
                  src="/logo.png"
                  alt="Storyteller AI Logo"
                  className="w-12 h-12 rounded-3x1 shadow-2xl border-3 border-white"
                /></div>
                <span className="text-xl font-bold text-[#4A4A4A]">StoryTeller AI</span>
                {/* Role Badge */}
                {isLoggedIn && currentUser && (
                  <span className={`ml-3 px-3 py-1 rounded-full text-xs font-semibold ${effectiveAccountType === 'teacher'
                    ? 'bg-[#A67C4D]/20 text-[#A67C4D]'
                    : 'bg-[#6B9FA3]/20 text-[#6B9FA3]'
                    }`}>
                    {effectiveAccountType === 'teacher' ? <><GraduationCap className="w-4 h-4 inline mr-1" /> Teacher</> : <><BookOpen className="w-4 h-4 inline mr-1 text-[#8B4F47]" /> Student</>}
                  </span>
                )}
              </div>

              {/* Right side controls */}
              <div className="flex items-center gap-4">
                {/* Teacher: Student View Toggle */}
                {isLoggedIn && currentUser?.account_type === 'teacher' && (
                  <div className="flex items-center gap-2 bg-[#8B9D83]/10 px-3 py-2 rounded-lg border border-[#8B9D83]/20">
                    <span className="text-sm text-[#4A4A4A] font-medium">View as:</span>
                    <button
                      onClick={() => {
                        setViewingAsStudent(false);
                        navigate('/teacher');
                      }}
                      className={`px-3 py-1 rounded text-sm font-medium transition-all ${!viewingAsStudent
                        ? 'bg-[#A67C4D] text-white shadow-sm'
                        : 'text-[#4A4A4A] hover:bg-white/50'
                        }`}
                    >
                      Teacher
                    </button>
                    <button
                      onClick={() => {
                        setViewingAsStudent(true);
                        navigate('/student');
                      }}
                      className={`px-3 py-1 rounded text-sm font-medium transition-all ${viewingAsStudent
                        ? 'bg-[#6B9FA3] text-white shadow-sm'
                        : 'text-[#4A4A4A] hover:bg-white/50'
                        }`}
                    >
                      Student
                    </button>
                  </div>
                )}

                {/* Dev Switcher */}
                <div className="dropdown dropdown-end">
                  <label tabIndex={0} className="btn btn-sm bg-[#DAA520]/20 border-[#DAA520]/40 hover:bg-[#DAA520]/30 text-[#4A4A4A]">
                    DEV TOOLS
                  </label>
                  <div tabIndex={0} className="dropdown-content z-[1] menu p-3 shadow-xl bg-white rounded-lg w-64 mt-2 border border-[#8B9D83]/20">
                    <div className="text-xs font-semibold text-[#4A4A4A]/70 mb-2 px-2">Quick Switch</div>
                    {devAccounts.length === 0 ? (
                      <div className="text-sm text-[#4A4A4A]/50 p-2">No accounts found</div>
                    ) : (
                      devAccounts.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => handleDevSwitch(account.username)}
                          className="flex justify-between items-center py-2 px-2 hover:bg-[#8B9D83]/10 rounded transition"
                        >
                          <div className="text-left">
                            <div className="font-semibold text-[#4A4A4A] text-sm">{account.full_name}</div>
                            <div className="text-xs text-[#4A4A4A]/60">@{account.username}</div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${account.account_type === 'teacher'
                            ? 'bg-[#A67C4D]/20 text-[#A67C4D]'
                            : 'bg-[#6B9FA3]/20 text-[#6B9FA3]'
                            }`}>
                            {account.account_type === 'teacher' ? 'Teacher' : 'Student'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* User Menu */}
                {isLoggedIn ? (
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-circle bg-[#8B4F47] hover:bg-[#A0605A] text-white border-none">
                      {currentUser?.full_name?.[0] || 'U'}
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-xl bg-white rounded-lg w-52 mt-2 border border-[#8B9D83]/20">
                      <li className="menu-title text-[#4A4A4A]/70">
                        <span>{currentUser?.full_name}</span>
                      </li>
                      <li><a className="text-[#4A4A4A] hover:bg-[#8B9D83]/10">Profile</a></li>
                      <li><a className="text-[#4A4A4A] hover:bg-[#8B9D83]/10">Settings</a></li>
                      <li><a onClick={handleLogout} className="text-[#8B4F47] hover:bg-[#8B4F47]/10">Logout</a></li>
                    </ul>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={openLogin} className="btn btn-sm bg-white text-[#8B4F47] border-[#8B4F47] hover:bg-[#8B4F47] hover:text-white">
                      Log in
                    </button>
                    <button onClick={openRegister} className="btn btn-sm bg-[#8B4F47] text-white border-none hover:bg-[#A0605A]">
                      Sign up
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main>
        <Outlet context={{ chatLog, setChatLog, threadId, setThreadId, conversationId, setConversationId }} />
      </main>

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