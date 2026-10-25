import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PixelMascot } from "@/components/ui/pixel-mascot";
import {
  PET_ACTIONS, PET_HEIGHT, PET_PALETTE, PET_WIDTH,
  advancePet, createPetPlayback, drawPixelPet, getPetPose,
  petOnClick, playPetAction, updatePetProgress, type PetAction,
} from "@/lib/pixel-pet";

function pixelCanvas() {
  let pixels = new Array<string>(PET_WIDTH * PET_HEIGHT).fill(".");
  const context = {
    fillStyle: "", imageSmoothingEnabled: true,
    clearRect: () => { pixels = new Array<string>(PET_WIDTH * PET_HEIGHT).fill("."); },
    fillRect(x: number, y: number, width: number, height: number) {
      if (![x, y, width, height].every(Number.isInteger) || width !== 1 || height !== 1)
        throw new Error("The renderer emitted a subpixel or non-pixel rectangle");
      if (!Object.values(PET_PALETTE).some(ink => ink === context.fillStyle))
        throw new Error("The renderer emitted a color outside the character palette");
      pixels[y * PET_WIDTH + x] = context.fillStyle;
    },
  };
  return { context, snapshot: () => pixels.join(""), painted: () => pixels.filter(p => p !== ".").length,
    pixel: (x: number, y: number) => pixels[y * PET_WIDTH + x],
    count: (ink: string) => pixels.filter(pixel => pixel === ink).length };
}

describe("procedural pixel character", () => {
  it("keeps the pair of bean brows above the sleepy eyes", () => {
    const canvas = pixelCanvas();
    drawPixelPet(canvas.context, getPetPose("idle", 0));
    for (const x of [29, 30, 41, 42]) expect(canvas.pixel(x, 25)).toBe(PET_PALETTE.L);
    for (const x of [28, 31, 40, 43]) expect(canvas.pixel(x, 25)).toBe(PET_PALETTE.D);
    expect(canvas.pixel(36, 27)).toBe(PET_PALETTE.R);
    for (const x of [29, 30, 31, 40, 41, 42]) expect(canvas.pixel(x, 29)).toBe(PET_PALETTE.E);
  });

  it("keeps every motion on the pixel grid and inside the stage", () => {
    const canvas = pixelCanvas();
    for (const action of Object.keys(PET_ACTIONS) as PetAction[]) {
      for (let time = 0; time <= PET_ACTIONS[action].duration; time += 50) {
        const clipped = drawPixelPet(canvas.context, getPetPose(action, time), 1);
        expect(clipped, `${action} at ${time}ms`).toBe(0);
        expect(canvas.painted(), action).toBeGreaterThan(400);
      }
    }
    expect(canvas.context.imageSmoothingEnabled).toBe(false);
  });

  it("preserves both complete bean brows during everyday motions", () => {
    const canvas = pixelCanvas();
    const actions: PetAction[] = ["idle", "read", "peek", "nod", "wave", "stretch", "pet", "sleep", "celebrate"];
    for (const action of actions) {
      for (let time = 0; time <= PET_ACTIONS[action].duration; time += 50) {
        drawPixelPet(canvas.context, getPetPose(action, time));
        expect(canvas.count(PET_PALETTE.D), `${action} brows at ${time}ms`).toBe(12);
        expect(canvas.count(PET_PALETTE.L), `${action} brows and highlights at ${time}ms`).toBe(9);
      }
    }
  });

  it.each(["wave", "hop", "walk", "dance", "stretch", "roll", "pet"] as PetAction[])(
    "%s computes continuous poses and renders distinct pixel silhouettes", (action) => {
      const canvas = pixelCanvas();
      const images = new Set<string>();
      for (let time = 0; time < PET_ACTIONS[action].duration; time += 50) {
        drawPixelPet(canvas.context, getPetPose(action, time));
        images.add(canvas.snapshot());
      }
      expect(getPetPose(action, 725.1)).not.toEqual(getPetPose(action, 725.2));
      expect(images.size).toBeGreaterThan(action === "pet" ? 1 : 3);
    },
  );
});

describe("pet playback", () => {
  it("immediately interrupts a motion and restarts repeat clicks at time zero", () => {
    let state = advancePet(playPetAction(createPetPlayback(), "hop"), 600);
    state = playPetAction(state, "wave");
    expect(state).toMatchObject({ action: "wave", elapsed: 0 });
    state = advancePet(state, 800);
    const restarted = playPetAction(state, "wave");
    expect(restarted.elapsed).toBe(0);
    expect(restarted.version).toBeGreaterThan(state.version);
    expect(advancePet(restarted, 100).action).toBe("wave");
  });

  it("returns to reading after a finite motion, and sleep remains asleep until woken", () => {
    let state = updatePetProgress(createPetPlayback(), 40);
    state = advancePet(playPetAction(state, "hop"), PET_ACTIONS.hop.duration);
    expect(state).toMatchObject({ action: "read", elapsed: 0 });
    expect(advancePet(playPetAction(state, "sleep"), 60000).action).toBe("sleep");
  });

  it("celebrates the real end of the article once per mount", () => {
    let state = updatePetProgress(createPetPlayback(), 90);
    expect(state.action).toBe("read");
    state = updatePetProgress(state, 100);
    expect(state).toMatchObject({ action: "celebrate", celebrated: true });
    state = advancePet(state, PET_ACTIONS.celebrate.duration);
    state = updatePetProgress(updatePetProgress(state, 0), 100);
    expect(state.action).toBe("read");
  });

  it("cycles through expressive motions and eventually naps when nobody interacts", () => {
    let state = createPetPlayback();
    const actions = new Set<PetAction>();
    for (let i = 0; i < 5; i++) { state = petOnClick(state); actions.add(state.action); }
    expect(actions).toContain("peek");
    expect(actions).toContain("stretch");
    expect(actions).not.toContain("roll");
    state = createPetPlayback();
    for (let i = 0; i < 1000; i++) state = advancePet(state, 50);
    expect(state.action).toBe("sleep");
  });

  it("renders native keyboard controls, a pixel canvas and a quiet live region", () => {
    const html = renderToStaticMarkup(<PixelMascot readingProgress={30} />);
    expect(html).toContain('width="72" height="48"');
    expect(html).toContain('aria-label="抚摸像素小宠物，切换动作"');
    expect(html).toContain('aria-label="暂停小宠物动作"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("30%");
    expect(html).not.toContain("background-position");
  });
});
