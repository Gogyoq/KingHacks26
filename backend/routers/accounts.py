# accounts.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from backboard import BackboardClient
from dotenv import load_dotenv 
import sqlite3
import os

# Get the directory where this file is located, then go up one level to backend/
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "account_info.db")
BACKBOARD_BASE_URL = "https://app.backboard.io/api"

#THIS NEEDS TO REMAIN PRIVATE, fine for now since we have no user data to secure
SECRET_KEY = "07491e256c50c40b71a9ddc14d90e0dd438d8863fe00ae90abc3b72878bb0741"
ALGORITHM = "HS256"
# CHANGED: Increased expiry from 30 minutes to ~10 years (5,256,000 minutes)
ACCESS_TOKEN_EXPIRE_MINUTES = 5256000

# Initialize router
router = APIRouter(prefix="/accounts", tags=["Accounts"])

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            hashed_password TEXT NOT NULL,
            account_active INTEGER NOT NULL DEFAULT 1,
            account_type TEXT NOT NULL DEFAULT 'student',
            assistant_id TEXT NOT NULL DEFAULT '',
            flagged_as_needing_help INTEGER NOT NULL DEFAULT 0
        );
        """
    )

    # Migration: Add assistant_id column if it doesn't exist
    c.execute("PRAGMA table_info(accounts)")
    columns = [col[1] for col in c.fetchall()]
    if 'assistant_id' not in columns:
        c.execute("ALTER TABLE accounts ADD COLUMN assistant_id TEXT NOT NULL DEFAULT ''")
    
    if 'flagged_as_needing_help' not in columns:
        c.execute("ALTER TABLE accounts ADD COLUMN flagged_as_needing_help INTEGER NOT NULL DEFAULT 0")

    conn.commit()
    conn.close()

init_db()

async def generate_assistant_id():
    load_dotenv() 
    client = BackboardClient(api_key=os.getenv("BACKBOARD_API_KEY"))
    
    import asyncio
    
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries):
        try:
            assistant = await client.create_assistant(
                name="Story Teller Teacher",
                description="You are a friendly storyteller who is responsible for teaching a student using your stories. Create a new genre every time. The story should continue forever. Occasionally integrate math problems into the story waiting for an answer. Don't provide the answer in the question.",
            )
            return assistant.assistant_id
        except Exception as e:
            print(f"Backboard create_assistant error (attempt {attempt+1}/{max_retries}): {e}")
            last_error = e
            if attempt < max_retries - 1:
                await asyncio.sleep(2 * (attempt + 1))
            
    # If we get here, all retries failed.
    # We could raise an error, OR return a dummy ID if we want to allow login even without AI
    # For now, let's raise a specific error so the user knows.
    raise HTTPException(
        status_code=504, 
        detail=f"AI Service Timeout: Failed to create assistant after {max_retries} attempts. Backboard might be down."
    )

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

class User(BaseModel):
    username: str
    email: str | None = None
    full_name: str | None = None
    account_active: bool | None = None
    account_type: str | None = None
    assistant_id: str

class UserInDB(User):
    hashed_password: str

class UserCreate(BaseModel):
    username: str
    full_name: str
    email: str
    password: str
    account_type: str = "student"  # "student" or "teacher"

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def username_exists(username: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT 1 FROM accounts WHERE username = ? LIMIT 1;",
        (username,),
    )
    row = c.fetchone()
    conn.close()
    return row is not None

def get_user_by_email(email: str) -> UserInDB | None:
    conn = sqlite3.connect(DB_PATH)  # Fix: use account_info.db
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT id, username, full_name, email, hashed_password, 
               account_active, account_type, assistant_id 
        FROM accounts 
        WHERE email = ? 
        LIMIT 1;
    """, (email,))
    row = c.fetchone()
    conn.close()
    if row is None:
        return None
    return UserInDB(**dict(row))

def get_user_id_from_token(token: str) -> int | None:
    """Extract user_id from JWT token. Returns None if not authenticated."""
    if not token:
        return None
    try:
        # Remove 'Bearer ' prefix if present
        if token.startswith('Bearer '):
            token = token[7:]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
        # Look up user_id from accounts DB (any account type)
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id FROM accounts WHERE username = ?", (username,))
        row = c.fetchone()
        conn.close()
        return row[0] if row else None
    except JWTError:
        return None

def get_user_assistant_id(user_id: int) -> str | None:
    """Fetch the unique assistant_id for a given user from the accounts table."""
    if not user_id:
        return None

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT assistant_id FROM accounts WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()

    return row["assistant_id"] if row and row["assistant_id"] else None

