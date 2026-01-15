import React, { useState, useEffect } from 'react';
import { BarChart3, FileText, Settings, Users, Calendar, TrendingUp, AlertCircle, Upload, FolderPlus, Tag, Trash2, Eye, EyeOff, CheckCircle, Clock, XCircle, AlertTriangle, FolderOpen, Plus, X, ToggleLeft, ToggleRight, Brain } from 'lucide-react';

// Interfaces
interface File {
  id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  uploaded_at: string;
  is_active: boolean;
  category_id: number | null;
  category_name: string | null;
  backboard_doc_id: string | null;
  backboard_status: string;
  solve_enabled: boolean;
}

interface Category {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface Instruction {
  id: number;
  instruction_name: string;
  instruction_value: string;
  is_active: boolean;
  created_at: string;
}

interface DashboardStats {
  active_students: number;
  sessions_today: number;
  class_accuracy: number;
  students_needing_help: number;
}

interface Student {
  student_id: number;
  username: string;
  full_name: string;
  total_sessions: number;
  accuracy_percent: number;
  last_active: string;
  status: 'good' | 'warning' | 'needs_help';
}

const Teacher: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'files' | 'config'>('dashboard');

  // Dashboard state
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Files state
  const [files, setFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [fileStatusPolling, setFileStatusPolling] = useState<Set<number>>(new Set());

  // Config state
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [instructionsLoading, setInstructionsLoading] = useState(false);
  const [newInstructionName, setNewInstructionName] = useState('');
  const [newInstructionValue, setNewInstructionValue] = useState('');

  // Fetch data on mount and tab change
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardStats();
      fetchStudents();
    } else if (activeTab === 'files') {
      fetchFiles();
      fetchCategories();
    } else if (activeTab === 'config') {
      fetchInstructions();
    }
  }, [activeTab]);

  // Poll file statuses for pending uploads
  useEffect(() => {
    const interval = setInterval(() => {
      fileStatusPolling.forEach(fileId => {
        checkFileStatus(fileId);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [fileStatusPolling]);

  // Insights State
  const [analyzingStudentId, setAnalyzingStudentId] = useState<number | null>(null);
  const [insightData, setInsightData] = useState<any>(null);

  const fetchStudentInsights = async (studentId: number) => {
    setAnalyzingStudentId(studentId);
    setInsightData(null);
    try {
      const response = await fetch(`http://localhost:8000/teacher/dashboard/student/${studentId}/ai-insights`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setInsightData(data);
        const modal = document.getElementById('insights_modal') as HTMLDialogElement;
        if (modal) modal.showModal();
      } else {
        alert("Failed to analyze student data");
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error);
      alert("Error analyzing student data");
    } finally {
      setAnalyzingStudentId(null);
    }
  };

  // Chat History State
  const [viewingChatStudentId, setViewingChatStudentId] = useState<number | null>(null);
  const [studentConversations, setStudentConversations] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);

  const fetchStudentChats = async (studentId: number) => {
    setViewingChatStudentId(studentId);
    setChatLoading(true);
    setStudentConversations([]);
    setSelectedConvId(null);
    try {
      const response = await fetch(`http://localhost:8000/teacher/students/${studentId}/conversations`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Student chats received:', data);
        setStudentConversations(data.conversations || []);
        const modal = document.getElementById('chat_modal') as HTMLDialogElement;
        if (modal) modal.showModal();
      } else {
        alert("Failed to fetch student chats");
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
      alert("Error fetching student chats");
    } finally {
      setChatLoading(false);
    }
  };
  // API calls
  const getToken = () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/teacher/dashboard/stats', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchStudents = async () => {
    setStudentsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/teacher/dashboard/students', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStudents(data.students || []);
      }
    } catch (error) {
      console.error('Failed to fetch students:', error);
    } finally {
      setStudentsLoading(false);
    }
  };

  const fetchFiles = async () => {
    setFilesLoading(true);
    try {
      const response = await fetch('http://localhost:8000/teacher/files', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);

        const pending = data.files.filter((f: File) =>
          f.backboard_status === 'pending' || f.backboard_status === 'processing' || f.backboard_status === 'retrying'
        ).map((f: File) => f.id);
        setFileStatusPolling(new Set(pending));
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setFilesLoading(false);
    }
  };

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const response = await fetch('http://localhost:8000/teacher/categories', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchInstructions = async () => {
    setInstructionsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/teacher/config/instructions', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setInstructions(data.instructions || []);
      }
    } catch (error) {
      console.error('Failed to fetch instructions:', error);
    } finally {
      setInstructionsLoading(false);
    }
  };

  const checkFileStatus = async (fileId: number) => {
    try {
      const response = await fetch(`http://localhost:8000/teacher/files/${fileId}/backboard-status`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();

        setFiles(prev => prev.map(f =>
          f.id === fileId
            ? { ...f, backboard_status: data.status, backboard_doc_id: data.backboard_doc_id }
            : f
        ));

        if (!['pending', 'processing', 'retrying'].includes(data.status)) {
          setFileStatusPolling(prev => {
            const newSet = new Set(prev);
            newSet.delete(fileId);
            return newSet;
          });
        }
      }
    } catch (error) {
      console.error('Failed to check file status:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('http://localhost:8000/teacher/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        await fetchFiles();
        e.target.value = '';
      } else {
        const error = await response.json();
        alert('Upload failed: ' + (error.detail || 'Unknown error'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: Network error');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;

    try {
      const response = await fetch('http://localhost:8000/teacher/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ name: newCategoryName })
      });

      if (response.ok) {
        setNewCategoryName('');
        await fetchCategories();
      } else {
        alert('Failed to create category');
      }
    } catch (error) {
      console.error('Error creating category:', error);
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!confirm('Delete this category? Files will become uncategorized.')) return;

    try {
      const response = await fetch(`http://localhost:8000/teacher/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        await fetchCategories();
        await fetchFiles();
      }
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleMoveToCategory = async (fileId: number, categoryId: number | null) => {
    try {
      const response = await fetch(`http://localhost:8000/teacher/files/${fileId}/category`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ category_id: categoryId })
      });

      if (response.ok) {
        await fetchFiles();
      }
    } catch (error) {
      console.error('Error moving file:', error);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Delete this file permanently?')) return;

    try {
      const response = await fetch(`http://localhost:8000/teacher/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        await fetchFiles();
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const handleToggleActive = async (fileId: number, isActive: boolean) => {
    const endpoint = isActive
      ? `http://localhost:8000/teacher/files/${fileId}/deactivate`
      : `http://localhost:8000/teacher/files/${fileId}/activate`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        await fetchFiles();
      }
    } catch (error) {
      console.error('Error toggling file active:', error);
    }
  };

  const handleToggleSolve = async (fileId: number) => {
    try {
      const response = await fetch(`http://localhost:8000/teacher/files/${fileId}/toggle-solve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        await fetchFiles();
      }
    } catch (error) {
      console.error('Error toggling solve:', error);
    }
  };

  const handleCreateInstruction = async () => {
    if (!newInstructionName.trim() || !newInstructionValue.trim()) return;

    try {
      const response = await fetch('http://localhost:8000/teacher/config/instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          name: newInstructionName,
          value: newInstructionValue
        })
      });

      if (response.ok) {
        setNewInstructionName('');
        setNewInstructionValue('');
        await fetchInstructions();
      }
    } catch (error) {
      console.error('Error creating instruction:', error);
    }
  };

  const handleToggleInstruction = async (instructionId: number) => {
    try {
      const response = await fetch(`http://localhost:8000/teacher/config/instructions/${instructionId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        await fetchInstructions();
      }
    } catch (error) {
      console.error('Error toggling instruction:', error);
    }
  };

  const handleDeleteInstruction = async (instructionId: number) => {
    if (!confirm('Delete this instruction?')) return;

    try {
      const response = await fetch(`http://localhost:8000/teacher/config/instructions/${instructionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (response.ok) {
        await fetchInstructions();
      }
    } catch (error) {
      console.error('Error deleting instruction:', error);
    }
  };

  const renderBackboardStatus = (file: File) => {
    const statusConfig = {
      'processed': { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle, text: 'Ready' },
      'indexed': { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle, text: 'Ready' },
      'pending': { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Clock, text: 'Processing' },
      'processing': { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Clock, text: 'Processing' },
      'retrying': { color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock, text: 'Retrying' },
      'error': { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle, text: 'Error' },
      'conversion_failed': { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle, text: 'Failed' },
      'retry_failed': { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle, text: 'Failed' },
      'not_uploaded': { color: 'text-gray-600', bg: 'bg-gray-100', icon: AlertCircle, text: 'Not uploaded' },
    };

    const config = statusConfig[file.backboard_status as keyof typeof statusConfig] || statusConfig['not_uploaded'];
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
        <Icon size={14} />
        {config.text}
      </span>
    );
  };

  const getFilesForCategory = (categoryId: number) => {
    return files.filter(f => f.category_id === categoryId);
  };

  const getUncategorizedFiles = () => {
    return files.filter(f => f.category_id === null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F1E8] to-[#E8DFD0] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[#4A4A4A] mb-2 flex items-center gap-3">
            <Users className="w-10 h-10 text-[#8B4F47]" />
            Teacher Dashboard
          </h1>
          <p className="text-[#4A4A4A]/70">Manage your classroom, track student progress, and organize learning materials</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-2 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'dashboard'
                ? 'bg-[#8B4F47] text-white shadow-md'
                : 'text-[#4A4A4A] hover:bg-[#8B9D83]/10'
                }`}
            >
              <BarChart3 size={20} />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'files'
                ? 'bg-[#8B4F47] text-white shadow-md'
                : 'text-[#4A4A4A] hover:bg-[#8B9D83]/10'
                }`}
            >
              <FileText size={20} />
              Learning Materials
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'config'
                ? 'bg-[#8B4F47] text-white shadow-md'
                : 'text-[#4A4A4A] hover:bg-[#8B9D83]/10'
                }`}
            >
              <Settings size={20} />
              AI Settings
            </button>
          </div>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Users className="w-8 h-8 text-[#8B4F47]" />
                  <div className="text-right">
                    <p className="text-3xl font-bold text-[#4A4A4A]">
                      {statsLoading ? '...' : stats?.active_students || 0}
                    </p>
                    <p className="text-sm text-[#4A4A4A]/60">Active Students</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Calendar className="w-8 h-8 text-[#8B4F47]" />
                  <div className="text-right">
                    <p className="text-3xl font-bold text-[#4A4A4A]">
                      {statsLoading ? '...' : stats?.sessions_today || 0}
                    </p>
                    <p className="text-sm text-[#4A4A4A]/60">Sessions Today</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-8 h-8 text-[#6B9FA3]" />
                  <div className="text-right">
                    <p className="text-3xl font-bold text-[#6B9FA3]">
                      {statsLoading ? '...' : `${stats?.class_accuracy || 0}%`}
                    </p>
                    <p className="text-sm text-[#4A4A4A]/60">Class Accuracy</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="w-8 h-8 text-[#8B4F47]" />
                  <div className="text-right">
                    <p className="text-3xl font-bold text-[#8B4F47]">
                      {statsLoading ? '...' : stats?.students_needing_help || 0}
                    </p>
                    <p className="text-sm text-[#4A4A4A]/60">Need Help</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Student Performance Table */}
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
              <h2 className="text-2xl font-bold text-[#4A4A4A] mb-4 flex items-center gap-2">
                <Users className="w-6 h-6 text-[#8B4F47]" />
                Student Performance
              </h2>

              {studentsLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-[#8B4F47] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[#4A4A4A]/60 mt-4">Loading student data...</p>
                </div>
              ) : students.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 mx-auto text-[#4A4A4A]/30 mb-4" />
                  <p className="text-[#4A4A4A]/60">No student data yet. Students will appear here once they start learning.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-[#8B9D83]/20">
                        <th className="text-left py-3 px-4 font-semibold text-[#4A4A4A]">Student</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#4A4A4A]">Sessions</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#4A4A4A]">Accuracy</th>
                        <th className="text-left py-3 px-4 font-semibold text-[#4A4A4A]">Last Active</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#4A4A4A]">Status</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#4A4A4A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => (
                        <tr key={student.student_id} className="border-b border-[#8B9D83]/10 hover:bg-[#8B9D83]/5 transition-colors">
                          <td className="py-4 px-4">
                            <div>
                              <div className="font-semibold text-[#4A4A4A]">{student.full_name}</div>
                              <div className="text-sm text-[#4A4A4A]/60">@{student.username}</div>
                            </div>
                          </td>
                          <td className="text-center py-4 px-4 text-[#4A4A4A]">{student.total_sessions}</td>
                          <td className="text-center py-4 px-4">
                            <span className={`font-semibold ${student.accuracy_percent >= 70 ? 'text-green-600' :
                              student.accuracy_percent >= 50 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                              {student.accuracy_percent}%
                            </span>
                          </td>
                          <td className="py-4 px-4 text-[#4A4A4A]/70 text-sm">
                            {student.last_active ? new Date(student.last_active).toLocaleString() : 'Never'}
                          </td>
                          <td className="text-center py-4 px-4">
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${student.status === 'good' ? 'bg-green-100 text-green-700' :
                              student.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                              {student.status === 'good' ? <CheckCircle size={14} /> : student.status === 'warning' ? <Clock size={14} /> : <AlertCircle size={14} />}
                              {student.status === 'good' ? 'Good' : student.status === 'warning' ? 'Fair' : 'Needs Help'}
                            </span>
                          </td>
                          <td className="text-center py-4 px-4">
                            <button
                              onClick={() => fetchStudentInsights(student.student_id)}
                              disabled={analyzingStudentId === student.student_id}
                              className="btn btn-sm btn-ghost text-[#8B4F47] hover:bg-[#8B4F47]/10 gap-2"
                            >
                              {analyzingStudentId === student.student_id ? (
                                <span className="loading loading-spinner loading-xs"></span>
                              ) : (
                                <Brain size={16} />
                              )}
                              Analyze
                            </button>
                            <button
                              onClick={() => fetchStudentChats(student.student_id)}
                              disabled={viewingChatStudentId === student.student_id}
                              className="btn btn-sm btn-ghost text-[#8B9D83] hover:bg-[#8B9D83]/10 gap-2"
                            >
                              {viewingChatStudentId === student.student_id ? (
                                <span className="loading loading-spinner loading-xs"></span>
                              ) : (
                                <Eye size={16} />
                              )}
                              Chats
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
              <h2 className="text-2xl font-bold text-[#4A4A4A] mb-4 flex items-center gap-2">
                <Upload className="w-6 h-6 text-[#8B4F47]" />
                Upload Learning Materials
              </h2>
              <p className="text-[#4A4A4A]/70 mb-4">
                Upload PDFs, documents, or markdown files. They will be processed and made available to students.
              </p>
              <div className="flex gap-3">
                <label className="flex-1">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <div className="w-full px-6 py-4 bg-[#8B4F47] text-white font-semibold rounded-xl hover:bg-[#A0605A] transition-all duration-300 cursor-pointer text-center disabled:opacity-50 shadow-md">
                    {uploading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Uploading...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Upload size={20} />
                        Select Files to Upload
                      </span>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Category Management */}
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
              <h2 className="text-2xl font-bold text-[#4A4A4A] mb-4 flex items-center gap-2">
                <Tag className="w-6 h-6 text-[#8B4F47]" />
                Categories
              </h2>
              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                  placeholder="New category name..."
                  className="flex-1 px-4 py-3 bg-white border-2 border-[#8B9D83]/30 rounded-xl focus:outline-none focus:border-[#8B4F47] text-[#4A4A4A]"
                />
                <button
                  onClick={handleCreateCategory}
                  className="px-6 py-3 bg-[#8B9D83] text-white font-semibold rounded-xl hover:bg-[#6B9FA3] transition-all duration-300 shadow-md flex items-center gap-2"
                >
                  <Plus size={20} />
                  Add Category
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoriesLoading ? (
                  <div className="col-span-full text-center py-8">
                    <div className="inline-block w-6 h-6 border-4 border-[#8B4F47] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : categories.length === 0 ? (
                  <div className="col-span-full text-center py-8 text-[#4A4A4A]/60">
                    No categories yet. Create one above!
                  </div>
                ) : (
                  categories.map((category) => (
                    <div key={category.id} className="bg-white rounded-xl p-4 border-2 border-[#8B9D83]/20 hover:border-[#8B9D83] transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-[#4A4A4A] flex-1">{category.name}</h3>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="text-[#8B4F47] hover:text-red-600 transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <p className="text-sm text-[#4A4A4A]/60">
                        {getFilesForCategory(category.id).length} file(s)
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Files by Category */}
            <div className="space-y-6">
              {categories.map((category) => {
                const categoryFiles = getFilesForCategory(category.id);
                if (categoryFiles.length === 0) return null;

                return (
                  <div key={category.id} className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
                    <h2 className="text-xl font-bold text-[#4A4A4A] mb-4 flex items-center gap-2">
                      <FolderOpen size={20} className="text-[#8B4F47]" />
                      {category.name}
                    </h2>
                    <div className="space-y-3">
                      {categoryFiles.map((file) => (
                        <div key={file.id} className="bg-white rounded-xl p-4 border border-[#8B9D83]/20 hover:shadow-md transition-all">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-[#4A4A4A] truncate">{file.original_filename}</h3>
                                {renderBackboardStatus(file)}
                              </div>
                              <p className="text-sm text-[#4A4A4A]/60">
                                {(file.file_size / 1024).toFixed(2)} KB • {new Date(file.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleActive(file.id, file.is_active)}
                                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1 ${file.is_active
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                              >
                                {file.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                                {file.is_active ? 'Active' : 'Inactive'}
                              </button>
                              <button
                                onClick={() => handleToggleSolve(file.id)}
                                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1 ${file.solve_enabled
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                title={file.solve_enabled ? 'Students can see answers' : 'Answer button disabled'}
                              >
                                {file.solve_enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                Solve
                              </button>
                              <button
                                onClick={() => handleDeleteFile(file.id)}
                                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all font-medium flex items-center gap-1"
                              >
                                <Trash2 size={16} />
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Uncategorized Files */}
              {getUncategorizedFiles().length > 0 && (
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
                  <h2 className="text-xl font-bold text-[#4A4A4A] mb-4 flex items-center gap-2">
                    <FileText size={20} className="text-[#8B4F47]" />
                    Uncategorized Files
                  </h2>
                  <div className="space-y-3">
                    {getUncategorizedFiles().map((file) => (
                      <div key={file.id} className="bg-white rounded-xl p-4 border border-[#8B9D83]/20 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-[#4A4A4A] truncate">{file.original_filename}</h3>
                              {renderBackboardStatus(file)}
                            </div>
                            <p className="text-sm text-[#4A4A4A]/60">
                              {(file.file_size / 1024).toFixed(2)} KB • {new Date(file.uploaded_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              onChange={(e) => handleMoveToCategory(file.id, e.target.value ? parseInt(e.target.value) : null)}
                              className="px-3 py-2 bg-white border-2 border-[#8B9D83]/30 rounded-lg focus:outline-none focus:border-[#8B4F47] text-sm"
                              defaultValue=""
                            >
                              <option value="">Move to...</option>
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleToggleActive(file.id, file.is_active)}
                              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1 ${file.is_active
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                              {file.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                              {file.is_active ? 'Active' : 'Inactive'}
                            </button>
                            <button
                              onClick={() => handleToggleSolve(file.id)}
                              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1 ${file.solve_enabled
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                              {file.solve_enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                              Solve
                            </button>
                            <button
                              onClick={() => handleDeleteFile(file.id)}
                              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all font-medium flex items-center gap-1"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6">
              <h2 className="text-2xl font-bold text-[#4A4A4A] mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6 text-[#8B4F47]" />
                AI Instructions
              </h2>
              <p className="text-[#4A4A4A]/70 mb-6">
                Add custom rules and instructions that will guide the AI when teaching students. These instructions will be included in every conversation.
              </p>

              {/* Add Instruction Form */}
              <div className="bg-[#8B9D83]/5 rounded-xl p-4 mb-6">
                <input
                  type="text"
                  value={newInstructionName}
                  onChange={(e) => setNewInstructionName(e.target.value)}
                  placeholder="Instruction name (e.g., 'Be Encouraging')"
                  className="w-full px-4 py-3 bg-white border-2 border-[#8B9D83]/30 rounded-xl focus:outline-none focus:border-[#8B4F47] text-[#4A4A4A] mb-3"
                />
                <textarea
                  value={newInstructionValue}
                  onChange={(e) => setNewInstructionValue(e.target.value)}
                  placeholder="Instruction details (e.g., 'Always praise student effort before correcting mistakes')"
                  rows={3}
                  className="w-full px-4 py-3 bg-white border-2 border-[#8B9D83]/30 rounded-xl focus:outline-none focus:border-[#8B4F47] text-[#4A4A4A] mb-3 resize-none"
                />
                <button
                  onClick={handleCreateInstruction}
                  className="px-6 py-3 bg-[#8B4F47] text-white font-semibold rounded-xl hover:bg-[#A0605A] transition-all duration-300 shadow-md flex items-center gap-2"
                >
                  <Plus size={20} />
                  Add Instruction
                </button>
              </div>

              {/* Instructions List */}
              {instructionsLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-[#8B4F47] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : instructions.length === 0 ? (
                <div className="text-center py-12">
                  <Settings className="w-16 h-16 mx-auto text-[#4A4A4A]/30 mb-4" />
                  <p className="text-[#4A4A4A]/60">No instructions yet. Add one above to customize the AI's behavior!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {instructions.map((inst) => (
                    <div key={inst.id} className={`bg-white rounded-xl p-4 border-2 transition-all ${inst.is_active
                      ? 'border-[#8B9D83] shadow-md'
                      : 'border-[#8B9D83]/20 opacity-60'
                      }`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-[#4A4A4A] mb-2">{inst.instruction_name}</h3>
                          <p className="text-[#4A4A4A]/70 mb-2">{inst.instruction_value}</p>
                          <p className="text-xs text-[#4A4A4A]/50">
                            Created: {new Date(inst.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleInstruction(inst.id)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1 ${inst.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                          >
                            {inst.is_active ? <CheckCircle size={16} /> : <XCircle size={16} />}
                            {inst.is_active ? 'Active' : 'Inactive'}
                          </button>
                          <button
                            onClick={() => handleDeleteInstruction(inst.id)}
                            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all font-medium flex items-center gap-1"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Insights Modal */}
      <dialog id="insights_modal" className="modal">
        <div className="modal-box w-11/12 max-w-4xl bg-[#FDFBF7] text-[#4A4A4A]">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
          </form>

          {insightData && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-[#8B9D83]/20 pb-4">
                <Brain className="w-8 h-8 text-[#8B4F47]" />
                <div>
                  <h3 className="font-bold text-2xl text-[#8B4F47]">AI Progress Analysis</h3>
                  <p className="text-[#4A4A4A]/60">Insights for {insightData.student.full_name} (@{insightData.student.username})</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="stat bg-white rounded-xl shadow-sm border border-[#8B9D83]/10">
                  <div className="stat-title text-[#4A4A4A]/60">Total Answered</div>
                  <div className="stat-value text-[#4A4A4A]">{insightData.stats.total_answers}</div>
                </div>
                <div className="stat bg-white rounded-xl shadow-sm border border-[#8B9D83]/10">
                  <div className="stat-title text-[#4A4A4A]/60">Accuracy</div>
                  <div className={`stat-value ${insightData.stats.accuracy_percent >= 70 ? 'text-green-600' :
                    insightData.stats.accuracy_percent >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>{insightData.stats.accuracy_percent}%</div>
                </div>
                <div className="stat bg-white rounded-xl shadow-sm border border-[#8B9D83]/10">
                  <div className="stat-title text-[#4A4A4A]/60">Areas to Improve</div>
                  <div className="stat-value text-[#8B4F47]">{insightData.stats.wrong_answers}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                  <h4 className="font-bold text-green-800 flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5" /> Strengths
                  </h4>
                  <p className="text-green-900/80 leading-relaxed">
                    {insightData.insights.strengths}
                  </p>
                </div>

                <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                  <h4 className="font-bold text-red-800 flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5" /> Struggles
                  </h4>
                  <p className="text-red-900/80 leading-relaxed">
                    {insightData.insights.struggles}
                  </p>
                </div>
              </div>

              <div className="bg-[#8B4F47]/5 rounded-xl p-6 border border-[#8B4F47]/10">
                <h4 className="font-bold text-[#8B4F47] flex items-center gap-2 mb-4">
                  <Brain className="w-5 h-5" /> Support Recommendations
                </h4>
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]/50">Suggested Focus</span>
                    <p className="font-medium text-[#4A4A4A] mt-1">{insightData.insights.suggested_focus}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]/50">Action Items</span>
                    <ul className="mt-2 space-y-2">
                      {Array.isArray(insightData.insights.recommendations)
                        ? insightData.insights.recommendations.map((rec: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-[#4A4A4A]/80">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#8B4F47] flex-shrink-0" />
                            {rec}
                          </li>
                        ))
                        : <li className="text-[#4A4A4A]/80">{insightData.insights.recommendations}</li>
                      }
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Chat History Modal */}
      <dialog id="chat_modal" className="modal">
        <div className="modal-box w-11/12 max-w-5xl bg-[#FDFBF7] text-[#4A4A4A] max-h-[90vh]">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
          </form>

          <div className="flex items-center gap-3 border-b border-[#8B9D83]/20 pb-4 mb-4">
            <Eye className="w-8 h-8 text-[#8B9D83]" />
            <div>
              <h3 className="font-bold text-2xl text-[#8B9D83]">Student Chat History</h3>
              <p className="text-[#4A4A4A]/60">{studentConversations.length} conversation(s) found</p>
            </div>
          </div>

          {chatLoading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg text-[#8B9D83]"></span>
            </div>
          ) : studentConversations.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-[#4A4A4A]/30 mb-4" />
              <p className="text-[#4A4A4A]/60">No conversations found for this student.</p>
            </div>
          ) : (
            <div className="flex gap-4 h-[60vh]">
              {/* Conversation List */}
              <div className="w-1/3 border-r border-[#8B9D83]/20 pr-4 overflow-y-auto">
                <h4 className="font-bold text-sm text-[#4A4A4A]/70 mb-3 uppercase tracking-wider">Sessions</h4>
                <div className="space-y-2">
                  {studentConversations.map((conv: any) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConvId(conv.id)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${selectedConvId === conv.id
                        ? 'bg-[#8B9D83] text-white'
                        : 'bg-white hover:bg-[#8B9D83]/10'
                        }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Session #{conv.id}</span>
                        {conv.has_wrong_answers ? (
                          <span className={`text-xs px-2 py-0.5 rounded ${selectedConvId === conv.id ? 'bg-red-200 text-red-800' : 'bg-red-100 text-red-700'}`}>Has Errors</span>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded ${selectedConvId === conv.id ? 'bg-green-200 text-green-800' : 'bg-green-100 text-green-700'}`}>All Correct</span>
                        )}
                      </div>
                      <p className={`text-xs mt-1 ${selectedConvId === conv.id ? 'text-white/70' : 'text-[#4A4A4A]/50'}`}>
                        {new Date(conv.started_at).toLocaleDateString()} • {conv.messages?.length || 0} msgs
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message View */}
              <div className="flex-1 overflow-y-auto pl-4">
                {selectedConvId ? (
                  <div className="space-y-3">
                    {studentConversations.find((c: any) => c.id === selectedConvId)?.messages?.map((msg: any) => (
                      <div key={msg.id} className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}>
                        <div className="chat-header text-xs mb-1">
                          {msg.role === 'user' ? 'Student' : 'StoryBot'}
                          {msg.role === 'user' && (
                            msg.is_wrong ? (
                              <span className="ml-2 badge badge-error badge-xs">WRONG</span>
                            ) : msg.content !== 'Start my lesson' && (
                              <span className="ml-2 badge badge-success badge-xs">CORRECT</span>
                            )
                          )}
                          {msg.difficulty && <span className="ml-2 badge badge-ghost badge-xs">{msg.difficulty}</span>}
                        </div>
                        <div
                          className={`chat-bubble text-sm whitespace-pre-wrap ${msg.role === 'user'
                            ? msg.is_wrong
                              ? 'bg-red-100 text-red-900'
                              : 'bg-[#8B9D83]/20 text-[#4A4A4A]'
                            : 'bg-[#8B4F47]/10 text-[#4A4A4A]'
                            }`}
                        >
                          {msg.content}
                        </div>
                        <div className="chat-footer text-xs opacity-50">
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[#4A4A4A]/50">
                    <p>Select a session to view messages</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
};

export default Teacher;
