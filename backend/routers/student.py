# student.py
import os
import json
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from backboard import BackboardClient
import sqlite3
from .accounts import get_current_user, get_user_id_from_token,get_user_assistant_id ,User, oauth2_scheme, DB_PATH as ACCOUNTS_DB_PATH
from .teacher import get_active_instructions
from jose import JWTError, jwt
from typing import Optional
from pathlib import Path
import httpx

def flag_student_as_needing_help(student_id: int):
    """Mark a student account as needing help."""
    try:
        conn = sqlite3.connect(ACCOUNTS_DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE accounts SET flagged_as_needing_help = 1 WHERE id = ?", (student_id,))
        conn.commit()
        conn.close()
        print(f"Flagged student {student_id} as needing help")
    except Exception as e:
        print(f"Error flagging student: {e}")


# Initialize router
router = APIRouter(prefix="/student", tags=["Student"])

# For token decoding
SECRET_KEY = "07491e256c50c40b71a9ddc14d90e0dd438d8863fe00ae90abc3b72878bb0741"
ALGORITHM = "HS256"

# ===== STRUCTURED OUTPUT MODELS =====

class StoryResponse(BaseModel):
    """Structured response for story generation"""
    story: str  # The narrative/story text
    question: str  # The math question to ask
    expected_answer: str  # The correct answer (e.g., "12", "3.5", "seven")
    difficulty: str  # "easy", "medium", "hard"
    hint: str  # A hint to give if the student gets it wrong

class FeedbackResponse(BaseModel):
    """Structured response for feedback after wrong answer"""
    encouragement: str  # Encouraging message
    hint: str  # Hint without giving away the answer
    question_repeated: str  # The same question asked again

# JSON schemas for Backboard response_format
STORY_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "story_response",
        "strict": True,
        "schema": StoryResponse.model_json_schema()
    }
}

FEEDBACK_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "feedback_response",
        "strict": True,
        "schema": FeedbackResponse.model_json_schema()
    }
}

# Request model
class ChatRequest(BaseModel):
    thread_id: str | None = None
    conversation_id: int | None = None
    file_id: int | None = None  # Lesson/File ID for lesson-specific chats
    message: str

#Load .env file
load_dotenv()

# Initialize Backboard Client
API_KEY = os.getenv("BACKBOARD_API_KEY")
BACKBOARD_API_KEY = API_KEY
BACKBOARD_BASE_URL = "https://app.backboard.io/api"
client = BackboardClient(API_KEY)

# System prompt for the educational story AI (structured output version)
SYSTEM_PROMPT = """You are an educational storyteller for children. Your job is to teach using engaging stories.

CRITICAL RULES - FOLLOW EXACTLY:
1. ONLY teach concepts EXPLICITLY covered in the uploaded teaching materials
2. DO NOT introduce new operations, concepts, or topics not in the materials
3. If materials teach subtraction, ask ONLY subtraction questions - NO division, multiplication, fractions, etc.
4. If materials teach multiplication, ask ONLY multiplication questions - NO other operations
5. Stay STRICTLY within the scope of what the teacher uploaded
6. Create a short, engaging story (2-3 paragraphs) that teaches concepts FROM THE MATERIALS ONLY
7. Ask exactly ONE clear question using ONLY concepts and operations from the teaching materials
8. STRICTLY follow the difficulty level provided - do NOT jump ahead

ADAPTIVE DIFFICULTY RULES (MUST FOLLOW):
The system will tell you what difficulty to use. Follow these guidelines for each level:

"easy" - Basic single-digit problems ONLY:
  - Subtraction: numbers 1-10 only (e.g., 9-3, 7-2, 10-4)
  - Simple word problems with small numbers
  - Example: "5 birds - 2 birds = ?"

"medium" - Two-digit problems WITHOUT regrouping:
  - Subtraction: numbers up to 20 (e.g., 15-8, 17-9, 20-12)
  - May include larger numbers where ones digit doesn't require borrowing
  - Example: "47-23 = ?" (no borrowing needed)

"hard" - Two-digit problems WITH regrouping/borrowing:
  - Subtraction requiring borrowing (e.g., 52-27, 64-38)
  - Multi-step problems within the material's scope
  - Example: "A library has 75 books. Students borrow 48. How many left?"

STRICT DIFFICULTY BOUNDARIES:
- If told "easy", NEVER use numbers above 10
- If told "medium", NEVER require regrouping/borrowing
- If told "hard", you MAY use regrouping but stay within material scope
- NEVER jump from easy to hard - progression must be gradual

QUESTION STYLE ADAPTATION:
- If a student struggles with a format, give MORE practice with that exact format
- Vary how you ask questions BUT only use concepts from the uploaded materials
- Pay attention to WHAT the student gets wrong and practice that specific skill

STRICT EXAMPLES:
✓ CORRECT (if materials teach subtraction): "What is 15 - 8?"
✓ CORRECT (if materials teach subtraction): "If you have 20 apples and give away 13, how many are left?"
✗ WRONG: "What is (20 - 11) / 2?" - Division is NOT in subtraction materials
✗ WRONG: "What is 5 × 3?" - Multiplication is NOT in subtraction materials
✗ WRONG: "What is 1/2 of 10?" - Fractions are NOT in subtraction materials

Your response will be parsed as JSON with these fields:
- story: The narrative text using ONLY concepts from teaching materials
- question: A question testing ONLY what's explicitly in the materials
- expected_answer: The correct answer (just the value)
- difficulty: "easy", "medium", or "hard" (USE THE DIFFICULTY YOU WERE TOLD)
- hint: A helpful clue referencing the materials"""

# Store the expected answer per thread for validation
thread_expected_answers = {}