def get_user(username:str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # allows name-based access
    c = conn.cursor()
    c.execute("""
        SELECT id, username, full_name, email, hashed_password, 
               account_active, account_type, assistant_id 
        FROM accounts 
        WHERE username = ? 
        LIMIT 1;
    """, (username,))
    row = c.fetchone()
    conn.close()
    if row is None:
        return None

    return UserInDB(**dict(row))

def authenticate_user(username: str, password: str):
    user = get_user(username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    
    return user

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now() + expires_delta
    else:
        expire = datetime.now() + timedelta(minutes=15)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credential_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credential_exception
        
        token_data = TokenData(username=username)
    except JWTError:
        raise credential_exception
    
    user = get_user(username=token_data.username)
    if user is None:
        raise credential_exception
    
    return user

async def wipe_assistant(assistant_id: str):
    """
    Delete ALL documents from an assistant. 
    Used to ensure a clean slate on login/registration.
    """
    load_dotenv() 
    client = BackboardClient(api_key=os.getenv("BACKBOARD_API_KEY"))
    import asyncio
    import httpx
    
    print(f"Wiping assistant {assistant_id}...")
    try:
        async with httpx.AsyncClient() as http_client:
            # 1. List docs
            resp = await http_client.get(
                f"{BACKBOARD_BASE_URL}/assistants/{assistant_id}/documents",
                headers={"X-API-Key": os.getenv("BACKBOARD_API_KEY")},
                timeout=30.0
            )
            if resp.status_code == 200:
                docs = resp.json()
                print(f"Found {len(docs)} docs to delete in assistant {assistant_id}")
                for doc in docs:
                    doc_id = doc.get("document_id")
                    if doc_id:
                        await http_client.delete(
                             f"{BACKBOARD_BASE_URL}/documents/{doc_id}",
                            headers={"X-API-Key": os.getenv("BACKBOARD_API_KEY")},
                            timeout=30.0
                        )
                print(f"Assistant {assistant_id} wiped successfully.")
            else:
                print(f"Failed to list docs for wipe: {resp.status_code}")
    except Exception as e:
        print(f"Error wiping assistant: {e}")

@router.post("/signin/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM accounts WHERE username = ?", (form_data.username,))
    row = c.fetchone()
    conn.close()
    
    if not row or not verify_password(form_data.password, row["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": row["username"]}, expires_delta=access_token_expires
    )
    
    # If student, wipe assistant on login to ensure clean slate
    if row["account_type"] == "student" and row["assistant_id"]:
        # Run cleanup in background so login is fast? 
        # Or wait to ensure it's clean? Waiting is safer for "start lesson" flow immediately after.
        await wipe_assistant(row["assistant_id"])
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Check if exists
    c.execute("SELECT id FROM accounts WHERE username = ?", (user.username,))
    if c.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already registered")
        
    hashed_password = get_password_hash(user.password)
    
    # Generate Assistant ID for everyone for simplicity (or just students/teachers)
    assistant_id = None
    try:
        assistant_id = await generate_assistant_id()
    except HTTPException as e:
        # If AI generation fails, we might still want to allow registration?
        # But for this app, AI is critical.
        print(f"Warning: Failed to create assistant: {e.detail}")
        if user.account_type == "student": # Critical for students
             conn.close()
             raise e
    except Exception as e:
        print(f"Error creating assistant: {e}")
        conn.close()
        raise HTTPException(status_code=500, detail="Failed to initialize AI assistant")

    # Cast UUID to string for SQLite
    if assistant_id:
        assistant_id = str(assistant_id)

    c.execute(
        "INSERT INTO accounts (username, full_name, email, hashed_password, account_type, assistant_id) VALUES (?, ?, ?, ?, ?, ?)",
        (user.username, user.full_name, user.email, hashed_password, user.account_type, assistant_id)
    )
    conn.commit()
    conn.close()

    # New assistant is empty by definition, no need to wipe.
    
    return {"message": "User created successfully"}

@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current logged-in user's information"""
    return {
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "account_type": current_user.account_type,
        "account_active": current_user.account_active
    }

@router.get("/students")
async def get_all_students(current_user: User = Depends(get_current_user)):
    # Only teachers can view all students
    if current_user.account_type != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view student list")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        "SELECT username, full_name, email, account_active FROM accounts WHERE account_type = 'student'"
    )
    rows = c.fetchall()
    conn.close()

    students = [dict(row) for row in rows]
    return {"students": students}


# ===== DEV-ONLY ENDPOINTS =====

@router.get("/dev/all")
async def get_all_accounts_dev():
    """
    DEV ONLY: Get all accounts for quick switching during testing.
    Returns username and account_type only (no sensitive data).
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, username, full_name, account_type FROM accounts ORDER BY account_type, username")
    rows = c.fetchall()
    conn.close()

    accounts = [dict(row) for row in rows]
    return {"accounts": accounts}


@router.post("/dev/switch/{username}", response_model=Token)
async def dev_switch_account(username: str):
    """
    DEV ONLY: Generate a token for any account without password.
    This bypasses authentication for testing purposes.
    """
    user = get_user(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

