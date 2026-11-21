/** Static-demo stand-in for @/lib/booking/actions: never creates a booking. */
export async function startBooking() {
  await new Promise((r) => setTimeout(r, 400));
  return { ok: false as const, problem: { code: "demo" as const } };
}
export async function preparePayment() {
  return { status: "idle" as const };
}