def calculate_next_difficulty(current_difficulty: str, stats: dict) -> str:
    """
    Calculate the next difficulty based on student performance.

    Rules:
    - Start at "easy"
    - After 3 correct answers in a row at current difficulty: increase difficulty
    - After 2 wrong answers in a row: decrease difficulty
    - Never skip levels (easy -> medium -> hard, not easy -> hard)
    """
    difficulty_order = ['easy', 'medium', 'hard']
    current_idx = difficulty_order.index(current_difficulty) if current_difficulty in difficulty_order else 0

    correct_streak = stats.get('recent_correct_streak', 0)
    wrong_streak = stats.get('recent_wrong_streak', 0)

    # Increase difficulty after 3 correct in a row
    if correct_streak >= 3 and current_idx < len(difficulty_order) - 1:
        return difficulty_order[current_idx + 1]

    # Decrease difficulty after 2 wrong in a row
    if wrong_streak >= 2 and current_idx > 0:
        return difficulty_order[current_idx - 1]

    # Stay at current difficulty
    return current_difficulty

def save_message_to_conversation(conversation_id: int, role: str, content: str, is_wrong: bool = False, difficulty: str = None):
    """Save a message to the conversation_messages table."""
    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()
        c.execute(
            "INSERT INTO conversation_messages (conversation_id, role, content, is_wrong, difficulty) VALUES (?, ?, ?, ?, ?)",
            (conversation_id, role, content, 1 if is_wrong else 0, difficulty)
        )
        # Update last_message_at timestamp
        c.execute(
            "UPDATE student_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?",
            (conversation_id,)
        )
        # If wrong answer, update has_wrong_answers flag
        if is_wrong:
            c.execute(
                "UPDATE student_conversations SET has_wrong_answers = 1 WHERE id = ?",
                (conversation_id,)
            )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving message to conversation: {e}")

def get_performance_stats(conversation_id: int) -> dict:
    """Get performance statistics for a conversation to inform difficulty adjustment."""
    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()

        # Get counts of correct/wrong answers
        c.execute("""
            SELECT
                COUNT(*) as total_answers,
                SUM(CASE WHEN is_wrong = 1 THEN 1 ELSE 0 END) as wrong_count,
                SUM(CASE WHEN is_wrong = 0 THEN 1 ELSE 0 END) as correct_count
            FROM conversation_messages
            WHERE conversation_id = ? AND role = 'user'
        """, (conversation_id,))
        row = c.fetchone()

        # Get recent performance (last 5 answers)
        c.execute("""
            SELECT is_wrong, difficulty FROM conversation_messages
            WHERE conversation_id = ? AND role = 'user'
            ORDER BY id DESC LIMIT 5
        """, (conversation_id,))
        recent = c.fetchall()

        # Get difficulty distribution
        c.execute("""
            SELECT difficulty, COUNT(*) as count
            FROM conversation_messages
            WHERE conversation_id = ? AND role = 'bot' AND difficulty IS NOT NULL
            GROUP BY difficulty
        """, (conversation_id,))
        difficulty_dist = {r[0]: r[1] for r in c.fetchall()}

        conn.close()

        total = row[0] or 0
        wrong = row[1] or 0
        correct = row[2] or 0

        # Calculate recent streak
        recent_correct_streak = 0
        recent_wrong_streak = 0
        for r in recent:
            if r[0] == 0:  # correct
                recent_correct_streak += 1
            else:
                break
        for r in recent:
            if r[0] == 1:  # wrong
                recent_wrong_streak += 1
            else:
                break

        return {
            'total_answers': total,
            'correct_count': correct,
            'wrong_count': wrong,
            'accuracy': (correct / total * 100) if total > 0 else 0,
            'recent_correct_streak': recent_correct_streak,
            'recent_wrong_streak': recent_wrong_streak,
            'difficulty_distribution': difficulty_dist
        }
    except Exception as e:
        print(f"Error getting performance stats: {e}")
        return {
            'total_answers': 0,
            'correct_count': 0,
            'wrong_count': 0,
            'accuracy': 0,
            'recent_correct_streak': 0,
            'recent_wrong_streak': 0,
            'difficulty_distribution': {}
        }

def create_conversation(student_id: int, thread_id: str, file_id: int | None = None) -> int:
    """Create a new conversation for a student and return its ID."""
    conn = sqlite3.connect('chat_history.db')
    c = conn.cursor()
    c.execute(
        "INSERT INTO student_conversations (student_id, thread_id, file_id) VALUES (?, ?, ?)",
        (student_id, thread_id, file_id)
    )
    conversation_id = c.lastrowid
    conn.commit()
    conn.close()
    return conversation_id

def get_conversation_by_id(conversation_id: int) -> dict | None:
    """Get conversation details by ID."""
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM student_conversations WHERE id = ?", (conversation_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def get_active_conversation_for_lesson(student_id: int, file_id: int) -> dict | None:
    """Get the most recent active (not ended) conversation for a student and lesson."""
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT * FROM student_conversations 
        WHERE student_id = ? AND file_id = ? AND ended_at IS NULL
        ORDER BY last_message_at DESC
        LIMIT 1
    """, (student_id, file_id))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def get_most_recent_conversation_for_lesson(student_id: int, file_id: int) -> dict | None:
    """Get the most recent conversation (including ended ones) for a student and lesson."""
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT * FROM student_conversations 
        WHERE student_id = ? AND file_id = ?
        ORDER BY last_message_at DESC
        LIMIT 1
    """, (student_id, file_id))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def normalize_answer(answer: str) -> str:
    """Normalize an answer for comparison (lowercase, strip, handle number words)"""
    answer = answer.lower().strip()
    # Common number words to digits
    word_to_num = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
        'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
        'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
        'eighteen': '18', 'nineteen': '19', 'twenty': '20'
    }
    if answer in word_to_num:
        return word_to_num[answer]
    # Remove common extra characters
    answer = answer.replace('$', '').replace('%', '').replace(',', '')
    return answer

