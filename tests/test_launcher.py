from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_one_click_launcher_checks_both_services_and_hides_helpers() -> None:
    launcher = (ROOT / "start-pack-qa.ps1").read_text("utf-8")
    wrapper = (ROOT / "เปิด Pack QA.cmd").read_text("utf-8")

    assert "/api/health" in launcher
    assert "http://localhost:3000" in launcher
    assert launcher.count("-WindowStyle Hidden") == 2
    assert "Wait-PackQaEndpoint" in launcher
    assert "python-libs" in launcher
    assert "import yaml, jinja2, pydantic" in launcher
    assert "pip install" in launcher
    assert "start-pack-qa.ps1" in wrapper
    assert "cmd /k" not in wrapper.lower()
