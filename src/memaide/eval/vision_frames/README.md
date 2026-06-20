# Vision eval frames

Drop representative point-of-view `.jpg` / `.jpeg` / `.png` scenes here (e.g. person
sitting calmly, person on the floor, empty room, kitchen, person holding chest). The
eval harness (`python -m memaide.eval.run_vision_eval`) globs every image in this
directory and runs it through each (model, detail) combo.

Optional: add a sidecar `<name>.json` with `{"expected_label": ..., "expected_flags": [...]}`
for reference (the harness does not require it).

This directory is committed so runs are reproducible; real captured frames can be added
later and are picked up automatically.
