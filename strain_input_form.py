"""
Strain diagram input form
--------------------------
Popup window (tkinter = built-in Python GUI toolkit) to collect the
numbers needed to draw the strain diagram, before we send anything
to AutoCAD.

Key ideas explained inline as comments (per your beginner-learning setup).
"""

import tkinter as tk
from tkinter import messagebox
from fractions import Fraction


# ---------------------------------------------------------
# Helper: turn text like "3/1000" OR "0.003" into an exact
# Fraction, so no rounding happens while you're still typing
# numbers in. (Fraction = Python's exact-ratio number type,
# keeps "1/3" as 1/3, not 0.333333...)
# ---------------------------------------------------------
def parse_fraction(text):
    text = text.strip()
    if text == "":
        return None
    if "/" in text:
        # split "0.62/4700" into "0.62" and "4700", parse each
        # separately as a Fraction, then divide -> stays exact,
        # no rounding, even though both sides are decimals.
        num_str, den_str = text.split("/", 1)
        return Fraction(num_str.strip()) / Fraction(den_str.strip())
    return Fraction(text)  # plain decimal like "0.003"


# ---------------------------------------------------------
# The actual math.
# The triangle's own two corners sit at height 0 (top) and
# height d (bottom) -- NOT H. H is a separate, longer
# reference line (total section height) that the triangle's
# straight strain line is imagined to continue past.
#
# c    = neutral axis depth from top (where the diagonal
#        crosses the main vertical reference line, strain = 0)
# y_fr = height (from top) where the diagonal's strain would
#        equal -eps_fr (the cracking-strain point)
# lcr  = distance from that eps_fr crossing point DOWN TO THE
#        BOTTOM OF H (not down to d)
#
# Because lcr's definition now depends on eps_fr, eps_fr is a
# required input every time (no longer optional/unused).
# ---------------------------------------------------------
def solve_triangle(eps_c, eps_s, d, H, lcr, eps_fr):
    """
    eps_fr is always required.
    Exactly one of eps_c, eps_s, lcr should be None (blank) coming in.
    Returns dict with all values filled in, plus computed c, y_fr.
    """
    if eps_fr is None:
        raise ValueError("\u03b5fr is required now -- lcr is measured from the \u03b5fr crossing point.")

    filled = [v is not None for v in (eps_c, eps_s, lcr)]
    if sum(filled) != 2:
        raise ValueError("Fill exactly 2 of: \u03b5c, \u03b5s, lcr (leave the third blank).")

    if eps_c is not None and eps_s is not None:
        # both strains already known -- nothing to solve for here
        pass

    elif eps_c is not None and lcr is not None:
        # y_fr = d*(eps_c+eps_fr)/(eps_c+eps_s)  and  lcr = H - y_fr
        # so: y_fr = H - lcr  ->  solve that equation for eps_s
        y_fr = H - lcr
        if y_fr == 0:
            raise ValueError("H - lcr came out to 0; can't solve for \u03b5s (check lcr/H).")
        eps_s = d * (eps_c + eps_fr) / y_fr - eps_c

    elif eps_s is not None and lcr is not None:
        # same relationship, rearranged to solve for eps_c instead
        y_fr = H - lcr
        if d == y_fr:
            raise ValueError("d equals H-lcr; can't solve for \u03b5c (check lcr/H).")
        eps_c = (y_fr * eps_s - d * eps_fr) / (d - y_fr)

    else:
        raise ValueError("Need at least one of \u03b5c/\u03b5s, plus lcr, d, H, and \u03b5fr.")

    # neutral axis depth -- unchanged definition, top to zero-strain point
    c = d * eps_c / (eps_c + eps_s)

    # eps_fr crossing height (top -> strain = -eps_fr), and lcr measured
    # from THAT point down to the bottom of H -- always recomputed here
    # so it's consistent even if lcr was one of the two inputs above
    y_fr = d * (eps_c + eps_fr) / (eps_c + eps_s)
    lcr = H - y_fr

    return {
        "eps_c": eps_c, "eps_s": eps_s, "d": d, "H": H,
        "c": c, "lcr": lcr, "y_fr": y_fr, "eps_fr": eps_fr,
    }


