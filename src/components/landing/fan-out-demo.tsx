"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/** Three made-up websites, each rendering the same entry in its own house style. */
const sites = [
  {
    domain: "northside-physio.com",
    name: "Northside Physio",
    surface: "bg-[#eaf2ed] text-[#173b2c]",
    heading: "font-sans text-lg leading-tight font-bold tracking-tight",
  },
  {
    domain: "harbourclinic.com",
    name: "Harbour Clinic",
    surface: "bg-[#1b2430] text-[#e9edf2]",
    heading: "font-serif text-xl leading-snug italic",
    rule: "bg-[#f0b35a]",
  },
  {
    domain: "movementstudio.com",
    name: "Movement Studio",
    surface: "bg-[#f6ecf1] text-[#561a39] text-center",
    heading: "font-sans text-xl leading-tight font-light",
  },
];

// Vertical centres of the three site frames, in the connector SVG's 0–100 coordinate space.
const siteCentres = [16.7, 50, 83.3];

/**
 * A live picture of what the CMS does: edit the entry title and every connected site picks it up.
 * The connectors draw in once on load; after that, motion only answers typing.
 */
export function FanOutDemo({ className }: { className?: string }) {
  const [title, setTitle] = useState("Knee complaints");
  const [edits, setEdits] = useState(0);

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center", className)}>
      <div className="rounded-xl bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.25)] ring-1 ring-foreground/10">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Conditions</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span aria-hidden className="size-2 rounded-full bg-status-published" /> Published
          </span>
        </div>
        <label htmlFor="hero-title" className="mt-4 block text-sm font-medium">Title</label>
        <input
          id="hero-title"
          value={title}
          maxLength={48}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setTitle(event.target.value);
            setEdits((count) => count + 1);
          }}
          className="mt-1.5 w-full rounded-lg border border-ring bg-transparent px-2.5 py-1.5 font-serif text-lg ring-3 ring-ring/20 outline-none focus-visible:ring-ring/40"
        />
        <p className="mt-4 text-sm font-medium">Content</p>
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
          The knee is the largest joint in the body. Most complaints come from overuse, and a physiotherapist can help you find the cause.
        </p>
      </div>

      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full self-stretch overflow-visible text-primary">
        {siteCentres.map((y, index) => (
          <path
            key={y}
            d={connector(y)}
            pathLength={100}
            strokeDasharray="100"
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="motion-safe:animate-[fan-out-draw_700ms_ease-out_both]"
            style={{ animationDelay: `${200 + index * 120}ms` }}
          />
        ))}
        {edits > 0
          ? siteCentres.map((y) => (
              <path
                key={`${edits}-${y}`}
                d={connector(y)}
                pathLength={100}
                strokeDasharray="10 110"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="motion-reduce:hidden motion-safe:animate-[fan-out-pulse_550ms_ease-in-out_both]"
              />
            ))
          : null}
      </svg>

      <div className="flex flex-col gap-3">
        {sites.map((site, index) => (
          <div
            key={site.domain}
            className="overflow-hidden rounded-lg shadow-[0_8px_24px_-16px_rgb(0_0_0/0.3)] ring-1 ring-foreground/10 motion-safe:animate-[fan-out-rise_500ms_ease-out_both]"
            style={{ animationDelay: `${700 + index * 120}ms` }}
          >
            <div className="truncate border-b bg-card px-2.5 py-1 text-[0.6875rem] text-muted-foreground">{site.domain}</div>
            <div className={cn("px-3.5 py-3", site.surface)}>
              <p className="text-[0.6875rem] font-semibold opacity-70">{site.name}</p>
              <p className={cn("mt-1 min-h-[1.25em] break-words", site.heading)}>{title}</p>
              {site.rule ? <span aria-hidden className={cn("mt-2 block h-0.5 w-6", site.rule)} /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function connector(y: number) {
  return `M0 50 C 55 50, 45 ${y}, 100 ${y}`;
}
