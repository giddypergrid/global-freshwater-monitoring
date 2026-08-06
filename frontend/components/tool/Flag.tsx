import { flagSrc } from "@/lib/countries";

interface Props {
  country: string;
  className?: string;
}

/** Decorative only — the country name is always next to it, so the alt stays empty. */
export default function Flag({ country, className = "" }: Props) {
  const src = flagSrc(country);
  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={20}
      height={14}
      className={`h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 ${className}`}
    />
  );
}