def check_answer(student_answer: str, expected_answer: str) -> bool:
    """Check if student's answer matches expected answer"""
    student_norm = normalize_answer(student_answer)
    expected_norm = normalize_answer(expected_answer)

    # Direct match
    if student_norm == expected_norm:
        return True

    # Try numeric comparison (handles "12" vs "12.0")
    try:
        return float(student_norm) == float(expected_norm)
    except ValueError:
        pass

    # Check if expected is contained in student answer (e.g., "The answer is 12" contains "12")
    if expected_norm in student_norm:
        return True

    return False

async def sync_exclusive_lesson(student_id: int, student_assistant_id: str, file_id: int):
    """
    Exclusive Mode: Ensure ONLY the selected lesson file exists in the assistant.
    Removes all other files and uploads/ensures the target file is present.
    """
    import asyncio
    
    print(f"Starting exclusive sync for student {student_id}, lesson {file_id}")
    
    try:
        # 1. Get target file info
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT id, file_path, original_filename FROM files WHERE id = ?", (file_id,))
        target_file = c.fetchone()
        conn.close()

        if not target_file:
            raise Exception("Target lesson file not found")

        target_path = Path(target_file["file_path"])
        if not target_path.exists():
            raise Exception("Target lesson file does not exist on disk")

        # RETRY WRAPPER for Backboard operations
        async def backboard_request_with_retry(operation_name, operation_coroutine, max_retries=3):
            for i in range(max_retries):
                try:
                    return await operation_coroutine()
                except Exception as e:
                    print(f"{operation_name} failed (attempt {i+1}/{max_retries}): {e}")
                    if i < max_retries - 1:
                        await asyncio.sleep(2 * (i + 1))
                    else:
                        raise e

        async with httpx.AsyncClient() as http_client:
            # 2. List all current documents in assistant
            async def list_docs():
                resp = await http_client.get(
                    f"{BACKBOARD_BASE_URL}/assistants/{student_assistant_id}/documents",
                    headers={"X-API-Key": BACKBOARD_API_KEY},
                    timeout=30.0
                )
                resp.raise_for_status()
                return resp.json()

            current_docs = await backboard_request_with_retry("List Docs", list_docs)
            print(f"Found {len(current_docs)} existing docs in assistant")

            # 3. Check if we're already in the desired state (optimization)
            # If there is exactly 1 doc and it matches our target, we are good.
            # NOTE: Backboard doc doesn't always have 'original_filename' easily matching without metadata.
            # But we can compare by checking if we have the file_id mapped.
            # For robustness, we'll just wipe and re-add unless it's empty.
            
            # To avoid re-uploading the SAME file (which takes time), we could check if 
            # the single existing file matches the target's backboard_doc_id from our DB.
            # But DB might be out of sync. 
            # Let's do the safe "Wipe All" approach first.
            
            # 4. DELETE ALL existing documents
            for doc in current_docs:
                doc_id = doc.get('document_id')
                if doc_id:
                    print(f"Removing old doc: {doc_id}")
                    async def delete_doc():
                        resp = await http_client.delete(
                            f"{BACKBOARD_BASE_URL}/documents/{doc_id}",
                            headers={"X-API-Key": BACKBOARD_API_KEY},
                            timeout=30.0
                        )
                        # 404 is fine (already deleted)
                        if resp.status_code != 404:
                            resp.raise_for_status()
                    
                    try:
                        await backboard_request_with_retry(f"Delete {doc_id}", delete_doc)
                    except Exception as e:
                        print(f"Warning: Failed to delete doc {doc_id}: {e}")

            # 5. UPLOAD target file
            print(f"Uploading target file: {target_file['original_filename']}")
            
            with open(target_path, "rb") as f:
                file_content = f.read()

            async def upload_doc():
                return await http_client.post(
                    f"{BACKBOARD_BASE_URL}/assistants/{student_assistant_id}/documents",
                    headers={"X-API-Key": BACKBOARD_API_KEY},
                    files={"file": (target_file["original_filename"], file_content)},
                    timeout=60.0
                )

            response = await backboard_request_with_retry("Upload File", upload_doc)
            
            if response.status_code == 200:
                doc_data = response.json()
                backboard_doc_id = doc_data.get("document_id")
                print(f"Uploaded new lesson: {backboard_doc_id}")
                
                # 6. POLL for indexing
                max_poll = 20
                for i in range(max_poll):
                    print(f"Waiting for indexing... ({i+1}/{max_poll})")
                    status_resp = await http_client.get(
                        f"{BACKBOARD_BASE_URL}/documents/{backboard_doc_id}/status",
                        headers={"X-API-Key": BACKBOARD_API_KEY},
                        timeout=30.0
                    )
                    if status_resp.status_code == 200:
                        status = status_resp.json().get("status")
                        if status == "indexed":
                            print("Lesson fully indexed.")
                            break
                        elif status == "error":
                            print("Indexing failed.")
                            break
                    await asyncio.sleep(1)
                
                # Update DB with new doc id
                conn = sqlite3.connect('chat_history.db')
                c = conn.cursor()
                c.execute("""
                    UPDATE files SET backboard_doc_id = ?, backboard_status = 'indexed' 
                    WHERE id = ?
                """, (backboard_doc_id, target_file["id"]))
                
                # Update or Insert student_lessons record
                # We need to know this file is linked to this student
                c.execute("SELECT id FROM student_lessons WHERE student_id = ? AND file_id = ?", (student_id, file_id))
                if c.fetchone():
                     c.execute("""
                        UPDATE student_lessons SET backboard_doc_id = ? 
                        WHERE student_id = ? AND file_id = ?
                    """, (backboard_doc_id, student_id, file_id))
                else:
                    c.execute("""
                        INSERT INTO student_lessons (student_id, file_id, backboard_doc_id)
                        VALUES (?, ?, ?)
                    """, (student_id, file_id, backboard_doc_id))
                
                conn.commit()
                conn.close()
                return backboard_doc_id
            else:
                 raise Exception(f"Upload failed: {response.status_code} {response.text}")

    except Exception as e:
        print(f"Error in sync_exclusive_lesson: {e}")
        # Re-raise so caller knows it failed
        raise e

