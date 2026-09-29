// ---------------------------------------------------------
// Parse "3/1000" or "0.003" into a plain float. (The web
// preview only needs to look right; the downloaded AutoLISP
// script re-parses your exact typed text with Fraction(),
// so no rounding ever reaches the actual AutoCAD drawing.)
// ---------------------------------------------------------
function parseNum(text){
  text = (text || "").trim();
  if(text === "") return null;
  if(text.includes("/")){
    const [a,b] = text.split("/");
    return parseFloat(a) / parseFloat(b);
  }
  return parseFloat(text);
}

// ---------------------------------------------------------
// Solving triangle formula.
// ---------------------------------------------------------
function solveTriangle(eps_c, eps_d, d, H, lcr, eps_fr){
  if(eps_fr === null) throw new Error("εfr is required — lcr is measured from the εfr crossing point.");
  const filled = [eps_c, eps_d, lcr].filter(v => v !== null).length;
  if(filled !== 2) throw new Error("Fill exactly 2 of: εc, εd, lcr (leave the third blank).");

  if(eps_c !== null && eps_d !== null){
    // nothing to solve here yet
  } else if(eps_c !== null && lcr !== null){
    const y_fr = H - lcr;
    if(y_fr === 0) throw new Error("H - lcr came out to 0 — check lcr/H.");
    eps_d = d * (eps_c + eps_fr) / y_fr - eps_c;
  } else if(eps_d !== null && lcr !== null){
    const y_fr = H - lcr;
    if(d === y_fr) throw new Error("d equals H-lcr — check lcr/H.");
    eps_c = (y_fr * eps_d - d * eps_fr) / (d - y_fr);
  } else {
    throw new Error("Need at least one of εc/εd, plus lcr, d, H, and εfr.");
  }

  const c = d * eps_c / (eps_c + eps_d);
  const y_fr = d * (eps_c + eps_fr) / (eps_c + eps_d);
  const lcr_out = H - y_fr;

  return { eps_c, eps_d, d, H, c, lcr: lcr_out, y_fr, eps_fr };
}

function strainAtDepth(depth, solved){
  if(!Number.isFinite(depth) || depth < 0 || depth > solved.H){
    throw new Error("Strain point depths must be between 0 and H, measured from the top.");
  }
  if(!Number.isFinite(solved.d) || solved.d <= 0){
    throw new Error("d must be greater than 0 to calculate strain at a depth.");
  }
  return solved.eps_c - (solved.eps_c + solved.eps_d) * depth / solved.d;
}

