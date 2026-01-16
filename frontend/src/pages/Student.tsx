import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ChatContextType } from '../App';
import { BookOpen, CheckCircle, Sparkles, Lightbulb, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import LoadingAnimation from '../components/LoadingAnimation';

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
  const [chatStarted, setChatStarted] = useState(false); // Used to show/hide the chat UI area

  // New states for prefetch logic
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false); // True while fetching the FIRST message silently
  const [showChat, setShowChat] = useState(false); // True when user clicks "Begin Story" OR if history exists

  const storyEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when chat updates
  useEffect(() => {
    storyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  // Fetch available lessons on mount
  useEffect(() => {
    fetchLessons();
  }, []);

  // Auto-load chat for selected lesson when it changes
  useEffect(() => {
    if (selectedLessonId !== null) {
      loadLessonChat(selectedLessonId);
    }
  }, [selectedLessonId]);

  // Load chat history for a lesson
  const loadLessonChat = async (fileId: number) => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;

    setHistoryLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/student/conversations/lesson/${fileId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const conv = data.conversation;
        const messages = data.messages || [];

        const chatLogMessages: Message[] = messages.map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'bot',
          content: msg.content,
          isWrong: msg.is_wrong ? true : false
        }));

        if (selectedLessonId === fileId) {
          setConversationId(conv?.id || null);
          setThreadId(conv?.thread_id || null);
          setChatLog(chatLogMessages);
          setIsChatEnded(conv?.ended_at ? true : false);

          if (chatLogMessages.length > 0) {
            setChatStarted(true);
            setShowChat(true); // Show immediately if history exists
          } else {
            setChatStarted(false);
            setShowChat(false); // Don't show yet, wait for prefetch
          }
        }
      } else {
        if (selectedLessonId === fileId) {
          // No conversation found
          setConversationId(null);
          setThreadId(null);
          setChatLog([]);
          setIsChatEnded(false);
          setChatStarted(false);
          setShowChat(false);
        }
      }
    } catch (error) {
      console.error('Failed to load lesson chat:', error);
      if (selectedLessonId === fileId) {
        setConversationId(null);
        setThreadId(null);
        setChatLog([]);
        setIsChatEnded(false);
        setChatStarted(false);
        setShowChat(false);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLessonSelect = async (lessonId: number, lessonStarted: boolean) => {
    // If clicking the already selected lesson, do nothing (or we could refresh)
    if (lessonId === selectedLessonId) return;

    // Clear current chat state immediately to prevent "flicker" of old lesson content
    setChatLog([]);
    setConversationId(null);
    setThreadId(null);
    setIsChatEnded(false);
    setChatStarted(false);
    setShowChat(false); // Reset show state
    setIsPreparing(false); // Reset preparing state

    // Always call startLesson to ensure exclusive sync (Backboard wipe + upload)
    await handleStartLesson(lessonId);
  };

  const fetchLessons = async () => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;

    setLessonsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/student/available-lessons', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const fetchedLessons = data.lessons || [];
        setLessons(fetchedLessons);

        // Auto-select the first started lesson when student logs in
        // IF we want to auto-sync on login, we'd need to call startLesson here too.
        // But for now, just selecting UI state is safer to avoid accidental wipes on refresh.
        // However, if the user picks up where they left off, the assistant state *might* be stale 
        // if they played with another file in a different session (unlikely in this user flow).
        if (selectedLessonId === null && fetchedLessons.length > 0) {
          const firstStartedLesson = fetchedLessons.find((l: Lesson) => l.started);
          if (firstStartedLesson) {
            // REMOVED AUTO-SELECT: User should explicitly choose or use "Continue" if we had that feature.
            // This keeps the "Select a lesson" state clear and avoids confusion.
            // setSelectedLessonId(firstStartedLesson.id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch lessons:', error);
    } finally {
      setLessonsLoading(false);
    }
  };

  const handleStartLesson = async (lessonId: number) => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
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
        // Removed alert to verify smoother transition
        // alert(result.message || 'Lesson started! You can now chat about this topic.');

        // Refresh lessons to update "started" status/timestamp
        await fetchLessons();

        // Directly set selected ID instead of calling handleLessonSelect (avoids loop)
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

  const handleBackToLibrary = () => {
    // Clear all chat-related state to return to the initial "Select a lesson" view
    setSelectedLessonId(null);
    setConversationId(null);
    setThreadId(null);
    setChatLog([]);
    setIsChatEnded(false);
    setChatStarted(false);
    setShowChat(false);
    setIsPreparing(false);
  };

  const handleEndChat = async () => {
    if (!conversationId) {
      alert('No active chat to end');
      return;
    }

    if (window.confirm('Are you sure you want to end this chat session?')) {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
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

        // Successfully ended logic:
        alert('Chat session ended. You can start a new session now.');

        // Reset state so user goes back to library and can start fresh
        handleBackToLibrary();

        // Refresh lessons list
        fetchLessons();

      } catch (err: any) {
        console.error('Error ending chat:', err);
        alert('Failed to end chat session: ' + (err.message || 'Unknown error'));
      }
    }
  };

  // Prefetch the first message if logic dictates
  useEffect(() => {
    // Only prefetch if:
    // 1. A lesson is selected
    // 2. History loading is done
    // 3. Chat log is empty (no previous history)
    // 4. Not already preparing
    // 5. Chat is not ended
    if (selectedLessonId && !historyLoading && chatLog.length === 0 && !isPreparing && !isChatEnded) {
      prepareFirstMessage();
    }
  }, [selectedLessonId, historyLoading, chatLog, isPreparing, isChatEnded]);

  const prepareFirstMessage = async (retryCount = 0) => {
    // Double check conditions to be safe
    if (!selectedLessonId || isChatEnded) return;

    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;

    // Start preparing
    if (retryCount === 0) setIsPreparing(true);

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
      let threadIdInternal: string | null = null;
      let conversationIdInternal: number | null = null;

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
                threadIdInternal = data.thread_id;
                if (data.conversation_id) {
                  conversationIdInternal = data.conversation_id;
                }
              } else if (data.type === 'content') {
                accumulatedContent += data.content;
              } else if (data.type === 'done') {
                // When done, we update the state with the FULL message
                setThreadId(threadIdInternal || data.thread_id);
                if (conversationIdInternal) setConversationId(conversationIdInternal);

                setChatLog([{ role: 'bot', content: accumulatedContent }]);
                setChatStarted(true); // Content is ready
                setIsPreparing(false); // Done preparing
              } else if (data.type === 'error') {
                // Handle error... (similar retry logic could go here if needed)
                console.error('Error from server during prefetch:', data.error);
                setIsPreparing(false);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Prefetch failed', err);
      setIsPreparing(false);
    }
  };

  // User clicks "Begin Story" - just reveal the chat
  const handleStartChat = () => {
    setShowChat(true);
  };

  const handleGetHint = async () => {
    if (!conversationId || isLoading || isChatEnded) return;
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
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

  const handleSolve = async () => {
    if (!conversationId || isLoading || isChatEnded || !solveEnabled) return;
    if (!window.confirm('Are you sure you want to see the answer? This will be recorded.')) {
      return;
    }

    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
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

  const checkSolveEnabled = async (fileId: number) => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
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

    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

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
                // Update the bot message in real-time
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F1E8] to-[#E8DFD0] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Lesson Selection */}
          <div className="lg:col-span-1">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 p-6 sticky top-20">
              <h2 className="text-2xl font-bold text-[#4A4A4A] mb-4 flex items-center gap-2">
                <BookOpen className="w-8 h-8" />
                Your Library
              </h2>

              {lessonsLoading ? (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner loading-md text-[#8B4F47]"></span>
                </div>
              ) : lessons.length === 0 ? (
                <div className="text-center py-8 text-[#4A4A4A]/60">
                  <div className="mb-3"><BookOpen className="w-12 h-12 mx-auto" /></div>
                  <p className="text-sm">No lessons available yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      onClick={() => handleLessonSelect(lesson.id, lesson.started)}
                      disabled={startingLesson === lesson.id}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-300 ${selectedLessonId === lesson.id
                        ? 'bg-[#8B4F47] border-[#8B4F47] text-white shadow-lg'
                        : 'bg-white/50 border-[#8B9D83]/20 text-[#4A4A4A] hover:border-[#8B9D83] hover:shadow-md'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl mt-1">
                          {lesson.started ? <CheckCircle className="w-6 h-6" /> : <BookOpen className="w-6 h-6" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm mb-1 truncate">
                            {lesson.name}
                          </h3>
                          {lesson.category && (
                            <p className={`text-xs mb-1 ${selectedLessonId === lesson.id ? 'text-white/80' : 'text-[#4A4A4A]/60'}`}>
                              {lesson.category}
                            </p>
                          )}
                          {lesson.started && lesson.started_at && (
                            <p className={`text-xs ${selectedLessonId === lesson.id ? 'text-white/70' : 'text-[#4A4A4A]/50'}`}>
                              Started: {new Date(lesson.started_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Story Area */}
          <div className="lg:col-span-2">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-[#8B9D83]/20 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
              {/* Story Header */}
              <div className="px-8 py-6 border-b border-[#8B9D83]/20 bg-gradient-to-r from-[#8B9D83]/10 to-[#6B9FA3]/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedLessonId && (
                      <button
                        onClick={handleBackToLibrary}
                        className="mr-2 p-2 rounded-full hover:bg-white/20 text-[#4A4A4A] transition-colors"
                        title="Back to Library"
                      >
                        <ArrowLeft className="w-6 h-6" />
                      </button>
                    )}
                    <div className="w-12 h-12 bg-gradient-to-br from-[#8B9D83] to-[#6B9FA3] rounded-full flex items-center justify-center">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-[#4A4A4A]">Your Learning Story</h2>
                      <p className="text-sm text-[#4A4A4A]/60">An interactive adventure</p>
                    </div>
                  </div>
                  {chatStarted && !isChatEnded && (
                    <button
                      onClick={handleEndChat}
                      className="px-4 py-2 bg-[#8B4F47]/10 text-[#8B4F47] rounded-lg border border-[#8B4F47]/30 hover:bg-[#8B4F47] hover:text-white transition-all duration-300 text-sm font-medium"
                    >
                      End Story
                    </button>
                  )}
                </div>
              </div>

              {/* Story Content */}
              <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
                {startingLesson || historyLoading || isPreparing ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <LoadingAnimation
                      message="Opening this book..."
                      subMessage="Preparing your personalized lesson adventure."
                    />
                  </div>
                ) : !showChat && chatLog.length > 0 && selectedLessonId ? (
                  // Content is READY (prefetched), show the Start Button
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="mb-6 animate-in zoom-in duration-500">
                      <div className="w-24 h-24 bg-[#8B4F47]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-12 h-12 text-[#8B4F47]" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-[#4A4A4A] mb-3">Ready to begin your story?</h3>
                    <p className="text-[#4A4A4A]/70 mb-8 max-w-md mx-auto">
                      Click the button below to start your interactive learning adventure.
                    </p>
                    <button
                      onClick={handleStartChat}
                      className="px-8 py-4 bg-[#8B4F47] text-white font-semibold rounded-xl shadow-lg hover:bg-[#A0605A] hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center gap-3"
                    >
                      <BookOpen className="w-5 h-5" />
                      <span>Begin Story</span>
                    </button>
                  </div>
                ) : !selectedLessonId ? (
                  <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                    <div className="mb-6"><BookOpen className="w-16 h-16 mx-auto text-[#8B9D83]" /></div>
                    <h3 className="text-2xl font-bold text-[#4A4A4A] mb-3">Select a lesson to begin</h3>
                    <p className="text-[#4A4A4A]/70 max-w-md mx-auto">
                      Choose a book from your library on the left to start your learning journey.
                    </p>
                  </div>
                ) : null}

                {/* Story Narration */}
                {
                  showChat && chatLog.length > 0 && (
                    <div className="prose prose-lg max-w-none">
                      <div className="story-content space-y-6">
                        {chatLog.map((log, i) => (
                          <div key={i}>
                            {log.role === 'bot' ? (
                              <div className="story-narration">
                                <div className="text-[#4A4A4A] leading-relaxed font-serif text-lg markdown-content">
                                  <ReactMarkdown>{log.content}</ReactMarkdown>
                                </div>
                              </div>
                            ) : (
                              <div className="student-response my-6">
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 w-8 h-8 bg-[#6B9FA3] rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                    You
                                  </div>
                                  <div className="flex-1 bg-[#6B9FA3]/10 border-l-4 border-[#6B9FA3] rounded-r-xl px-5 py-3">
                                    <div className="text-[#4A4A4A] italic font-medium markdown-content">
                                      <ReactMarkdown>{log.content}</ReactMarkdown>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        <div ref={storyEndRef} />
                      </div>
                    </div>
                  )
                }
              </div >

              {/* Action Controls */}
              {
                chatStarted && !isChatEnded && (
                  <div className="px-8 py-4 bg-[#8B9D83]/5 border-t border-[#8B9D83]/20">
                    <div className="flex gap-2">
                      <button
                        onClick={handleGetHint}
                        disabled={hintLoading || isLoading}
                        className="flex-1 px-4 py-2 bg-[#DAA520]/20 text-[#A67C4D] rounded-lg border border-[#DAA520]/40 hover:bg-[#DAA520]/30 transition-all duration-300 font-medium text-sm disabled:opacity-50"
                      >
                        {hintLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="loading loading-spinner loading-xs"></span>
                            Getting Hint...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Lightbulb className="w-4 h-4" /> Get Hint
                          </span>
                        )}
                      </button>

                      {solveEnabled && (
                        <button
                          onClick={handleSolve}
                          disabled={solveLoading || isLoading}
                          className="flex-1 px-4 py-2 bg-[#8B4F47]/10 text-[#8B4F47] rounded-lg border border-[#8B4F47]/30 hover:bg-[#8B4F47]/20 transition-all duration-300 font-medium text-sm disabled:opacity-50"
                        >
                          {solveLoading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="loading loading-spinner loading-xs"></span>
                              Solving...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <Sparkles className="w-4 h-4" /> Show Answer
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )
              }

              {/* Input Area */}
              <div className="px-8 py-5 bg-gradient-to-t from-[#F5F1E8] to-white/50 border-t border-[#8B9D83]/20">
                <div className="flex gap-3 items-stretch">
                  <div className="flex-1">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (!isLoading && !isChatEnded && chatStarted) {
                            sendMessage();
                          }
                        }
                      }}
                      placeholder={isChatEnded ? "Story has ended" : chatStarted ? "Write your response..." : "Select and start a lesson first"}
                      disabled={isLoading || isChatEnded || !chatStarted}
                      rows={1}
                      className="w-full px-5 py-3 bg-white border-2 border-[#8B9D83]/30 rounded-2xl focus:outline-none focus:border-[#8B4F47] resize-none text-[#4A4A4A] placeholder-[#4A4A4A]/40 disabled:bg-[#8B9D83]/5 disabled:cursor-not-allowed transition-all duration-300"
                    />
                  </div>
                  <button
                    onClick={sendMessage}
                    disabled={isLoading || isChatEnded || !chatStarted || !message.trim()}
                    className="px-6 py-3 bg-[#8B4F47] text-white font-semibold rounded-2xl hover:bg-[#A0605A] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    {isLoading ? (
                      <span className="loading loading-spinner loading-sm"></span>
                    ) : (
                      <span>Send</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(139, 157, 131, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 157, 131, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 157, 131, 0.5);
        }
        .story-content {
          animation: fadeIn 0.5s ease-in;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .markdown-content p {
          margin: 0;
          white-space: pre-wrap;
        }
        .markdown-content strong {
          font-weight: 700;
        }
        .markdown-content em {
          font-style: italic;
        }
        .markdown-content ul, .markdown-content ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }
        .markdown-content li {
          margin: 0.25em 0;
        }
        .markdown-content code {
          background-color: rgba(139, 157, 131, 0.1);
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.9em;
        }
        .markdown-content pre {
          background-color: rgba(139, 157, 131, 0.1);
          padding: 1em;
          border-radius: 6px;
          overflow-x: auto;
          margin: 1em 0;
        }
        .markdown-content pre code {
          background-color: transparent;
          padding: 0;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          margin-top: 1em;
          margin-bottom: 0.5em;
          font-weight: 700;
        }
        .markdown-content blockquote {
          border-left: 4px solid rgba(139, 157, 131, 0.3);
          padding-left: 1em;
          margin: 1em 0;
          color: rgba(74, 74, 74, 0.8);
        }
      `}</style>
    </div >
  );
};

export default Student;