@router.get("/available-lessons")
async def get_available_lessons(authorization: Optional[str] = Header(None)):
    """
    Get all active lessons available to students.
    """
    user_id = get_user_id_from_token(authorization) if authorization else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Please log in!")

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # FIX: Include 'pending' status so new uploads appear immediately
        # They'll just show as "Processing" until indexed
        c.execute("""
            SELECT 
                f.id,
                f.original_filename as name,
                COALESCE(c.name, 'Uncategorized') as category,
                f.uploaded_at,
                f.backboard_status,
                COALESCE(sl.id, 0) as has_started,
                sl.started_at
            FROM files f
            LEFT JOIN categories c ON f.category_id = c.id
            LEFT JOIN student_lessons sl ON f.id = sl.file_id AND sl.student_id = ?
            WHERE f.is_active = 1 
            AND f.backboard_status IN ('indexed', 'processed', 'pending', 'processing', 'retrying')
            ORDER BY f.uploaded_at DESC
        """, (user_id,))

        rows = c.fetchall()
        conn.close()

        lessons = [{
            "id": row["id"],
            "name": row["name"],
            "category": row["category"],
            "uploaded_at": row["uploaded_at"],
            "backboard_status": row["backboard_status"],
            "started": bool(row["has_started"]),
            "started_at": row["started_at"]
        } for row in rows]

        return {"lessons": lessons, "count": len(lessons)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))





