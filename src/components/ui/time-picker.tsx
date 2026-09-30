"use client";

import { useRef } from "react";
import { Clock3, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

type TimePickerProps = {
  id: string;
  label: string;
  value: string;
  describedBy?: string;
  required?: boolean;
  onChange: (value: string) => void;
};

export function TimePicker({ id, label, value, describedBy, required, onChange }: TimePickerProps) {
  const hourTrigger = useRef<HTMLButtonElement>(null);
  const [hour = "", minute = ""] = value.split(":");

  return (
    <div className="flex items-end gap-2" role="group" aria-label={label} aria-describedby={describedBy}>
      <Clock3 aria-hidden="true" className="mb-3 size-4 shrink-0 text-muted-foreground" />
      <div className="flex w-20 min-w-14 flex-col gap-1">
        <label htmlFor={id} className="text-xs text-muted-foreground">Hour</label>
        <Select value={hour} onValueChange={(nextHour) => onChange(`${nextHour}:${minute || "00"}`)}>
          <SelectTrigger ref={hourTrigger} id={id} aria-label={`${label}, hour`} aria-required={required} aria-describedby={describedBy} className="w-full tabular-nums data-[size=default]:h-10">
            <SelectValue placeholder="HH" />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="max-h-64 min-w-20">
            <SelectGroup>
              {hours.map((option) => <SelectItem key={option} value={option} className="min-h-9 tabular-nums">{option}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <span aria-hidden="true" className="pb-2.5 text-muted-foreground">:</span>
      <div className="flex w-20 min-w-14 flex-col gap-1">
        <label htmlFor={`${id}-minute`} className="text-xs text-muted-foreground">Minute</label>
        <Select value={minute} onValueChange={(nextMinute) => onChange(`${hour || "00"}:${nextMinute}`)}>
          <SelectTrigger id={`${id}-minute`} aria-label={`${label}, minute`} aria-required={required} aria-describedby={describedBy} className="w-full tabular-nums data-[size=default]:h-10">
            <SelectValue placeholder="mm" />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="max-h-64 min-w-20">
            <SelectGroup>
              {minutes.map((option) => <SelectItem key={option} value={option} className="min-h-9 tabular-nums">{option}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <span className="mb-2.5 shrink-0 text-xs text-muted-foreground">24h</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mb-1"
        aria-label={`Clear ${label}`}
        title="Clear time"
        disabled={!value}
        onClick={() => {
          onChange("");
          hourTrigger.current?.focus();
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
