"""The full candidate workflow through the REST API, with the test LLM."""
from pathlib import Path

from app.config import get_settings
from conftest import SAMPLES, register


def setup_interview(client, auth, **cfg):
    with open(SAMPLES / "sample_resume.pdf", "rb") as f:
        r = client.post("/api/documents", data={"kind": "resume"}, files={"file": ("resume.pdf", f, "application/pdf")}, headers=auth)
    assert r.status_code == 201, r.text
    resume_id = r.json()["id"]
    job = client.post("/api/documents", data={"kind": "job", "text": (SAMPLES / "sample_job_description.txt").read_text()}, headers=auth)
    assert job.status_code == 201, job.text
    a = client.post("/api/analyses", json={"resume_id": resume_id, "job_id": job.json()["id"]}, headers=auth)
    assert a.status_code == 201, a.text
    body = {"analysis_id": a.json()["id"], "duration_minutes": 15, "question_count": 4, **cfg}
    iv = client.post("/api/interviews", json=body, headers=auth)
    assert iv.status_code == 201, iv.text
    return a.json(), iv.json()


def answer(client, auth, iv_id, qid, text="", skipped=False, audio=None):
    files = {"audio": ("a.webm", audio, "audio/webm")} if audio else None
    return client.post(f"/api/interviews/{iv_id}/answers", headers=auth, files=files,
                       data={"question_id": qid, "transcript": text, "skipped": str(skipped).lower(), "elapsed_seconds": 30})


def test_documents_reach_the_model(client, auth, fake_llm):
    analysis, _ = setup_interview(client, auth)
    kinds = [c[0] for c in fake_llm.calls]
    assert kinds == ["AnalysisResult", "QuestionPlan"]
    assert "DocuQuery" in fake_llm.calls[0][1] and "BrightLeaf" in fake_llm.calls[0][1]
    assert "DocuQuery" in [p["name"] for p in analysis["result"]["candidate"]["projects"]][0]
    # the question plan must carry the interview settings
    assert "4 questions" in fake_llm.calls[1][1] and "Full interview" in fake_llm.calls[1][1].replace("full interview", "Full interview")


def test_full_interview_flow(client, auth, fake_llm):
    _, iv = setup_interview(client, auth)
    iid = iv["id"]
    assert iv["questions"] == [] and iv["total_questions"] == 4, "questions must stay hidden before the start"

    assert client.post(f"/api/interviews/{iid}/start", json={"consent": False}, headers=auth).status_code == 400
    assert client.post(f"/api/interviews/{iid}/recording/chunks?index=0", files={"chunk": ("c", b"x", "video/webm")}, headers=auth).status_code == 403
    iv = client.post(f"/api/interviews/{iid}/start", json={"consent": True}, headers=auth).json()
    assert iv["status"] == "live" and len(iv["questions"]) == 1
    q1 = iv["questions"][0]

    assert answer(client, auth, iid, q1["id"], "").status_code == 422  # empty answer
    assert answer(client, auth, iid, q1["id"] + 999, "x").status_code == 409  # wrong question

    # Recording chunks: in order, duplicate tolerated, gap rejected
    up = lambda i, b: client.post(f"/api/interviews/{iid}/recording/chunks?index={i}", files={"chunk": ("c", b, "video/webm")}, headers=auth)
    assert up(0, b"AAA").json()["next_chunk"] == 1
    assert up(0, b"AAA").json()["next_chunk"] == 1
    assert up(5, b"ZZZ").status_code == 409
    assert up(1, b"BBB").json()["size_bytes"] == 6

    r = answer(client, auth, iid, q1["id"], "A good answer that needs a FOLLOWUP please", audio=b"webm-bytes").json()
    assert r["next_question"]["text"] == "Can you give a concrete example?"
    assert r["total_questions"] == 5 and r["acknowledgement"] == "Thank you."
    followup = r["next_question"]

    # Pause blocks answering until resumed
    client.post(f"/api/interviews/{iid}/pause", json={"elapsed_seconds": 60}, headers=auth)
    assert answer(client, auth, iid, followup["id"], "x").status_code == 409
    client.post(f"/api/interviews/{iid}/resume", headers=auth)

    r = answer(client, auth, iid, followup["id"], "A good concrete example").json()
    assert "FOLLOWUP" not in r["next_question"]["text"]  # follow-ups never chain
    r = answer(client, auth, iid, r["next_question"]["id"], skipped=True).json()
    r = answer(client, auth, iid, r["next_question"]["id"], "weak answer").json()
    r = answer(client, auth, iid, r["next_question"]["id"], "another good answer").json()
    assert r["finished"] is True

    client.post(f"/api/interviews/{iid}/recording/complete", headers=auth)
    rep = client.post(f"/api/interviews/{iid}/report", headers=auth)
    assert rep.status_code == 200, rep.text
    rep = rep.json()
    assert rep["status"] == "scored"
    s = rep["report"]["scores"]
    # scores: 8, 8, 0 (skipped), 4, 8 -> overall 56%
    assert s["overall"] == 56
    assert s["communication"] == 70  # mean of 8,8,4,8 (skipped excluded) = 7.0
    assert [x["score"] for x in rep["report"]["incorrect"]] == [0.0, 4.0]
    skipped = [q for q in rep["questions"] if q["answer"]["skipped"]][0]
    assert skipped["answer"]["evaluation"]["verdict"] == "not answered"
    eval_prompts = [p for k, p in fake_llm.calls if k == "Evaluation"]
    assert len(eval_prompts) == 4, "skipped answers are scored without calling the model"
    assert any("A good answer that needs a FOLLOWUP" in p for p in eval_prompts)
    assert all("accent" in p for p in eval_prompts), "fairness rule must be in every evaluation prompt"

    pdf = client.get(f"/api/interviews/{iid}/report.pdf", headers=auth)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    video = client.get(f"/api/interviews/{iid}/recording", headers=auth)
    assert video.content == b"AAABBB"
    q_first = rep["questions"][0]
    assert client.get(f"/api/interviews/{iid}/answers/{q_first['id']}/audio", headers=auth).content == b"webm-bytes"

    hist = client.get("/api/interviews", headers=auth).json()
    assert hist[0]["id"] == iid and hist[0]["overall"] == 56

    # Deleting the recording keeps transcripts and scores
    assert client.delete(f"/api/interviews/{iid}/recording", headers=auth).status_code == 204
    after = client.get(f"/api/interviews/{iid}", headers=auth).json()
    assert after["has_recording"] is False and after["questions"][0]["answer"]["transcript"]
    assert client.get(f"/api/interviews/{iid}/recording", headers=auth).status_code == 404

    # Deleting the interview removes its files
    folder = Path(get_settings().storage_dir).resolve()
    assert client.delete(f"/api/interviews/{iid}", headers=auth).status_code == 204
    assert client.get(f"/api/interviews/{iid}", headers=auth).status_code == 404
    assert not any(folder.glob(f"user_*/interview_{iid}"))


