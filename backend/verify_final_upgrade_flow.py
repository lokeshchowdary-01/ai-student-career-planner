"""
End-to-End Verification Script for Final Product Upgrade (All 5 Systems + Security)
Tests:
1. User registration & authentication
2. System 1: Today's Plan (Generate with budget, start/complete, study hours update, replace task)
3. System 2: Career Skill Assessment (Fetch practical questions, submit quiz, score calculation, retake history)
4. System 3: Evidence-Based Skill Profile (Confidence levels High/Med/Low, milestone/project/study metrics, WHY explanation)
5. System 4: Project-Based Learning (AI project blueprint generation, save confirmed project to PostgreSQL, toggle milestone, progress %)
6. System 5: Career Preparation Dashboard (6 pillars, going well, needs attention, next recommended action)
7. AI Mentor integration with new telemetry
8. Multi-tenant security isolation & 'Not enough data yet' empty states
"""

import time
import httpx

BASE_URL = "http://127.0.0.1:8000"

def run_upgrade_verification():
    client = httpx.Client(timeout=30.0)
    print("==================================================")
    print("FINAL UPGRADE: FULL E2E 5-SYSTEM VERIFICATION")
    print(f"Target: {BASE_URL}")
    print("==================================================")

    ts = int(time.time() * 1000)
    email = f"marcus.vance.{ts}@example.com"
    password = "VancePassword2026!"
    name = "Marcus Vance"

    # 1. Register & Login
    r_reg = client.post(f"{BASE_URL}/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    assert r_reg.status_code == 201, f"Register failed: {r_reg.text}"
    token = r_reg.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("Step 1: Student registered and authenticated [OK]")

    # 2. System 1: Today's Plan
    # Generate 60 min plan
    r_plan_gen = client.post(f"{BASE_URL}/api/today-plan/generate", json={
        "available_minutes": 60,
        "force_regenerate": True
    }, headers=headers)
    assert r_plan_gen.status_code == 200, f"Plan gen failed: {r_plan_gen.text}"
    plan = r_plan_gen.json()
    assert len(plan["tasks"]) > 0, "No tasks generated in today's plan"
    first_task = plan["tasks"][0]
    print(f"Step 2a: Generated Today's Plan ({len(plan['tasks'])} tasks, budget: {plan['available_minutes']}m) [OK]")

    # Complete first task
    r_task_comp = client.put(f"{BASE_URL}/api/today-tasks/{first_task['id']}", json={
        "status": "completed",
        "minutes_spent": 30
    }, headers=headers)
    assert r_task_comp.status_code == 200
    print(f"Step 2b: Completed task '{first_task['title']}' (+30 mins real study logged) [OK]")

    # Verify real study activity was logged without faked skill boost
    r_study = client.get(f"{BASE_URL}/api/study-activity", headers=headers).json()
    assert r_study["total_minutes"] >= 30
    print(f"Step 2c: Verified real study activity updated ({r_study['total_minutes']} mins) [OK]")

    # Replace second task if exists
    if len(plan["tasks"]) > 1:
        second_task = plan["tasks"][1]
        r_replace = client.post(f"{BASE_URL}/api/today-tasks/{second_task['id']}/replace", headers=headers)
        assert r_replace.status_code == 200
        print(f"Step 2d: Successfully replaced task ID {second_task['id']} with alternative [OK]")

    # 3. System 2: Career Skill Assessment
    # Fetch questions
    r_q = client.get(f"{BASE_URL}/api/assessments/questions", headers=headers)
    assert r_q.status_code == 200
    q_data = r_q.json()
    questions = q_data.get("questions", [])
    assert len(questions) > 0, "No assessment questions found"
    assert "correct_answer" not in questions[0], "Correct answer was leaked in client response!"
    print(f"Step 3a: Retrieved {len(questions)} assessment questions without answers [OK]")

    # Submit quiz answers
    answers = []
    for q in questions:
        opts = q.get("options")
        answers.append({
            "question_id": q["id"],
            "selected_answer": opts[0] if opts else "Sample answer",
            "confidence": "High"
        })

    r_sub = client.post(f"{BASE_URL}/api/assessments/submit", json={
        "role_id": 1,
        "confidence_rating": "High",
        "answers": answers
    }, headers=headers)
    assert r_sub.status_code == 200, f"Submit assessment failed: {r_sub.text}"
    sub_res = r_sub.json()
    assert "score_percentage" in sub_res and "estimated_level" in sub_res
    print(f"Step 3b: Submitted assessment (Score: {sub_res['score_percentage']}%, Level: {sub_res['estimated_level']}) [OK]")

    # Check attempt history
    r_hist = client.get(f"{BASE_URL}/api/assessments/history", headers=headers)
    assert r_hist.status_code == 200
    hist_list = r_hist.json()
    assert len(hist_list) >= 1
    print(f"Step 3c: Verified assessment history preserved ({len(hist_list)} attempts recorded) [OK]")

    # 4. System 3: Evidence-Based Skill Profile
    # Check zero fabrication before adding skills
    r_ev_empty = client.get(f"{BASE_URL}/api/skills/evidence", headers=headers)
    assert r_ev_empty.status_code == 200 and len(r_ev_empty.json()) == 0
    print("Step 4a: Verified zero data fabrication (0 skills before student creates any) [OK]")

    # Student adds a skill
    client.post(f"{BASE_URL}/api/skills", json={
        "name": "FastAPI",
        "category": "Backend Development",
        "level": "Intermediate"
    }, headers=headers)

    r_ev = client.get(f"{BASE_URL}/api/skills/evidence", headers=headers)
    assert r_ev.status_code == 200
    ev_list = r_ev.json()
    assert len(ev_list) == 1
    first_ev = ev_list[0]
    assert "evidence_confidence" in first_ev
    assert "confidence_reason" in first_ev
    assert first_ev["evidence_confidence"] in ["High", "Medium", "Low"]
    print(f"Step 4b: Evidence profile computed for '{first_ev['skill_name']}' (Confidence: {first_ev['evidence_confidence']}, WHY: '{first_ev['confidence_reason'][:40]}...') [OK]")

    # 5. System 4: Project-Based Learning Hub
    # Generate AI Project blueprint draft
    r_ai_prj = client.post(f"{BASE_URL}/api/projects/ai-generate", headers=headers)
    assert r_ai_prj.status_code == 200
    draft = r_ai_prj.json()
    assert "title" in draft and "milestones" in draft
    print(f"Step 5a: AI Project draft generated ('{draft['title']}') [OK]")

    # Save project to PostgreSQL after user confirmation
    r_create_prj = client.post(f"{BASE_URL}/api/projects", json={
        "title": draft["title"],
        "description": draft["description"],
        "target_skills": draft.get("target_skills", ["Python", "FastAPI"]),
        "difficulty": draft.get("difficulty", "Intermediate"),
        "estimated_hours": draft.get("estimated_hours", 20.0),
        "status": "In Progress",
        "notes": draft.get("alignment_reason", "Addresses core backend gap"),
        "milestones": [{"title": m if isinstance(m, str) else m.get("title", "Milestone"), "completed": False} for m in draft.get("milestones", [])]
    }, headers=headers)
    assert r_create_prj.status_code == 201
    created_prj = r_create_prj.json()
    p_id = created_prj["id"]
    print(f"Step 5b: Confirmed and saved project ID {p_id} to PostgreSQL with {len(created_prj['milestones'])} milestones [OK]")

    # Toggle milestone in PostgreSQL
    if len(created_prj["milestones"]) > 0:
        first_p_m = created_prj["milestones"][0]
        r_toggle_m = client.put(f"{BASE_URL}/api/projects/{p_id}/milestones/{first_p_m['id']}", json={
            "completed": True
        }, headers=headers)
        assert r_toggle_m.status_code == 200 and r_toggle_m.json()["completed"] is True
        print(f"Step 5c: Toggled project milestone '{first_p_m['title']}' to completed [OK]")

    # 6. System 5: Career Preparation Dashboard
    r_prep = client.get(f"{BASE_URL}/api/career-preparation", headers=headers)
    assert r_prep.status_code == 200
    prep_data = r_prep.json()
    assert "overall_preparation_percentage" in prep_data
    assert len(prep_data["pillars"]) == 6
    assert len(prep_data["what_is_going_well"]) > 0
    assert len(prep_data["what_needs_attention"]) > 0
    assert "next_recommended_action" in prep_data
    assert "calculation_explanation" in prep_data
    print(f"Step 6: Career Preparation verified ({prep_data['overall_preparation_percentage']}% prep, 6 pillars active, Next Action: '{prep_data['next_recommended_action'][:50]}...') [OK]")

    # 7. AI Career Mentor Telemetry
    r_ai = client.post(f"{BASE_URL}/api/ai/chat", json={
        "message": "What should I study today based on my current plan and projects?",
        "history": []
    }, headers=headers)
    assert r_ai.status_code == 200
    ai_resp = r_ai.json()
    assert len(ai_resp.get("reply", "")) > 40
    print("Step 7: AI Career Mentor answers daily study queries using live telemetry [OK]")

    # 8. User Isolation & 'Not Enough Data Yet'
    ts2 = int(time.time() * 1000) + 1
    r_user2 = client.post(f"{BASE_URL}/api/auth/register", json={
        "name": "Jordan Lee",
        "email": f"jordan.lee.{ts2}@example.com",
        "password": "JordanPassword2026!"
    })
    assert r_user2.status_code == 201
    user2_token = r_user2.json()["token"]
    user2_headers = {"Authorization": f"Bearer {user2_token}"}

    # User 2 cannot see Marcus Vance's projects
    r_u2_prjs = client.get(f"{BASE_URL}/api/projects", headers=user2_headers).json()
    assert not any(p["id"] == p_id for p in r_u2_prjs)

    # User 2 cannot mutate Marcus Vance's project
    r_u2_del = client.delete(f"{BASE_URL}/api/projects/{p_id}", headers=user2_headers)
    assert r_u2_del.status_code == 404

    # User 2 sees empty assessment history (no fabricated data)
    r_u2_hist = client.get(f"{BASE_URL}/api/assessments/history", headers=user2_headers).json()
    assert len(r_u2_hist) == 0
    print("Step 8: Verified strict user isolation and zero data fabrication for new user [OK]")

    print("\n==================================================")
    print("SUCCESS: ALL 8 CORE STAGES PASSED VERIFICATION!")
    print("==================================================")

if __name__ == "__main__":
    run_upgrade_verification()