@router.post("/chat")
async def chat(request: ChatRequest, authorization: Optional[str] = Header(None)):
    # Get user_id from token (works for both students and teachers)
    user_id = get_user_id_from_token(authorization) if authorization else None

    user_assistant_id = get_user_assistant_id(user_id) if user_id else None

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Please log in to start your learning adventure!"
        )

    if not user_assistant_id:
        raise HTTPException(
            status_code=400,
            detail="Your account needs to be set up. Please contact support or re-register."
        )

    async def generate_stream():
        nonlocal user_id
        conversation_id = request.conversation_id
        is_wrong_answer = False

        try:
            # 1. Handle lesson-specific conversation lookup
            if request.file_id:
                if conversation_id:
                    # Verify the conversation belongs to this lesson and user
                    conv = get_conversation_by_id(conversation_id)
                    if conv and conv.get('student_id') == user_id and conv.get('file_id') == request.file_id:
                        # Use the provided conversation
                        current_thread_id = conv['thread_id']
                        is_first_message = False
                        # If conversation is ended, create a new one
                        if conv.get('ended_at'):
                            conversation_id = None
                            current_thread_id = None
                            is_first_message = False
                    else:
                        # Invalid conversation, look for active one
                        conversation_id = None
                        active_conv = get_active_conversation_for_lesson(user_id, request.file_id)
                        if active_conv:
                            conversation_id = active_conv['id']
                            current_thread_id = active_conv['thread_id']
                            is_first_message = False
                        else:
                            current_thread_id = None
                            is_first_message = False
                else:
                    # Look for active conversation for this lesson
                    active_conv = get_active_conversation_for_lesson(user_id, request.file_id)
                    if active_conv:
                        conversation_id = active_conv['id']
                        current_thread_id = active_conv['thread_id']
                        is_first_message = False
                    else:
                        # No active conversation, will create new one below
                        current_thread_id = None
                        is_first_message = False
            else:
                # No file_id provided, use existing thread_id/conversation_id
                current_thread_id = request.thread_id
                is_first_message = False

            # 2. Create a new thread if one doesn't exist
            if not current_thread_id:
                print("Creating new thread...")
                thread = await client.create_thread(user_assistant_id)
                current_thread_id = str(thread.thread_id)
                is_first_message = True

                # Create conversation record if user is logged in
                if user_id:
                    conversation_id = create_conversation(user_id, current_thread_id, request.file_id)

                # EXCLUSIVE MODE: Sync is handled by start_lesson explicitly.
                # We do NOT sync here to avoid race conditions or unwanted context switches.
                # await auto_sync_lessons_to_student(user_id, user_assistant_id)

                # Send thread_id and conversation_id first
                yield f"data: {json.dumps({'type': 'thread_id', 'thread_id': current_thread_id, 'conversation_id': conversation_id})}\n\n"

            print(f"Student message to thread {current_thread_id}: {request.message}")

            # Save user message to conversation if we have one
            # NOTE: We skip saving here if we're in the grading block later, but tricky...
            # Actually, let's save normally here as NOT wrong, and UPDATE it to wrong if penalized later?
            # Or better: don't save here, save in logic branches?
            # Existing code saves here. Let's keep it but handle the update in the penalty block.
            if conversation_id:
                save_message_to_conversation(conversation_id, 'user', request.message, is_wrong=False)

            # Get teacher's custom instructions
            teacher_instructions = get_active_instructions()

            # Retry logic for add_message to handle potential indexing race conditions
            async def add_message_with_retry(thread_id, content, retries=3):
                import asyncio
                from backboard.exceptions import BackboardValidationError
                
                last_error = None
                for i in range(retries):
                    try:
                        return await client.add_message(
                            thread_id=thread_id,
                            content=content,
                            llm_provider="openai",
                            model_name="gpt-4o",
                            stream=True
                        )
                    except BackboardValidationError as e:
                        if "HTTP 400" in str(e):
                            print(f"Backboard 400 error (attempt {i+1}/{retries}). Waiting for indexing...")
                            await asyncio.sleep(2 * (i + 1))  # Exponential backoff: 2s, 4s, 6s
                            last_error = e
                        else:
                            raise e
                    except Exception as e:
                        # Also catch generic 400s that might be masked
                        if "HTTP 400" in str(e):
                            print(f"HTTP 400 error (attempt {i+1}/{retries}). Waiting for indexing...")
                            await asyncio.sleep(2 * (i + 1))
                            last_error = e
                        else:
                            raise e
                
                if last_error:
                    raise last_error

            # 2. If this is the first message, generate a new story with structured output
            if is_first_message:
                initial_prompt = f"""{SYSTEM_PROMPT}
{teacher_instructions}

The student wants to learn about: {request.message}

This is the START of the session, so begin with an "easy" question to warm up.

REMINDER: Only use concepts and operations explicitly taught in the uploaded materials. Do NOT introduce operations not covered in the materials.

IMPORTANT: You MUST respond with ONLY valid JSON in this exact format (no other text):
{{"story": "your story here", "question": "your question here", "expected_answer": "the answer", "difficulty": "easy", "hint": "a helpful hint"}}"""

                # Collect full response (no streaming for JSON)
                full_response = ""
                response_stream = await add_message_with_retry(
                    thread_id=current_thread_id,
                    content=initial_prompt
                )
                async for chunk in response_stream:
                    if chunk.get('type') == 'content_streaming' and chunk.get('content'):
                        full_response += chunk['content']
                    elif chunk.get('type') == 'message_complete':
                        break

                # Parse the JSON response
                try:
                    # Try to extract JSON from the response (in case there's extra text)
                    json_start = full_response.find('{')
                    json_end = full_response.rfind('}') + 1
                    if json_start >= 0 and json_end > json_start:
                        json_str = full_response[json_start:json_end]
                        story_data = json.loads(json_str)
                    else:
                        story_data = json.loads(full_response)
                    story_response = StoryResponse(**story_data)
                except json.JSONDecodeError as e:
                    print(f"JSON parse error: {e}")
                    print(f"Raw response: {full_response}")
                    # Fallback: treat as plain text story
                    story_response = StoryResponse(
                        story=full_response,
                        question="What did you learn from the story?",
                        expected_answer="",
                        difficulty="easy",
                        hint="Think about the story!"
                    )

                # Store expected answer for this thread
                thread_expected_answers[current_thread_id] = {
                    'expected_answer': story_response.expected_answer,
                    'hint': story_response.hint,
                    'question': story_response.question,
                    'difficulty': story_response.difficulty
                }
                print(f"Stored expected answer for thread {current_thread_id}: {story_response.expected_answer} (difficulty: {story_response.difficulty})")

                # Format the response for the student (story + question, NOT the answer)
                display_text = f"{story_response.story}\n\n{story_response.question}"

                # Stream the display text to the frontend
                yield f"data: {json.dumps({'type': 'content', 'content': display_text, 'thread_id': str(current_thread_id), 'conversation_id': conversation_id, 'difficulty': story_response.difficulty})}\n\n"

                # Save bot message to conversation WITH difficulty
                if conversation_id:
                    save_message_to_conversation(conversation_id, 'bot', display_text, is_wrong=False, difficulty=story_response.difficulty)

            else:
                # 3. Validate student's answer using stored expected_answer
                stored_data = thread_expected_answers.get(current_thread_id)

                if stored_data:
                    # 3.0 Check for help keywords
                    help_keywords = ["help", "hint", "stuck", "idk", "i don't know", "confused", "hard", "don't understand", "dunno"]
                    if any(keyword in request.message.lower() for keyword in help_keywords):
                        stored_data['help_used'] = True
                        print(f"Marked help used for thread {current_thread_id} (keyword detection)")
                    
                    expected = stored_data['expected_answer']
                    is_correct = check_answer(request.message, expected)
                    print(f"Answer check: '{request.message}' vs expected '{expected}' = {is_correct}")

                    # 3.1 Apply penalty if help was used
                    if is_correct and stored_data.get('help_used'):
                        print("Correct answer BUT help was used - marking as wrong/no credit")
                        # Mark as wrong in DB even though they got it right eventually
                        if conversation_id:
                            # Flag student as needing help PERMANENTLY
                            if user_id:
                                flag_student_as_needing_help(user_id)
                                
                            try:
                                # Update the LAST user message (which we just saved above) to be WRONG
                                conn = sqlite3.connect('chat_history.db')
                                c = conn.cursor()
                                c.execute("""
                                    UPDATE conversation_messages 
                                    SET is_wrong = 1 
                                    WHERE id = (
                                        SELECT id FROM conversation_messages 
                                        WHERE conversation_id = ? AND role = 'user' 
                                        ORDER BY id DESC LIMIT 1
                                    )
                                """, (conversation_id,))
                                
                                # And flag conversation
                                c.execute("UPDATE student_conversations SET has_wrong_answers = 1 WHERE id = ?", (conversation_id,))
                                conn.commit()
                                conn.close()
                                print("Updated message to wrong due to help penalty")
                            except Exception as e:
                                print(f"Error applying help penalty: {e}")
                        
                        # Reset help_used since they answered this question (even if penalized)
                        # Actually, wait - let the normal flow proceed to generate new story
                        # But we treat it as "correct" for flow control (new story), just "wrong" for grading.
                        pass
                else:
                    # No stored answer, assume correct to continue
                    is_correct = True
                    print("No stored answer found, assuming correct")

                if is_correct:
                    # Answer is correct - generate new story
                    last_difficulty = stored_data.get('difficulty', 'easy') if stored_data else 'easy'

                    # Check for difficulty override (from multiple wrong answers)
                    difficulty_override = stored_data.get('next_difficulty_override') if stored_data else None

                    # Get performance stats and calculate next difficulty
                    stats = get_performance_stats(conversation_id) if conversation_id else {}
                    if difficulty_override:
                        next_difficulty = difficulty_override
                        print(f"Using difficulty override: {next_difficulty} (was {last_difficulty})")
                        # Clear the override after using it
                        if stored_data:
                            stored_data.pop('next_difficulty_override', None)
                    else:
                        next_difficulty = calculate_next_difficulty(last_difficulty, stats)
                        print(f"Calculated next difficulty: {next_difficulty} (was {last_difficulty}, streak: {stats.get('recent_correct_streak', 0)} correct, {stats.get('recent_wrong_streak', 0)} wrong)")

                    # Build performance context for the AI
                    perf_context = f"""
STUDENT PERFORMANCE (use this to adjust teaching):
- Total answers: {stats.get('total_answers', 0)}
- Correct: {stats.get('correct_count', 0)} | Wrong: {stats.get('wrong_count', 0)}
- Accuracy: {stats.get('accuracy', 0):.0f}%
- Recent correct streak: {stats.get('recent_correct_streak', 0)}
- Recent wrong streak: {stats.get('recent_wrong_streak', 0)}

REQUIRED DIFFICULTY FOR NEXT QUESTION: {next_difficulty}
(Previous was: {last_difficulty})
"""

                    continuation_prompt = f"""Great job! The student answered correctly with: {request.message}

{SYSTEM_PROMPT}
{teacher_instructions}
{perf_context}

YOU MUST USE DIFFICULTY: "{next_difficulty}"
- If "{next_difficulty}" is "easy": Use ONLY numbers 1-10
- If "{next_difficulty}" is "medium": Use numbers up to 20, no regrouping needed
- If "{next_difficulty}" is "hard": May use regrouping/borrowing

REMINDER: Only use concepts and operations explicitly taught in the materials. Do NOT introduce division, multiplication, fractions, or any other operations not covered.

Congratulate them briefly, then continue with the same story and a NEW question at {next_difficulty} difficulty using ONLY concepts from the teaching materials.

IMPORTANT: You MUST respond with ONLY valid JSON in this exact format (no other text):
{{"story": "your story here", "question": "your question here", "expected_answer": "the answer", "difficulty": "{next_difficulty}", "hint": "a helpful hint"}}"""

                    # Collect full response
                    full_response = ""
                    response_stream = await add_message_with_retry(
                        thread_id=current_thread_id,
                        content=continuation_prompt
                    )
                    async for chunk in response_stream:
                        if chunk.get('type') == 'content_streaming' and chunk.get('content'):
                            full_response += chunk['content']
                        elif chunk.get('type') == 'message_complete':
                            break

                    # Parse the JSON response
                    try:
                        json_start = full_response.find('{')
                        json_end = full_response.rfind('}') + 1
                        if json_start >= 0 and json_end > json_start:
                            json_str = full_response[json_start:json_end]
                            story_data = json.loads(json_str)
                        else:
                            story_data = json.loads(full_response)
                        story_response = StoryResponse(**story_data)
                    except json.JSONDecodeError as e:
                        print(f"JSON parse error on continuation: {e}")
                        print(f"Raw response: {full_response}")
                        story_response = StoryResponse(
                            story=full_response,
                            question="What did you learn?",
                            expected_answer="",
                            difficulty="easy",
                            hint="Think about it!"
                        )

                    # Store new expected answer with difficulty
                    thread_expected_answers[current_thread_id] = {
                        'expected_answer': story_response.expected_answer,
                        'hint': story_response.hint,
                        'question': story_response.question,
                        'difficulty': story_response.difficulty
                    }

                    print(f"New question difficulty: {story_response.difficulty} (was {last_difficulty})")
                    display_text = f"Correct! 🎉\n\n{story_response.story}\n\n{story_response.question}"
                    is_wrong_answer = False

                else:
                    # Answer is incorrect - give hint and repeat question
                    is_wrong_answer = True
                    hint = stored_data.get('hint', 'Think about it carefully!')
                    question = stored_data.get('question', 'Try the question again.')
                    current_difficulty = stored_data.get('difficulty', 'easy')

                    # Check if we should drop difficulty after multiple wrong answers
                    stats = get_performance_stats(conversation_id) if conversation_id else {}
                    wrong_streak = stats.get('recent_wrong_streak', 0) + 1  # +1 for current wrong answer

                    if wrong_streak >= 2 and current_difficulty != 'easy':
                        # Drop difficulty and generate an easier question
                        new_difficulty = 'easy' if current_difficulty == 'medium' else 'medium'
                        display_text = f"Let's try something a bit easier! 🌟\n\n**Hint:** {hint}\n\nI'll give you a simpler problem next time. **Try again:** {question}"
                        # Update the stored difficulty for next question
                        thread_expected_answers[current_thread_id]['next_difficulty_override'] = new_difficulty
                    else:
                        display_text = f"Not quite! 🤔\n\n**Hint:** {hint}\n\n**Try again:** {question}"

                    # Mark the user message as wrong
                    if conversation_id:
                        try:
                            conn = sqlite3.connect('chat_history.db')
                            c = conn.cursor()
                            c.execute("""
                                UPDATE conversation_messages
                                SET is_wrong = 1
                                WHERE id = (
                                    SELECT id FROM conversation_messages
                                    WHERE conversation_id = ? AND role = 'user'
                                    ORDER BY id DESC LIMIT 1
                                )
                            """, (conversation_id,))
                            c.execute(
                                "UPDATE student_conversations SET has_wrong_answers = 1 WHERE id = ?",
                                (conversation_id,)
                            )
                            conn.commit()
                            conn.close()
                        except Exception as e:
                            print(f"Error marking wrong answer: {e}")

                # Get difficulty for saving (from correct branch or wrong branch)
                save_difficulty = story_response.difficulty if is_correct else current_difficulty

                # Stream the response with difficulty info
                yield f"data: {json.dumps({'type': 'content', 'content': display_text, 'thread_id': str(current_thread_id), 'conversation_id': conversation_id, 'difficulty': save_difficulty})}\n\n"

                # Save bot message to conversation with difficulty
                if conversation_id:
                    save_message_to_conversation(conversation_id, 'bot', display_text, is_wrong=False, difficulty=save_difficulty)

            # Send done signal
            yield f"data: {json.dumps({'type': 'done', 'thread_id': str(current_thread_id), 'conversation_id': conversation_id, 'was_wrong': is_wrong_answer})}\n\n"

        except Exception as e:
            print(f"Error in chat: {str(e)}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")