# ---------------------------------------------------------
# Visual sanity check -- draws the same shape as your picture,
# using real numbers, so you can eyeball if it looks right.
# Uses plain tkinter Canvas
# ---------------------------------------------------------
def draw_preview(solved):
    eps_c = float(solved["eps_c"])
    eps_s = float(solved["eps_s"])
    d = float(solved["d"])
    H = float(solved["H"])
    c = float(solved["c"])
    lcr = float(solved["lcr"])
    y_fr = float(solved["y_fr"])
    eps_fr = float(solved["eps_fr"])
    scale = float(solved["scale"])

    xc = eps_c * scale
    xs = -eps_s * scale
    x_fr = -eps_fr * scale
    x_lcr = max(xc, 1) + max(abs(xs), abs(xc)) * 0.3 + 1
    x_H = x_lcr - (0 - x_lcr) * 0.3
    x_c = min(xs, x_fr, -1) - max(abs(xs), abs(xc)) * 0.3 - 1
    x_d = x_c + x_c * 0.3

    # ---- figure out the data's bounding box, so we can map it onto
    # a fixed-size canvas (canvas coordinates are just pixels) ----
    all_x = [0, xc, xs, x_fr, x_lcr, x_d, x_c, x_H]
    all_y = [0, c, d, H, y_fr]
    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    pad_x = (max_x - min_x) * 0.12 or 1
    pad_y = (max_y - min_y) * 0.08 or 1
    min_x, max_x = min_x - pad_x, max_x + pad_x
    min_y, max_y = min_y - pad_y, max_y + pad_y
    dimension_gap = max((max_x - min_x) * 0.015, 1)

    W, HPX = 700, 850  # canvas size in pixels
    margin = 40

    def to_px(x, y):
        # map data-space (x,y) -> pixel-space. Canvas y already
        # increases downward, same direction as our "height from
        # top" convention, so no flipping needed
        px = margin + (x - min_x) / (max_x - min_x) * (W - 2 * margin)
        py = margin + (y - min_y) / (max_y - min_y) * (HPX - 2 * margin)
        return px, py

    win = tk.Toplevel()
    win.title("Strain diagram preview (all dimensions labeled)")
    canvas = tk.Canvas(win, width=W, height=HPX, bg="white")
    canvas.pack()

    def line(p1, p2, color="black", dash=None, arrows=False):
        x1, y1 = to_px(*p1)
        x2, y2 = to_px(*p2)
        canvas.create_line(x1, y1, x2, y2, fill=color, dash=dash,
                            arrow=(tk.BOTH if arrows else None))

    def dot(p, color):
        x, y = to_px(*p)
        r = 3
        canvas.create_oval(x - r, y - r, x + r, y + r, fill=color, outline=color)

    def label(p, text, color, dx=6, dy=-6, anchor="w"):
        x, y = to_px(*p)
        canvas.create_text(x + dx, y + dy, text=text, fill=color, anchor=anchor)

    # ---- the shape itself ----
    line((0, 0), (0, H))                       # main vertical, top -> H
    line((0, 0), (xc, 0))                      # top stub
    line((xs, d), (0, d))                      # bottom stub
    line((xc, 0), (xs, d))                     # diagonal

    dot((xc, 0), "green")
    label((xc, 0), f"\u03b5c={eps_c:.6g}", "green", dx=6, dy=-10)

    dot((xs, d), "purple")
    label((xs, d), f"\u03b5s={eps_s:.6g}", "purple", dx=6, dy=10)

    dot((0, c), "red")
    line((x_c, 0), (x_c, c), color="red", arrows=True)
    line((x_c - dimension_gap, 0), (0, 0), color="red", dash=(2, 2))
    line((x_c - dimension_gap, c), (0, c), color="red", dash=(2, 2))
    label((x_c, c / 2), f"c={c:.4g}", "red", dx=10, dy=0)

    dot((x_fr, y_fr), "teal")
    label((x_fr, y_fr), f"\u03b5fr={eps_fr:.6g}", "teal", dx=10, dy=10)

    # ---- dimension lines (double-headed arrows + a text label) ----
    line((x_lcr, y_fr), (x_lcr, H), color="orange", arrows=True)
    line((x_lcr + dimension_gap, y_fr), (0, y_fr), color="orange", dash=(2, 2))
    line((x_lcr + dimension_gap, H), (0, H), color="orange", dash=(2, 2))
    label((x_lcr, (y_fr + H) / 2), f"lcr={lcr:.4g}", "orange", dx=-10, dy=0, anchor="e")

    line((x_d, 0), (x_d, d), color="black", arrows=True)
    line((x_d - dimension_gap, 0), (0, 0), color="black", dash=(2, 2))
    line((x_d - dimension_gap, d), (0, d), color="black", dash=(2, 2))
    label((x_d, d / 2), f"d={d:.4g}", "black", dx=-10, dy=0, anchor="e")

    line((x_H, 0), (x_H, H), color="blue", arrows=True)
    line((x_H + dimension_gap, 0), (0, 0), color="blue", dash=(2, 2))
    line((x_H + dimension_gap, H), (0, H), color="blue", dash=(2, 2))
    label((x_H, H / 2), f"H={H:.4g}", "blue", dx=10, dy=0)


