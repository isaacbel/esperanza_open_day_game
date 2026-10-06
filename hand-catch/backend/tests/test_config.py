from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_config():
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert data["gameDuration"] == 60
    assert data["initialLives"] == 3
    assert data["maxComboMultiplier"] == 10
    assert data["baseScore"] == 10