@router.get("/conversations")
async def get_my_conversations(current_user: User = Depends(get_current_user)):
    """Get all conversations for the logged-in student."""
    if current_user.account_type != "student":
        raise HTTPException(status_code=403, detail="Only students can view their conversations")

    # Get student_id
    conn = sqlite3.connect(ACCOUNTS_DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM accounts WHERE username = ?", (current_user.username,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Student not found")

    student_id = row[0]

    # Get conversations
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT id, thread_id, started_at, last_message_at, has_wrong_answers
        FROM student_conversations
        WHERE student_id = ?
        ORDER BY last_message_at DESC
    """, (student_id,))
    rows = c.fetchall()
    conn.close()

    return {"conversations": [dict(row) for row in rows]}


# ===== LESSON MANAGEMENT ENDPOINTS =====

@router.get("/my-lessons")
async def get_my_lessons(current_user: User = Depends(get_current_user)):
    """Get lessons the student has already started."""
    if current_user.account_type != "student":
        raise HTTPException(status_code=403, detail="Only students can view their lessons")

    # Get student_id
    conn = sqlite3.connect(ACCOUNTS_DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM accounts WHERE username = ?", (current_user.username,))
    row = c.fetchone()
    student_id = row[0] if row else None
    conn.close()

    if not student_id:
        raise HTTPException(status_code=404, detail="Student not found")

    # Get started lessons
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT sl.id, sl.file_id, sl.started_at, sl.last_accessed_at,
               f.original_filename, c.name as category_name
        FROM student_lessons sl
        JOIN files f ON sl.file_id = f.id
        LEFT JOIN categories c ON f.category_id = c.id
        WHERE sl.student_id = ?
        ORDER BY sl.last_accessed_at DESC
    """, (student_id,))
    lessons = [dict(row) for row in c.fetchall()]
    conn.close()

    return {"lessons": lessons}

