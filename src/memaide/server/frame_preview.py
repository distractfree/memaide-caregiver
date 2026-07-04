"""Live-preview snapshot: write the newest described frame + its trace to two files.

The bridge server points a static ``index.html`` (served by stdlib ``http.server``) at the
same directory; the page polls ``latest.jpg`` + ``latest.json`` every ~1s to show the glasses
frame next to the ``[vision]``/``[escalation]`` trace. Intentionally low-effort (no push,
no deps). Every write is best-effort: a bad frame or I/O error is logged and skipped, never
raised, so the preview can't take down a connection.
"""

import asyncio
import base64
import json
import logging
from pathlib import Path
from typing import Any

from memaide.schemas import EscalationDecision, VisionContext

_log = logging.getLogger(__name__)

# Static, dependency-free page: polls latest.jpg + latest.json every second and shows the
# frame next to its [vision]/[escalation] trace. Served by stdlib http.server from the same dir.
PREVIEW_INDEX_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MemAide - glasses vision trace</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;margin:0;background:#111;color:#eee}
  header{padding:12px 16px;background:#1b1b1b;border-bottom:1px solid #333;font-size:15px}
  .wrap{display:flex;gap:16px;padding:16px;flex-wrap:wrap}
  img{max-width:640px;width:100%;border-radius:8px;background:#000;object-fit:contain}
  .trace{flex:1;min-width:280px}
  .row{margin:10px 0;line-height:1.4}
  .k{color:#8ab4f8}
  .flags{font-family:ui-monospace,Consolas,monospace}
  .esc{background:#5c1a1a;color:#ffd7d7;padding:12px;border-radius:8px;font-weight:bold}
  .ok{color:#9ae6a0}
  #ts{color:#888;font-size:12px}
</style></head><body>
<header><b>MemAide</b> &mdash; live glasses vision trace <span id="conn" style="color:#888"></span></header>
<div class="wrap">
  <img id="frame" alt="latest glasses frame">
  <div class="trace">
    <div class="row"><span class="k">label</span>: <span id="label">&mdash;</span></div>
    <div class="row"><span class="k">description</span>: <span id="desc">&mdash;</span></div>
    <div class="row"><span class="k">flags</span>: <span id="flags" class="flags">&mdash;</span></div>
    <div class="row"><span class="k">advisory</span>: <span id="adv" class="flags">&mdash;</span></div>
    <div class="row" id="escbox"></div>
    <div class="row" id="ts"></div>
  </div>
</div>
<script>
async function tick(){
  try{
    const r = await fetch('latest.json?t=' + Date.now());
    if(r.ok){
      const m = await r.json();
      document.getElementById('label').textContent = m.label || '\\u2014';
      document.getElementById('desc').textContent = m.description || '\\u2014';
      document.getElementById('flags').textContent = (m.flags && m.flags.length) ? m.flags.join(', ') : '(none)';
      document.getElementById('adv').textContent = (m.advisory_flags && m.advisory_flags.length) ? m.advisory_flags.join(', ') : '(none)';
      document.getElementById('ts').textContent = m.ts || '';
      const eb = document.getElementById('escbox');
      if(m.escalate){ eb.className='row esc'; eb.textContent='\\u26a0 ESCALATION \\u2014 ' + (m.reason||''); }
      else { eb.className='row'; eb.innerHTML='<span class="ok">no escalation</span>'; }
      document.getElementById('conn').textContent='';
    }
  }catch(e){ document.getElementById('conn').textContent='(waiting for server\\u2026)'; }
  document.getElementById('frame').src = 'latest.jpg?t=' + Date.now();
}
setInterval(tick, 1000); tick();
</script></body></html>
"""


def write_index_html(out_dir: str | Path) -> Path:
    """Write the static preview page into ``out_dir`` (created if needed). Returns its path."""
    d = Path(out_dir)
    d.mkdir(parents=True, exist_ok=True)
    path = d / "index.html"
    path.write_text(PREVIEW_INDEX_HTML, encoding="utf-8")
    return path


class FramePreviewWriter:
    def __init__(self, out_dir: str | Path) -> None:
        self._dir = Path(out_dir)

    @staticmethod
    def _decode(data_url: str) -> bytes:
        payload = data_url.split(",", 1)[1] if "," in data_url else data_url
        return base64.b64decode(payload, validate=True)

    async def write(
        self,
        ctx: VisionContext,
        frame_url: str | None,
        flags: list[str],
        decision: EscalationDecision | None,
    ) -> None:
        try:
            await asyncio.to_thread(self._dir.mkdir, parents=True, exist_ok=True)
        except Exception as exc:  # noqa: BLE001 - preview must never kill the connection
            _log.warning("preview: mkdir failed, skipping: %s", exc)
            return

        if frame_url:
            try:
                jpeg = self._decode(frame_url)
                await asyncio.to_thread((self._dir / "latest.jpg").write_bytes, jpeg)
            except Exception as exc:  # noqa: BLE001 - bad frame -> keep the trace, drop the image
                _log.warning("preview: bad frame payload, skipping image: %s", exc)

        meta: dict[str, Any] = {
            "description": ctx.description,
            "label": ctx.label,
            "flags": list(flags),
            "advisory_flags": list(ctx.advisory_flags),
            "ts": ctx.ts.isoformat(),
            "escalate": bool(decision and decision.escalate),
            "reason": decision.reason if decision else "",
            "triggered_by": list(decision.triggered_by) if decision else [],
        }
        try:
            await asyncio.to_thread(
                (self._dir / "latest.json").write_text, json.dumps(meta, indent=2)
            )
        except Exception as exc:  # noqa: BLE001
            _log.warning("preview: trace write failed, skipping: %s", exc)
