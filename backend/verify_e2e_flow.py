"""
Phase 4 End-to-End User Flow Automated Verification Script.
Executes the exact 22 steps requested in Phase 4 against the live FastAPI & PostgreSQL backend.
"""

import time
import httpx

BASE_URL = "http://127.0.0.1:8000"

def run_e2e_flow():
    client = httpx.Client(timeout=30.0)
    print("==================================================")
    print("PHASE 4: COMPLETE END-TO-END USER JOURNEY VERIFICATION")
    print(f"Target Server: {BASE_URL}")
    print("==================================================")

    ts = int(time.time() * 1000)
    email = f"elena.rostova.{ts}@example.com"
    password = "StudentPassword2026!"
    name = "Elena Rostova"
    token = None
    headers = {}

    # Step 1: Open Application (Health check)
    r1 = client.get(f"{BASE_URL}/")
    assert r1.status_code == 200, f"Step 1 Failed: {r1.text}"
    print("Step 1: Open application [OK]")

    # Step 2: Register New Account
    r2 = client.post(f"{BASE_URL}/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    assert r2.status_code == 201, f"Step 2 Failed: {r2.text}"
    data2 = r2.json()
    assert "token" in data2 and data2["user"]["email"] == email
    token = data2["token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"Step 2: Register new account ({email}) [OK]")

    # Step 3: Login
    r3 = client.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert r3.status_code == 200, f"Step 3 Failed: {r3.text}"
    login_token = r3.json()["token"]
    assert len(login_token) >= 32
    token = login_token
    headers = {"Authorization": f"Bearer {token}"}
    print("Step 3: Login & verify JWT session token [OK]")

    # Step 4: Open Dashboard (Fetch career goal & skills for current user)
    r4 = client.get(f"{BASE_URL}/api/career-goal", headers=headers)
    assert r4.status_code == 200, f"Step 4 Failed: {r4.text}"
    assert r4.json()["student_name"] == name
    print(f"Step 4: Open dashboard (User: {r4.json()['student_name']}, Goal: {r4.json()['role_name']}) [OK]")

    # Step 5: Add / Edit / Delete Skills
    # 5a. Add Skill
    r5a = client.post(f"{BASE_URL}/api/skills", json={
        "name": "FastAPI",
        "category": "Backend Development",
        "level": "Intermediate"
    }, headers=headers)
    assert r5a.status_code == 201, f"Step 5a Failed: {r5a.text}"
    skill_id = r5a.json()["id"]

    # 5b. Edit Skill
    r5b = client.put(f"{BASE_URL}/api/skills/{skill_id}", json={
        "name": "FastAPI",
        "category": "Backend Development",
        "level": "Advanced"
    }, headers=headers)
    assert r5b.status_code == 200 and r5b.json()["level"] == "Advanced"

    # 5c. Add temporary skill to delete
    r5_temp = client.post(f"{BASE_URL}/api/skills", json={
        "name": "Ruby on Rails",
        "category": "Backend Development",
        "level": "Beginner"
    }, headers=headers)
    temp_id = r5_temp.json()["id"]

    # 5d. Delete Skill
    r5d = client.delete(f"{BASE_URL}/api/skills/{temp_id}", headers=headers)
    assert r5d.status_code == 200

    # Verify skills list
    r5_list = client.get(f"{BASE_URL}/api/skills", headers=headers).json()
    assert any(s["id"] == skill_id for s in r5_list)
    assert not any(s["id"] == temp_id for s in r5_list)
    print(f"Step 5: Add/Edit/Delete skills (Verified: {len(r5_list)} active skills) [OK]")

    # Step 6: Select Career Goal
    r6 = client.put(f"{BASE_URL}/api/career-goal", json={
        "career_role_id": 2,  # Cloud Solutions Architect
        "student_name": name,
        "target_date": "March 2027"
    }, headers=headers)
    assert r6.status_code == 200 and r6.json()["career_role_id"] == 2
    print(f"Step 6: Select career goal ({r6.json()['role_name']}) [OK]")

    # Step 7: View Career Gap Analysis
    r7 = client.get(f"{BASE_URL}/api/career-gap-analysis", headers=headers)
    assert r7.status_code == 200, f"Step 7 Failed: {r7.text}"
    gap_data = r7.json()
    assert "readiness_percentage" in gap_data
    assert "missing_skills" in gap_data
    print(f"Step 7: View career gap analysis (Readiness: {gap_data['readiness_percentage']}%, Missing: {gap_data['missing_count']}) [OK]")

    # Step 8: View Recommended Roadmap
    r8 = client.get(f"{BASE_URL}/api/learning-roadmap", headers=headers)
    assert r8.status_code == 200, f"Step 8 Failed: {r8.text}"
    roadmap_data = r8.json()
    assert len(roadmap_data["roadmap_steps"]) > 0
    print(f"Step 8: View recommended roadmap ({roadmap_data['total_roadmap_steps']} structured steps) [OK]")

    # Step 9: Complete Learning Milestones
    r9_milestones = client.get(f"{BASE_URL}/api/learning-milestones", headers=headers).json()
    assert len(r9_milestones) > 0, "No milestones returned"
    first_m_id = r9_milestones[0]["id"]
    r9_toggle = client.put(f"{BASE_URL}/api/learning-milestones/{first_m_id}", json={
        "completed": True
    }, headers=headers)
    assert r9_toggle.status_code == 200 and r9_toggle.json()["completed"] is True
    print(f"Step 9: Complete learning milestone (ID: {first_m_id}, Title: '{r9_milestones[0]['title']}') [OK]")

    # Step 10: Log Study Activity
    r10 = client.post(f"{BASE_URL}/api/study-activity", json={
        "minutes_spent": 90,
        "activities_completed": 2,
        "focus_area": "Docker & FastAPI Containerization"
    }, headers=headers)
    assert r10.status_code == 201, f"Step 10 Failed: {r10.text}"
    print("Step 10: Log study activity (90 minutes) [OK]")

    # Step 11: Verify Streak / Heatmap Updates
    r11 = client.get(f"{BASE_URL}/api/study-activity", headers=headers)
    assert r11.status_code == 200
    study_data = r11.json()
    assert study_data["total_minutes"] == 90
    assert study_data["current_streak_days"] >= 1
    print(f"Step 11: Verify streak & heatmap (Streak: {study_data['current_streak_days']} day, Total Hours: {study_data['total_hours']}h) [OK]")

    # Step 12: Open AI Career Mentor (Get status)
    r12 = client.get(f"{BASE_URL}/api/ai/status")
    assert r12.status_code == 200 and r12.json()["configured"] is True
    print(f"Step 12: Open AI Career Mentor (Model: {r12.json()['model']}) [OK]")

    # Step 13: Ask Technical Question (RAG enabled)
    r13 = client.post(f"{BASE_URL}/api/ai/chat", json={
        "message": "How does a Docker multi-stage build reduce image size in FastAPI?",
        "history": []
    }, headers=headers)
    assert r13.status_code == 200, f"Step 13 Failed: {r13.text}"
    ai_reply_tech = r13.json()
    assert len(ai_reply_tech.get("reply", "")) > 50
    print("Step 13: Ask technical question to AI Mentor [OK]")

    # Step 14: Ask Career Question
    r14 = client.post(f"{BASE_URL}/api/ai/chat", json={
        "message": "Which missing skill in my roadmap should I tackle next to reach my goal?",
        "history": [{"role": "user", "content": "How does a Docker multi-stage build work?"}, {"role": "assistant", "content": ai_reply_tech["reply"]}]
    }, headers=headers)
    assert r14.status_code == 200, f"Step 14 Failed: {r14.text}"
    ai_reply_career = r14.json()
    print("Step 14: Ask career question to AI Mentor [OK]")

    # Step 15: Verify AI Uses Student's Actual Career Context
    highlights = ai_reply_career.get("context_highlights", {})
    assert highlights.get("student_name") == name, f"Expected {name}, got {highlights.get('student_name')}"
    assert highlights.get("role_name") == "Backend & Distributed Systems Engineer"
    print(f"Step 15: Verify AI uses student's actual career context (Student: {highlights['student_name']}, Role: {highlights['role_name']}) [OK]")

    # Step 16: Verify RAG Citations / Retrieved Knowledge
    rag_citations = ai_reply_tech.get("retrieved_knowledge", [])
    assert len(rag_citations) > 0, "Expected RAG citations for Docker question"
    print(f"Step 16: Verify RAG citations (Retrieved {len(rag_citations)} chunks from PostgreSQL) [OK]")

    # Step 17 & 18: Refresh Browser (Session restoration via /api/auth/me)
    r17 = client.get(f"{BASE_URL}/api/auth/me", headers=headers)
    assert r17.status_code == 200
    assert r17.json()["email"] == email
    print(f"Step 17 & 18: Refresh browser & restore session (User: {r17.json()['name']}) [OK]")

    # Step 19: Logout
    r19 = client.post(f"{BASE_URL}/api/auth/logout", headers=headers)
    assert r19.status_code == 200
    print("Step 19: Logout successfully [OK]")

    # Step 20: Confirm Protected Session Revocation
    r20 = client.get(f"{BASE_URL}/api/auth/me", headers=headers)
    assert r20.status_code == 401
    print("Step 20: Confirm old session token is invalidated [OK]")

    # Step 21: Login Again
    r21 = client.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert r21.status_code == 200
    new_token = r21.json()["token"]
    new_headers = {"Authorization": f"Bearer {new_token}"}
    print("Step 21: Login again with valid credentials [OK]")

    # Step 22: Confirm User's Data Remains Intact
    r22_skills = client.get(f"{BASE_URL}/api/skills", headers=new_headers).json()
    assert any(s["name"] == "FastAPI" and s["level"] == "Advanced" for s in r22_skills)

    r22_goal = client.get(f"{BASE_URL}/api/career-goal", headers=new_headers).json()
    assert r22_goal["career_role_id"] == 2

    r22_milestones = client.get(f"{BASE_URL}/api/learning-milestones", headers=new_headers).json()
    completed_m = [m for m in r22_milestones if m["id"] == first_m_id]
    assert completed_m and completed_m[0]["completed"] is True

    r22_study = client.get(f"{BASE_URL}/api/study-activity", headers=new_headers).json()
    assert r22_study["total_minutes"] == 90
    print("Step 22: Confirm all skills, goal, milestones, and study data remain completely intact! [OK]")

    print("\n==================================================")
    print("ALL 22 STEPS OF PHASE 4 PASSED WITH 100% SUCCESS!")
    print("==================================================")

if __name__ == "__main__":
    run_e2e_flow()
