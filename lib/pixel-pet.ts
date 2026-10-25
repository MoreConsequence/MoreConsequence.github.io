export const PET_WIDTH = 72;
export const PET_HEIGHT = 48;
export const PET_FRAME_MS = 50;

export const PET_PALETTE = {
  O: "#51465f", // soft plum outline
  F: "#faf5ec", // cream
  S: "#e0cec9", // body shade
  H: "#aaa6e3", // hair
  L: "#cec8f4", // hair highlight / bean brows
  D: "#756ba8", // hair shade
  E: "#885467", // sleepy eyes / little mouth
  C: "#f0b0c1", // cheeks
  R: "#bc455b", // ornament / heart
  B: "#4e6c9b", // book
} as const;
type Ink = keyof typeof PET_PALETTE;
type Expression = "half" | "open" | "closed" | "happy" | "wink";
type Joint = { angle: number; bend: number };

export type PetPose = {
  x: number;
  y: number;
  rotation: number;
  bodyAngle: number;
  headAngle: number;
  headY: number;
  scaleX: number;
  scaleY: number;
  leftArm: Joint;
  rightArm: Joint;
  leftLeg: Joint;
  rightLeg: Joint;
  hair: number;
  gaze?: number;
  eyes: Expression;
  smile: boolean;
  book: boolean;
  effect: "none" | "hearts" | "sleep" | "confetti";
  effectPhase: number;
};

const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const pulse = (u: number, start: number, end: number) =>
  Math.sin(Math.PI * clamp((u - start) / (end - start)));
const gesture = (u: number) => ease(u / 0.25) * (1 - ease((u - 0.7) / 0.3));
const arm = (angle: number, bend = 0): Joint => ({ angle, bend });

// Keep the few-pixel face rigid; daily gestures use translation and joints.
function restPose(t: number): PetPose {
  const blink = t % 4.7;
  return {
    x: 0, y: 0, rotation: 0,
    bodyAngle: 0, headAngle: 0, headY: 0,
    scaleX: 1, scaleY: 1,
    leftArm: arm(18), rightArm: arm(-18),
    leftLeg: arm(-8), rightLeg: arm(8),
    hair: 0,
    eyes: blink > 4.5 ? "closed" : "half",
    smile: false, book: false, effect: "none", effectPhase: 0,
  };
}

type Motion = {
  label: string;
  duration: number;
  loop?: boolean;
  still: number;
  pose: (pose: PetPose, u: number, seconds: number) => PetPose;
};

