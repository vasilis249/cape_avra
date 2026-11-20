import { notFound } from "next/navigation";

/** Routes the localized not-found page for any unknown path under /[locale]. */
export default function CatchAll() {
  notFound();
}
