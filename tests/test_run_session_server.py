import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from run_session_server import build_components

from memaide import config


def test_build_components_shares_one_registry_and_registers_route():
    app, ws_deps, registry = build_components(client=object())
    # Both listeners share the SAME registry instance.
    assert ws_deps.registry is registry
    # The HTTP app exposes /session/start.
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/session/start" in paths
    assert "/infer" in paths
    # The reporter seam is wired into the WS deps.
    assert ws_deps.reporter is not None


def test_build_components_no_whatsapp_token_means_no_notifier(monkeypatch):
    monkeypatch.setattr(config, "WHATSAPP_TOKEN", None)
    _app, ws_deps, _reg = build_components(client=object())
    assert ws_deps.notifier is None


def test_build_components_builds_notifier_when_whatsapp_configured(monkeypatch):
    monkeypatch.setattr(config, "WHATSAPP_TOKEN", "tok")
    monkeypatch.setattr(config, "WHATSAPP_PHONE_NUMBER_ID", "pnid")
    _app, ws_deps, _reg = build_components(client=object())
    assert ws_deps.notifier is not None