// Actions synthesize a pose at any time; there is no fixed sprite-frame catalogue.
export const PET_ACTIONS = {
  idle: { label: "陪你发会儿呆", duration: 6000, loop: true, still: 0,
    pose: (p) => p },
  read: { label: "陪你读书", duration: 6000, loop: true, still: 0,
    pose: (p) => p },
  peek: { label: "偷偷看你", duration: 1800, still: 900,
    pose: (p, u) => ({ ...p, x: -gesture(u), gaze: -gesture(u) }) },
  nod: { label: "点点头", duration: 1500, still: 750,
    pose: (p, u) => ({ ...p, headY: gesture(u), smile: true }) },
  wave: { label: "向你招手", duration: 1700, still: 800,
    pose: (p, u, t) => {
      const lift = gesture(u);
      return { ...p, smile: true,
        rightArm: arm(-18 + 115 * lift, Math.sin(t * 10) * 20 * lift) };
    } },
  hop: { label: "蹦一下", duration: 1400, still: 550,
    pose: (p, u) => {
      const flight = clamp((u - 0.2) / 0.5);
      const height = 4 * flight * (1 - flight);
      const squash = pulse(u, 0, 0.2) * 0.16 + pulse(u, 0.7, 1) * 0.12;
      return { ...p, y: -3 * height, scaleX: 1 + squash * 0.4, scaleY: 1 - squash * 0.4,
        headY: squash * 5, eyes: "happy", smile: true,
        leftArm: arm(-18 - 100 * height), rightArm: arm(18 + 100 * height),
        leftLeg: arm(-8 - 28 * height, 30 * height),
        rightLeg: arm(8 + 28 * height, -30 * height), hair: height * 2 };
    } },
  walk: { label: "走两步", duration: 3000, still: 750,
    pose: (p, u, t) => {
      const step = Math.sin(t * TAU / 0.48);
      return { ...p, x: Math.sin(u * TAU) * 10, y: -Math.abs(step) * 0.8,
        bodyAngle: step * 3, headAngle: -step * 2, hair: -step * 1.5,
        leftLeg: arm(step * 38, Math.max(0, -step) * 42),
        rightLeg: arm(-step * 38, -Math.max(0, step) * 42),
        leftArm: arm(-18 - step * 26), rightArm: arm(18 - step * 26) };
    } },
  dance: { label: "跳支小舞", duration: 2600, still: 650,
    pose: (p, u, t) => {
      const beat = Math.sin(t * TAU / 0.65);
      const envelope = Math.sin(Math.PI * u);
      return { ...p, x: beat * 3 * envelope, y: -Math.abs(beat),
        bodyAngle: beat * 10, headAngle: -beat * 8, eyes: "happy", smile: true,
        leftArm: arm(-90 - beat * 50), rightArm: arm(90 - beat * 50),
        leftLeg: arm(-8 + beat * 24, 20), rightLeg: arm(8 + beat * 24, -20),
        hair: -beat * 2 };
    } },
  stretch: { label: "伸个懒腰", duration: 2200, still: 1000,
    pose: (p, u) => {
      const reach = pulse(u, 0, 1);
      return { ...p, y: -reach, eyes: "closed",
        leftArm: arm(18 - reach * 100, -reach * 12),
        rightArm: arm(-18 + reach * 100, reach * 12) };
    } },
  roll: { label: "团子翻滚", duration: 1800, still: 900,
    pose: (p, u) => ({ ...p, x: Math.sin(u * Math.PI) * 8,
      y: -pulse(u, 0, 1) * 2, rotation: ease(u) * 360,
      scaleX: 0.94, scaleY: 0.94, eyes: "happy", smile: true,
      leftArm: arm(-70, -50), rightArm: arm(70, 50), hair: Math.sin(u * TAU) * 2 }) },
  pet: { label: "开心贴贴", duration: 1100, still: 400,
    pose: (p, u) => ({ ...p, y: -pulse(u, 0, 1), eyes: "happy", smile: true,
      leftArm: arm(30, 20), rightArm: arm(-30, -20) }) },
  sleep: { label: "打个小盹", duration: 6000, loop: true, still: 1600,
    pose: (p, u) => ({ ...p, headY: 1, eyes: "closed",
      leftArm: arm(-5), rightArm: arm(5), effect: "sleep", effectPhase: u }) },
  celebrate: { label: "读到文末啦", duration: 2300, still: 750,
    pose: (p, u, t) => {
      const hop = Math.abs(Math.sin(u * Math.PI * 2)) * Math.sin(Math.PI * u);
      return { ...p, y: -hop, smile: true,
        leftArm: arm(18 - hop * 80, Math.sin(t * 10) * 12),
        rightArm: arm(-18 + hop * 80, -Math.sin(t * 10) * 12), hair: hop,
        effect: "none", effectPhase: u };
    } },
} satisfies Record<string, Motion>;

export type PetAction = keyof typeof PET_ACTIONS;
export const PET_CLICK_ACTIONS: readonly PetAction[] = [
  "pet", "peek", "nod", "wave", "stretch",
];
const AUTONOMOUS_ACTIONS: readonly PetAction[] = ["peek", "nod"];

export function getPetPose(action: PetAction, elapsedMs: number): PetPose {
  const motion: Motion = PET_ACTIONS[action];
  const elapsed = Math.max(0, elapsedMs);
  const time = motion.loop ? elapsed % motion.duration : Math.min(elapsed, motion.duration);
  return motion.pose(restPose(elapsed / 1000), time / motion.duration, elapsed / 1000);
}

export type PetPlayback = {
  action: PetAction;
  elapsed: number;
  rest: "idle" | "read";
  quiet: number;
  waiting: number;
  autoIndex: number;
  clicks: number;
  version: number;
  celebrated: boolean;
};

