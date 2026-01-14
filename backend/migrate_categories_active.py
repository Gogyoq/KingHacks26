"""
Add is_active column to categories table
"""
import sqlite3

def migrate():
    conn = sqlite3.connect('chat_history.db')
    c = conn.cursor()

    # Add is_active column to categories table
    try:
        c.execute('ALTER TABLE categories ADD COLUMN is_active BOOLEAN DEFAULT 1')
        print("Added is_active column to categories table")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("is_active column already exists in categories table")
        else:
            print(f"Error: {e}")

    conn.commit()
    conn.close()

    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
