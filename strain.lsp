;; ==================================================================
;; STRAIN.LSP -- Strain diagram tool for AutoCAD (pure AutoLISP)
;; ==================================================================
;; Same calculator/drawing tool as the Python/tkinter version, but
;; runs entirely inside AutoCAD -- nobody needs Python installed.
;; This is a SINGLE FILE: the input dialog (DCL) is written to a
;; temp file at runtime, so there's nothing extra to distribute.
;;
;; HOW TO USE (recipients):
;;   1. In AutoCAD: type APPLOAD, browse to strain.lsp, click Load.
;;      (Or just drag-and-drop strain.lsp onto the AutoCAD window.)
;;   2. Type STRAIN at the command line to open the input form.
;;   3. Fill in values -- leave exactly ONE of eps_c / eps_s / lcr
;;      blank (it gets solved for you) -- then click "Draw in AutoCAD".
;;
;; NOTE: Works on AutoCAD for Windows. AutoCAD for Mac does not
;; support DCL dialogs, so this particular form won't display there
;; (the math/drawing logic itself would still translate fine).
;; ==================================================================

(vl-load-com)

;; ------------------------------------------------------------------
;; Helper: turn text like "3/1000" OR "0.003" into a real number.
;; Returns nil for a blank string, same idea as Python's parse_fraction.
;; ------------------------------------------------------------------
(defun parse-frac (s / pos numstr denstr)
  (setq s (vl-string-trim " \t" s))
  (cond
    ((= s "") nil)
    ((setq pos (vl-string-search "/" s))
     (setq numstr (vl-string-trim " \t" (substr s 1 pos)))
     (setq denstr (vl-string-trim " \t" (substr s (+ pos 2))))
     (/ (atof numstr) (atof denstr))
    )
    (t (atof s))
  )
)

(defun tile-frac (key) (parse-frac (get_tile key)))

(defun count-filled (a b c)
  (+ (if a 1 0) (if b 1 0) (if c 1 0))
)

;; ------------------------------------------------------------------
;; The actual math (mirrors solve_triangle() from the Python version).
;;   c    = neutral axis depth from top (strain = 0)
;;   y_fr = height from top where strain = -eps_fr
;;   lcr  = distance from that eps_fr point DOWN TO THE BOTTOM OF H
;;          (not down to d)
;; eps_fr is always required -- lcr's definition depends on it.
;; Returns (eps_c eps_s c lcr y_fr) on success, or nil on failure
;; (with *strain-err* set to an explanation).
;; ------------------------------------------------------------------
(defun solve-triangle (epsc epss d h lcr epsfr / yfr c)
  (setq *strain-err* nil)
  (cond
    ((not epsfr)
     (setq *strain-err* "eps_fr is required -- lcr is measured from the eps_fr crossing point.")
     nil
    )
    ((/= (count-filled epsc epss lcr) 2)
     (setq *strain-err* "Fill exactly 2 of: eps_c, eps_s, lcr (leave the third blank).")
     nil
    )
    (t
     (cond
       ((and epsc epss) nil) ;; both already known -- nothing to solve
       ((and epsc lcr)
        (setq yfr (- h lcr))
        (if (equal yfr 0.0 1e-12)
          (setq *strain-err* "H - lcr came out to 0; can't solve for eps_s (check lcr/H).")
          (setq epss (- (/ (* d (+ epsc epsfr)) yfr) epsc))
        )
       )
       ((and epss lcr)
        (setq yfr (- h lcr))
        (if (equal d yfr 1e-9)
          (setq *strain-err* "d equals H-lcr; can't solve for eps_c (check lcr/H).")
          (setq epsc (/ (- (* yfr epss) (* d epsfr)) (- d yfr)))
        )
       )
     )
     (if *strain-err*
       nil
       (progn
         ;; neutral axis depth -- top to zero-strain point
         (setq c (/ (* d epsc) (+ epsc epss)))
         ;; eps_fr crossing height, and lcr from THAT point to bottom of H
         ;; -- always recomputed here so it's consistent either way
         (setq yfr (/ (* d (+ epsc epsfr)) (+ epsc epss)))
         (setq lcr (- h yfr))
         (list epsc epss c lcr yfr)
       )
     )
    )
  )
)

;; ------------------------------------------------------------------
;; Drawing helpers
;; ------------------------------------------------------------------

;; AutoCAD's Y axis points up by default; the diagram wants height=0
;; (top of section) at the top of the screen, height increasing
;; downward -- so every height value gets negated here.
(defun P (x height) (list x (- height) 0.0))