export function createPetPlayback(): PetPlayback {
  return { action: "idle", elapsed: 0, rest: "idle", quiet: 0, waiting: 0,
    autoIndex: 0, clicks: 0, version: 0, celebrated: false };
}

export function playPetAction(state: PetPlayback, action: PetAction): PetPlayback {
  return { ...state, action, elapsed: 0, quiet: 0, waiting: 0, version: state.version + 1 };
}

export function petOnClick(state: PetPlayback): PetPlayback {
  return { ...playPetAction(state, PET_CLICK_ACTIONS[state.clicks % PET_CLICK_ACTIONS.length]),
    clicks: state.clicks + 1 };
}

export function finishPetAction(state: PetPlayback): PetPlayback {
  return { ...state, action: state.rest, elapsed: 0, waiting: 0, version: state.version + 1 };
}

export function updatePetProgress(state: PetPlayback, progress: number): PetPlayback {
  const rest: PetPlayback["rest"] = progress > 5 ? "read" : "idle";
  let next = { ...state, rest };
  if (progress >= 100 && !state.celebrated) {
    next = { ...playPetAction(next, "celebrate"), celebrated: true };
  } else if (state.action === "idle" || state.action === "read") {
    next = { ...next, action: rest, version: state.version + Number(state.action !== rest) };
  }
  return next;
}

export function advancePet(state: PetPlayback, delta: number): PetPlayback {
  let next = { ...state, elapsed: state.elapsed + delta, quiet: state.quiet + delta };
  const motion: Motion = PET_ACTIONS[next.action];
  if (!motion.loop && next.elapsed >= motion.duration) next = finishPetAction(next);
  if (next.action !== "idle" && next.action !== "read") return next;
  if (next.quiet >= 45000) return { ...next, action: "sleep", elapsed: 0, version: next.version + 1 };
  next.waiting += delta;
  if (next.waiting >= 16000) {
    next = { ...next, action: AUTONOMOUS_ACTIONS[next.autoIndex % AUTONOMOUS_ACTIONS.length],
      elapsed: 0, waiting: 0, autoIndex: next.autoIndex + 1, version: next.version + 1 };
  }
  return next;
}

// Pixel masks are the editable character model. Every output cell is rasterized on the same grid.
const FRINGE = [
  "..........OOOOOOOOOO..........",
  ".......OOOHHHHHHHHHHOOO.......",
  ".....OOHHHHHHHHHHHHHHHHOO.....",
  "....OHHHHHHHHHHHHHHHHHHHHO....",
  "...OHHHLLLHHHHHHHHHHHHHHHHO...",
  "..OHHHLLHHHHHHHHHHHHHHHHHHHO..",
  ".OHHHHHHHHHHHHHHHHHHHHHHHHHHO.",
  "OHHHHHHHHHHHHHHHHHHHHHHHHHHHHO",
  "OHHHHHHHHHOHHHHHHHHOHHHHHHHHHO",
  "OHHHHHHHHOFOHHHHHHHHOHHHHHHHHO",
  ".OHHHHHOOFFOHHHHHHHHHOHHHHHHO.",
  "..OOOOOFFFFFOHHHHHHOOFOOOOOO..",
  "............OOOOOO............",
];
const HAIR = [
  "..OOOO..", ".OHHHHO.", "OHHHHHHO", "OHHHHHHO", ".OHHHHHO",
  ".OHHHHHO", "..OHHHHO", "..OHHHHO", ".OHHHHHO", "OHHHHHHO",
  "OHHHHHO.", ".OHHHO..", "..OOO...",
];
const RIGHT_HAIR = HAIR.map(row => [...row].reverse().join(""));
const BOOK = [
  "BBBBBB.BBBBBB", "BFFFFFBFFFFFB", "BFSFSFBFSFSFB", "BFFFFFBFFFFFB",
  "BFSFSFBFSFSFB", "BFFFFFBFFFFFB", ".BBBBBBBBBBB.",
];
const HEART = [".RR.RR.", "RRRRRRR", "RRRRRRR", ".RRRRR.", "..RRR..", "...R..."];
const ZZZ = ["BBBB", "..B.", ".B..", "BBBB"];

