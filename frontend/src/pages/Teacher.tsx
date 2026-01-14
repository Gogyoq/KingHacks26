import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_URL = "http://localhost:8000";

interface DashboardStats {
  active_students: number;
  sessions_today: number;
  class_accuracy: number;
  students_needing_help: number;
}

interface Student {
  student_id?: number;
  id?: number;
  username: string;
  full_name: string;
  total_sessions?: number;
  accuracy_percent?: number;
  last_active?: string | null;
  status?: "good" | "warning" | "needs_help";
  email?: string;
  account_active?: boolean;
  enrolled_at?: string;
}

interface Classroom {
  id: number;
  class_name: string;
  teacher_id: number;
  teacher_name: string;
  description: string;
  created_at: string;
  student_count: number;
}

interface AIInsights {
  struggles: string;
  strengths: string;
  recommendations: string;
}

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
  classroom_id: number;
}

interface Category {
  id: number;
  name: string;
  classroom_id: number;
  created_at: string;
}

interface Instruction {
  id: number;
  instruction_name: string;
  instruction_value: string;
  is_active: boolean;
  created_at: string;
  classroom_id: number;
}

interface Conversation {
  id: number;
  student_id: number;
  username: string;
  full_name: string;
  thread_id: string;
  started_at: string;
  ended_at: string | null;
  last_message_at: string;
  has_wrong_answers: boolean;
}

interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  is_wrong: boolean;
}

