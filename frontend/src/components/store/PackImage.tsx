import Image from "next/image";

interface PackImageProps {
  /** Component perfume images (empty strings are ignored). The first is the fallback hero. */
  images: string[];
  /** Letter shown when no image is available. */
  fallbackLetter?: string;
  sizes?: string;
  /** Skip lazy loading for above-the-fold images. */
  priority?: boolean;
  className?: string;
}

/**
 * Composed collage of a pack's perfume images, filling its (relatively positioned) parent.
 * 1 image → full bleed; 2 → side by side; 3+ → one large + two stacked (a 4th makes a 2×2 grid).
 * Pure presentational — no new image storage: it reuses the component perfumes' own images.
 */
export default function PackImage({ images, fallbackLetter = "P", sizes = "(max-width: 768px) 50vw, 25vw", priority = false, className = "" }: PackImageProps) {
  const list = images.filter(Boolean).slice(0, 4);

  if (list.length === 0) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-[var(--bg-surface)] ${className}`}>
        <span className="font-serif text-4xl text-[var(--text-muted)]">{fallbackLetter}</span>
      </div>
    );
  }

  const tile = (src: string, key: string, extra = "") => (
    <div key={key} className={`relative overflow-hidden bg-[var(--bg-surface)] ${extra}`}>
      <Image src={src} alt="" fill className="object-cover img-zoom" sizes={sizes} priority={priority} />
    </div>
  );

  if (list.length === 1) {
    return <div className={`absolute inset-0 ${className}`}>{tile(list[0], "0", "absolute inset-0")}</div>;
  }

  if (list.length === 2) {
    return (
      <div className={`absolute inset-0 grid grid-cols-2 gap-px bg-[var(--border)] ${className}`}>
        {list.map((src, i) => tile(src, String(i)))}
      </div>
    );
  }

  if (list.length === 3) {
    return (
      <div className={`absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[var(--border)] ${className}`}>
        {tile(list[0], "0", "row-span-2")}
        {tile(list[1], "1")}
        {tile(list[2], "2")}
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[var(--border)] ${className}`}>
      {list.map((src, i) => tile(src, String(i)))}
    </div>
  );
}