# ---------------------------------------------------------
# Send the same diagram into a running AutoCAD session, via COM
# automation (pyautocad = a thin wrapper around win32com for
# talking to AutoCAD). Requires:
#   - Windows, with AutoCAD already open
#   - pip install pyautocad pywin32
#
# True lengths (c, lcr, d, H) get drawn as real AutoCAD DimAligned
# dimension objects, true-size, no scale applied -- they're actual
# measurements the drawing can be trusted for.
#
# Strains (eps_c, eps_s, eps_fr) are NOT real lengths, so they are
# NOT given AutoCAD dimension objects. They're only used to place
# points horizontally (multiplied by "scale", same as the preview)
# and labeled with plain text so it's clear those numbers are strains,
# not measured distances.
# ---------------------------------------------------------
def send_to_autocad(solved):
    try:
        from pyautocad import Autocad, APoint
    except ImportError:
        raise RuntimeError(
            "pyautocad isn't installed. In a terminal, run:\n"
            "    pip install pyautocad pywin32\n"
            "(Windows only, and AutoCAD must already be open.)"
        )

    eps_c = float(solved["eps_c"])
    eps_s = float(solved["eps_s"])
    d = float(solved["d"])
    H = float(solved["H"])
    c = float(solved["c"])
    lcr = float(solved["lcr"])
    y_fr = float(solved["y_fr"])
    eps_fr = float(solved["eps_fr"])
    scale = float(solved["scale"])

    # Scaled x-positions for the strain corners
    xc = eps_c * scale
    xs = -eps_s * scale
    x_fr = -eps_fr * scale
    x_lcr = max(xc, 1) + max(abs(xs), abs(xc)) * 0.3 + 1
    x_H = x_lcr - (0 - x_lcr) * 0.3
    x_c = min(xs, x_fr, -1) - max(abs(xs), abs(xc)) * 0.3 - 1
    x_d = x_c + x_c * 0.3

    # AutoCAD's Y axis points up by default; our diagram wants height=0
    # (top of section) at the top of the screen and height increasing
    # downward, so every height value just gets negated here.
    def P(x, height):
        return APoint(x, -height)

    acad = Autocad(create_if_not_exists=True)
    ms = acad.model

    # spacing unit for offset dimension lines -- scales with the
    # drawing itself so it looks reasonable at any d/H size
    unit = max(d, 1) * 0.05

    # --- geometry: same lines as the preview ---
    ms.AddLine(P(0, 0), P(0, H))            # main vertical line, top -> H

    ms.AddLine(P(0, 0), P(xc, 0))     # top stub
    ms.AddLine(P(xs, d), P(0, d))     # bottom stub
    ms.AddLine(P(xc, 0), P(xs, d))    # diagonal (hypotenuse)

    # --- strain points + text labels (scaled position, NOT a real
    # AutoCAD dimension -- these numbers are strains, not lengths) ---
    text_h = unit * 0.5
    ms.AddPoint(P(xc, 0))
    ms.AddText(f"\u03b5c={eps_c:.6g}", P(xc, 0), text_h)
    ms.AddPoint(P(xs, d))
    ms.AddText(f"\u03b5s={eps_s:.6g}", P(xs - unit * 4, d + unit), text_h)
    ms.AddPoint(P(x_fr, y_fr))
    ms.AddText(f"\u03b5fr={eps_fr:.6g}", P(x_fr - unit * 2, y_fr - unit), text_h)

    # --- real dimensions (true lengths, drawn true-size) ---
    ms.AddPoint(P(0, c))  # neutral axis point, marked for reference
    ms.AddDimAligned(P(0, 0), P(0, c), P(x_c, -c / 2))                     # c
    ms.AddDimAligned(P(0, y_fr), P(0, H), P(x_lcr, -(y_fr + H) / 2))       # lcr: eps_fr point -> bottom of H
    ms.AddDimAligned(P(0, 0), P(0, d), P(x_d, -d / 2))                     # d

    # H needs its own vertical reference line off to the side (like
    # the preview's blue line) since it isn't part of the triangle
    ms.AddLine(P(x_H, 0), P(x_H, H))
    ms.AddDimAligned(P(x_H, 0), P(x_H, H), P(x_H + unit * 2, -H / 2))      # H

    acad.doc.Application.ZoomExtents()


