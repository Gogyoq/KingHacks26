# classroom.py

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime
import sqlite3
import os
from pydantic import BaseModel
from .accounts import get_current_user, User, DB_PATH as ACCOUNTS_DB_PATH

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "classrooms.db")

router = APIRouter(prefix="/classroom", tags=["Classroom"])

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Classrooms table
    c.execute("""
    CREATE TABLE IF NOT EXISTS classrooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_name TEXT NOT NULL,
        teacher_id INTEGER NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (teacher_id) REFERENCES accounts(id)
    );
    """)

    # Junction table for student enrollments
    c.execute("""
    CREATE TABLE IF NOT EXISTS classroom_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        classroom_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        enrolled_at TEXT NOT NULL,
        FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES accounts(id) ON DELETE CASCADE,
        UNIQUE(classroom_id, student_id)
    );
    """)

    conn.commit()
    conn.close()

init_db()

# Pydantic models
class ClassroomCreate(BaseModel):
    class_name: str
    description: Optional[str] = ""

class ClassroomUpdate(BaseModel):
    class_name: Optional[str] = None
    description: Optional[str] = None

class ClassroomResponse(BaseModel):
    id: int
    class_name: str
    teacher_id: int
    teacher_name: str
    description: Optional[str]
    created_at: str
    student_count: int

class StudentEnroll(BaseModel):
    student_id: int

class StudentResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: str
    enrolled_at: str

# Helper function to get user ID
def get_user_id(username: str) -> int:
    conn_accounts = sqlite3.connect(ACCOUNTS_DB_PATH)
    c_accounts = conn_accounts.cursor()
    c_accounts.execute("SELECT id FROM accounts WHERE username = ?", (username,))
    user_row = c_accounts.fetchone()
    conn_accounts.close()

    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    return user_row[0]

# ===== REQUESTED ENDPOINTS =====

@router.post("/create")
async def create_classroom(
    classroom: ClassroomCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new classroom (teachers only). Requires class_name and optionally description."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create classrooms")

    teacher_id = get_user_id(current_user.username)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    created_at = datetime.now().isoformat()
    c.execute(
        "INSERT INTO classrooms (class_name, teacher_id, description, created_at) VALUES (?, ?, ?, ?)",
        (classroom.class_name, teacher_id, classroom.description, created_at)
    )
    classroom_id = c.lastrowid
    conn.commit()
    conn.close()

    return {
        "message": "Classroom created successfully",
        "classroom_id": classroom_id,
        "class_name": classroom.class_name
    }

@router.get("/classes")
async def get_classes(current_user: User = Depends(get_current_user)):
    """Get all classes for the current user (as teacher or student)."""
    user_id = get_user_id(current_user.username)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    if current_user.account_type == "teacher":
        # Get classrooms taught by this teacher
        c.execute("""
        SELECT c.id, c.class_name, c.teacher_id, c.description, c.created_at,
               COUNT(cs.student_id) as student_count
        FROM classrooms c
        LEFT JOIN classroom_students cs ON c.id = cs.classroom_id
        WHERE c.teacher_id = ?
        GROUP BY c.id
        ORDER BY c.created_at DESC
        """, (user_id,))
    else:
        # Get classrooms student is enrolled in
        c.execute("""
        SELECT c.id, c.class_name, c.teacher_id, c.description, c.created_at,
               COUNT(DISTINCT cs2.student_id) as student_count
        FROM classrooms c
        INNER JOIN classroom_students cs ON c.id = cs.classroom_id AND cs.student_id = ?
        LEFT JOIN classroom_students cs2 ON c.id = cs2.classroom_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
        """, (user_id,))

    rows = c.fetchall()
    conn.close()

    # Get teacher names and build response
    classrooms = []
    for row in rows:
        conn_accounts = sqlite3.connect(ACCOUNTS_DB_PATH)
        c_accounts = conn_accounts.cursor()
        c_accounts.execute("SELECT full_name FROM accounts WHERE id = ?", (row['teacher_id'],))
        teacher_row = c_accounts.fetchone()
        conn_accounts.close()

        classrooms.append({
            "id": row['id'],
            "class_name": row['class_name'],
            "teacher_id": row['teacher_id'],
            "teacher_name": teacher_row[0] if teacher_row else "Unknown",
            "description": row['description'],
            "created_at": row['created_at'],
            "student_count": row['student_count']
        })

    return {"classrooms": classrooms, "count": len(classrooms)}

