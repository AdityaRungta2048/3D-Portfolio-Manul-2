import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import skyImg from "./assets/sky.webp";
import cloudsImg from "./assets/clouds.webp";
import { experience, person, works, type Work } from "./data";
import { N, pose } from "./pose";

// Posters, banners and the portrait interleaved, so neighbours never share artwork.
// Wide banners sit on a blurred copy of themselves to fill the 9:16 card.
const posters = works.filter((w) => !w.wide);
const banners = works.filter((w) => w.wide);
const portraitCard: Work = { title: `About ${person.name}`, category: "Portrait", client: person.title, year: "", cover: person.portrait, href: "#about" };
const reel: Work[] = posters.flatMap((p, i) => [p, ...(i === 2 ? [portraitCard] : []), ...(banners[i] ? [banners[i]] : [])]);
const cards = Array.from({ length: N }, (_, i) => reel[i % reel.length]);
// N is not a multiple of the reel, so the last card would match card 0 across the seam.
if (cards[N - 1] === cards[0]) cards[N - 1] = reel[Math.floor(reel.length / 2)];
const assets = [...reel.map((w) => w.cover), skyImg, cloudsImg];
const LIFT_EASE = [0.5, 0, 0.15, 1] as const;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const [first, ...rest] = person.name.split(" ");
// Drifting petals: position as a fraction of the stage, drift in px/s, tumble in deg/s.
const PETAL_COLORS = ["#f4c23a", "#f0922b", "#e0552f", "#f6d36b", "#d8402a"];
const petals = Array.from({ length: 34 }, (_, i) => ({
  x: Math.random(),
  y: Math.random(),
  vx: 14 + Math.random() * 22,
  vy: 6 + Math.random() * 12,
  sway: 10 + Math.random() * 18,
  phase: Math.random() * 6.3,
  spin: 0.8 + Math.random() * 1.6,
  size: 12 + Math.random() * 9,
  color: PETAL_COLORS[i % PETAL_COLORS.length],
}));
const WORDMARK_SCALE = innerWidth < 720 ? 1.8 : 3;

/** Last value written for every per-card style, so unchanged frames write nothing. */
type Slot = {
  el: HTMLAnchorElement | null;
  video: HTMLVideoElement | null;
  t: string;
  v: string;
  playing: boolean;
};