@router.post("/start-lesson/{file_id}")
async def start_lesson(file_id: int, current_user: User = Depends(get_current_user)):
    """Start a lesson - syncs the document to the student's assistant."""
    if current_user.account_type != "student":
        raise HTTPException(status_code=403, detail="Only students can start lessons")

    # Get student info
    conn = sqlite3.connect(ACCOUNTS_DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, assistant_id FROM accounts WHERE username = ?", (current_user.username,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Student not found")

    student_id = row["id"]
    student_assistant_id = row["assistant_id"]

    if not student_assistant_id:
        raise HTTPException(status_code=400, detail="Student doesn't have an assistant. Please re-login.")

    # Get file info
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT id, file_path, original_filename, backboard_status
        FROM files WHERE id = ? AND is_active = 1
    """, (file_id,))
    file_row = c.fetchone()

    if not file_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Lesson not found or not available")

    # EXCLUSIVE MODE: Always sync this lesson to be the ONLY one in the assistant
    # regardless of whether it was started before.
    try:
        backboard_doc_id = await sync_exclusive_lesson(student_id, student_assistant_id, file_id)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to sync lesson: {str(e)}")

    # Update or Create DB record (sync_exclusive_lesson also handles some DB updates but good to be sure)
    c.execute("SELECT id FROM student_lessons WHERE student_id = ? AND file_id = ?", (student_id, file_id))
    existing = c.fetchone()
    
    if existing:
        c.execute("UPDATE student_lessons SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?", (existing["id"],))
        lesson_id = existing["id"]
    else:
        # Should have been inserted by sync_exclusive_lesson but we ensure return value
        c.execute("SELECT id FROM student_lessons WHERE student_id = ? AND file_id = ?", (student_id, file_id))
        row = c.fetchone()
        lesson_id = row["id"] if row else 0 # Should not happen

    conn.commit()
    conn.close()

    return {
        "message": "Lesson started successfully!",
        "lesson_id": lesson_id,
        "backboard_doc_id": backboard_doc_id
    }


@router.get("/conversations/lesson/{file_id}")
async def get_conversation_for_lesson(file_id: int, current_user: User = Depends(get_current_user)):
    """Get the most recent conversation (including ended) for a specific lesson."""
    if current_user.account_type != "student":
        raise HTTPException(status_code=403, detail="Only students can view their conversations")
    
    # Get student_id
    conn = sqlite3.connect(ACCOUNTS_DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM accounts WHERE username = ?", (current_user.username,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Student not found")
    
    student_id = row[0]
    
    # Get most recent conversation for this lesson (including ended ones)
    conv = get_most_recent_conversation_for_lesson(student_id, file_id)
    
    if not conv:
        return {"conversation": None, "messages": []}
    
    conversation_id = conv['id']
    
    # Get messages for this conversation
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT id, role, content, is_wrong, difficulty, created_at
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY id ASC
    """, (conversation_id,))
    messages = [dict(row) for row in c.fetchall()]
    conn.close()
    
    return {
        "conversation": {
            "id": conv['id'],
            "thread_id": conv['thread_id'],
            "file_id": conv.get('file_id'),
            "started_at": conv['started_at'],
            "last_message_at": conv['last_message_at'],
            "has_wrong_answers": bool(conv['has_wrong_answers']),
            "ended_at": conv.get('ended_at')
        },
        "messages": messages
    }


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int, current_user: User = Depends(get_current_user)):
    """Get all messages for a specific conversation."""
    if current_user.account_type != "student":
        raise HTTPException(status_code=403, detail="Only students can view their conversations")
    
    # Get student_id
    conn = sqlite3.connect(ACCOUNTS_DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM accounts WHERE username = ?", (current_user.username,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Student not found")
    
    student_id = row[0]
    
    # Get conversation and verify ownership
    conversation = get_conversation_by_id(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if conversation['student_id'] != student_id:
        raise HTTPException(status_code=403, detail="You can only view your own conversations")
    
    # Get messages
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT id, role, content, is_wrong, difficulty, created_at
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY id ASC
    """, (conversation_id,))
    messages = [dict(row) for row in c.fetchall()]
    conn.close()
    
    return {
        "conversation": {
            "id": conversation['id'],
            "thread_id": conversation['thread_id'],
            "file_id": conversation.get('file_id'),
            "started_at": conversation['started_at'],
            "last_message_at": conversation['last_message_at'],
            "has_wrong_answers": bool(conversation['has_wrong_answers']),
            "ended_at": conversation.get('ended_at')
        },
        "messages": messages
    }


@router.post("/hint/{conversation_id}")
async def get_hint(conversation_id: int, authorization: Optional[str] = Header(None)):
    """Get an in-depth hint for the current question without revealing the answer."""
    user_id = get_user_id_from_token(authorization) if authorization else None

    if not user_id:
        raise HTTPException(status_code=401, detail="Please log in to get hints")

    try:
        # Verify conversation belongs to user
        conv = get_conversation_by_id(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conv['student_id'] != user_id:
            raise HTTPException(status_code=403, detail="You can only get hints for your own conversations")

        thread_id = conv['thread_id']

        # Get stored question data
        stored_data = thread_expected_answers.get(thread_id)
        if not stored_data:
            raise HTTPException(status_code=400, detail="No active question found. Please answer a question first.")

        # Record hint usage
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()
        c.execute("""
            UPDATE student_conversations
            SET hints_used = COALESCE(hints_used, 0) + 1
            WHERE id = ?
        """, (conversation_id,))
        conn.commit()
        conn.close()

        # Generate a more detailed hint
        question = stored_data.get('question', '')
        basic_hint = stored_data.get('hint', '')

        # Create a detailed hint based on the question type
        detailed_hint = f"{basic_hint}\n\nThink about the problem step by step. What operation do you need to use?"

        # Mark help as used for this thread
        if thread_id in thread_expected_answers:
            thread_expected_answers[thread_id]['help_used'] = True
            print(f"Marked help used for thread {thread_id} (hint button)")

        return {
            "hint": detailed_hint,
            "question": question
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/solve/{conversation_id}")
async def solve_question(conversation_id: int, authorization: Optional[str] = Header(None)):
    """Reveal the answer to the current question. This is recorded for teacher visibility."""
    user_id = get_user_id_from_token(authorization) if authorization else None

    if not user_id:
        raise HTTPException(status_code=401, detail="Please log in")

    try:
        # Verify conversation belongs to user
        conv = get_conversation_by_id(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conv['student_id'] != user_id:
            raise HTTPException(status_code=403, detail="You can only solve your own questions")

        # Check if solve is enabled for this lesson
        file_id = conv.get('file_id')
        if file_id:
            conn = sqlite3.connect('chat_history.db')
            c = conn.cursor()
            c.execute("SELECT solve_enabled FROM files WHERE id = ?", (file_id,))
            row = c.fetchone()
            conn.close()
            if row and row[0] == 0:
                raise HTTPException(status_code=403, detail="Solve feature is disabled for this lesson")

        thread_id = conv['thread_id']

        # Get stored question data
        stored_data = thread_expected_answers.get(thread_id)
        if not stored_data:
            raise HTTPException(status_code=400, detail="No active question found")

        expected_answer = stored_data.get('expected_answer', 'Unknown')
        question = stored_data.get('question', '')
        hint = stored_data.get('hint', '')

        # Mark help as used for this thread
        if thread_id in thread_expected_answers:
            thread_expected_answers[thread_id]['help_used'] = True
            print(f"Marked help used for thread {thread_id} (solve button)")

        # Record solve usage
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()
        c.execute("""
            UPDATE student_conversations
            SET solves_used = COALESCE(solves_used, 0) + 1,
                has_wrong_answers = 1
            WHERE id = ?
        """, (conversation_id,))

        # Flag student as needing help since they used solve
        if user_id:
            flag_student_as_needing_help(user_id)

        # Also save a message indicating the student requested the solution
        c.execute(
            "INSERT INTO conversation_messages (conversation_id, role, content, is_wrong) VALUES (?, ?, ?, ?)",
            (conversation_id, 'user', '[Student requested solution]', 1)
        )
        conn.commit()
        conn.close()

        return {
            "answer": expected_answer,
            "explanation": f"The question was: {question}\n\nHint for next time: {hint}",
            "question": question
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lesson/{file_id}/settings")
async def get_lesson_settings(file_id: int, authorization: Optional[str] = Header(None)):
    """Get settings for a specific lesson (e.g., whether solve is enabled)."""
    user_id = get_user_id_from_token(authorization) if authorization else None

    if not user_id:
        raise HTTPException(status_code=401, detail="Please log in")

    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()
        c.execute("SELECT solve_enabled FROM files WHERE id = ?", (file_id,))
        row = c.fetchone()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="Lesson not found")

        return {
            "file_id": file_id,
            "solve_enabled": row[0] if row[0] is not None else True
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/end-chat/{conversation_id}")
async def end_chat(conversation_id: int, authorization: Optional[str] = Header(None)):
    """Mark a conversation as ended in the database."""
    user_id = get_user_id_from_token(authorization) if authorization else None
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Please log in to end chat")
    
    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()
        
        # Verify the conversation belongs to the user
        c.execute("SELECT student_id FROM student_conversations WHERE id = ?", (conversation_id,))
        row = c.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        if row[0] != user_id:
            conn.close()
            raise HTTPException(status_code=403, detail="You can only end your own conversations")
        
        # Update ended_at timestamp
        c.execute(
            "UPDATE student_conversations SET ended_at = CURRENT_TIMESTAMP WHERE id = ? AND ended_at IS NULL",
            (conversation_id,)
        )
        
        if c.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=400, detail="Conversation already ended")
        
        conn.commit()
        conn.close()
        return {"message": f"Chat session {conversation_id} ended successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