@router.post("/{classroom_id}/students/add")
async def add_student(
    classroom_id: int,
    student: StudentEnroll,
    current_user: User = Depends(get_current_user)
):
    """Enroll a student in a classroom by student_id (teachers only)."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can add students")

    teacher_id = get_user_id(current_user.username)

    # Verify classroom belongs to this teacher
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT teacher_id FROM classrooms WHERE id = ?", (classroom_id,))
    classroom_row = c.fetchone()

    if not classroom_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom_row[0] != teacher_id:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only add students to your own classrooms")

    # Verify student exists and is actually a student
    conn_accounts = sqlite3.connect(ACCOUNTS_DB_PATH)
    c_accounts = conn_accounts.cursor()
    c_accounts.execute("SELECT account_type, full_name FROM accounts WHERE id = ?", (student.student_id,))
    student_row = c_accounts.fetchone()
    conn_accounts.close()

    if not student_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")

    if student_row[0] != "student":
        conn.close()
        raise HTTPException(status_code=400, detail="Only student accounts can be enrolled")

    # Enroll student
    try:
        enrolled_at = datetime.now().isoformat()
        c.execute(
            "INSERT INTO classroom_students (classroom_id, student_id, enrolled_at) VALUES (?, ?, ?)",
            (classroom_id, student.student_id, enrolled_at)
        )
        conn.commit()
        conn.close()
        return {
            "message": "Student enrolled successfully",
            "student_name": student_row[1],
            "classroom_id": classroom_id
        }
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Student already enrolled in this classroom")

@router.delete("/{classroom_id}/students/{student_id}")
async def remove_student(
    classroom_id: int,
    student_id: int,
    current_user: User = Depends(get_current_user)
):
    """Remove a student from a classroom by student_id (teachers only)."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can remove students")

    teacher_id = get_user_id(current_user.username)

    # Verify classroom belongs to this teacher
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT teacher_id FROM classrooms WHERE id = ?", (classroom_id,))
    classroom_row = c.fetchone()

    if not classroom_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom_row[0] != teacher_id:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only remove students from your own classrooms")

    # Remove student
    c.execute(
        "DELETE FROM classroom_students WHERE classroom_id = ? AND student_id = ?",
        (classroom_id, student_id)
    )
    conn.commit()

    if c.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not enrolled in this classroom")

    conn.close()
    return {"message": "Student removed successfully", "student_id": student_id}

@router.delete("/{classroom_id}")
async def delete_classroom(
    classroom_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete a classroom and all its enrollments (teachers only)."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can delete classrooms")

    teacher_id = get_user_id(current_user.username)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Verify classroom belongs to this teacher
    c.execute("SELECT teacher_id, class_name FROM classrooms WHERE id = ?", (classroom_id,))
    classroom_row = c.fetchone()

    if not classroom_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom_row[0] != teacher_id:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only delete your own classrooms")

    class_name = classroom_row[1]

    # Delete classroom (cascade will delete enrollments)
    c.execute("DELETE FROM classrooms WHERE id = ?", (classroom_id,))
    conn.commit()
    conn.close()

    return {
        "message": "Classroom deleted successfully",
        "classroom_name": class_name
    }

# ===== ADDITIONAL SUGGESTED ENDPOINTS =====

@router.get("/{classroom_id}")
async def get_classroom_details(
    classroom_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get detailed information about a specific classroom."""
    user_id = get_user_id(current_user.username)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
    SELECT c.id, c.class_name, c.teacher_id, c.description, c.created_at,
           COUNT(cs.student_id) as student_count
    FROM classrooms c
    LEFT JOIN classroom_students cs ON c.id = cs.classroom_id
    WHERE c.id = ?
    GROUP BY c.id
    """, (classroom_id,))

    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    # Verify user has access (is teacher or enrolled student)
    if current_user.account_type == "student":
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT 1 FROM classroom_students WHERE classroom_id = ? AND student_id = ?", (classroom_id, user_id))
        if not c.fetchone():
            conn.close()
            raise HTTPException(status_code=403, detail="You are not enrolled in this classroom")
        conn.close()

    # Get teacher name
    conn_accounts = sqlite3.connect(ACCOUNTS_DB_PATH)
    c_accounts = conn_accounts.cursor()
    c_accounts.execute("SELECT full_name FROM accounts WHERE id = ?", (row['teacher_id'],))
    teacher_row = c_accounts.fetchone()
    conn_accounts.close()

    return {
        "id": row['id'],
        "class_name": row['class_name'],
        "teacher_id": row['teacher_id'],
        "teacher_name": teacher_row[0] if teacher_row else "Unknown",
        "description": row['description'],
        "created_at": row['created_at'],
        "student_count": row['student_count']
    }