export default function Hero() {
  const deal = useMotionValue(0);
  const lift = useMotionValue(0);
  const sky = useMotionValue(0);
  const inset = useMotionValue(0);
  const [entering, setEntering] = useState(true);
  const [copy, setCopy] = useState<false | "fade" | "instant">(false);

  const frame = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const digits = useRef<(HTMLSpanElement | null)[]>([]);
  const slots = useRef<Slot[]>(
    cards.map(() => ({ el: null, video: null, t: "", v: "", playing: false })),
  );
  const fit = useRef(1);
  const size = useRef({ w: 1, h: 1 });
  const petalEls = useRef<(HTMLElement | null)[]>([]);
  const loaded = useRef(0);
  const done = useRef(false);
  const anims = useRef<AnimationPlaybackControls[]>([]);
  const timers = useRef<number[]>([]);
  const g = useRef({
    target: 0, rot: 0, vel: 0,
    down: false, dragging: false, suppress: false,
    startX: 0, lastX: 0, lastT: 0,
  });

  const cloudY = useTransform(lift, [0, 1], ["60%", "0%"]);
  const loaderOpacity = useTransform(sky, [0, 0.6], [1, 0]);
  const markScale = useTransform(lift, [0, 1], [WORDMARK_SCALE, 1]);

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  const stopAll = () => {
    anims.current.forEach((a) => a.stop());
    timers.current.forEach(clearTimeout);
  };

  // Ends the entrance instantly: Escape, Tab, the skip button, reduced motion.
  const finish = () => {
    if (done.current) return;
    done.current = true;
    stopAll();
    deal.set(1);
    sky.set(1);
    lift.set(1);
    inset.set(1);
    setEntering(false);
    setCopy("instant");
  };

  // Entrance: decode every image, deal, fade the sky in, then lift.
  useEffect(() => {
    if (reduced) return finish();
    let cancelled = false;
    let n = 0;
    Promise.all(
      assets.map((src) => {
        const img = new Image();
        img.src = src;
        return img
          .decode()
          .catch(() => {})
          .then(() => void (loaded.current = ++n / assets.length));
      }),
    ).then(() => {
      if (cancelled || done.current) return;
      // ponytail: "ready" is the images only; add video previews here if cards get clips.
      anims.current.push(
        animate(deal, 1, {
          duration: 2.6,
          ease: "linear",
          onComplete: () => {
            if (cancelled || done.current) return;
            anims.current.push(animate(sky, 1, { duration: 0.5, ease: "easeOut" }));
            later(250, () => {
              anims.current.push(
                animate(lift, 1, {
                  duration: 1.9,
                  ease: LIFT_EASE,
                  onComplete: () => {
                    done.current = true;
                    setEntering(false);
                  },
                }),
              );
              later(1000, () => setCopy("fade"));
            });
          },
        }),
      );
    });
    return () => {
      cancelled = true;
      stopAll();
    };
  }, []);

  // The hero closes into a rounded panel as the header and headline arrive.
  useEffect(() => {
    if (copy === "fade") anims.current.push(animate(inset, 1, { duration: 0.9, ease: [0.65, 0, 0.2, 1] }));
  }, [copy]);

  useEffect(() => {
    if (!entering) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") finish();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [entering]);

  // Scene is sized to the hero frame, not the window.
  useEffect(() => {
    const el = frame.current!;
    const ro = new ResizeObserver(() => {
      fit.current = Math.min(el.clientHeight / 1180, el.clientWidth / 560);
      size.current = { w: el.clientWidth, h: el.clientHeight };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The one animation loop: wheel physics, scene, every card, video, counter.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let sceneT = "";
    const digitT = ["", "", ""];
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const D = deal.get();
      const L = lift.get();
      const s = g.current;

      if (!s.dragging) {
        if (!reduced) s.target += 7 * L * dt;
        s.target += s.vel * dt;
        s.vel *= Math.exp(-dt * 3.2);
      }
      s.rot = reduced ? s.target : s.rot + (s.target - s.rot) * (1 - Math.exp(-dt * 9));

      const t = `scale(${(fit.current * (1 + 0.14 * L)).toFixed(4)}) rotateX(${(12 * L).toFixed(2)}deg)`;
      if (t !== sceneT) scene.current!.style.transform = sceneT = t;

      // Odometer: never ahead of what has actually loaded.
      const pct = Math.round(100 * Math.min(loaded.current, D / 0.6));
      const ds = [Math.floor(pct / 100), Math.floor(pct / 10) % 10, pct % 10];
      for (let k = 0; k < 3; k++) {
        const el = digits.current[k];
        const v = `translateY(${-ds[k] * 10}%)`;
        if (el && v !== digitT[k]) el.style.transform = digitT[k] = v;
      }

      // Petals only drift once the sky is showing; reduced motion keeps them still.
      const { w, h } = size.current;
      const sec = now / 1000;
      if (sky.get() > 0) {
        for (let k = 0; k < petals.length; k++) {
          const p = petals[k];
          const el = petalEls.current[k];
          if (!el) continue;
          if (!reduced) {
            p.x = (p.x + (p.vx * dt) / w + 1.04) % 1.04;
            p.y = (p.y + (p.vy * dt) / h + 1.04) % 1.04;
          }
          const sx = reduced ? 0 : Math.sin(sec * 0.9 + p.phase) * p.sway;
          // Tumble part-way rather than fully, so the petal's face keeps showing.
          const a = reduced ? p.phase : sec * p.spin + p.phase;
          el.style.transform =
            `translate3d(${(p.x - 0.02) * w + sx}px,${(p.y - 0.02) * h}px,0) ` +
            `rotate(${((a * 40) % 360).toFixed(1)}deg) rotateX(${(Math.sin(a) * 60).toFixed(1)}deg) ` +
            `rotateY(${(Math.cos(a * 0.7) * 45).toFixed(1)}deg)`;
        }
      }

      const live = L > 0.6 && !reduced;
      for (let i = 0; i < N; i++) {
        const slot = slots.current[i];
        if (!slot.el) continue;
        const p = pose(i, D, L, s.rot);
        if (p.visible && p.transform !== slot.t) slot.el.style.transform = slot.t = p.transform;
        const v = p.visible ? "visible" : "hidden";
        if (v !== slot.v) slot.el.style.visibility = slot.v = v;
        if (slot.video) {
          const play = live && p.visible && Math.abs(p.angle) < 40;
          if (play !== slot.playing) {
            slot.playing = play;
            if (play) slot.video.play().catch(() => {});
            else slot.video.pause();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Wheel needs a non-passive listener to stop horizontal swipes navigating back.
  useEffect(() => {
    const el = frame.current!;
    const onWheel = (e: WheelEvent) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (horizontal) e.preventDefault();
      g.current.target += (horizontal ? e.deltaX : e.deltaY) * 0.04;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Degrees per pixel, so the card under the finger follows it.
  const degPerPx = () => {
    const L = lift.get();
    return 57.3 / ((580 + 430 * L) * (1 + 0.14 * L) * fit.current);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    Object.assign(g.current, {
      down: true, vel: 0, startX: e.clientX, lastX: e.clientX, lastT: e.timeStamp,
    });
  };

  const onPointerMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s.down) return;
    if (!s.dragging) {
      if (Math.abs(e.clientX - s.startX) < 6) return;
      // Capture only once it is a drag, so a plain click still reaches its link.
      s.dragging = true;
      frame.current!.setPointerCapture(e.pointerId);
    }
    const dt = Math.max((e.timeStamp - s.lastT) / 1000, 0.001);
    const d = -(e.clientX - s.lastX) * degPerPx();
    s.target += d;
    s.vel = Math.max(-400, Math.min(400, 0.7 * (d / dt) + 0.3 * s.vel));
    s.lastX = e.clientX;
    s.lastT = e.timeStamp;
  };

  const onPointerUp = (e: PointerEvent) => {
    const s = g.current;
    if (s.dragging) {
      if (e.type === "pointercancel" || e.timeStamp - s.lastT > 80) s.vel = 0;
      s.suppress = true;
      setTimeout(() => (s.suppress = false), 0);
    }
    s.down = s.dragging = false;
  };

  const show = copy ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 };
  const ease = [0.2, 0.7, 0.2, 1] as const;
  const fade = (delay = 0) => (copy === "instant" ? { duration: 0 } : { duration: 0.9, delay, ease });

  return (
    <section
      ref={frame}
      className="hero"
      aria-label="Introduction"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        if (g.current.suppress) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <motion.div className="stage" style={{ "--k": inset } as never}>
        <motion.img className="sky" src={skyImg} alt="" style={{ opacity: sky }} />

        <div className="scene" ref={scene} role="list" aria-label="Selected work">
          {cards.map((w, i) => (
            <a
              key={i}
              role="listitem"
              ref={(el) => void (slots.current[i].el = el)}
              className="card"
              href={w.href}
              target={w.href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              draggable={false}
              style={{ visibility: "hidden" }}
            >
              <span className="face front">
                {w.wide && <img className="fill" src={w.cover} alt="" draggable={false} />}
                <img className={w.wide ? "wide" : undefined} src={w.cover} alt="" draggable={false} />
                {w.video && (
                  <video
                    ref={(el) => void (slots.current[i].video = el)}
                    src={w.video}
                    muted
                    loop
                    playsInline
                    preload="none"
                    onPlaying={(e) => e.currentTarget.classList.add("on")}
                  />
                )}
                <span className="cap" aria-hidden>{w.title}</span>
              </span>
              <span className="face back" aria-hidden>
                <span>{person.monogram}</span>
              </span>
              <span className="sr">
                {w.href.startsWith("http")
                  ? `${w.title}, ${w.category} for ${w.client}, ${w.year} (opens in a new tab)`
                  : w.title}
              </span>
            </a>
          ))}
        </div>

        <motion.div className="petals" style={{ opacity: sky }} aria-hidden>
          {petals.map((p, k) => (
            <i
              key={k}
              ref={(el) => void (petalEls.current[k] = el)}
              style={{ width: p.size, height: p.size * 0.62, background: p.color }}
            />
          ))}
        </motion.div>

        <motion.img className="clouds" src={cloudsImg} alt="" style={{ y: cloudY }} draggable={false} />
      </motion.div>

      <header className="bar">
        <a href="#top" className="mark" aria-label={person.name}>
          <motion.span className="mark-scale" style={{ scale: markScale }}>
            <span className={entering && !reduced ? "typed" : undefined} aria-hidden>
              {[...first].map((ch, i) => (
                <span key={i} className="ch" style={{ animationDelay: `${0.15 + i * 0.11}s` }}>{ch}</span>
              ))}
              {/* The typed full stop gives way to the surname. */}
              <motion.span
                className="dot"
                initial={false}
                animate={copy ? { opacity: 0, width: 0 } : { opacity: 1, width: "auto" }}
                transition={fade()}
              >
                <span className="ch" style={{ animationDelay: `${0.15 + first.length * 0.11}s` }}>.</span>
              </motion.span>
            </span>
          </motion.span>
          <motion.span className="mark-rest" aria-hidden initial={false} animate={{ opacity: copy ? 1 : 0 }} transition={fade()}>
            {rest.join(" ")}.
          </motion.span>
        </a>
        <motion.nav initial={false} animate={show} transition={fade(0.1)}>
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="#experience">Experience</a>
          <a href="#contact">Contact</a>
        </motion.nav>
        <motion.a className="pill" href="resume.pdf" target="_blank" rel="noreferrer" initial={false} animate={show} transition={fade(0.15)}>
          Resume
        </motion.a>
      </header>

      <motion.div className="headline" initial={false} animate={show} transition={fade(0.2)}>
        <h1>
          {person.name} edits <u>cinematic stories</u>, <u>brand campaigns</u>,
          {" "}<u>motion graphics</u> and sound that lands.
        </h1>
        <p className="meta">
          5+ years · {experience.length} studios & brands
          <br />
          <span>Drag the reel to look around</span>
        </p>
      </motion.div>

      {entering && (
        <motion.div className="loader" style={{ opacity: loaderOpacity }}>
          <div className="count" aria-hidden>
            {[0, 1, 2].map((k) => (
              <span key={k} className="digit">
                <span ref={(el) => void (digits.current[k] = el)} className="strip">
                  0123456789
                </span>
              </span>
            ))}
            <sup>%</sup>
            <small>Loading reels</small>
          </div>
          <button type="button" className="skip" onClick={finish}>
            Skip intro
          </button>
        </motion.div>
      )}
    </section>
  );
}
