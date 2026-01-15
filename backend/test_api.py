import sqlite3
import json

conn = sqlite3.connect('chat_history.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

student_id = 1

# Get conversations
c.execute("""
    SELECT id, started_at, last_message_at, has_wrong_answers, thread_id
    FROM student_conversations
    WHERE student_id = ?
    ORDER BY last_message_at DESC
""", (student_id,))
conversations = [dict(row) for row in c.fetchall()]

print(f"Found {len(conversations)} conversations for student {student_id}")

# For each conversation, fetch messages
for conv in conversations:
    c.execute("""
        SELECT id, role, content, is_wrong, created_at, difficulty
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
    """, (conv['id'],))
    msgs = [dict(row) for row in c.fetchall()]
    conv['messages'] = msgs
    print(f"Conv {conv['id']}: attached {len(msgs)} messages")

conn.close()

# Simulate what frontend receives
result = {"conversations": conversations}
print("\n--- JSON Output (first conv sample) ---")
if len(result['conversations']) > 0:
    sample = result['conversations'][0]
    print(f"Conv ID: {sample['id']}")
    print(f"Has 'messages' key: {'messages' in sample}")
    print(f"Messages count: {len(sample.get('messages', []))}")