(defun draw-line (p1 p2)
  (entmakex (list '(0 . "LINE") (cons 10 p1) (cons 11 p2)))
)

(defun draw-point (p)
  (entmakex (list '(0 . "POINT") (cons 10 p)))
)

(defun draw-text (str p height)
  (entmakex (list '(0 . "TEXT") (cons 10 p) (cons 40 height) (cons 1 str)))
)

(defun try-load-dashed ()
  (if (not (tblsearch "LTYPE" "DASHED"))
    (command "_.-linetype" "_load" "DASHED" "acad.lin" "")
  )
)

(defun set-dashed (ename)
  (if (and ename (tblsearch "LTYPE" "DASHED"))
    (entmod (append (entget ename) (list (cons 6 "DASHED"))))
  )
)

;; ------------------------------------------------------------------
;; Draws the full diagram into the current drawing.
;; True lengths (c, lcr, d, H) get real DIMALIGNED dimension objects,
;; true-size, no scale applied. Strains (eps_c, eps_s, eps_fr) are
;; NOT real lengths -- they only get their scaled x-position and a
;; plain text label, same as the matplotlib preview.
;; ------------------------------------------------------------------
(defun draw-strain-geometry (epsc epss d h c lcr yfr epsfr scale
                              / xc xs xfr unit extline xh)
  (setq xc (* epsc scale))
  (setq xs (- (* epss scale)))
  (setq xfr (- (* epsfr scale)))
  (setq unit (* (max d 1.0) 0.05))

  ;; main vertical line (top -> d), dashed extension (d -> H)
  (draw-line (P 0 0) (P 0 d))
  (try-load-dashed)
  (setq extline (draw-line (P 0 d) (P 0 h)))
  (set-dashed extline)

  ;; top/bottom stubs + diagonal
  (draw-line (P 0 0) (P xc 0))
  (draw-line (P xs d) (P 0 d))
  (draw-line (P xc 0) (P xs d))

  ;; strain points + text labels (scaled position, plain text --
  ;; these are strains, not real lengths, so no dimension objects)
  (draw-point (P xc 0))
  (draw-text (strcat "eps_c=" (rtos epsc 2 6)) (P xc 0) (* unit 0.5))
  (draw-point (P xs d))
  (draw-text (strcat "eps_s=" (rtos epss 2 6)) (P (- xs (* unit 4)) (+ d unit)) (* unit 0.5))
  (draw-point (P xfr yfr))
  (draw-text (strcat "eps_fr=" (rtos epsfr 2 6)) (P (- xfr (* unit 2)) (- yfr unit)) (* unit 0.5))

  ;; real dimensions (true length, true scale): c, lcr, d, H
  (draw-point (P 0 c))
  (command "_.dimaligned" (P 0 0) (P 0 c) (P (* unit 2) (/ c -2.0)))
  (command "_.dimaligned" (P 0 yfr) (P 0 h) (P (* unit -3) (/ (+ yfr h) -2.0)))
  (command "_.dimaligned" (P 0 0) (P 0 d) (P (* unit -8) (/ d -2.0)))

  ;; H needs its own reference line off to the side (like the
  ;; preview's blue line), since it isn't part of the triangle
  (setq xh (* unit 12))
  (draw-line (P xh 0) (P xh h))
  (command "_.dimaligned" (P xh 0) (P xh h) (P (+ xh (* unit 2)) (/ h -2.0)))

  (command "_.zoom" "_extents")
  (princ)
)

;; ------------------------------------------------------------------
;; Dialog callbacks
;; ------------------------------------------------------------------

(defun strain-calc ( / epsc epss d h epsfr lcr solved msg)
  (setq epsc (tile-frac "epsc"))
  (setq epss (tile-frac "epss"))
  (setq d    (tile-frac "d"))
  (setq h    (tile-frac "h"))
  (setq epsfr (tile-frac "epsfr"))
  (setq lcr  (tile-frac "lcr"))
  (if (or (not d) (not h))
    (alert "d and H are always required.")
    (progn
      (setq solved (solve-triangle epsc epss d h lcr epsfr))
      (if solved
        (progn
          (setq msg (strcat
            "c    = " (rtos (nth 2 solved) 2 6) "   (neutral axis, top -> strain=0)\n"
            "y_fr = " (rtos (nth 4 solved) 2 6) "   (top -> eps_fr crossing point)\n"
            "lcr  = " (rtos (nth 3 solved) 2 6) "   (eps_fr point -> bottom of H)\n"
            "eps_c = " (rtos (nth 0 solved) 2 6) "\n"
            "eps_s = " (rtos (nth 1 solved) 2 6)
          ))
          (alert msg)
        )
        (alert *strain-err*)
      )
    )
  )
)

;; Returns T on success (so the dialog closes), nil on failure
;; (so the dialog stays open and the person can fix the inputs).
;; NOTE: this does NOT draw anymore. It only solves the math and
;; stashes the result in *strain-pending*. The real (command ...)
;; drawing calls run AFTER the dialog is closed (see c:STRAIN below) --
;; AutoCAD's command line is locked while a DCL dialog is open, so
;; any (command ...) call made from inside an action_tile callback
;; silently fails or half-runs. That was the "calc works, draw
;; doesn't" bug.
(defun strain-draw ( / epsc epss d h epsfr lcr scale solved)
  (setq epsc (tile-frac "epsc"))
  (setq epss (tile-frac "epss"))
  (setq d    (tile-frac "d"))
  (setq h    (tile-frac "h"))
  (setq epsfr (tile-frac "epsfr"))
  (setq lcr  (tile-frac "lcr"))
  (setq scale (tile-frac "scale"))
  (setq *strain-pending* nil)
  (cond
    ((or (not d) (not h)) (alert "d and H are always required.") nil)
    ((not scale) (alert "scale is required.") nil)
    (t
     (setq solved (solve-triangle epsc epss d h lcr epsfr))
     (if solved
       (progn
         (setq *strain-pending*
           (list (nth 0 solved) (nth 1 solved) d h
                 (nth 2 solved) (nth 3 solved) (nth 4 solved)
                 epsfr scale))
         t
       )
       (progn (alert *strain-err*) nil)
     )
    )
  )
)

;; ------------------------------------------------------------------
;; Writes the dialog layout to a temp .dcl file, so this stays a
;; single-file tool -- nothing else to distribute alongside it.
;; ------------------------------------------------------------------
(defun write-dcl-file ( / path f)
  (setq path (vl-filename-mktemp "strain" nil ".dcl"))
  (setq f (open path "w"))
  (write-line "strain_dlg : dialog {" f)
  (write-line "  label = \"Strain Diagram Input\";" f)
  (write-line "  : edit_box { key = \"epsc\";  label = \"eps_c (compression strain, top):\"; edit_width = 16; }" f)
  (write-line "  : edit_box { key = \"epss\";  label = \"eps_s (tension strain, bottom fiber):\"; edit_width = 16; }" f)
  (write-line "  : edit_box { key = \"d\";     label = \"d (effective depth):\"; edit_width = 16; }" f)
  (write-line "  : edit_box { key = \"h\";     label = \"H (total height):\"; edit_width = 16; }" f)
  (write-line "  : edit_box { key = \"epsfr\"; label = \"eps_fr (cracking strain, used for lcr):\"; edit_width = 16; }" f)
  (write-line "  : edit_box { key = \"lcr\";   label = \"lcr (eps_fr point -> bottom of H):\"; edit_width = 16; }" f)
  (write-line "  : edit_box { key = \"scale\"; label = \"horizontal scale multiplier:\"; edit_width = 16; }" f)
  (write-line "  : text { label = \"Leave exactly ONE of eps_c / eps_s / lcr blank.\"; }" f)
  (write-line "  spacer;" f)
  (write-line "  : row {" f)
  (write-line "    : button { key = \"calc\"; label = \"Calculate\"; width = 12; }" f)
  (write-line "    : button { key = \"draw\"; label = \"Draw in AutoCAD\"; width = 14; is_default = true; }" f)
  (write-line "    : cancel_button { label = \"Close\"; width = 10; }" f)
  (write-line "  }" f)
  (write-line "}" f)
  (close f)
  path
)

;; ------------------------------------------------------------------
;; Main command: type STRAIN in AutoCAD to run this.
;; ------------------------------------------------------------------
(defun c:STRAIN ( / dclpath dclid)
  (setq dclpath (write-dcl-file))
  (setq dclid (load_dialog dclpath))
  (if (not (new_dialog "strain_dlg" dclid))
    (progn
      (unload_dialog dclid)
      (vl-file-delete dclpath)
      (princ "\nCouldn't open the dialog.")
      (exit)
    )
  )

  ;; defaults (match the tkinter version's defaults)
  (set_tile "epsc" "0.003")
  (set_tile "epss" "420/200000")
  (set_tile "d" "212.5")
  (set_tile "h" "250")
  (set_tile "epsfr" "0.62/4700")
  (set_tile "lcr" "")
  (set_tile "scale" "10000")

  (setq *strain-pending* nil)
  (action_tile "calc" "(strain-calc)")
  (action_tile "draw" "(if (strain-draw) (done_dialog))")
  (action_tile "cancel" "(done_dialog)")

  (start_dialog)
  (unload_dialog dclid)
  (vl-file-delete dclpath)

  ;; dialog is fully closed now -- command line is free, so THIS is
  ;; where the actual drawing (entmakex + command calls) happens.
  (if *strain-pending*
    (apply 'draw-strain-geometry *strain-pending*)
  )
  (princ)
)

(princ "\nSTRAIN.LSP loaded -- type STRAIN to open the strain diagram tool.")
(princ)