# ---------------------------------------------------------
# GUI
# ---------------------------------------------------------
class StrainForm:
    def __init__(self, root):
        self.root = root
        root.title("Strain Diagram Input")

        # each row: label text, default value (default = pre-filled but editable)
        self.fields = {}
        rows = [
            ("eps_c", "εc (compression strain at top fiber)", "0.003"),
            ("eps_s", "εs (tension strain at tension rebar)", "420/200000"),
            ("d", "d (effective depth)", "212.5"),
            ("H", "H (total height)", "250"),
            ("eps_fr", "εfr (cracking strain)", "0.62/4700"),
            ("lcr", "lcr (crack length)", ""),
            ("scale", "horizontal scale multiplier", "10000"),
        ]

        for i, (key, label_text, default) in enumerate(rows):
            tk.Label(root, text=label_text).grid(row=i, column=0, sticky="w", padx=6, pady=3)
            var = tk.StringVar(value=default)
            entry = tk.Entry(root, textvariable=var, width=20)
            entry.grid(row=i, column=1, padx=6, pady=3)
            self.fields[key] = var

        tk.Label(
            root,
            text="Leave exactly ONE of εc / εs / lcr blank\n(it gets calculated for you).",
            fg="gray30",
        ).grid(row=len(rows), column=0, columnspan=2, pady=(4, 8))

        tk.Button(root, text="Calculate", command=self.on_calculate).grid(
            row=len(rows) + 1, column=0, pady=6
        )
        tk.Button(root, text="Draw Preview", command=self.on_draw).grid(
            row=len(rows) + 1, column=1, pady=6
        )
        tk.Button(root, text="Send to AutoCAD", command=self.on_send_autocad).grid(
            row=len(rows) + 2, column=0, columnspan=2, pady=(0, 6)
        )

        self.result = None  # will hold the solved dict after Calculate is pressed

    def on_calculate(self, show_result=True):
        self.result = None
        try:
            eps_c = parse_fraction(self.fields["eps_c"].get())
            eps_s = parse_fraction(self.fields["eps_s"].get())
            lcr = parse_fraction(self.fields["lcr"].get())
            d = parse_fraction(self.fields["d"].get())
            H = parse_fraction(self.fields["H"].get())
            eps_fr = parse_fraction(self.fields["eps_fr"].get())
            scale = parse_fraction(self.fields["scale"].get())

            if d is None or H is None:
                raise ValueError("d and H are always required.")
            if eps_fr is None:
                raise ValueError("εfr is always required now (lcr is measured from it).")

            solved = solve_triangle(eps_c, eps_s, d, H, lcr, eps_fr)
            solved["scale"] = scale
            self.result = solved

            # Show as decimals here just for readability; the Fraction
            # (exact) values are still what's stored in self.result.
            msg = (
                f"c    = {float(solved['c']):.6f}   (neutral axis, top -> strain=0)\n"
                f"y_fr = {float(solved['y_fr']):.6f}   (top -> εfr crossing point)\n"
                f"lcr  = {float(solved['lcr']):.6f}   (εfr point -> bottom of H)\n"
                f"eps_c = {float(solved['eps_c']):.6f}\n"
                f"eps_s = {float(solved['eps_s']):.6f}\n"
            )
            if show_result:
                messagebox.showinfo("Result", msg)

        except Exception as e:
            messagebox.showerror("Input problem", str(e))

    def on_draw(self):
        self.on_calculate(show_result=False)
        if self.result:
            draw_preview(self.result)

    def on_send_autocad(self):
        if self.result is None:
            self.on_calculate()
        if self.result:
            try:
                send_to_autocad(self.result)
            except Exception as e:
                messagebox.showerror("AutoCAD problem", str(e))


if __name__ == "__main__":
    root = tk.Tk()
    app = StrainForm(root)
    root.mainloop()

    # After the window closes, app.result holds the solved values
    # (exact Fractions) if Calculate was pressed at least once.
    if app.result:
        print("Final values ready for drawing:", app.result)