def test_end_early_scores_only_answered(client, auth):
    _, iv = setup_interview(client, auth)
    iid = iv["id"]
    q1 = client.post(f"/api/interviews/{iid}/start", json={"consent": True}, headers=auth).json()["questions"][0]
    answer(client, auth, iid, q1["id"], "good answer")
    assert client.post(f"/api/interviews/{iid}/report", headers=auth).status_code == 409  # not finished yet
    client.post(f"/api/interviews/{iid}/finish", json={"elapsed_seconds": 90}, headers=auth)
    rep = client.post(f"/api/interviews/{iid}/report", headers=auth).json()
    assert rep["report"]["answered"] == 1 and rep["elapsed_seconds"] == 90


def test_report_needs_an_answer(client, auth):
    _, iv = setup_interview(client, auth)
    iid = iv["id"]
    client.post(f"/api/interviews/{iid}/start", json={"consent": True}, headers=auth)
    client.post(f"/api/interviews/{iid}/finish", json={"elapsed_seconds": 5}, headers=auth)
    r = client.post(f"/api/interviews/{iid}/report", headers=auth)
    assert r.status_code == 502 and "nothing to score" in r.json()["detail"]


def test_users_cannot_see_each_others_data(client, auth):
    _, iv = setup_interview(client, auth)
    iid = iv["id"]
    client.post(f"/api/interviews/{iid}/start", json={"consent": True}, headers=auth)
    client.post(f"/api/interviews/{iid}/recording/chunks?index=0", files={"chunk": ("c", b"secret", "video/webm")}, headers=auth)
    other = register(client)
    for method, url in [("get", f"/api/interviews/{iid}"), ("get", f"/api/interviews/{iid}/recording"),
                        ("delete", f"/api/interviews/{iid}"), ("post", f"/api/interviews/{iid}/report")]:
        assert getattr(client, method)(url, headers=other).status_code == 404, url
    assert client.get("/api/interviews", headers=other).json() == []
    assert client.get("/api/documents", headers=other).json() == []
    # media links can use ?token= (for <video src>) and are still owner-only
    token = auth["Authorization"].split()[1]
    assert client.get(f"/api/interviews/{iid}/recording?token={token}").content == b"secret"


def test_delete_account_removes_everything(client):
    h = register(client)
    _, iv = setup_interview(client, h)
    assert client.delete("/api/auth/me", headers=h).status_code == 204
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_upload_validation_messages(client, auth):
    r = client.post("/api/documents", data={"kind": "resume"}, files={"file": ("cv.png", b"\x89PNG", "image/png")}, headers=auth)
    assert r.status_code == 422 and "PDF or DOCX" in r.json()["detail"]
    r = client.post("/api/documents", data={"kind": "resume", "text": "hi"}, headers=auth)
    assert r.status_code == 422