type Point = { x: number; y: number };
type PixelContext = Pick<CanvasRenderingContext2D, "fillStyle" | "fillRect" | "clearRect" | "imageSmoothingEnabled">;

export function drawPixelPet(ctx: PixelContext, pose: PetPose, gaze = 0): number {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PET_WIDTH, PET_HEIGHT);
  let clipped = 0;
  const plot = (x: number, y: number, ink: Ink) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= PET_WIDTH || py >= PET_HEIGHT) { clipped++; return; }
    ctx.fillStyle = PET_PALETTE[ink];
    ctx.fillRect(px, py, 1, 1);
  };
  const rotate = (p: Point, angle: number): Point => {
    const a = angle * Math.PI / 180;
    return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
  };
  const world = (p: Point): Point => {
    const q = rotate({ x: p.x, y: p.y + 10 }, pose.rotation);
    return { x: 36 + Math.round(pose.x) + q.x, y: 29 + Math.round(pose.y) + q.y };
  };
  const body = (p: Point): Point => {
    const q = rotate({ x: p.x * pose.scaleX, y: (p.y + 7) * pose.scaleY }, pose.bodyAngle);
    return world({ x: q.x, y: q.y - 7 });
  };
  const head = (p: Point): Point => {
    const q = rotate(p, pose.headAngle);
    return body({ x: q.x, y: q.y - 15 + Math.round(pose.headY) });
  };

  // Inverse sampling keeps rotated/scaled body parts pixel-sharp, without canvas antialiasing.
  const raster = (width: number, height: number, origin: Point,
    transform: (p: Point) => Point, sample: (x: number, y: number) => Ink | undefined) => {
    const o = transform(origin);
    const a = transform({ x: origin.x + 1, y: origin.y });
    const b = transform({ x: origin.x, y: origin.y + 1 });
    const ax = a.x - o.x, ay = a.y - o.y, bx = b.x - o.x, by = b.y - o.y;
    const determinant = ax * by - ay * bx;
    const corners = [o, transform({ x: origin.x + width, y: origin.y }),
      transform({ x: origin.x, y: origin.y + height }),
      transform({ x: origin.x + width, y: origin.y + height })];
    const minX = Math.floor(Math.min(...corners.map(p => p.x)));
    const maxX = Math.ceil(Math.max(...corners.map(p => p.x)));
    const minY = Math.floor(Math.min(...corners.map(p => p.y)));
    const maxY = Math.ceil(Math.max(...corners.map(p => p.y)));
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const dx = x + 0.5 - o.x, dy = y + 0.5 - o.y;
      const sx = Math.floor((dx * by - dy * bx) / determinant);
      const sy = Math.floor((dy * ax - dx * ay) / determinant);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const ink = sample(sx, sy);
      if (ink) plot(x, y, ink);
    }
  };
  const mask = (rows: readonly string[], origin: Point, transform = head) =>
    raster(Math.max(...rows.map(r => r.length)), rows.length, origin, transform,
      (x, y) => { const char = rows[y][x]; return char && char in PET_PALETTE ? char as Ink : undefined; });
  const ellipse = (width: number, height: number, origin: Point, transform: (p: Point) => Point) => {
    const inside = (x: number, y: number) =>
      ((x + 0.5 - width / 2) / (width / 2)) ** 2 + ((y + 0.5 - height / 2) / (height / 2)) ** 2 <= 1;
    raster(width, height, origin, transform, (x, y) => {
      if (!inside(x, y)) return undefined;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) return "O";
      return "F";
    });
  };
  const disk = (p: Point, radius: number, ink: Ink) => {
    const cx = Math.round(p.x), cy = Math.round(p.y);
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) plot(cx + x, cy + y, ink);
    }
  };
  const segment = (a: Point, b: Point, ink: Ink, radius: number) => {
    const length = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * 2));
    for (let i = 0; i <= length; i++) {
      const t = i / length;
      disk({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, radius, ink);
    }
  };
  const limb = (anchor: Point, joint: Joint, upper: number, lower: number,
    transform: (p: Point) => Point, outline: Ink = "O") => {
    const offset = (angle: number, length: number) => {
      const a = angle * Math.PI / 180;
      return { x: Math.sin(a) * length, y: Math.cos(a) * length };
    };
    const u = offset(joint.angle, upper), l = offset(joint.angle + joint.bend, lower);
    const elbow = { x: anchor.x + u.x, y: anchor.y + u.y };
    const end = { x: elbow.x + l.x, y: elbow.y + l.y };
    const a = transform(anchor), b = transform(elbow), c = transform(end);
    segment(a, b, outline, 1); segment(b, c, outline, 1);
    segment(a, b, "F", 0); segment(b, c, "F", 0);
    return c;
  };

  // Ground shadow stays put while the body jumps or rolls.
  for (let x = -9; x <= 9; x++) plot(36 + pose.x + x, 44, "S");
  const hairTransform = (side: number) => (p: Point) => {
    const sway = Math.sin((p.y + 4) / 17) * pose.hair;
    return head({ x: p.x + side * sway, y: p.y });
  };
  const leftFoot = limb({ x: -6, y: -1 }, pose.leftLeg, 1, 1, world);
  const rightFoot = limb({ x: 6, y: -1 }, pose.rightLeg, 1, 1, world);
  for (const foot of [leftFoot, rightFoot])
    mask([".OO.", "OFFO", ".OO."], { x: foot.x - 2, y: foot.y - 1 }, p => p);
  ellipse(32, 24, { x: -16, y: -23 }, body);
  mask(HAIR, { x: -18, y: -4 }, hairTransform(-1));
  mask(RIGHT_HAIR, { x: 10, y: -4 }, hairTransform(1));
  limb({ x: -10, y: -4 }, pose.leftArm, 1, 1.5, body, "S");
  limb({ x: 10, y: -4 }, pose.rightArm, 1, 1.5, body, "S");
  mask(FRINGE, { x: -15, y: -12 });
  mask(["R"], { x: 0, y: 3 });
  mask([".CC.", "CCCC", ".CC."], { x: -13, y: 7 });
  mask([".CC.", "CCCC", ".CC."], { x: 9, y: 7 });
  // Lavender bean brows and sleepy rose eyes carry the original character's expression.
  mask([".DD.", "DLLD", ".DD."], { x: -8, y: 0 });
  mask([".DD.", "DLLD", ".DD."], { x: 4, y: 0 });
  const eyeGaze = Math.max(-1, Math.min(1, Math.round(pose.gaze ?? gaze)));
  for (const x of [-7, 4]) {
    const closed = pose.eyes === "closed" || (pose.eyes === "wink" && x > 0);
    const rows = closed ? ["EEE"] : pose.eyes === "happy" ? [".E.", "E.E"]
      : pose.eyes === "open" ? ["EEE", "EFE", "EEE"] : ["EEE"];
    mask(rows, { x, y: 5 });
    if (!closed && (pose.eyes === "half" || pose.eyes === "open"))
      mask(["E"], { x: x + 1 + eyeGaze, y: 6 });
  }
  mask(pose.smile ? ["E...E", ".EEE."] : ["E.E", ".E."], { x: pose.smile ? -2 : -1, y: 9 });
  if (pose.book) mask(BOOK, { x: -6, y: -3 }, body);

  const u = pose.effectPhase;
  if (pose.effect === "hearts") {
    mask(HEART, { x: 11 + u * 2, y: 18 - u * 10 }, p => p);
    mask(HEART, { x: 55 - u * 2, y: 20 - u * 10 }, p => p);
  } else if (pose.effect === "sleep") {
    mask(ZZZ, { x: 53 + Math.floor(u * 3), y: 17 - Math.floor(u * 7) }, p => p);
  } else if (pose.effect === "confetti") {
    for (let i = 0; i < 8; i++) {
      const phase = (u + i / 8) % 1;
      plot(10 + i * 7 + Math.sin(phase * TAU) * 2, 7 + phase * 18, i % 2 ? "H" : "R");
    }
  }
  return clipped;
}
