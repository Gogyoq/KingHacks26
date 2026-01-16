import sqlite3
import os

# Get the directory where this file is located, then go to backend/
DB_PATH = os.path.join(os.path.dirname(__file__), "account_info.db")

def migrate():
    print(f"Migrating database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Check if column exists
    c.execute("PRAGMA table_info(accounts)")
    columns = [col[1] for col in c.fetchall()]
    
    if 'flagged_as_needing_help' not in columns:
        print("Adding flagged_as_needing_help column...")
        # Add column with default 0 (False)
        c.execute("ALTER TABLE accounts ADD COLUMN flagged_as_needing_help INTEGER NOT NULL DEFAULT 0")
        print("Column added successfully.")
    else:
        print("Column flagged_as_needing_help already exists.")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
