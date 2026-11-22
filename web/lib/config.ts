// Filled from the stack outputs at build time (scripts/build_web.py writes web/.env.production).
export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, ""),
  userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID ?? "",
  userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID ?? "",
};

/** No backend configured (local `npm run dev` before deploy): skip sign-in, show recorded data only. */
export const previewMode = !config.apiUrl;
