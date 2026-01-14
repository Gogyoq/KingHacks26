from fastapi import APIRouter, Header, UploadFile, File, HTTPException, Depends
from pathlib import Path
import shutil
from datetime import datetime
import sqlite3
from pydantic import BaseModel
from .accounts import get_current_user, get_user_assistant_id, get_user_id_from_token, User, DB_PATH as ACCOUNTS_DB_PATH
from .classroom import DB_PATH as CLASSROOM_DB_PATH
import httpx
import os
from typing import Optional
from dotenv import load_dotenv
from utils import convert_document_to_markdown, can_convert

load_dotenv()

router = APIRouter(prefix="/teacher", tags=["Teacher"])

# Backboard API configuration
BACKBOARD_API_KEY = os.getenv("BACKBOARD_API_KEY")
BACKBOARD_BASE_URL = "https://app.backboard.io/api"

class CategoryCreate(BaseModel):
    name: str
    classroom_id: int

class FileCategoryUpdate(BaseModel):
    category_id: int | None

class InstructionCreate(BaseModel):
    name: str
    value: str

class AIInsightsRequest(BaseModel):
    student_id: int

def get_teacher_id_from_user(current_user: User) -> int:
    """Extract teacher ID from current_user object"""
    if hasattr(current_user, 'id'):
        return current_user.id
    elif hasattr(current_user, 'username'):
        conn = sqlite3.connect(ACCOUNTS_DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id FROM accounts WHERE username = ?", (current_user.username,))
        row = c.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return row[0]
    else:
        raise HTTPException(status_code=400, detail="Invalid user object")

# Create uploads directory with classroom subdirectories
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

def get_classroom_upload_dir(classroom_id: int) -> Path:
    """Get or create upload directory for a specific classroom"""
    classroom_dir = UPLOAD_DIR / f"classroom_{classroom_id}"
    classroom_dir.mkdir(exist_ok=True)
    return classroom_dir

def get_active_instructions(classroom_id: int) -> str:
    """Get all active instructions concatenated together for the AI system prompt."""
    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()
        c.execute("""
            SELECT instruction_value
            FROM assistant_config
            WHERE is_active = 1 AND classroom_id = ?
            ORDER BY created_at ASC
        """, (classroom_id,))
        rows = c.fetchall()
        conn.close()

        if not rows:
            return ""

        # Concatenate all active instructions
        instructions = "\n\n".join([row[0] for row in rows])
        return instructions
    except Exception as e:
        print(f"Error getting active instructions: {e}")
        return ""

def verify_teacher_owns_classroom(teacher_id: int, classroom_id: int):
    """Verify that a teacher owns a specific classroom"""
    conn = sqlite3.connect(CLASSROOM_DB_PATH)
    c = conn.cursor()
    c.execute("SELECT teacher_id FROM classrooms WHERE id = ?", (classroom_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")
    if row[0] != teacher_id:
        raise HTTPException(status_code=403, detail="You don't have access to this classroom")

def init_classroom_db():
    """Initialize database with classroom_id columns"""
    conn = sqlite3.connect('chat_history.db')
    c = conn.cursor()

    # Check if files table exists before altering
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='files'")
    if c.fetchone():
        # Add classroom_id to files table if it doesn't exist
        c.execute("PRAGMA table_info(files)")
        columns = [col[1] for col in c.fetchall()]
        if 'classroom_id' not in columns:
            try:
                c.execute("ALTER TABLE files ADD COLUMN classroom_id INTEGER")
                conn.commit()
            except sqlite3.OperationalError as e:
                print(f"Could not add classroom_id to files: {e}")

    # Check if categories table exists before altering
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
    if c.fetchone():
        # Add classroom_id to categories table if it doesn't exist
        c.execute("PRAGMA table_info(categories)")
        columns = [col[1] for col in c.fetchall()]
        if 'classroom_id' not in columns:
            try:
                c.execute("ALTER TABLE categories ADD COLUMN classroom_id INTEGER")
                conn.commit()
            except sqlite3.OperationalError as e:
                print(f"Could not add classroom_id to categories: {e}")

    # Check if assistant_config table exists before altering
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='assistant_config'")
    if c.fetchone():
        # Add classroom_id to assistant_config table if it doesn't exist
        c.execute("PRAGMA table_info(assistant_config)")
        columns = [col[1] for col in c.fetchall()]
        if 'classroom_id' not in columns:
            try:
                c.execute("ALTER TABLE assistant_config ADD COLUMN classroom_id INTEGER")
                conn.commit()
            except sqlite3.OperationalError as e:
                print(f"Could not add classroom_id to assistant_config: {e}")

    conn.close()

# Call this at module load
init_classroom_db()

# ============================================================================
# FILE MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/{classroom_id}/upload")
async def upload_files(
    classroom_id: int,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    authorization: Optional[str] = Header(None)
):
    """
    Upload one or more lesson files to a specific classroom.
    Saves files locally AND uploads to Backboard assistant for RAG.
    """
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can upload files")

    user_id = get_teacher_id_from_user(current_user)
    user_assistant_id = get_user_assistant_id(user_id) if user_id else None

    if not user_id:
        raise HTTPException(status_code=401, detail="Please log in to start your learning adventure!")
    if not user_assistant_id:
        raise HTTPException(status_code=400, detail="Your account needs to be set up. Please contact support or re-register.")

    # Verify teacher owns this classroom
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        uploaded_files = []
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()

        # Get classroom-specific upload directory
        classroom_dir = get_classroom_upload_dir(classroom_id)

        for file in files:
            # Create a unique filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            safe_filename = f"{timestamp}_{file.filename}"
            file_path = classroom_dir / safe_filename

            # Read file content for Backboard upload
            file_content = await file.read()

            # Save locally
            with file_path.open("wb") as buffer:
                buffer.write(file_content)

            file_size = file_path.stat().st_size

            # Upload to Backboard assistant for RAG
            backboard_doc_id = None
            backboard_status = "not_uploaded"
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{BACKBOARD_BASE_URL}/assistants/{user_assistant_id}/documents",
                        headers={"X-API-Key": BACKBOARD_API_KEY},
                        files={"file": (file.filename, file_content)},
                        timeout=60.0
                    )

                    if response.status_code == 200:
                        doc_data = response.json()
                        backboard_doc_id = doc_data.get("document_id")
                        backboard_status = doc_data.get("status", "pending")
                        print(f"Uploaded to Backboard: {backboard_doc_id} - {backboard_status}")
                    else:
                        print(f"Backboard upload failed: {response.status_code} - {response.text}")
                        backboard_status = "upload_failed"
            except Exception as e:
                print(f"Backboard upload error: {e}")
                backboard_status = "upload_error"

            # Save to database with classroom_id and is_active
            try:
                c.execute(
                    """INSERT INTO files 
                       (filename, original_filename, file_path, file_size, backboard_doc_id, backboard_status, classroom_id, is_active)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (safe_filename, file.filename, str(file_path), file_size, backboard_doc_id, backboard_status, classroom_id, 1)
                )

                file_id = c.lastrowid
                uploaded_files.append({
                    "id": file_id,
                    "filename": safe_filename,
                    "original_filename": file.filename,
                    "size": file_size,
                    "path": str(file_path),
                    "backboard_doc_id": backboard_doc_id,
                    "backboard_status": backboard_status,
                    "classroom_id": classroom_id,
                    "is_active": True
                })
            except Exception as db_error:
                print(f"Database error for {file.filename}: {db_error}")
                # Delete the local file if DB insert fails
                if file_path.exists():
                    file_path.unlink()
                raise HTTPException(status_code=500, detail=f"Database error: {str(db_error)}")

        conn.commit()
        conn.close()

        return {
            "message": f"{len(uploaded_files)} file(s) uploaded successfully to classroom",
            "files": uploaded_files,
            "count": len(uploaded_files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/{classroom_id}/files")
async def list_files(classroom_id: int, current_user: User = Depends(get_current_user)):
    """
    List all uploaded files for a specific classroom with category and Backboard status information.
    """
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view files")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute("""
            SELECT f.id, f.filename, f.original_filename, f.file_size, 
                   f.uploaded_at, f.is_active, f.category_id, c.name as category_name,
                   f.backboard_doc_id, f.backboard_status, f.classroom_id
            FROM files f
            LEFT JOIN categories c ON f.category_id = c.id
            WHERE f.classroom_id = ?
            ORDER BY f.uploaded_at DESC
        """, (classroom_id,))

        rows = c.fetchall()
        conn.close()

        files = [dict(row) for row in rows]
        return {"files": files, "count": len(files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{classroom_id}/files/{file_id}")
async def delete_file(classroom_id: int, file_id: int, current_user: User = Depends(get_current_user)):
    """
    Delete a file from database, filesystem, AND Backboard.
    """
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can delete files")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Get file info and verify it belongs to this classroom
        c.execute(
            "SELECT file_path, backboard_doc_id, classroom_id FROM files WHERE id = ?",
            (file_id,)
        )
        row = c.fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="File not found")

        if row["classroom_id"] != classroom_id:
            conn.close()
            raise HTTPException(status_code=403, detail="File does not belong to this classroom")

        file_path = Path(row["file_path"])
        backboard_doc_id = row["backboard_doc_id"]

        # Delete from Backboard if it exists there
        if backboard_doc_id:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.delete(
                        f"{BACKBOARD_BASE_URL}/documents/{backboard_doc_id}",
                        headers={"X-API-Key": BACKBOARD_API_KEY},
                        timeout=30.0
                    )

                    if response.status_code == 200:
                        print(f"Deleted from Backboard: {backboard_doc_id}")
                    else:
                        print(f"Backboard delete failed: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"Backboard delete error: {e}")

        # Delete from database
        c.execute("DELETE FROM files WHERE id = ?", (file_id,))
        conn.commit()
        conn.close()

        # Delete physical file
        if file_path.exists():
            file_path.unlink()

        return {"message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{classroom_id}/files/{file_id}/toggle")
async def toggle_file_active(classroom_id: int, file_id: int, current_user: User = Depends(get_current_user)):
    """Toggle file active/inactive status"""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can modify files")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Verify file belongs to classroom
        c.execute("SELECT is_active, classroom_id FROM files WHERE id = ?", (file_id,))
        row = c.fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="File not found")

        if row["classroom_id"] != classroom_id:
            conn.close()
            raise HTTPException(status_code=403, detail="File not in this classroom")

        new_status = 0 if row["is_active"] else 1
        c.execute("UPDATE files SET is_active = ? WHERE id = ?", (new_status, file_id))
        conn.commit()
        conn.close()

        return {"message": "File status updated", "is_active": bool(new_status)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{classroom_id}/files/{file_id}/category")
async def update_file_category(
    classroom_id: int,
    file_id: int,
    category_update: FileCategoryUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update file category"""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can modify files")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()

        # Verify file belongs to classroom
        c.execute("SELECT classroom_id FROM files WHERE id = ?", (file_id,))
        row = c.fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="File not found")

        if row[0] != classroom_id:
            conn.close()
            raise HTTPException(status_code=403, detail="File not in this classroom")

        c.execute("UPDATE files SET category_id = ? WHERE id = ?", (category_update.category_id, file_id))
        conn.commit()
        conn.close()

        return {"message": "File category updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# CATEGORY MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/{classroom_id}/categories")
async def list_categories(classroom_id: int, current_user: User = Depends(get_current_user)):
    """
    List all categories for a specific classroom.
    """
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view categories")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute("""
            SELECT * FROM categories
            WHERE classroom_id = ?
            ORDER BY created_at ASC
        """, (classroom_id,))

        rows = c.fetchall()
        conn.close()

        categories = [dict(row) for row in rows]
        return {"categories": categories, "count": len(categories)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{classroom_id}/categories")
async def create_category(
    classroom_id: int,
    category: CategoryCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new category for a specific classroom.
    """
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create categories")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()

        c.execute(
            "INSERT INTO categories (name, classroom_id) VALUES (?, ?)",
            (category.name, classroom_id)
        )

        category_id = c.lastrowid
        conn.commit()
        conn.close()

        return {
            "message": "Category created successfully",
            "id": category_id,
            "name": category.name,
            "classroom_id": classroom_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{classroom_id}/categories/{category_id}")
async def delete_category(classroom_id: int, category_id: int, current_user: User = Depends(get_current_user)):
    """Delete a category"""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can delete categories")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()

        # Verify category belongs to classroom
        c.execute("SELECT classroom_id FROM categories WHERE id = ?", (category_id,))
        row = c.fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Category not found")

        if row[0] != classroom_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Category not in this classroom")

        # Remove category from files
        c.execute("UPDATE files SET category_id = NULL WHERE category_id = ?", (category_id,))

        # Delete category
        c.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        conn.commit()
        conn.close()

        return {"message": "Category deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# DASHBOARD ENDPOINTS
# ============================================================================

@router.get("/{classroom_id}/dashboard/stats")
async def get_dashboard_stats(classroom_id: int, current_user: User = Depends(get_current_user)):
    """
    Get classroom-specific dashboard statistics.
    Returns: active students (in this classroom), sessions today, class accuracy, students needing help.
    """
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view dashboard")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Get students enrolled in this classroom
        classroom_conn = sqlite3.connect(CLASSROOM_DB_PATH)
        classroom_c = classroom_conn.cursor()
        classroom_c.execute(
            "SELECT student_id FROM classroom_students WHERE classroom_id = ?",
            (classroom_id,)
        )
        student_ids = [row[0] for row in classroom_c.fetchall()]
        classroom_conn.close()

        if not student_ids:
            return {
                "active_students": 0,
                "sessions_today": 0,
                "class_accuracy": 0,
                "students_needing_help": 0
            }

        student_ids_str = ','.join('?' * len(student_ids))

        # Active students in last 7 days (from this classroom)
        c.execute(f"""
            SELECT COUNT(DISTINCT student_id) as count
            FROM student_conversations
            WHERE student_id IN ({student_ids_str})
            AND DATE(last_message_at) >= DATE('now', '-7 days')
        """, student_ids)
        active_students = c.fetchone()['count']

        # Sessions today (from this classroom)
        c.execute(f"""
            SELECT COUNT(*) as count
            FROM student_conversations
            WHERE student_id IN ({student_ids_str})
            AND DATE(created_at) = DATE('now')
        """, student_ids)
        sessions_today = c.fetchone()['count']

        # Calculate classroom accuracy
        c.execute(f"""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_wrong = 1 THEN 1 ELSE 0 END) as wrong
            FROM conversation_messages cm
            JOIN student_conversations sc ON cm.conversation_id = sc.id
            WHERE cm.role = 'user' AND sc.student_id IN ({student_ids_str})
        """, student_ids)
        accuracy_row = c.fetchone()
        total_answers = accuracy_row['total'] or 0
        wrong_answers = accuracy_row['wrong'] or 0
        correct_answers = total_answers - wrong_answers
        class_accuracy = round((correct_answers / total_answers * 100), 1) if total_answers > 0 else 0

        # Students needing help in this classroom
        c.execute(f"""
            SELECT COUNT(DISTINCT sc.student_id) as count
            FROM student_conversations sc
            WHERE sc.has_wrong_answers = 1
            AND sc.student_id IN ({student_ids_str})
            AND DATE(sc.last_message_at) >= DATE('now', '-7 days')
        """, student_ids)
        students_needing_help = c.fetchone()['count']

        conn.close()

        return {
            "active_students": active_students,
            "sessions_today": sessions_today,
            "class_accuracy": class_accuracy,
            "students_needing_help": students_needing_help
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{classroom_id}/dashboard/students")
async def get_dashboard_students(classroom_id: int, current_user: User = Depends(get_current_user)):
    """
    Get per-student performance summary for a specific classroom dashboard.
    Returns: student info, total sessions, accuracy %, last active, status.
    """
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view dashboard")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        # Get students enrolled in this classroom
        classroom_conn = sqlite3.connect(CLASSROOM_DB_PATH)
        classroom_c = classroom_conn.cursor()
        classroom_c.execute(
            "SELECT student_id FROM classroom_students WHERE classroom_id = ?",
            (classroom_id,)
        )
        student_ids = [row[0] for row in classroom_c.fetchall()]
        classroom_conn.close()

        if not student_ids:
            return {"students": []}

        # Get student performance data
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        student_ids_str = ','.join('?' * len(student_ids))

        c.execute(f"""
            SELECT 
                sc.student_id,
                COUNT(DISTINCT sc.id) as total_sessions,
                MAX(sc.last_message_at) as last_active,
                COUNT(cm.id) as total_answers,
                SUM(CASE WHEN cm.is_wrong = 1 THEN 1 ELSE 0 END) as wrong_answers
            FROM student_conversations sc
            LEFT JOIN conversation_messages cm ON sc.id = cm.conversation_id AND cm.role = 'user'
            WHERE sc.student_id IN ({student_ids_str})
            GROUP BY sc.student_id
            ORDER BY last_active DESC
        """, student_ids)

        student_data = c.fetchall()
        conn.close()

        # Get student info from accounts DB
        accounts_conn = sqlite3.connect(ACCOUNTS_DB_PATH)
        accounts_conn.row_factory = sqlite3.Row
        ac = accounts_conn.cursor()

        students = []
        for row in student_data:
            ac.execute(
                "SELECT username, full_name FROM accounts WHERE id = ? AND account_type = ?",
                (row['student_id'], 'student')
            )
            account = ac.fetchone()

            if not account:
                continue

            total = row['total_answers'] or 0
            wrong = row['wrong_answers'] or 0
            correct = total - wrong
            accuracy = round((correct / total * 100), 1) if total > 0 else 0

            # Determine status
            if accuracy >= 70:
                status = "good"
            elif accuracy >= 50:
                status = "warning"
            else:
                status = "needs_help"

            students.append({
                "student_id": row['student_id'],
                "username": account['username'],
                "full_name": account['full_name'],
                "total_sessions": row['total_sessions'],
                "accuracy_percent": accuracy,
                "last_active": row['last_active'],
                "status": status
            })

        accounts_conn.close()

        return {"students": students}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# STUDENT MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/{classroom_id}/students")
async def get_classroom_students(classroom_id: int, current_user: User = Depends(get_current_user)):
    """Get all students enrolled in a specific classroom."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view students")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        classroom_conn = sqlite3.connect(CLASSROOM_DB_PATH)
        classroom_conn.row_factory = sqlite3.Row
        classroom_c = classroom_conn.cursor()

        classroom_c.execute("""
            SELECT cs.student_id, a.username, a.full_name, a.email, a.account_active
            FROM classroom_students cs
            JOIN accounts a ON cs.student_id = a.id
            WHERE cs.classroom_id = ?
            ORDER BY a.full_name
        """, (classroom_id,))

        students = [dict(row) for row in classroom_c.fetchall()]
        classroom_conn.close()

        return {"students": students}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# CONVERSATION MONITORING ENDPOINTS
# ============================================================================

@router.get("/{classroom_id}/conversations")
async def get_classroom_conversations(
    classroom_id: int,
    status: str = "all",  # all, active, ended
    current_user: User = Depends(get_current_user)
):
    """Get all conversations for students in a classroom."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view conversations")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        # Get student IDs in this classroom
        classroom_conn = sqlite3.connect(CLASSROOM_DB_PATH)
        classroom_c = classroom_conn.cursor()
        classroom_c.execute(
            "SELECT student_id FROM classroom_students WHERE classroom_id = ?",
            (classroom_id,)
        )
        student_ids = [row[0] for row in classroom_c.fetchall()]
        classroom_conn.close()

        if not student_ids:
            return {"conversations": []}

        # Get conversations
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        student_ids_str = ','.join('?' * len(student_ids))

        query = f"""
            SELECT sc.*, a.username, a.full_name
            FROM student_conversations sc
            JOIN accounts a ON sc.student_id = a.id
            WHERE sc.student_id IN ({student_ids_str})
        """

        if status == "ended":
            query += " AND sc.ended_at IS NOT NULL"
        elif status == "active":
            query += " AND sc.ended_at IS NULL"

        query += " ORDER BY sc.last_message_at DESC"

        c.execute(query, student_ids)
        conversations = [dict(row) for row in c.fetchall()]
        conn.close()

        return {"conversations": conversations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{classroom_id}/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    classroom_id: int,
    conversation_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get all messages in a conversation."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view messages")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Verify conversation belongs to a student in this classroom
        c.execute("SELECT student_id FROM student_conversations WHERE id = ?", (conversation_id,))
        conv_row = c.fetchone()

        if not conv_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Verify student is in this classroom
        classroom_conn = sqlite3.connect(CLASSROOM_DB_PATH)
        classroom_c = classroom_conn.cursor()
        classroom_c.execute(
            "SELECT 1 FROM classroom_students WHERE classroom_id = ? AND student_id = ?",
            (classroom_id, conv_row['student_id'])
        )
        if not classroom_c.fetchone():
            classroom_conn.close()
            conn.close()
            raise HTTPException(status_code=403, detail="Conversation not in this classroom")
        classroom_conn.close()

        # Get messages
        c.execute("""
            SELECT * FROM conversation_messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        """, (conversation_id,))

        messages = [dict(row) for row in c.fetchall()]
        conn.close()

        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# INSTRUCTION MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/{classroom_id}/instructions")
async def get_classroom_instructions(classroom_id: int, current_user: User = Depends(get_current_user)):
    """Get all AI instructions for a specific classroom."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view instructions")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute("""
            SELECT * FROM assistant_config
            WHERE classroom_id = ?
            ORDER BY created_at DESC
        """, (classroom_id,))

        instructions = [dict(row) for row in c.fetchall()]
        conn.close()

        return {"instructions": instructions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{classroom_id}/instructions")
async def create_instruction(
    classroom_id: int,
    instruction: InstructionCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new AI instruction for a classroom."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create instructions")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()

        c.execute("""
            INSERT INTO assistant_config (instruction_name, instruction_value, classroom_id, is_active)
            VALUES (?, ?, ?, 1)
        """, (instruction.name, instruction.value, classroom_id))

        instruction_id = c.lastrowid
        conn.commit()
        conn.close()

        return {
            "message": "Instruction created successfully",
            "id": instruction_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{classroom_id}/instructions/{instruction_id}")
async def delete_instruction(
    classroom_id: int,
    instruction_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete an AI instruction."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can delete instructions")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        c = conn.cursor()

        # Verify instruction belongs to this classroom
        c.execute("SELECT classroom_id FROM assistant_config WHERE id = ?", (instruction_id,))
        row = c.fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Instruction not found")

        if row[0] != classroom_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Instruction not in this classroom")

        c.execute("DELETE FROM assistant_config WHERE id = ?", (instruction_id,))
        conn.commit()
        conn.close()

        return {"message": "Instruction deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{classroom_id}/instructions/{instruction_id}/toggle")
async def toggle_instruction(
    classroom_id: int,
    instruction_id: int,
    current_user: User = Depends(get_current_user)
):
    """Toggle instruction active/inactive status."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can modify instructions")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Verify instruction belongs to classroom
        c.execute("SELECT is_active, classroom_id FROM assistant_config WHERE id = ?", (instruction_id,))
        row = c.fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Instruction not found")

        if row["classroom_id"] != classroom_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Instruction not in this classroom")

        new_status = 0 if row["is_active"] else 1
        c.execute("UPDATE assistant_config SET is_active = ? WHERE id = ?", (new_status, instruction_id))
        conn.commit()
        conn.close()

        return {"message": "Instruction status updated", "is_active": bool(new_status)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# AI INSIGHTS ENDPOINT
# ============================================================================

@router.post("/{classroom_id}/ai-insights")
async def generate_ai_insights(
    classroom_id: int,
    request: AIInsightsRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate AI insights for a specific student's performance."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can generate insights")

    user_id = get_teacher_id_from_user(current_user)
    verify_teacher_owns_classroom(user_id, classroom_id)

    try:
        # Verify student is in classroom
        classroom_conn = sqlite3.connect(CLASSROOM_DB_PATH)
        classroom_c = classroom_conn.cursor()
        classroom_c.execute(
            "SELECT 1 FROM classroom_students WHERE classroom_id = ? AND student_id = ?",
            (classroom_id, request.student_id)
        )
        if not classroom_c.fetchone():
            classroom_conn.close()
            raise HTTPException(status_code=404, detail="Student not in classroom")
        classroom_conn.close()

        # Get student conversation data
        conn = sqlite3.connect('chat_history.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute("""
            SELECT cm.content, cm.is_wrong, cm.created_at
            FROM conversation_messages cm
            JOIN student_conversations sc ON cm.conversation_id = sc.id
            WHERE sc.student_id = ? AND cm.role = 'user'
            ORDER BY cm.created_at DESC
            LIMIT 50
        """, (request.student_id,))

        messages = c.fetchall()
        conn.close()

        if not messages:
            return {
                "insights": {
                    "struggles": "No data available yet.",
                    "strengths": "Student hasn't started learning yet.",
                    "recommendations": "Encourage the student to begin their first session."
                }
            }

        # Analyze the data (simplified - you can integrate with OpenAI here)
        wrong_count = sum(1 for msg in messages if msg['is_wrong'])
        accuracy = ((len(messages) - wrong_count) / len(messages) * 100) if messages else 0

        # Simple rule-based insights (replace with AI call to OpenAI/Claude)
        if accuracy >= 80:
            struggles = "Performing excellently with minimal struggles."
            strengths = f"Strong understanding demonstrated across {len(messages)} practice questions with {accuracy:.1f}% accuracy."
            recommendations = "Continue current pace. Consider advancing to more challenging material."
        elif accuracy >= 70:
            struggles = "Occasional difficulties with some concepts, but overall solid performance."
            strengths = f"Good grasp of most material with {accuracy:.1f}% accuracy over {len(messages)} questions."
            recommendations = "Review questions marked wrong to reinforce weak areas."
        elif accuracy >= 50:
            struggles = "Struggling with several key concepts. Multiple incorrect answers suggest knowledge gaps."
            strengths = f"Showing effort with {len(messages)} practice attempts."
            recommendations = "Schedule 1-on-1 review session. Focus on foundational concepts before advancing."
        else:
            struggles = f"Significant difficulties across most topics. Only {accuracy:.1f}% accuracy indicates fundamental understanding issues."
            strengths = "Persistent in attempting practice despite challenges."
            recommendations = "Immediate intervention needed. Consider alternative teaching methods or additional support resources."

        return {
            "insights": {
                "struggles": struggles,
                "strengths": strengths,
                "recommendations": recommendations
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
