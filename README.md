# RC Strain Diagram Calculator

A small tool for solving and drawing the reinforced-concrete strain diagram
(εc, εs, c, lcr) used when estimating crack length / beam performance.

**Live web version:** _[RC-Strain-Diagram-Calculator](https://andisaifulkohir.github.io/RC-Strain-Diagram-Calculator/)_

## What it does

- Enter any 2 of εc, εs, lcr (plus d, H, εfr) — the third is solved for you.
- Live diagram preview in the browser.
- Download button generates a  script that draws the
  same diagram straight into a running AutoCAD.

## Files

| File                     | What it's for                                                               |
| ------------------------ | --------------------------------------------------------------------------- |
| `index.html`           | Web calculator + live preview — open directly or via GitHub Pages          |
| `strain_input_form.py` | Desktop version (tkinter GUI), same math, can also send to AutoCAD directly |
| `requirements.txt`     | Python packages needed for the desktop version                              |

## Running the desktop version

```
pip install -r requirements.txt
python strain_input_form.py
```

AutoCAD must already be open for the "Send to AutoCAD" button to work.

## Background / citation

The strain-diagram / crack-length relationship this tool is based on comes from:

R. Djamaluddin, R. U. Latief, Fakhruddin, K. Yamaguchi, and A. Setiawan,
"Development of Performance Parameters for the Assessment of Reinforced
Concrete Bridge Girder Beams," *Engineering, Technology & Applied Science
Research*, vol. 16, no. 1, pp. 32074–32080, Feb. 2026.
DOI: [10.48084/etasr.15826](https://doi.org/10.48084/etasr.15826)

(Licensed under CC BY 4.0 — used here for reference, not reproduced.)

## Acknowledgment

This tool (both the web calculator and desktop app) was built with the help
of [Claude.ai](https://claude.ai).

## License

MIT — see [LICENSE](LICENSE).
