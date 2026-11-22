import { useEffect, useRef } from "react";

export function LiveVideo({ stream, className = "" }: { stream: MediaStream | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className={`h-full w-full -scale-x-100 object-cover ${className}`} aria-label="Your camera preview" />;
}

export function LevelMeter({ level, label = "Microphone level" }: { level: number; label?: string }) {
  const bars = 12;
  return (
    <div className="flex h-5 items-end gap-0.5" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={`w-1.5 rounded-sm ${level * bars > i ? (i > 9 ? "bg-warn" : "bg-good") : "bg-line"}`} style={{ height: `${30 + (i / bars) * 70}%` }} />
      ))}
    </div>
  );
}
