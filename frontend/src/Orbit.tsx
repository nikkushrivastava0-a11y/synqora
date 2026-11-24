import { useEffect, useRef } from "react";

// A torus knot with a faceted tube, projected from model space into the canvas.
type Point = [number, number, number];
const tau = Math.PI * 2;
function center(t: number): Point {
  const radius = 1.07 + 0.44 * Math.cos(3 * t);
  return [
    radius * Math.cos(2 * t),
    radius * Math.sin(2 * t),
    0.63 * Math.sin(3 * t),
  ];
}
const slices = 100,
  sides = 8;
const mesh: Point[] = [];
for (let i = 0; i < slices; i++) {
  const t = (tau * i) / slices,
    p = center(t),
    next = center(t + 0.001);
  const delta = next.map((v, k) => v - p[k]),
    length = Math.hypot(...delta);
  const [x, y, z] = delta.map((v) => v / length),
    h = Math.hypot(x, y);
  const normal = [-y / h, x / h, 0],
    binormal = [(-z * x) / h, (-z * y) / h, h];
  for (let j = 0; j < sides; j++) {
    const a = (tau * j) / sides;
    mesh.push(
      p.map(
        (v, k) =>
          v + 0.19 * (normal[k] * Math.cos(a) + binormal[k] * Math.sin(a)),
      ) as Point,
    );
  }
}
export function Orbit({ paused }: { paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const host = canvas.parentElement!;
    let width = 0,
      height = 0,
      frame = 0,
      last = 0,
      visible = true,
      px = 0,
      py = 0,
      dx = 0,
      dy = 0;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    function draw(time: number) {
      frame = 0;
      const active = !paused && !motion.matches && visible && !document.hidden;
      if (active && last) phase.current += Math.min(time - last, 60) * 0.00022;
      last = active ? time : 0;
      dx += ((active ? px : 0) - dx) * 0.09;
      dy += ((active ? py : 0) - dy) * 0.09;
      ctx!.clearRect(0, 0, width, height);
      const angle = phase.current + 0.42 + dx * 0.28,
        tilt = 0.78 + dy * 0.2;
      const size = Math.min(width * 0.225, height * 0.265);
      const projected = mesh.map(([x, y, z]) => {
        const u = x * Math.cos(angle) - y * Math.sin(angle),
          v = x * Math.sin(angle) + y * Math.cos(angle);
        const depth = v * Math.sin(tilt) + z * Math.cos(tilt),
          scale = 4.9 / (4.9 - depth);
        return [
          width * 0.5 + u * size * scale,
          height * 0.51 +
            (v * Math.cos(tilt) - z * Math.sin(tilt)) * size * scale,
          depth,
        ];
      });
      const faces = [];
      for (let i = 0; i < slices; i++)
        for (let j = 0; j < sides; j++) {
          const n = (i + 1) % slices,
            k = (j + 1) % sides;
          const points = [
            projected[i * sides + j],
            projected[n * sides + j],
            projected[n * sides + k],
            projected[i * sides + k],
          ];
          const depth = points.reduce((a, p) => a + p[2], 0) / 4;
          faces.push({ points, depth });
        }
      faces.sort((a, b) => a.depth - b.depth);
      for (const { points, depth } of faces) {
        const [a, b, c] = points;
        const edge =
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const light = Math.min(
          1,
          Math.max(
            0.04,
            0.42 +
              depth * 0.24 +
              Math.sin((edge / (size * size + 0.1)) * 78) * 0.32,
          ),
        );
        ctx!.beginPath();
        points.forEach(([x, y], i) =>
          i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y),
        );
        ctx!.closePath();
        ctx!.fillStyle = "hsl(44 86% " + (7 + light * 58) + "%)";
        ctx!.fill();
        ctx!.lineWidth = 0.55;
        ctx!.strokeStyle = "rgba(255,223,131," + (0.12 + light * 0.54) + ")";
        ctx!.stroke();
      }
      if (active) frame = requestAnimationFrame(draw);
    }
    function update() {
      cancelAnimationFrame(frame);
      last = 0;
      draw(performance.now());
    }
    function resize() {
      const box = canvas!.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const d = Math.min(devicePixelRatio, 2);
      canvas!.width = Math.round(width * d);
      canvas!.height = Math.round(height * d);
      ctx!.setTransform(d, 0, 0, d, 0, 0);
      update();
    }
    function move(e: PointerEvent) {
      const b = host.getBoundingClientRect();
      px = (2 * (e.clientX - b.left)) / b.width - 1;
      py = (2 * (e.clientY - b.top)) / b.height - 1;
    }
    function leave() {
      px = 0;
      py = 0;
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    intersection.observe(canvas);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [paused]);
  return <canvas ref={ref} className="orbit" aria-hidden="true" />;
}