@router.get("/{classroom_id}/students")
async def get_classroom_students(
    classroom_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get all students enrolled in a classroom."""
    user_id = get_user_id(current_user.username)

    # Verify classroom exists and user has access
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT teacher_id FROM classrooms WHERE id = ?", (classroom_id,))
    classroom_row = c.fetchone()

    if not classroom_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Classroom not found")

    # Check access: teacher of the class or enrolled student
    is_teacher = classroom_row[0] == user_id and current_user.account_type == "teacher"
    is_enrolled = False

    if not is_teacher and current_user.account_type == "student":
        c.execute("SELECT 1 FROM classroom_students WHERE classroom_id = ? AND student_id = ?", (classroom_id, user_id))
        is_enrolled = c.fetchone() is not None

    if not is_teacher and not is_enrolled:
        conn.close()
        raise HTTPException(status_code=403, detail="You don't have access to this classroom")

    # Get enrolled students
    c.execute("SELECT student_id, enrolled_at FROM classroom_students WHERE classroom_id = ? ORDER BY enrolled_at", (classroom_id,))
    enrollments = c.fetchall()
    conn.close()

    students = []
    for student_id, enrolled_at in enrollments:
        conn_accounts = sqlite3.connect(ACCOUNTS_DB_PATH)
        conn_accounts.row_factory = sqlite3.Row
        c_accounts = conn_accounts.cursor()
        c_accounts.execute(
            "SELECT id, username, full_name, email FROM accounts WHERE id = ?",
            (student_id,)
        )
        student_row = c_accounts.fetchone()
        conn_accounts.close()

        if student_row:
            students.append({
                "id": student_row['id'],
                "username": student_row['username'],
                "full_name": student_row['full_name'],
                "email": student_row['email'],
                "enrolled_at": enrolled_at
            })

    return {"students": students, "count": len(students)}

@router.put("/{classroom_id}")
async def update_classroom(
    classroom_id: int,
    classroom_update: ClassroomUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update classroom details (teachers only)."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can update classrooms")

    teacher_id = get_user_id(current_user.username)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Verify classroom belongs to this teacher
    c.execute("SELECT teacher_id FROM classrooms WHERE id = ?", (classroom_id,))
    classroom_row = c.fetchone()

    if not classroom_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom_row[0] != teacher_id:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only update your own classrooms")

    # Build update query dynamically
    updates = []
    values = []

    if classroom_update.class_name is not None:
        updates.append("class_name = ?")
        values.append(classroom_update.class_name)

    if classroom_update.description is not None:
        updates.append("description = ?")
        values.append(classroom_update.description)

    if not updates:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(classroom_id)
    query = f"UPDATE classrooms SET {', '.join(updates)} WHERE id = ?"
    c.execute(query, values)
    conn.commit()
    conn.close()

    return {"message": "Classroom updated successfully", "classroom_id": classroom_id}

@router.get("/{classroom_id}/available-students")
async def get_available_students(
    classroom_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get all students NOT enrolled in this classroom (for easy enrollment UI)."""
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can access this endpoint")

    teacher_id = get_user_id(current_user.username)

    # Verify classroom belongs to this teacher
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT teacher_id FROM classrooms WHERE id = ?", (classroom_id,))
    classroom_row = c.fetchone()

    if not classroom_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom_row[0] != teacher_id:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only view available students for your own classrooms")

    # FIXED: Get enrolled student IDs first from classrooms database
    c.execute("SELECT student_id FROM classroom_students WHERE classroom_id = ?", (classroom_id,))
    enrolled_ids = [row[0] for row in c.fetchall()]
    conn.close()

    # Then query accounts database for students not in that list
    conn_accounts = sqlite3.connect(ACCOUNTS_DB_PATH)
    conn_accounts.row_factory = sqlite3.Row
    c_accounts = conn_accounts.cursor()

    # Get all student accounts
    c_accounts.execute("""
    SELECT id, username, full_name, email
    FROM accounts
    WHERE account_type = 'student'
    ORDER BY full_name
    """)

    all_students = c_accounts.fetchall()
    conn_accounts.close()

    # Filter out enrolled students
    available_students = [
        dict(student) for student in all_students 
        if student['id'] not in enrolled_ids
    ]

    return {"available_students": available_students, "count": len(available_students)}