function getThemeColor(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------------------------------------------------------
// Draw the same shape as the tkinter Canvas version, as SVG.
// ---------------------------------------------------------
function drawDiagram(solved, scale, measurementPoints=[]){
  const { eps_c, eps_d, d, H, c, lcr, y_fr, eps_fr } = solved;
  const xc = eps_c * scale;
  const xd = -eps_d * scale;
  const x_fr = -eps_fr * scale;
  const x_lcr = Math.max(xc, 1) + Math.max(Math.abs(xd), Math.abs(xc)) * 0.3 + 1;
  const x_H = x_lcr - Math.min(xc, xd) * 0.3;
  const x_c = Math.min(xd, x_fr, -1) - Math.max(Math.abs(xd), Math.abs(xc)) * 0.3 - 1;
  const x_d = x_c + Math.min(xc, xd) * 0.3;

  const allX = [0, xc, xd, x_fr, x_lcr, x_d, x_c, x_H,
    ...measurementPoints.map(point => point.strain * scale)];
  const allY = [0, c, d, H, y_fr, ...measurementPoints.map(point => point.depth)];
  let minX = Math.min(...allX), maxX = Math.max(...allX);
  let minY = Math.min(...allY), maxY = Math.max(...allY);
  const padX = (maxX - minX) * 0.12 || 1;
  const padY = (maxY - minY) * 0.08 || 1;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  const dimensionGap = Math.max((maxX - minX) * 0.015, 1);

  const W = 700, HPX = 850, margin = 40;
  const toPx = (x,y) => [
    margin + (x - minX) / (maxX - minX) * (W - 2*margin),
    margin + (y - minY) / (maxY - minY) * (HPX - 2*margin)
  ];

  const svg = document.getElementById('diagram');
  svg.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const colors = {
    line: getThemeColor("--diagram-line"),
    epsC: getThemeColor("--diagram-eps-c"),
    epsD: getThemeColor("--diagram-eps-d"),
    c: getThemeColor("--diagram-c"),
    fr: getThemeColor("--diagram-fr"),
    lcr: getThemeColor("--diagram-lcr")
  };

  function line(p1, p2, color=colors.line, dash=null, arrows=false){
    const [x1,y1] = toPx(...p1), [x2,y2] = toPx(...p2);
    const el = document.createElementNS(ns, "line");
    el.setAttribute("x1",x1); el.setAttribute("y1",y1);
    el.setAttribute("x2",x2); el.setAttribute("y2",y2);
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", "1.4");
    if(dash) el.setAttribute("stroke-dasharray", dash);
    if(arrows){ el.setAttribute("marker-start","url(#arrow)"); el.setAttribute("marker-end","url(#arrow)"); }
    svg.appendChild(el);
  }
  function dot(p, color){
    const [x,y] = toPx(...p);
    const el = document.createElementNS(ns, "circle");
    el.setAttribute("cx",x); el.setAttribute("cy",y); el.setAttribute("r",4);
    el.setAttribute("fill", color);
    svg.appendChild(el);
  }
  function label(p, text, color, dx=6, dy=-6, anchor="start"){
    const [x,y] = toPx(...p);
    const el = document.createElementNS(ns, "text");
    el.setAttribute("x", x+dx); el.setAttribute("y", y+dy);
    el.setAttribute("fill", color);
    el.setAttribute("text-anchor", anchor);
    el.setAttribute("font-family", "IBM Plex Mono, monospace");
    el.setAttribute("font-size", "12");
    el.textContent = text;
    svg.appendChild(el);
  }

  // arrowhead marker def
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `<marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto-start-reverse">
    <path d="M0,0 L6,3 L0,6 Z" fill="${colors.lcr}"/></marker>`;
  svg.appendChild(defs);

  line([0,0],[0,H]);
  line([0,0],[xc,0]);
  line([xd,d],[0,d]);
  line([xc,0],[xd,d]);
  

  dot([xc,0], colors.epsC);
  label([xc,0], `εc=${eps_c.toPrecision(4)}`, colors.epsC, 0, -12, "middle");

  dot([xd,d], colors.epsD);
  label([xd,d], `εd=${eps_d.toPrecision(4)}`, colors.epsD, 0, 20, "middle");

  dot([0,c], colors.c);
  line([x_c,0],[x_c,c], colors.c, null, true);
  line([x_c-dimensionGap,0],[0,0], colors.c, "2,2");
  line([x_c-dimensionGap,c],[0,c], colors.c, "2,2");
  label([x_c,c/2], `c=${c.toPrecision(4)}`, colors.c, 10, 0);

  dot([x_fr,y_fr], colors.fr);
  label([x_fr,y_fr], `εfr=${eps_fr.toPrecision(4)}`, colors.fr, 0, 20, "middle");

  line([x_lcr,y_fr],[x_lcr,H], colors.lcr, null, true);
  line([x_lcr+dimensionGap,y_fr],[0,y_fr], colors.lcr, "2,2");
  line([x_lcr+dimensionGap,H],[0,H], colors.lcr, "2,2");
  label([x_lcr,(y_fr+H)/2], `lcr=${lcr.toPrecision(4)}`, colors.lcr, -10, 0, "end");

  line([x_d,0],[x_d,d], colors.line, null, true);
  line([x_d-dimensionGap,0],[0,0], colors.line, "2,2");
  line([x_d-dimensionGap,d],[0,d], colors.line, "2,2");
  label([x_d,d/2], `d=${d.toPrecision(4)}`, colors.line, -10, 0, "end");

  line([x_H,0],[x_H,H], colors.fr, null, true);
  line([x_H+dimensionGap,0],[0,0], colors.fr, "2,2");
  line([x_H+dimensionGap,H],[0,H], colors.fr, "2,2");
  label([x_H,H/2], `H=${H.toPrecision(4)}`, colors.fr, 10, 0);

  measurementPoints.forEach(point => {
    dot([point.strain * scale, point.depth], point.color);
    label([point.strain * scale, point.depth],
      `${point.name}=${point.strain.toPrecision(4)}`, point.color, 7, -7);
  });
}

// ---------------------------------------------------------
// Build the downloadable local script as AutoLISP (.lsp).
// AutoCAD runs this natively, just drag-and-drop script
// inside AutoCAD itself. Loading the file runs the drawing
// automatically. Values are baked in as plain
// numbers, already solved here in the browser.
// ---------------------------------------------------------
function fmt(n){
  // plain decimal string, safe to drop into LISP source
  return Number(n).toFixed(8).replace(/0+$/,"").replace(/\.$/,".0");
}

function buildScript(raw){
  const eps_c = parseNum(raw.eps_c);
  const eps_d = parseNum(raw.eps_d);
  const d = parseNum(raw.d);
  const H = parseNum(raw.H);
  const eps_fr = parseNum(raw.eps_fr);
  const lcr = parseNum(raw.lcr);
  const scale = parseNum(raw.scale) || 10000;

  const solved = solveTriangle(eps_c, eps_d, d, H, lcr, eps_fr);
  const { c, y_fr, lcr: lcrOut } = solved;
  const xc = solved.eps_c * scale;
  const xd = -solved.eps_d * scale;
  const x_fr = -solved.eps_fr * scale;

  return `;;; Standalone AutoCAD drawing script -- generated from the web calculator.
;;; Drag and drop this file onto the AutoCAD drawing
;;; window. The diagram is drawn automatically.

(defun c:DRAWSTRAIN ( / eps_c eps_d d H eps_fr c y_fr lcr xc xs x_fr x_H unit texth oldcelltype oldosmode)

  (setq eps_c  ${fmt(solved.eps_c)})
  (setq eps_d  ${fmt(solved.eps_d)})
  (setq d      ${fmt(d)})
  (setq H      ${fmt(H)})
  (setq eps_fr ${fmt(solved.eps_fr)})
  (setq c      ${fmt(c)})
  (setq y_fr   ${fmt(y_fr)})
  (setq lcr    ${fmt(lcrOut)})
  (setq xc     ${fmt(xc)})
  (setq xd     ${fmt(xd)})
  (setq x_fr   ${fmt(x_fr)})
  (setq unit   (* (max d 1.0) 0.05))
  (setq texth  (* unit 0.5))
  (setq x_H    (* unit 12))

  (setq oldosmode (getvar "OSMODE"))
  (setvar "OSMODE" 0)

  ;; main triangle + vertical fibers
  (command "_.LINE" (list 0 0) (list 0 (- d)) "")

  (if (not (tblsearch "LTYPE" "DASHED"))
    (command "_.-LINETYPE" "_Load" "DASHED" "acad.lin" "")
  )
  (setq oldcelltype (getvar "CELTYPE"))
  (setvar "CELTYPE" "DASHED")
  (command "_.LINE" (list 0 (- d)) (list 0 (- H)) "")
  (setvar "CELTYPE" oldcelltype)

  (command "_.LINE" (list 0 0) (list xc 0) "")
  (command "_.LINE" (list xd (- d)) (list 0 (- d)) "")
  (command "_.LINE" (list xc 0) (list xd (- d)) "")
  (command "_.LINE" (list x_H 0) (list x_H (- H)) "")

  ;; points + labels
  (command "_.POINT" (list xc 0))
  (command "_.TEXT" (list xc 0) texth 0
    (strcat "eps_c=" (rtos eps_c 2 6)))

  (command "_.POINT" (list xd (- d)))
  (command "_.TEXT" (list (- xd (* unit 4)) (- (+ d unit)) ) texth 0
    (strcat "eps_d=" (rtos eps_d 2 6)))

  (command "_.POINT" (list x_fr (- y_fr)))
  (command "_.TEXT" (list (- x_fr (* unit 2)) (+ (- y_fr) unit)) texth 0
    (strcat "eps_fr=" (rtos eps_fr 2 6)))

  (command "_.POINT" (list 0 (- c)))

  ;; dimensions
  (command "_.DIMALIGNED" (list 0 0) (list 0 (- c)) (list (- (* unit 14)) (/ c 2)))
  (command "_.DIMALIGNED" (list 0 (- y_fr)) (list 0 (- H)) (list (- (* unit 3)) (- (/ (+ y_fr H) 2))))
  (command "_.DIMALIGNED" (list 0 0) (list 0 (- d)) (list (- (* unit 8)) (/ d 2)))
  (command "_.DIMALIGNED" (list x_H 0) (list x_H (- H)) (list (+ x_H (* unit 2)) (- (/ H 2))))

  (setvar "OSMODE" oldosmode)
  (command "_.ZOOM" "_Extents")

  (princ "\\nDrawn. c=") (princ (rtos c 2 4))
  (princ "  lcr=") (princ (rtos lcr 2 4))
  (princ)
)

(c:DRAWSTRAIN)
(princ)
`;
}

function recalc(){
  const ids = ["eps_c","eps_d","d","H","eps_fr","lcr","scale"];
  const raw = {};
  ids.forEach(id => raw[id] = document.getElementById(id).value);

  const errEl = document.getElementById("error");
  const resEl = document.getElementById("results");
  const epsCSlider = document.getElementById("eps_c_slider");
  const epsDSlider = document.getElementById("eps_d_slider");
  const epsCSliderValue = document.getElementById("eps_c_slider_value");
  const epsDSliderValue = document.getElementById("eps_d_slider_value");
  errEl.textContent = "";

  try{
    const eps_c = parseNum(raw.eps_c);
    const eps_d = parseNum(raw.eps_d);
    const d = parseNum(raw.d);
    const H = parseNum(raw.H);
    const eps_fr = parseNum(raw.eps_fr);
    const lcr = parseNum(raw.lcr);
    const scale = parseNum(raw.scale) || 10000;

    if(d === null || H === null) throw new Error("d and H are always required.");

    const solved = solveTriangle(eps_c, eps_d, d, H, lcr, eps_fr);
    const measurementColors = [getThemeColor("--diagram-lcr")];
    const measurementPoints = Array.from(document.querySelectorAll("#strainPoints .strain-point-row"))
      .map((row, index) => {
        const input = row.querySelector(".measurement-depth");
        const depth = parseNum(input.value);
        return depth === null ? null : {
          name: row.dataset.pointName,
          depth,
          color: measurementColors[index % measurementColors.length],
          strain: strainAtDepth(depth, solved)
        };
      })
      .filter(point => point !== null);
    drawDiagram(solved, scale, measurementPoints);
    epsCSlider.value = solved.eps_c;
    epsDSlider.value = solved.eps_d;
    epsCSliderValue.textContent = solved.eps_c.toFixed(6);
    epsDSliderValue.textContent = solved.eps_d.toFixed(6);
    lastSolved = solved;

    resEl.innerHTML =
      `<span>c</span>    = ${solved.c.toFixed(4)}<br>` +
      `<span>y_fr</span> = ${solved.y_fr.toFixed(4)}<br>` +
      `<span>lcr</span>  = ${solved.lcr.toFixed(4)}<br>` +
      `<span>eps_c</span> = ${solved.eps_c.toFixed(6)}<br>` +
      `<span>eps_d</span> = ${solved.eps_d.toFixed(6)}` +
      (measurementPoints.length
        ? "<br>" + measurementPoints.map(point =>
          `<span>${point.name} at ${point.depth} mm</span> = ${point.strain.toFixed(6)}`
        ).join("<br>")
        : "");

    window._lastRaw = raw;
  } catch(e){
    errEl.textContent = e.message;
    resEl.textContent = "—";
    lastSolved = null;
    window._lastRaw = null;
  }
}

let lastSolved = null;

const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

function updateThemeToggle(isDark){
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  themeIcon.textContent = isDark ? "☀" : "☾";
}

updateThemeToggle(document.documentElement.getAttribute("data-theme") === "dark");
themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if(isDark){
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
  }
  updateThemeToggle(!isDark);
  recalc();
});

