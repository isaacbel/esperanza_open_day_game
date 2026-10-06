from fastapi.testclient import TestClient
from app.main import app

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

def test_sanitize_player_name():
    payload = {
        "playerName": "<script>alert('bad');</script>PLAYER_ONE",
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
    # Script brackets and symbols are stripped, capped at 12 characters
    assert "<" not in data["playerName"]
    assert ">" not in data["playerName"]
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
