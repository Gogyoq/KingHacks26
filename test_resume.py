import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def get_student_token():
    # 1. Get all accounts
    try:
        resp = requests.get(f"{BASE_URL}/accounts/dev/all")
        if resp.status_code != 200:
            print(f"Failed to list accounts: {resp.status_code}")
            return None
        
        accounts = resp.json().get("accounts", [])
        student = next((a for a in accounts if a["account_type"] == "student"), None)
        
        if not student:
            print("No student account found.")
            return None
            
        print(f"Found student: {student['username']}")
        
        # 2. Get token
        resp = requests.post(f"{BASE_URL}/accounts/dev/switch/{student['username']}")
        if resp.status_code != 200:
            print(f"Failed to get token: {resp.status_code}")
            return None
            
        return resp.json().get("access_token")
        
    except Exception as e:
        print(f"Connection error: {e}")
        return None

def test_resume():
    token = get_student_token()
    if not token:
        print("Skipping test: No token available.")
        return

    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Get started lessons
    resp = requests.get(f"{BASE_URL}/student/my-lessons", headers=headers)
    if resp.status_code != 200:
        print(f"Failed to get lessons: {resp.status_code}")
        return
        
    lessons = resp.json().get("lessons", [])
    if not lessons:
        print("No started lessons found for this student. Please start a lesson manually first to verify.")
        return
        
    # Pick the most recent one
    lesson = lessons[0]
    file_id = lesson['file_id']
    print(f"Testing with lesson: {lesson['original_filename']} (ID: {file_id})")
    
    # 4. Get active conversation
    resp = requests.get(f"{BASE_URL}/student/conversations/lesson/{file_id}", headers=headers)
    if resp.status_code != 200:
        print("Failed to get conversation.")
        return
        
    data = resp.json()
    conv = data.get("conversation")
    messages = data.get("messages", [])
    
    if not conv or not messages:
        print("No active conversation/messages found to resume.")
        return

    print(f"Found conversation ID: {conv['id']}")
    
    # 5. Send "Start my lesson" request
    payload = {
        "message": "Start my lesson",
        "file_id": file_id,
        "conversation_id": conv['id'],
        "thread_id": conv['thread_id']
    }
    
    print("Sending 'Start my lesson' request...")
    resp = requests.post(f"{BASE_URL}/student/chat", json=payload, headers=headers, stream=True)
    
    if resp.status_code != 200:
        print(f"Chat request failed: {resp.status_code}")
        print(resp.text)
        return

    # Read stream to verify we get content and NOT a wrong answer penalty
    content_received = ""
    was_wrong = None
    
    for line in resp.iter_lines():
        if line:
            decoded_line = line.decode('utf-8')
            if decoded_line.startswith("data: "):
                try:
                    json_data = json.loads(decoded_line[6:])
                    if json_data.get("type") == "content":
                        content_received += json_data.get("content", "")
                    elif json_data.get("type") == "done":
                        was_wrong = json_data.get("was_wrong")
                except:
                    pass
    
    print("-" * 50)
    print(f"Response Length: {len(content_received)} chars")
    # print(f"Preview: {content_received[:100]}...")
    print(f"Was marked wrong: {was_wrong}")
    
    if was_wrong is False and len(content_received) > 0:
        print("SUCCESS: Conversation resumed without penalty!")
    else:
        print("FAILURE: 'Start my lesson' was treated incorrectly or returned no content.")
        if was_wrong:
             print("Reason: Marked as WRONG answer.")

if __name__ == "__main__":
    test_resume()
