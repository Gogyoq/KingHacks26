import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ChatContextType } from '../App';

interface Message {
  role: 'user' | 'bot';
  content: string;
  isWrong?: boolean;
}

interface Lesson {
  id: number;
  name: string;
  category: string;
  uploaded_at: string;
  started: boolean;
  started_at: string | null;
  classroom_id?: number;
  classroom_name?: string;
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

const Student: React.FC = () => {
  // === USE PERSISTENT STATE FROM APP ===
  const {
    chatLog, setChatLog,
    threadId, setThreadId,
    conversationId, setConversationId
  } = useOutletContext<ChatContextType>();

  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [startingLesson, setStartingLesson] = useState<number | null>(null);
  const [isChatEnded, setIsChatEnded] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [solveLoading, setSolveLoading] = useState(false);
  const [solveEnabled, setSolveEnabled] = useState(true);
  const [chatStarted, setChatStarted] = useState(false);

  // NEW: Classroom state
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<number | null>(null);
  const [classroomsLoading, setClassroomsLoading] = useState(false);

  const getToken = () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  // Fetch classrooms on mount
  useEffect(() => {
    fetchClassrooms();
  }, []);

  // Fetch lessons when classroom changes
  useEffect(() => {
    if (selectedClassroomId !== null) {
      fetchLessons();
    }
  }, [selectedClassroomId]);

  // Auto-load chat for selected lesson when it changes
  useEffect(() => {
    if (selectedLessonId !== null) {
      loadLessonChat(selectedLessonId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLessonId]);

  const fetchClassrooms = async () => {
    const token = getToken();
    if (!token) return;

    setClassroomsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/classroom/classes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setClassrooms(data.classrooms || []);
        // Auto-select first classroom
        if (data.classrooms && data.classrooms.length > 0) {
          setSelectedClassroomId(data.classrooms[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch classrooms:', error);
    } finally {
      setClassroomsLoading(false);
    }
  };

  const fetchLessons = async () => {
    const token = getToken();
    if (!token) return;

    setLessonsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/student/available-lessons', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        let fetchedLessons = data.lessons || [];

        // Filter lessons by selected classroom if one is selected
        if (selectedClassroomId !== null) {
          fetchedLessons = fetchedLessons.filter((l: Lesson) => l.classroom_id === selectedClassroomId);
        }

        setLessons(fetchedLessons);

        // Auto-select the first started lesson when student logs in
        if (selectedLessonId === null && fetchedLessons.length > 0) {
          const firstStartedLesson = fetchedLessons.find((l: Lesson) => l.started);
          if (firstStartedLesson) {
            setSelectedLessonId(firstStartedLesson.id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch lessons:', error);
    } finally {
      setLessonsLoading(false);
    }
  };

  // Load chat history for a lesson
  const loadLessonChat = async (fileId: number) => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch(`http://localhost:8000/student/conversations/lesson/${fileId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const conv = data.conversation;
        const messages = data.messages || [];

        // Convert messages to chat log format
        const chatLogMessages: Message[] = messages.map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'bot',
          content: msg.content,
          isWrong: msg.is_wrong ? true : false
        }));

        // Always update global chat state when loading a lesson
        if (selectedLessonId === fileId) {
          setConversationId(conv?.id || null);
          setThreadId(conv?.thread_id || null);
          setChatLog(chatLogMessages);
          setIsChatEnded(conv?.ended_at ? true : false);
          setChatStarted(chatLogMessages.length > 0);
          console.log(`Loaded chat for lesson ${fileId}: ${chatLogMessages.length} messages`);
        }
      } else {
        // No conversation exists yet - clear the chat
        if (selectedLessonId === fileId) {
          setConversationId(null);
          setThreadId(null);
          setChatLog([]);
          setIsChatEnded(false);
          setChatStarted(false);
        }
      }
    } catch (error) {
      console.error('Failed to load lesson chat:', error);
      // On error, clear chat for this lesson
      if (selectedLessonId === fileId) {
        setConversationId(null);
        setThreadId(null);
        setChatLog([]);
        setIsChatEnded(false);
        setChatStarted(false);
      }
    }
  };

  // Handle lesson selection
  const handleLessonSelect = async (lessonId: number, lessonStarted: boolean) => {
    if (!lessonStarted) {
      await handleStartLesson(lessonId);
      return;
    }
    setSelectedLessonId(lessonId);
  };

  const handleStartLesson = async (lessonId: number) => {
    const token = getToken();
    if (!token) {
      alert('Please log in to start a lesson');
      return;
    }

    setStartingLesson(lessonId);
    try {
      const response = await fetch(`http://localhost:8000/student/start-lesson/${lessonId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || 'Lesson started!');
        await fetchLessons();
        setSelectedLessonId(lessonId);
      } else {
        const error = await response.json();
        alert('Failed to start lesson: ' + (error.detail || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to start lesson:', error);
      alert('Network error: Failed to start lesson');
    } finally {
      setStartingLesson(null);
    }
  };

  const handleEndChat = async () => {
    if (!conversationId) {
      alert('No active chat to end');
      return;
    }

    if (window.confirm('Are you sure you want to end this chat session?')) {
      const token = getToken();
      if (!token) {
        alert('Please log in to end chat');
        return;
      }

      try {
        const response = await fetch(`http://localhost:8000/student/end-chat/${conversationId}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || 'Failed to end chat');
        }

        setIsChatEnded(true);
        alert('Chat session ended successfully!');
      } catch (err: any) {
        console.error('Error ending chat:', err);
        alert('Failed to end chat session: ' + (err.message || 'Unknown error'));
      }
    }
  };

  // Start a new chat session
  const handleStartChat = async () => {
    if (!selectedLessonId || isLoading || isChatEnded) return;

    const token = getToken();
    if (!token) {
      alert('Please log in to start learning');
      return;
    }

    setIsLoading(true);
    setChatLog([{ role: 'bot', content: '' }]);

    try {
      const response = await fetch('http://localhost:8000/student/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: 'Start my lesson',
          thread_id: null,
          conversation_id: null,
          file_id: selectedLessonId,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'thread_id') {
                setThreadId(data.thread_id);
                if (data.conversation_id) {
                  setConversationId(data.conversation_id);
                }
              } else if (data.type === 'content') {
                accumulatedContent += data.content;
                setChatLog([{ role: 'bot', content: accumulatedContent }]);
              } else if (data.type === 'done') {
                if (data.thread_id) {
                  setThreadId(data.thread_id);
                }
                setChatStarted(true);
              } else if (data.type === 'error') {
                console.error('Error from server:', data.error);
                setChatLog([{ role: 'bot', content: `Error: ${data.error}` }]);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Start chat failed', err);
      setChatLog([{ role: 'bot', content: 'Error: Failed to start lesson' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Request a hint from the AI
  const handleGetHint = async () => {
    if (!conversationId || isLoading || isChatEnded) return;

    const token = getToken();
    if (!token) return;

    setHintLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/student/hint/${conversationId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setChatLog(prev => [...prev, { role: 'bot', content: `**Hint:** ${data.hint}` }]);
      } else {
        const error = await response.json();
        alert('Failed to get hint: ' + (error.detail || 'Unknown error'));
      }
    } catch (err) {
      console.error('Get hint failed', err);
      alert('Failed to get hint');
    } finally {
      setHintLoading(false);
    }
  };

  // Request the solution from the AI
  const handleSolve = async () => {
    if (!conversationId || isLoading || isChatEnded || !solveEnabled) return;

    if (!window.confirm('Are you sure you want to see the answer? This will be recorded.')) {
      return;
    }

    const token = getToken();
    if (!token) return;

    setSolveLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/student/solve/${conversationId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setChatLog(prev => [...prev, { role: 'bot', content: `**Solution:** The answer is **${data.answer}**\n\n${data.explanation}` }]);
      } else {
        const error = await response.json();
        alert('Failed to get solution: ' + (error.detail || 'Unknown error'));
      }
    } catch (err) {
      console.error('Get solution failed', err);
      alert('Failed to get solution');
    } finally {
      setSolveLoading(false);
    }
  };

  // Check if solve is enabled for the current lesson
  const checkSolveEnabled = async (fileId: number) => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch(`http://localhost:8000/student/lesson/${fileId}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSolveEnabled(data.solve_enabled !== false);
      }
    } catch (err) {
      console.error('Failed to check solve setting', err);
      setSolveEnabled(true);
    }
  };

  // Check solve setting when lesson changes
  useEffect(() => {
    if (selectedLessonId) {
      checkSolveEnabled(selectedLessonId);
    }
  }, [selectedLessonId]);

  const sendMessage = async () => {
    if (!message || isLoading || isChatEnded) return;

    const userMessage = message;
    const newLog: Message[] = [...chatLog, { role: 'user', content: userMessage }];
    setChatLog(newLog);
    setMessage('');
    setIsLoading(true);

    const botMessageIndex = newLog.length;
    setChatLog([...newLog, { role: 'bot', content: '' }]);

    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch('http://localhost:8000/student/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: userMessage,
          thread_id: threadId,
          conversation_id: conversationId,
          file_id: selectedLessonId,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'thread_id') {
                setThreadId(data.thread_id);
                if (data.conversation_id) {
                  setConversationId(data.conversation_id);
                }
              } else if (data.type === 'content') {
                accumulatedContent += data.content;
                setChatLog(prevLog => {
                  const updatedLog = [...prevLog];
                  updatedLog[botMessageIndex] = { role: 'bot', content: accumulatedContent };
                  return updatedLog;
                });
              } else if (data.type === 'done') {
                if (data.thread_id) {
                  setThreadId(data.thread_id);
                }
              } else if (data.type === 'error') {
                console.error('Error from server:', data.error);
                setChatLog(prevLog => {
                  const updatedLog = [...prevLog];
                  updatedLog[botMessageIndex] = { role: 'bot', content: `Error: ${data.error}` };
                  return updatedLog;
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat failed', err);
      setChatLog(prevLog => {
        const updatedLog = [...prevLog];
        updatedLog[botMessageIndex] = { role: 'bot', content: 'Error: Failed to get response' };
        return updatedLog;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get lessons filtered by classroom
  const getFilteredLessons = () => {
    if (selectedClassroomId === null) {
      return lessons;
    }
    return lessons.filter(l => l.classroom_id === selectedClassroomId);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Left Sidebar - Classrooms & Lessons */}
      <div className="w-80 flex flex-col gap-4 overflow-auto">
        {/* Classrooms Section */}
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="font-bold text-lg mb-2">My Classrooms</h3>
            {classroomsLoading ? (
              <div className="flex justify-center"><span className="loading loading-spinner"></span></div>
            ) : classrooms.length === 0 ? (
              <p className="text-sm text-gray-500">Not enrolled in any classrooms yet</p>
            ) : (
              <div className="space-y-2">
                {classrooms.map(classroom => (
                  <button
                    key={classroom.id}
                    onClick={() => setSelectedClassroomId(classroom.id)}
                    className={`btn btn-sm w-full justify-start ${
                      selectedClassroomId === classroom.id ? 'btn-primary' : 'btn-ghost'
                    }`}
                  >
                    <span className="truncate">{classroom.class_name}</span>
                    <span className="badge badge-sm">{classroom.teacher_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lessons Section */}
        <div className="card bg-base-200 flex-1">
          <div className="card-body p-4">
            <h3 className="font-bold text-lg mb-2">Available Lessons</h3>
            {lessonsLoading ? (
              <div className="flex justify-center"><span className="loading loading-spinner"></span></div>
            ) : getFilteredLessons().length === 0 ? (
              <p className="text-sm text-gray-500">
                {selectedClassroomId === null 
                  ? 'Select a classroom to view lessons'
                  : 'No lessons available yet'}
              </p>
            ) : (
              <div className="space-y-2">
                {getFilteredLessons().map(lesson => (
                  <div
                    key={lesson.id}
                    className={`card bg-base-100 ${
                      selectedLessonId === lesson.id ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <div className="card-body p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-2xl">{lesson.started ? '✅' : '📚'}</span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{lesson.name}</h4>
                          {lesson.category && (
                            <p className="text-xs text-gray-500">📁 {lesson.category}</p>
                          )}
                          {lesson.started && lesson.started_at && (
                            <p className="text-xs text-gray-400">
                              Started: {new Date(lesson.started_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleLessonSelect(lesson.id, lesson.started)}
                        disabled={startingLesson === lesson.id}
                        className={`btn btn-sm w-full mt-2 ${
                          selectedLessonId === lesson.id
                            ? 'btn-primary'
                            : lesson.started
                            ? 'btn-outline'
                            : 'btn-success'
                        }`}
                      >
                        {startingLesson === lesson.id ? (
                          <span className="loading loading-spinner loading-sm"></span>
                        ) : lesson.started ? (
                          selectedLessonId === lesson.id ? 'Selected' : 'Continue'
                        ) : (
                          'Start Learning'
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Chat Area */}
      <div className="flex-1 card bg-base-200">
        <div className="card-body p-4 flex flex-col h-full">
          <h2 className="card-title">Story Chat</h2>

          {/* Chat Messages */}
          <div className="flex-1 overflow-auto space-y-3 mb-4">
            {chatLog.length === 0 && selectedLessonId && (
              <div className="text-center py-8">
                <p className="text-lg mb-4">Ready to start learning?</p>
                <button
                  onClick={handleStartChat}
                  disabled={isLoading || isChatEnded}
                  className="btn btn-primary"
                >
                  {isLoading ? (
                    <>
                      <span className="loading loading-spinner"></span>
                      Starting...
                    </>
                  ) : (
                    'Start Lesson'
                  )}
                </button>
              </div>
            )}

            {chatLog.length === 0 && !selectedLessonId && (
              <div className="text-center py-8 text-gray-500">
                <p>Select a lesson to begin!</p>
              </div>
            )}

            {chatLog.map((log, i) => (
              <div
                key={i}
                className={`chat ${log.role === 'user' ? 'chat-end' : 'chat-start'}`}
              >
                <div className="chat-header">
                  {log.role === 'user' ? 'You' : 'StoryBot'}
                </div>
                <div
                  className={`chat-bubble ${
                    log.role === 'user'
                      ? log.isWrong
                        ? 'chat-bubble-error'
                        : 'chat-bubble-primary'
                      : 'chat-bubble-secondary'
                  }`}
                >
                  {log.content}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          {chatStarted && !isChatEnded && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleGetHint}
                disabled={hintLoading || isLoading}
                className="btn btn-outline btn-sm"
              >
                {hintLoading ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Getting Hint...
                  </>
                ) : (
                  'Get Hint'
                )}
              </button>

              {solveEnabled && (
                <button
                  onClick={handleSolve}
                  disabled={solveLoading || isLoading}
                  className="btn btn-outline btn-warning btn-sm"
                >
                  {solveLoading ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Solving...
                    </>
                  ) : (
                    'Show Answer'
                  )}
                </button>
              )}
            </div>
          )}

          {/* Message Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && !isChatEnded && sendMessage()}
              placeholder={isChatEnded ? 'Chat ended' : 'Type your answer...'}
              className="input input-bordered flex-1"
              disabled={isLoading || isChatEnded || !chatStarted}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || isChatEnded || !message.trim() || !chatStarted}
              className="btn btn-primary"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={handleEndChat}
              disabled={!conversationId || isChatEnded}
              className="btn btn-error"
            >
              {isChatEnded ? 'Chat Ended' : 'End Chat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Student;
