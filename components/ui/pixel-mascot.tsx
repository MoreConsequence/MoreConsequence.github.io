"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import {
  PET_ACTIONS, PET_FRAME_MS, PET_HEIGHT, PET_WIDTH,
  advancePet, createPetPlayback, drawPixelPet, finishPetAction,
  getPetPose, petOnClick, playPetAction, updatePetProgress,
  type PetAction,
} from "@/lib/pixel-pet";
import styles from "./pixel-mascot.module.css";

function subscribeMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
const readMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const readVisibility = () => !document.hidden;
const serverMotion = () => false;
const serverVisibility = () => true;

const REACTIONS: Partial<Record<PetAction, string>> = {
  pet: "收到你的摸摸。", hop: "一、二，起跳！", dance: "偷偷跳一支。",
  wave: "嗨，我在呢。", stretch: "伸个懒腰，再接着读。",
  roll: "团子也会翻跟头。", walk: "散个步，很快回来。",
  sleep: "我眯一会儿，点我就醒。",
  peek: "嗯？你在看我吗。", nod: "嗯嗯，我在听。",
};

interface PixelMascotProps {
  readingProgress?: number;
  positionMode?: "shelf" | "floating";
  onToggleMode?: () => void;
}

export function PixelMascot({ readingProgress = 0 }: PixelMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef(createPetPlayback());
  const publishedRef = useRef(-1);
  const gazeRef = useRef(0);
  const [current, setCurrent] = useState({ action: "idle" as PetAction, version: 0 });
  const [speech, setSpeech] = useState<{ text: string; version: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const pageVisible = useSyncExternalStore(subscribeVisibility, readVisibility, serverVisibility);
  const progress = Number.isFinite(readingProgress) ? Math.max(0, Math.min(100, Math.round(readingProgress))) : 0;

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const playback = playbackRef.current;
    const elapsed = reducedMotion ? PET_ACTIONS[playback.action].still : playback.elapsed;
    drawPixelPet(ctx, getPetPose(playback.action, elapsed), gazeRef.current);
  }, [reducedMotion]);

  const publish = useCallback(() => {
    const playback = playbackRef.current;
    if (publishedRef.current === playback.version) return;
    publishedRef.current = playback.version;
    setCurrent({ action: playback.action, version: playback.version });
    if (playback.action === "celebrate") {
      setSpeech({ text: "到文末啦，歇一歇眼睛。", version: playback.version });
    }
  }, []);

  const playAction = useCallback((action: PetAction) => {
    playbackRef.current = playPetAction(playbackRef.current, action);
    setSpeech({ text: REACTIONS[action] ?? "我在这里陪你。", version: playbackRef.current.version });
    publish();
    paint();
  }, [paint, publish]);

  const handlePet = () => {
    if (playbackRef.current.action === "sleep") {
      playAction("stretch");
      return;
    }
    playbackRef.current = petOnClick(playbackRef.current);
    setSpeech({ text: REACTIONS[playbackRef.current.action] ?? "我在呢。", version: playbackRef.current.version });
    publish();
    paint();
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    playbackRef.current = updatePetProgress(playbackRef.current, progress);
    playbackRef.current.quiet = 0;
  }, [progress]);

  // Only the little canvas updates per frame; React updates when an action or message changes.
  useEffect(() => {
    if (!inView || !pageVisible) { paint(); return; }
    let frame = 0;
    let previous = 0;
    let drawn = 0;
    const animate = (now: number) => {
      if (previous && !paused && !reducedMotion) {
        playbackRef.current = advancePet(playbackRef.current, Math.min(100, now - previous));
      }
      previous = now;
      publish();
      if (!drawn || now - drawn >= PET_FRAME_MS) { paint(); drawn = now; }
      if (!paused && !reducedMotion) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [inView, pageVisible, paused, reducedMotion, progress, paint, publish]);

  useEffect(() => {
    if (!reducedMotion || paused) return;
    const motion = PET_ACTIONS[current.action];
    if ("loop" in motion && motion.loop) return;
    const timer = window.setTimeout(() => {
      playbackRef.current = finishPetAction(playbackRef.current);
      publish();
      paint();
    }, Math.max(0, motion.duration - playbackRef.current.elapsed));
    return () => window.clearTimeout(timer);
  }, [reducedMotion, paused, current, paint, publish]);

  useEffect(() => {
    if (!speech) return;
    const timer = window.setTimeout(() => setSpeech(null), 2800);
    return () => window.clearTimeout(timer);
  }, [speech]);

  useEffect(() => {
    if (!inView || !pageVisible || paused || reducedMotion) return;
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      gazeRef.current = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / 60));
      playbackRef.current.quiet = 0;
    };
    const activity = () => { playbackRef.current.quiet = 0; };
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("scroll", activity, { passive: true });
    window.addEventListener("keydown", activity);
    return () => {
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("scroll", activity);
      window.removeEventListener("keydown", activity);
    };
  }, [inView, pageVisible, paused, reducedMotion]);

  const wake = () => {
    playbackRef.current.quiet = 0;
    if (playbackRef.current.action === "sleep") playAction("wave");
  };

  return (
    <div ref={containerRef} className={styles.pet} data-pixel-pet="" data-action={current.action}
      data-paused={paused} data-reduced-motion={reducedMotion} aria-label="像素伴读小宠物">
      <div className={styles.speech} role="status" aria-live="polite" aria-atomic="true">
        {speech ? <span className={styles.bubble}>{speech.text}</span>
          : <span className={styles.hint} aria-hidden="true">戳一下，我在呢</span>}
      </div>
      <button type="button" className={styles.stage} onClick={handlePet}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") wake(); }} onFocus={wake}
        aria-label="抚摸像素小宠物，切换动作">
        <canvas ref={canvasRef} width={PET_WIDTH} height={PET_HEIGHT} className={styles.canvas} aria-hidden="true" />
      </button>
      <div className={styles.caption}>
        <span className={styles.dot} aria-hidden="true" />
        <span>{paused ? "安静陪你" : PET_ACTIONS[current.action].label}</span>
        {progress > 0 && <span className={styles.progress}>{progress}%</span>}
        <button type="button" className={styles.pause} onClick={() => setPaused(value => !value)} aria-pressed={paused}
          aria-label={paused ? "继续小宠物动作" : "暂停小宠物动作"} title={paused ? "继续动作" : "暂停动作"}>
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
