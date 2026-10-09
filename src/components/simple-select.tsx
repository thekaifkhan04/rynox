"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * The shadcn Select with a flat list of options. Works controlled (`value`)
 * or inside a plain form (`name` + `defaultValue`). Option values must be
 * non-empty, so "no filter" choices use a value such as "all".
 */
export function SimpleSelect({
  id,
  options,
  placeholder,
  className,
  ...props
}: {
  id?: string;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select {...props}>
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
