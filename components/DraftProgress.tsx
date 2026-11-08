"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { LinearProgress } from "./Loading";
import { Icon } from "./M3Node";

export type DraftLogLine = { time: string; text: string };

/** The floating card that follows a whole-design draft: phase events in a small
 *  terminal-style log, the characters received so far, the screens the model has
 *  named so far, and a way to stop it. It never covers the canvas for long: it
 *  docks in the corner so the drifting screens stay visible behind it. */
export function DraftProgress({
  p,
  open,
  model,
  lines,
  chars,
  elapsed,
  screens,
  onCancel,
}: {
  p: Palette;
  open: boolean;
  /** the model id shown next to the title */
  model: string;
  lines: DraftLogLine[];
  /** characters received from the stream so far */
  chars: number;
  /** seconds since the request started */
  elapsed: number;
  /** screen names detected in the partial JSON as it streams */
  screens: string[];
  onCancel: () => void;
}) {
  const lang = useLang();
  const logRef = useRef<HTMLDivElement>(null);
  /* the newest log line is the interesting one: keep it in view as events land */
  useEffect(() => {
    const box = logRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines.length, chars]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="draft-progress"
          role="status"
          aria-live="polite"
          aria-label={t("draftPanelTitle", lang)}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
          style={{
            position: "fixed",
            right: 20,
            bottom: "calc(20px + var(--bottom-ui, 0px) + env(safe-area-inset-bottom))",
            zIndex: 500,
            width: "min(360px, calc(100vw - 32px))",
            padding: 16,
            borderRadius: 24,
            background: p.surfaceContainerHigh,
            color: p.onSurface,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="m3-spin" style={{ display: "inline-flex" }}>
              <Icon name="progress_activity" size={18} />
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 14,
                fontWeight: 700,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {t("draftPanelTitle", lang)}
              {model && (
                <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: p.onSurfaceVariant }}>
                  {model}
                </span>
              )}
            </span>
            <span style={{ font: "600 11px ui-monospace, SFMono-Regular, Menlo, monospace", color: p.onSurfaceVariant, flex: "0 0 auto" }}>
              {chars > 0 ? `${chars.toLocaleString()} · ${Math.round(chars / Math.max(elapsed, 0.1))}/s · ${elapsed.toFixed(1)}s` : `${elapsed.toFixed(1)}s`}
            </span>
          </div>
          <LinearProgress width={328} color={p.primary} trackColor={p.surfaceContainerHighest} wavy />
          {screens.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {screens.map((name) => (
                <span
                  key={name}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 10,
                    background: p.secondaryContainer,
                    color: p.onSecondaryContainer,
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          )}
          <div
            ref={logRef}
            className="no-scrollbar"
            style={{
              maxHeight: 148,
              overflowY: "auto",
              padding: "10px 12px",
              borderRadius: 14,
              background: p.surface,
              font: "12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: p.outline, flex: "0 0 auto" }}>{l.time}</span>
                <span style={{ color: p.onSurfaceVariant, overflowWrap: "anywhere" }}>{l.text}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onCancel}
              className="m3-press"
              title={t("cancel", lang)}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 18,
                border: "none",
                background: "transparent",
                color: p.primary,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="stop_circle" size={18} />
              {t("cancel", lang)}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