export default function Teacher() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"dashboard" | "students" | "files" | "instructions" | "chat-history" | "classrooms">("classrooms");

  // Dashboard state
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardStudents, setDashboardStudents] = useState<Student[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // AI Insights state
  const [aiInsights, setAiInsights] = useState<Record<number, AIInsights>>({});
  const [aiInsightsLoading, setAiInsightsLoading] = useState<Record<number, boolean>>({});
  const [selectedStudentForInsights, setSelectedStudentForInsights] = useState<number | null>(null);

  // Students list state
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Files state
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Instructions state
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [newInstruction, setNewInstruction] = useState({ name: "", value: "" });

  // Chat history state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [conversationFilter, setConversationFilter] = useState<"all" | "active" | "ended">("all");

  // Classrooms state
  const [allClassrooms, setAllClassrooms] = useState<Classroom[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(false);
  const [selectedClassroomForManagement, setSelectedClassroomForManagement] = useState<number | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<Student[]>([]);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [newClassroom, setNewClassroom] = useState({ class_name: "", description: "" });
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [classroomFiles, setClassroomFiles] = useState<File[]>([]);

  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    if (activeTab === "dashboard" && classroomId) {
      fetchDashboardStats();
      fetchDashboardStudents();
    } else if (activeTab === "students" && classroomId) {
      fetchStudents();
    } else if (activeTab === "files" && classroomId) {
      fetchFiles();
      fetchCategories();
    } else if (activeTab === "instructions" && classroomId) {
      fetchInstructions();
    } else if (activeTab === "chat-history" && classroomId) {
      fetchConversations();
    } else if (activeTab === "classrooms") {
      fetchAllClassrooms();
    }
  }, [activeTab, classroomId]);

  useEffect(() => {
    if (activeTab === "chat-history" && classroomId) {
      fetchConversations();
    }
  }, [conversationFilter]);

  useEffect(() => {
    if (selectedClassroomForManagement) {
      fetchEnrolledStudents(selectedClassroomForManagement);
      fetchAvailableStudents(selectedClassroomForManagement);
      fetchClassroomFiles(selectedClassroomForManagement);
    }
  }, [selectedClassroomForManagement]);

  const fetchDashboardStats = async () => {
    if (!classroomId) return;
    setDashboardLoading(true);
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setDashboardStats(data);
      }
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchDashboardStudents = async () => {
    if (!classroomId) return;
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/dashboard/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setDashboardStudents(data.students);
      }
    } catch (error) {
      console.error("Error fetching dashboard students:", error);
    }
  };

  const fetchStudents = async () => {
    if (!classroomId) return;
    setStudentsLoading(true);
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStudents(data.students);
      }
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setStudentsLoading(false);
    }
  };

  const fetchFiles = async () => {
    if (!classroomId) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files);
      }
    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    if (!classroomId) return;
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const fetchInstructions = async () => {
    if (!classroomId) return;
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/instructions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setInstructions(data.instructions);
      }
    } catch (error) {
      console.error("Error fetching instructions:", error);
    }
  };

  const fetchConversations = async () => {
    if (!classroomId) return;
    setConversationsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/teacher/${classroomId}/conversations?status=${conversationFilter}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  };

  const fetchMessages = async (conversationId: number) => {
    if (!classroomId) return;
    setMessagesLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/teacher/${classroomId}/conversations/${conversationId}/messages`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const fetchAIInsights = async (studentId: number) => {
    if (!classroomId) return;
    setAiInsightsLoading({ ...aiInsightsLoading, [studentId]: true });
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/ai-insights`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ student_id: studentId }),
      });
      if (response.ok) {
        const data = await response.json();
        setAiInsights({ ...aiInsights, [studentId]: data.insights });
      }
    } catch (error) {
      console.error("Error fetching AI insights:", error);
    } finally {
      setAiInsightsLoading({ ...aiInsightsLoading, [studentId]: false });
    }
  };

  // ============================================================================
  // CLASSROOM MANAGEMENT FUNCTIONS
  // ============================================================================

  const fetchAllClassrooms = async () => {
    setClassroomsLoading(true);
    try {
      const response = await fetch(`${API_URL}/classroom/classes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAllClassrooms(data.classrooms);
      }
    } catch (error) {
      console.error("Error fetching classrooms:", error);
    } finally {
      setClassroomsLoading(false);
    }
  };

  const fetchEnrolledStudents = async (classroomId: number) => {
    try {
      const response = await fetch(`${API_URL}/classroom/${classroomId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setEnrolledStudents(data.students);
      }
    } catch (error) {
      console.error("Error fetching enrolled students:", error);
    }
  };

  const fetchAvailableStudents = async (classroomId: number) => {
    try {
      const response = await fetch(`${API_URL}/classroom/${classroomId}/available-students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableStudents(data.available_students);
      }
    } catch (error) {
      console.error("Error fetching available students:", error);
    }
  };

  const fetchClassroomFiles = async (classroomId: number) => {
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setClassroomFiles(data.files);
      }
    } catch (error) {
      console.error("Error fetching classroom files:", error);
    }
  };

  const handleCreateClassroom = async () => {
    if (!newClassroom.class_name.trim()) {
      alert("Please enter a classroom name");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/classroom/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newClassroom),
      });

      if (response.ok) {
        await fetchAllClassrooms();
        setNewClassroom({ class_name: "", description: "" });
        alert("Classroom created successfully!");
      } else {
        const error = await response.json();
        alert(`Failed to create classroom: ${error.detail}`);
      }
    } catch (error) {
      console.error("Error creating classroom:", error);
      alert("Failed to create classroom");
    }
  };

  const handleUpdateClassroom = async () => {
    if (!editingClassroom) return;

    try {
      const response = await fetch(`${API_URL}/classroom/${editingClassroom.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          class_name: editingClassroom.class_name,
          description: editingClassroom.description,
        }),
      });

      if (response.ok) {
        await fetchAllClassrooms();
        setEditingClassroom(null);
        alert("Classroom updated successfully!");
      } else {
        const error = await response.json();
        alert(`Failed to update classroom: ${error.detail}`);
      }
    } catch (error) {
      console.error("Error updating classroom:", error);
      alert("Failed to update classroom");
    }
  };

  const handleDeleteClassroom = async (classroomId: number, className: string) => {
    if (!confirm(`Are you sure you want to delete "${className}"? This will remove all student enrollments.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/classroom/${classroomId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchAllClassrooms();
        if (selectedClassroomForManagement === classroomId) {
          setSelectedClassroomForManagement(null);
        }
        alert("Classroom deleted successfully!");
      } else {
        const error = await response.json();
        alert(`Failed to delete classroom: ${error.detail}`);
      }
    } catch (error) {
      console.error("Error deleting classroom:", error);
      alert("Failed to delete classroom");
    }
  };

  const handleAddStudent = async (studentId: number) => {
    if (!selectedClassroomForManagement) return;

    try {
      const response = await fetch(
        `${API_URL}/classroom/${selectedClassroomForManagement}/students/add`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ student_id: studentId }),
        }
      );

      if (response.ok) {
        await fetchEnrolledStudents(selectedClassroomForManagement);
        await fetchAvailableStudents(selectedClassroomForManagement);
        await fetchAllClassrooms();
        alert("Student added successfully!");
      } else {
        const error = await response.json();
        alert(`Failed to add student: ${error.detail}`);
      }
    } catch (error) {
      console.error("Error adding student:", error);
      alert("Failed to add student");
    }
  };

  const handleRemoveStudent = async (studentId: number) => {
    if (!selectedClassroomForManagement) return;

    if (!confirm("Are you sure you want to remove this student from the classroom?")) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/classroom/${selectedClassroomForManagement}/students/${studentId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        await fetchEnrolledStudents(selectedClassroomForManagement);
        await fetchAvailableStudents(selectedClassroomForManagement);
        await fetchAllClassrooms();
        alert("Student removed successfully!");
      } else {
        const error = await response.json();
        alert(`Failed to remove student: ${error.detail}`);
      }
    } catch (error) {
      console.error("Error removing student:", error);
      alert("Failed to remove student");
    }
  };

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !classroomId) return;

    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append("files", fileList[i]);
    }

    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        await fetchFiles();
        alert("Files uploaded successfully!");
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.detail}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm("Are you sure you want to delete this file?") || !classroomId) return;

    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchFiles();
        alert("File deleted successfully!");
      } else {
        const error = await response.json();
        alert(`Delete failed: ${error.detail}`);
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const handleToggleFileActive = async (fileId: number) => {
    if (!classroomId) return;
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/files/${fileId}/toggle`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchFiles();
      }
    } catch (error) {
      console.error("Toggle error:", error);
    }
  };

  const handleUpdateFileCategory = async (fileId: number, categoryId: number | null) => {
    if (!classroomId) return;
    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/files/${fileId}/category`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category_id: categoryId }),
      });

      if (response.ok) {
        await fetchFiles();
      }
    } catch (error) {
      console.error("Category update error:", error);
    }
  };

  const handleBulkCategoryUpdate = async (categoryId: number | null) => {
    if (selectedFiles.length === 0) {
      alert("No files selected");
      return;
    }

    try {
      await Promise.all(
        selectedFiles.map((fileId) => handleUpdateFileCategory(fileId, categoryId))
      );
      setSelectedFiles([]);
      alert("Category updated for selected files!");
    } catch (error) {
      console.error("Bulk update error:", error);
    }
  };

  const toggleFileSelection = (fileId: number) => {
    setSelectedFiles((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  // ============================================================================
  // CATEGORY OPERATIONS
  // ============================================================================

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !classroomId) {
      alert("Please enter a category name");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/categories`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newCategoryName, classroom_id: parseInt(classroomId!) }),
      });

      if (response.ok) {
        await fetchCategories();
        setNewCategoryName("");
        alert("Category created!");
      }
    } catch (error) {
      console.error("Create category error:", error);
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!confirm("Delete this category? Files will become uncategorized.") || !classroomId) return;

    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/categories/${categoryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchCategories();
        await fetchFiles();
        alert("Category deleted!");
      }
    } catch (error) {
      console.error("Delete category error:", error);
    }
  };

  // ============================================================================
  // INSTRUCTION OPERATIONS
  // ============================================================================

  const handleCreateInstruction = async () => {
    if (!newInstruction.name.trim() || !newInstruction.value.trim() || !classroomId) {
      alert("Please fill in both name and instruction");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/teacher/${classroomId}/instructions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newInstruction),
      });

      if (response.ok) {
        await fetchInstructions();
        setNewInstruction({ name: "", value: "" });
        alert("Instruction created!");
      }
    } catch (error) {
      console.error("Create instruction error:", error);
    }
  };

  const handleDeleteInstruction = async (instructionId: number) => {
    if (!confirm("Delete this instruction?") || !classroomId) return;

    try {
      const response = await fetch(
        `${API_URL}/teacher/${classroomId}/instructions/${instructionId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        await fetchInstructions();
        alert("Instruction deleted!");
      }
    } catch (error) {
      console.error("Delete instruction error:", error);
    }
  };

  const handleToggleInstruction = async (instructionId: number) => {
    if (!classroomId) return;
    try {
      const response = await fetch(
        `${API_URL}/teacher/${classroomId}/instructions/${instructionId}/toggle`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        await fetchInstructions();
      }
    } catch (error) {
      console.error("Toggle instruction error:", error);
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getFilesForCategory = (categoryId: number) => {
    return files.filter((f) => f.category_id === categoryId);
  };

  const getUncategorizedFiles = () => {
    return files.filter((f) => f.category_id === null);
  };

  const renderBackboardStatus = (file: File) => {
    const statusColors: Record<string, string> = {
      ready: "badge-success",
      pending: "badge-warning",
      processing: "badge-info",
      upload_failed: "badge-error",
      upload_error: "badge-error",
      not_uploaded: "badge-ghost",
    };

    return (
      <span className={`badge badge-sm ${statusColors[file.backboard_status] || "badge-ghost"}`}>
        {file.backboard_status?.replace("_", " ") || "unknown"}
      </span>
    );
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "good":
        return "badge-success";
      case "warning":
        return "badge-warning";
      case "needs_help":
        return "badge-error";
      default:
        return "badge-ghost";
    }
  };

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderClassrooms = () => (
    <div className="space-y-6">
      {/* Create New Classroom */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Create New Classroom</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Classroom name (e.g., 'Math 101')"
              className="input input-bordered w-full"
              value={newClassroom.class_name}
              onChange={(e) => setNewClassroom({ ...newClassroom, class_name: e.target.value })}
            />
            <textarea
              placeholder="Description (optional)"
              className="textarea textarea-bordered w-full"
              value={newClassroom.description}
              onChange={(e) => setNewClassroom({ ...newClassroom, description: e.target.value })}
            />
            <button className="btn btn-primary" onClick={handleCreateClassroom}>
              Create Classroom
            </button>
          </div>
        </div>
      </div>

      {/* All Classrooms List */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Your Classrooms</h2>
          {classroomsLoading ? (
            <div className="flex justify-center">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : allClassrooms.length === 0 ? (
            <div className="alert">
              <span>No classrooms yet. Create one above!</span>
            </div>
          ) : (
            <div className="space-y-3">
              {allClassrooms.map((classroom) => (
                <div
                  key={classroom.id}
                  className={`card ${
                    selectedClassroomForManagement === classroom.id ? "bg-primary/10" : "bg-base-200"
                  }`}
                >
                  <div className="card-body">
                    {editingClassroom?.id === classroom.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          className="input input-bordered w-full"
                          value={editingClassroom.class_name}
                          onChange={(e) =>
                            setEditingClassroom({ ...editingClassroom, class_name: e.target.value })
                          }
                        />
                        <textarea
                          className="textarea textarea-bordered w-full"
                          value={editingClassroom.description}
                          onChange={(e) =>
                            setEditingClassroom({ ...editingClassroom, description: e.target.value })
                          }
                        />
                        <div className="flex gap-2">
                          <button className="btn btn-sm btn-success" onClick={handleUpdateClassroom}>
                            Save
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setEditingClassroom(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="card-title">{classroom.class_name}</h3>
                            {classroom.description && (
                              <p className="text-sm opacity-70 mt-1">{classroom.description}</p>
                            )}
                            <div className="flex gap-4 mt-2 text-sm">
                              <span className="badge badge-info">{classroom.student_count} students</span>
                              <span className="opacity-50">
                                Created: {new Date(classroom.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                if (selectedClassroomForManagement === classroom.id) {
                                  setSelectedClassroomForManagement(null);
                                } else {
                                  setSelectedClassroomForManagement(classroom.id);
                                }
                              }}
                            >
                              {selectedClassroomForManagement === classroom.id ? "Hide" : "Manage"}
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => setEditingClassroom(classroom)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-error btn-outline"
                              onClick={() => handleDeleteClassroom(classroom.id, classroom.class_name)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Classroom Management Panel */}
                        {selectedClassroomForManagement === classroom.id && (
                          <div className="mt-4 pt-4 border-t space-y-4">
                            {/* Enrolled Students */}
                            <div>
                              <h4 className="font-bold mb-2">Enrolled Students ({enrolledStudents.length})</h4>
                              {enrolledStudents.length === 0 ? (
                                <div className="alert alert-info">
                                  <span>No students enrolled yet</span>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {enrolledStudents.map((student) => (
                                    <div
                                      key={student.id}
                                      className="flex justify-between items-center p-3 bg-base-100 rounded-lg"
                                    >
                                      <div>
                                        <div className="font-semibold">{student.full_name}</div>
                                        <div className="text-sm opacity-70">
                                          @{student.username} • {student.email}
                                        </div>
                                        <div className="text-xs opacity-50">
                                          Enrolled: {new Date(student.enrolled_at!).toLocaleDateString()}
                                        </div>
                                      </div>
                                      <button
                                        className="btn btn-sm btn-error btn-outline"
                                        onClick={() => handleRemoveStudent(student.id!)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Available Students */}
                            <div>
                              <h4 className="font-bold mb-2">
                                Available Students to Add ({availableStudents.length})
                              </h4>
                              {availableStudents.length === 0 ? (
                                <div className="alert">
                                  <span>All students are already enrolled</span>
                                </div>
                              ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                  {availableStudents.map((student) => (
                                    <div
                                      key={student.id}
                                      className="flex justify-between items-center p-3 bg-base-100 rounded-lg"
                                    >
                                      <div>
                                        <div className="font-semibold">{student.full_name}</div>
                                        <div className="text-sm opacity-70">
                                          @{student.username} • {student.email}
                                        </div>
                                      </div>
                                      <button
                                        className="btn btn-sm btn-success"
                                        onClick={() => handleAddStudent(student.id!)}
                                      >
                                        Add
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Current Files/Lessons */}
                            <div>
                              <h4 className="font-bold mb-2">
                                Current Lessons/Files ({classroomFiles.length})
                              </h4>
                              {classroomFiles.length === 0 ? (
                                <div className="alert">
                                  <span>No files uploaded yet</span>
                                </div>
                              ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                  {classroomFiles.map((file) => (
                                    <div key={file.id} className="p-3 bg-base-100 rounded-lg">
                                      <div className="flex justify-between items-center">
                                        <div className="flex-1">
                                          <div className="font-semibold">
                                            {file.original_filename} {renderBackboardStatus(file)}
                                          </div>
                                          <div className="text-sm opacity-70">
                                            {(file.file_size / 1024).toFixed(2)} KB •{" "}
                                            {new Date(file.uploaded_at).toLocaleDateString()}
                                            {file.category_name && (
                                              <span className="ml-2 badge badge-sm">
                                                {file.category_name}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <span
                                          className={`badge ${
                                            file.is_active ? "badge-success" : "badge-ghost"
                                          }`}
                                        >
                                          {file.is_active ? "Active" : "Inactive"}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => {
    if (!classroomId) {
      return (
        <div className="alert alert-warning">
          <span>Please select a classroom from the Classrooms tab to view dashboard</span>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {dashboardLoading ? (
          <div className="flex justify-center">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="stat bg-base-200 rounded-box">
                <div className="stat-title">Active Students</div>
                <div className="stat-value text-primary">{dashboardStats?.active_students || 0}</div>
                <div className="stat-desc">Last 7 days</div>
              </div>
              <div className="stat bg-base-200 rounded-box">
                <div className="stat-title">Sessions Today</div>
                <div className="stat-value text-secondary">{dashboardStats?.sessions_today || 0}</div>
                <div className="stat-desc">Active learning sessions</div>
              </div>
              <div className="stat bg-base-200 rounded-box">
                <div className="stat-title">Class Accuracy</div>
                <div className="stat-value text-accent">{dashboardStats?.class_accuracy || 0}%</div>
                <div className="stat-desc">Overall performance</div>
              </div>
              <div className="stat bg-base-200 rounded-box">
                <div className="stat-title">Need Help</div>
                <div className="stat-value text-error">{dashboardStats?.students_needing_help || 0}</div>
                <div className="stat-desc">Students struggling</div>
              </div>
            </div>

            {/* Student Performance Table */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Student Performance</h2>
                {dashboardStudents.length === 0 ? (
                  <div className="alert">
                    <span>No student data yet. Students will appear here once they start learning.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-zebra">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Sessions</th>
                          <th>Accuracy</th>
                          <th>Last Active</th>
                          <th>Status</th>
                          <th>AI Insights</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardStudents.map((student) => (
                          <tr key={student.student_id}>
                            <td>
                              <div>
                                <div className="font-bold">{student.full_name}</div>
                                <div className="text-sm opacity-50">@{student.username}</div>
                              </div>
                            </td>
                            <td>{student.total_sessions}</td>
                            <td>{student.accuracy_percent}%</td>
                            <td>
                              {student.last_active
                                ? new Date(student.last_active).toLocaleString()
                                : "Never"}
                            </td>
                            <td>
                              <span className={`badge ${getStatusBadgeClass(student.status!)}`}>
                                {student.status === "good"
                                  ? "Good"
                                  : student.status === "warning"
                                  ? "Fair"
                                  : "Needs Help"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => {
                                  if (selectedStudentForInsights === student.student_id) {
                                    setSelectedStudentForInsights(null);
                                  } else {
                                    setSelectedStudentForInsights(student.student_id!);
                                    if (!aiInsights[student.student_id!]) {
                                      fetchAIInsights(student.student_id!);
                                    }
                                  }
                                }}
                              >
                                {selectedStudentForInsights === student.student_id ? "Hide" : "View"}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {dashboardStudents.map(
                          (student) =>
                            selectedStudentForInsights === student.student_id && (
                              <tr key={`insights-${student.student_id}`}>
                                <td colSpan={6} className="bg-base-200">
                                  {aiInsightsLoading[student.student_id!] ? (
                                    <div className="flex justify-center p-4">
                                      <span className="loading loading-spinner"></span>
                                      <span className="ml-2">Analyzing student data with AI...</span>
                                    </div>
                                  ) : aiInsights[student.student_id!] ? (
                                    <div className="space-y-2 p-4">
                                      <div>
                                        <strong>Struggles:</strong>{" "}
                                        {aiInsights[student.student_id!].struggles}
                                      </div>
                                      <div>
                                        <strong>Strengths:</strong>{" "}
                                        {aiInsights[student.student_id!].strengths}
                                      </div>
                                      <div>
                                        <strong>Recommendations:</strong>{" "}
                                        {aiInsights[student.student_id!].recommendations}
                                      </div>
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderStudents = () => {
    if (!classroomId) {
      return (
        <div className="alert alert-warning">
          <span>Please select a classroom from the Classrooms tab</span>
        </div>
      );
    }

    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">All Students</h2>
          {studentsLoading ? (
            <div className="flex justify-center">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : students.length === 0 ? (
            <div className="alert">
              <span>No students registered yet.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.student_id || student.id}>
                      <td>{student.username}</td>
                      <td>{student.full_name}</td>
                      <td>{student.email}</td>
                      <td>
                        <span className={`badge ${student.account_active ? "badge-success" : "badge-error"}`}>
                          {student.account_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFiles = () => {
    if (!classroomId) {
      return (
        <div className="alert alert-warning">
          <span>Please select a classroom from the Classrooms tab</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Upload Section */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Upload Files</h2>
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="file-input file-input-bordered w-full"
              disabled={uploading}
            />
            {uploading && <progress className="progress progress-primary"></progress>}
          </div>
        </div>

        {/* Category Creation */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Create Category</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Category name"
                className="input input-bordered flex-1"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleCreateCategory}>
                Create
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Operations */}
        {selectedFiles.length > 0 && (
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="font-bold">Selected files ({selectedFiles.length}):</h3>
              <div className="flex gap-2 flex-wrap">
                <select
                  className="select select-bordered"
                  onChange={(e) => {
                    const val = e.target.value;
                    handleBulkCategoryUpdate(val === "none" ? null : parseInt(val));
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Assign to category
                  </option>
                  <option value="none">Uncategorized</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost" onClick={() => setSelectedFiles([])}>
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Categories with Files */}
        {loading ? (
          <div className="flex justify-center">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : (
          <>
            {categories.map((category) => (
              <div key={category.id} className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between items-center">
                    <h2 className="card-title">
                      {category.name}
                      <span className="badge badge-neutral">
                        {getFilesForCategory(category.id).length} file(s)
                      </span>
                    </h2>
                    <button
                      className="btn btn-sm btn-error btn-outline"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      Delete Category
                    </button>
                  </div>
                  <div className="space-y-2">
                    {getFilesForCategory(category.id).length === 0 ? (
                      <div className="alert">
                        <span>No files in this category</span>
                      </div>
                    ) : (
                      getFilesForCategory(category.id).map((file) => (
                        <div
                          key={file.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            selectedFiles.includes(file.id) ? "bg-primary/20" : "bg-base-200"
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={selectedFiles.includes(file.id)}
                              onChange={() => toggleFileSelection(file.id)}
                            />
                            <div className="flex-1">
                              <div className="font-semibold">
                                {file.original_filename} {renderBackboardStatus(file)}
                              </div>
                              <div className="text-sm text-base-content/70">
                                {(file.file_size / 1024).toFixed(2)} KB •{" "}
                                {new Date(file.uploaded_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className={`btn btn-sm ${file.is_active ? "btn-success" : "btn-ghost"}`}
                              onClick={() => handleToggleFileActive(file.id)}
                            >
                              {file.is_active ? "Active" : "Inactive"}
                            </button>
                            <button
                              className="btn btn-sm btn-error btn-outline"
                              onClick={() => handleDeleteFile(file.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Uncategorized Files */}
            {getUncategorizedFiles().length > 0 && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">Uncategorized Files</h2>
                  <div className="space-y-2">
                    {getUncategorizedFiles().map((file) => (
                      <div
                        key={file.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          selectedFiles.includes(file.id) ? "bg-primary/20" : "bg-base-200"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={selectedFiles.includes(file.id)}
                            onChange={() => toggleFileSelection(file.id)}
                          />
                          <div className="flex-1">
                            <div className="font-semibold">
                              {file.original_filename} {renderBackboardStatus(file)}
                            </div>
                            <div className="text-sm text-base-content/70">
                              {(file.file_size / 1024).toFixed(2)} KB •{" "}
                              {new Date(file.uploaded_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <select
                            className="select select-sm select-bordered"
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) handleUpdateFileCategory(file.id, parseInt(val));
                            }}
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Assign category
                            </option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className={`btn btn-sm ${file.is_active ? "btn-success" : "btn-ghost"}`}
                            onClick={() => handleToggleFileActive(file.id)}
                          >
                            {file.is_active ? "Active" : "Inactive"}
                          </button>
                          <button
                            className="btn btn-sm btn-error btn-outline"
                            onClick={() => handleDeleteFile(file.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderInstructions = () => {
    if (!classroomId) {
      return (
        <div className="alert alert-warning">
          <span>Please select a classroom from the Classrooms tab</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Create Instruction */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Add AI Instruction</h2>
            <p className="text-sm opacity-70">
              Add custom rules and instructions that will guide the AI when teaching students. These
              instructions will be included in every conversation.
            </p>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Instruction name (e.g., 'Encouraging tone')"
                className="input input-bordered w-full"
                value={newInstruction.name}
                onChange={(e) => setNewInstruction({ ...newInstruction, name: e.target.value })}
              />
              <textarea
                placeholder="Instruction content (e.g., 'Always use encouraging and positive language with students')"
                className="textarea textarea-bordered w-full h-24"
                value={newInstruction.value}
                onChange={(e) => setNewInstruction({ ...newInstruction, value: e.target.value })}
              />
              <button className="btn btn-primary" onClick={handleCreateInstruction}>
                Add Instruction
              </button>
            </div>
          </div>
        </div>

        {/* Instructions List */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Active Instructions</h2>
            {instructions.length === 0 ? (
              <div className="alert">
                <span>No instructions yet. Add one above to customize the AI's behavior!</span>
              </div>
            ) : (
              <div className="space-y-3">
                {instructions.map((inst) => (
                  <div
                    key={inst.id}
                    className={`p-4 rounded-lg ${
                      inst.is_active ? "bg-success/10 border border-success" : "bg-base-200"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-bold">{inst.instruction_name}</h3>
                        <p className="text-sm mt-1">{inst.instruction_value}</p>
                        <p className="text-xs opacity-50 mt-2">
                          Created: {new Date(inst.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className={`btn btn-sm ${inst.is_active ? "btn-success" : "btn-ghost"}`}
                          onClick={() => handleToggleInstruction(inst.id)}
                        >
                          {inst.is_active ? "Active" : "Inactive"}
                        </button>
                        <button
                          className="btn btn-sm btn-error btn-outline"
                          onClick={() => handleDeleteInstruction(inst.id)}
                        >
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
      </div>
    );
  };

  const renderChatHistory = () => {
    if (!classroomId) {
      return (
        <div className="alert alert-warning">
          <span>Please select a classroom from the Classrooms tab</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Filter */}
        <div className="flex gap-2">
          <button
            className={`btn ${conversationFilter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setConversationFilter("all")}
          >
            All
          </button>
          <button
            className={`btn ${conversationFilter === "active" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setConversationFilter("active")}
          >
            Active
          </button>
          <button
            className={`btn ${conversationFilter === "ended" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setConversationFilter("ended")}
          >
            Ended
          </button>
        </div>

        {/* Conversations List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Conversations</h2>
              {conversationsLoading ? (
                <div className="flex justify-center">
                  <span className="loading loading-spinner"></span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="alert">
                  <span>No conversations yet. Students will appear here once they start learning.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`p-3 rounded-lg cursor-pointer ${
                        selectedConversation === conv.id ? "bg-primary/20" : "bg-base-200"
                      }`}
                      onClick={() => {
                        setSelectedConversation(conv.id);
                        fetchMessages(conv.id);
                      }}
                    >
                      <div className="font-bold">
                        {conv.full_name} (@{conv.username})
                      </div>
                      <div className="text-sm opacity-70">
                        Session #{conv.id} • Thread: {conv.thread_id.substring(0, 8)}...
                      </div>
                      <div className="text-xs opacity-50">
                        Started: {new Date(conv.started_at).toLocaleString()}
                        {conv.ended_at && (
                          <>
                            {" "}
                            • Ended: {new Date(conv.ended_at).toLocaleString()}
                          </>
                        )}
                      </div>
                      {conv.has_wrong_answers && (
                        <span className="badge badge-warning badge-sm mt-1">Has errors</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Messages</h2>
              {!selectedConversation ? (
                <div className="alert">
                  <span>Select a conversation to view messages</span>
                </div>
              ) : messagesLoading ? (
                <div className="flex justify-center">
                  <span className="loading loading-spinner"></span>
                </div>
              ) : messages.length === 0 ? (
                <div className="alert">
                  <span>No messages in this conversation yet.</span>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${
                        msg.role === "user"
                          ? msg.is_wrong
                            ? "bg-error/10 border border-error"
                            : "bg-info/10"
                          : "bg-base-200"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold">
                          {msg.role === "user" ? "Student" : "AI Teacher"}
                        </span>
                        <span className="text-xs opacity-50">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                      {msg.is_wrong && msg.role === "user" && (
                        <span className="badge badge-error badge-sm mt-2">Incorrect Answer</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          Teacher Dashboard{classroomId && ` - Classroom ${classroomId}`}
        </h1>
        <button className="btn btn-ghost" onClick={() => navigate("/")}>
          Back to Home
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed mb-6">
        <a
          className={`tab ${activeTab === "classrooms" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("classrooms")}
        >
          Classrooms
        </a>
        <a
          className={`tab ${activeTab === "dashboard" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </a>
        <a
          className={`tab ${activeTab === "students" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("students")}
        >
          Students
        </a>
        <a
          className={`tab ${activeTab === "files" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          Files
        </a>
        <a
          className={`tab ${activeTab === "instructions" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("instructions")}
        >
          Instructions
        </a>
        <a
          className={`tab ${activeTab === "chat-history" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("chat-history")}
        >
          Chat History
        </a>
      </div>

      {/* Tab Content */}
      {activeTab === "classrooms" && renderClassrooms()}
      {activeTab === "dashboard" && renderDashboard()}
      {activeTab === "students" && renderStudents()}
      {activeTab === "files" && renderFiles()}
      {activeTab === "instructions" && renderInstructions()}
      {activeTab === "chat-history" && renderChatHistory()}
    </div>
  );
}
