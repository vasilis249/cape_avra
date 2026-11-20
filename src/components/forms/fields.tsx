"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "mt-2 block w-full border border-limestone bg-white/60 px-4 py-3 text-[1rem] text-ink placeholder:text-ink-soft/60 transition-colors focus:border-ionian focus:bg-white focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dusk aria-[invalid=true]:border-dusk";

type Common = { name: string; label: string; error?: string; hint?: string; optional?: string; className?: string };

function Wrap({ name, label, error, hint, optional, className, children }: Common & { children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={`f-${name}`} className="text-[0.8125rem] font-medium tracking-[0.06em] text-ink">
        {label}
        {optional && <span className="ml-2 font-normal text-ink-soft">({optional})</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`f-${name}-hint`} className="mt-1.5 text-[0.8125rem] text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`f-${name}-error`} className="mt-1.5 text-[0.8125rem] text-[#9a4a2a]">
          {error}
        </p>
      )}
    </div>
  );
}

const described = (name: string, error?: string, hint?: string) =>
  error ? `f-${name}-error` : hint ? `f-${name}-hint` : undefined;

export function TextField({ name, label, error, hint, optional, className, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrap {...{ name, label, error, hint, optional, className }}>
      <input
        id={`f-${name}`}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(name, error, hint)}
        className={control}
        {...rest}
      />
    </Wrap>
  );
}

export function TextArea({ name, label, error, hint, optional, className, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrap {...{ name, label, error, hint, optional, className }}>
      <textarea
        id={`f-${name}`}
        name={name}
        rows={5}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(name, error, hint)}
        className={cn(control, "resize-y")}
        {...rest}
      />
    </Wrap>
  );
}

export function SelectField({
  name,
  label,
  error,
  hint,
  optional,
  className,
  children,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrap {...{ name, label, error, hint, optional, className }}>
      <select
        id={`f-${name}`}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(name, error, hint)}
        className={cn(control, "appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%231d2220' stroke-width='1.2'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    </Wrap>
  );
}

export function Checkbox({
  name,
  label,
  error,
  defaultChecked,
  required,
}: {
  name: string;
  label: ReactNode;
  error?: string;
  defaultChecked?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="flex cursor-pointer items-start gap-3 text-[0.9375rem] text-ink-soft">
        <input
          id={`f-${name}`}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `f-${name}-error` : undefined}
          className="mt-1 h-5 w-5 shrink-0 accent-ionian"
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={`f-${name}-error`} className="mt-1.5 pl-8 text-[0.8125rem] text-[#9a4a2a]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Off-screen honeypot. Bots fill every input; people never see this one. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