document.querySelectorAll("#form-panel input:not([type='range'])").forEach(el => {
  el.addEventListener("input", recalc);
});

const strainPoints = document.getElementById("strainPoints");
let nextStrainPointId = 1;
document.getElementById("addStrainPointBtn").addEventListener("click", () => {
  const row = document.createElement("div");
  row.className = "strain-point-row";
  const inputId = `strain-point-depth-${nextStrainPointId++}`;
  row.innerHTML =
    `<div class="field">` +
      `<label for="${inputId}"></label>` +
      `<input id="${inputId}" class="measurement-depth" type="number" min="0" step="any" placeholder="Depth in mm">` +
    `</div>` +
    `<button type="button" class="remove-point-button" aria-label="Remove strain point">×</button>`;
  strainPoints.appendChild(row);
  updateStrainPointLabels();
  recalc();
});

strainPoints.addEventListener("input", recalc);
strainPoints.addEventListener("click", event => {
  const removeButton = event.target.closest(".remove-point-button");
  if(removeButton){
    removeButton.closest(".strain-point-row").remove();
    updateStrainPointLabels();
    recalc();
  }
});

function updateStrainPointLabels(){
  Array.from(strainPoints.children).forEach((row, index) => {
    const name = `εs${index + 1}`;
    row.dataset.pointName = name;
    row.querySelector("label").textContent = `${name} depth`;
  });
}

[
  ["eps_c_slider", "eps_c"],
  ["eps_d_slider", "eps_d"]
].forEach(([sliderId, strainId]) => {
  const slider = document.getElementById(sliderId);
  slider.addEventListener("input", () => {
    const epsC = document.getElementById("eps_c");
    const epsD = document.getElementById("eps_d");

    if(lastSolved){
      if(epsC.value.trim() === "") epsC.value = lastSolved.eps_c;
      if(epsD.value.trim() === "") epsD.value = lastSolved.eps_d;
    }

    document.getElementById(strainId).value = slider.value;
    document.getElementById("lcr").value = "";
    recalc();
  });
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  if(!window._lastRaw){
    document.getElementById("error").textContent = "Fix the input error above first.";
    return;
  }
  const script = buildScript(window._lastRaw);
  const blob = new Blob([script], {type:"text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "draw_strain.lsp";
  a.click();
  URL.revokeObjectURL(url);
});

recalc();
