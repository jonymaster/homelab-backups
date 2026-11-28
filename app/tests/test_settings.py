DEFAULTS = {
    "general": {"clock": "24h", "default_theme": "dark", "base_url": None},
    "notifications": {
        "events": {"run_failed": True, "run_recovered": True, "job_stale": True, "disk_low": True,
                   "run_succeeded": False, "weekly_summary": False},
        "weekly_summary_day": 0,
        "weekly_summary_time": "09:00",
    },
    "monitoring": {"disk_warning_percent": 90, "metrics_enabled": False},
    "defaults": {"retention_days": 180, "exclude_presets": ["caches", "temp", "trash"], "exclude_patterns": [],
                 "schedule_time": "02:00"},
    "maintenance": {"update_check": True},
}


def test_defaults(client):
    assert client.get("/settings").json() == DEFAULTS
    assert client.get("/settings/").json() == DEFAULTS


def test_deep_merge(client):
    response = client.put("/settings", json={"notifications": {"events": {"run_succeeded": True}},
                                             "general": {"base_url": "http://nas:3000/"}})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["notifications"]["events"]["run_succeeded"] is True
    assert body["notifications"]["events"]["run_failed"] is True
    assert body["notifications"]["weekly_summary_time"] == "09:00"
    assert body["general"] == {"clock": "24h", "default_theme": "dark", "base_url": "http://nas:3000"}

    body = client.put("/settings/", json={"defaults": {"retention_days": None, "exclude_presets": ["caches"]}}).json()
    assert body["defaults"]["retention_days"] is None
    assert body["defaults"]["exclude_presets"] == ["caches"]
    assert body["notifications"]["events"]["run_succeeded"] is True
    assert client.get("/settings").json() == body


def test_validation(client):
    bad = [
        {"unknown": {}},
        {"general": {"unknown": 1}},
        {"notifications": {"events": {"nope": True}}},
        {"general": {"clock": "13h"}},
        {"general": {"base_url": "nas:3000"}},
        {"monitoring": {"disk_warning_percent": 49}},
        {"monitoring": {"disk_warning_percent": 100}},
        {"notifications": {"weekly_summary_day": 7}},
        {"notifications": {"weekly_summary_time": "24:00"}},
        {"defaults": {"retention_days": 0}},
        {"defaults": {"exclude_presets": ["nope"]}},
        {"defaults": {"exclude_patterns": ["  "]}},
        {"defaults": {"schedule_time": "2:00"}},
        {"general": "dark"},
    ]
    for patch in bad:
        assert client.put("/settings", json=patch).status_code == 422, patch
    assert client.get("/settings").json() == DEFAULTS


def test_empty_base_url_is_null(client):
    assert client.put("/settings", json={"general": {"base_url": " "}}).json()["general"]["base_url"] is None
