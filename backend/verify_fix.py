
import requests
import json
import sqlite3
import time

BASE_URL = "http://127.0.0.1:8004"
USERNAME = "oli69"
FILE_ID = 10

# 1. Reset State (Remove started lesson Record)
print("Resetting database state...")
conn = sqlite3.connect('chat_history.db')
c = conn.cursor()
# Get student ID for oli69
# The accounts table is in account_info.db
conn.close()

conn = sqlite3.connect('account_info.db')
c = conn.cursor()
c.execute("select id from accounts where username='oli69' limit 1")
student_id = c.fetchone()[0]
conn.close()

conn = sqlite3.connect('chat_history.db')
c = conn.cursor()
c.execute("DELETE FROM student_lessons WHERE student_id = ? AND file_id = ?", (student_id, FILE_ID))
conn.commit()
conn.close()

# 2. Get Token
print(f"Logging in as {USERNAME}...")
resp = requests.post(f"{BASE_URL}/accounts/dev/switch/{USERNAME}")
if resp.status_code != 200:
    print(f"Login failed: {resp.text}")
    exit(1)
token = resp.json()["access_token"]

# 3. Call Start Lesson
print("Calling start-lesson...")
start_time = time.time()
resp = requests.post(
    f"{BASE_URL}/student/start-lesson/{FILE_ID}",
    headers={"Authorization": f"Bearer {token}"}
)
duration = time.time() - start_time

print(f"Status: {resp.status_code}")
print(f"Duration: {duration:.2f}s")
print(resp.json())

if resp.status_code == 200 and duration > 1.0:
    print("SUCCESS: Request waited for processing.")
elif resp.status_code == 200:
    print("WARNING: Request was very fast, maybe file was already indexed or race condition not triggered.")
else:
    print("FAILURE: Request failed.")
