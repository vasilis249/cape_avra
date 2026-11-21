/** Form state shared by the lead forms (client) and their server actions. No zod here: keep it out of the browser bundle. */
export type FormState = {
  status: "idle" | "success" | "error";
  /** field → error code */
  fieldErrors?: Record<string, string>;
  /** generic | rate | unavailable */
  formError?: "generic" | "rate" | "unavailable";
  email?: string;
  /** submitted values, returned on error so the form can refill (React resets forms after an action) */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };
