from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)

def test_get_leaderboard_normal():
    response = client.get("/api/leaderboard?mode=NORMAL&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) <= 5
    for item in data:
        assert "playerName" in item
        assert "score" in item
        assert item["mode"] == "NORMAL"

def test_get_leaderboard_endless():
    response = client.get("/api/leaderboard?mode=ENDLESS&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    for item in data:
        assert item["mode"] == "ENDLESS"

def test_get_leaderboard_survival():
    response = client.get("/api/leaderboard?mode=SURVIVAL&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for item in data:
        assert item["mode"] == "SURVIVAL"

def test_get_leaderboard_nightmare():
    response = client.get("/api/leaderboard?mode=NIGHTMARE&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for item in data:
        assert item["mode"] == "NIGHTMARE"

def test_submit_valid_score():
    payload = {
        "playerName": "TESTER",
        "score": 450,
        "maxCombo": 8,
        "caught": 25,
        "missed": 2,
        "accuracy": 92.5,
        "mode": "NORMAL"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["playerName"] == "TESTER"
    assert data["score"] == 450
    assert data["maxCombo"] == 8

def test_submit_survival_score():
    payload = {
        "playerName": "SURVIVOR",
        "score": 1200,
        "maxCombo": 18,
        "caught": 40,
        "missed": 1,
        "accuracy": 97.5,
        "mode": "SURVIVAL"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["playerName"] == "SURVIVOR"
    assert data["mode"] == "SURVIVAL"

def test_sanitize_player_name():
    payload = {
        "playerName": "<script>alert('bad');</script>PILOT",
        "score": 100,
        "maxCombo": 2,
        "caught": 5,
        "missed": 1,
        "accuracy": 83.3,
        "mode": "NORMAL"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "<" not in data["playerName"]
    assert ">" not in data["playerName"]
    assert "(" not in data["playerName"]
    assert "'" not in data["playerName"]
    assert len(data["playerName"]) <= 12

def test_reject_impossible_score():
    payload = {
        "playerName": "HACKER",
        "score": 999999,
        "maxCombo": 2,
        "caught": 2, # only 2 catches cannot yield 999k points!
        "missed": 0,
        "accuracy": 100.0,
        "mode": "NORMAL"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 422

def test_reject_zero_caught_with_score():
    payload = {
        "playerName": "HACKER",
        "score": 50000,
        "maxCombo": 0,
        "caught": 0, # zero catches with score > 0 is cheating
        "missed": 5,
        "accuracy": 0.0,
        "mode": "NORMAL"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 422

def test_submit_precision_score():
    payload = {
        "playerName": "SNIPER",
        "score": 1800,
        "maxCombo": 22,
        "caught": 35,
        "missed": 0,
        "accuracy": 100.0,
        "mode": "PRECISION"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["playerName"] == "SNIPER"
    assert data["mode"] == "PRECISION"

def test_submit_daily_challenge_score():
    payload = {
        "playerName": "CHALLENGER",
        "score": 2100,
        "maxCombo": 25,
        "caught": 42,
        "missed": 2,
        "accuracy": 95.4,
        "mode": "DAILY_CHALLENGE"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["playerName"] == "CHALLENGER"
    assert data["mode"] == "DAILY_CHALLENGE"

def test_submit_boss_rush_score():
    payload = {
        "playerName": "BOSS_SLAYER",
        "score": 3500,
        "maxCombo": 30,
        "caught": 50,
        "missed": 3,
        "accuracy": 94.3,
        "mode": "BOSS_RUSH"
    }
    response = client.post("/api/leaderboard", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["playerName"] == "BOSS_SLAYER"
    assert data["mode"] == "BOSS_RUSH"

def test_reset_leaderboard_with_admin_key():
    headers = {"X-Admin-Key": settings.admin_key}
    response = client.delete("/api/leaderboard?mode=SURVIVAL", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["mode"] == "SURVIVAL"

