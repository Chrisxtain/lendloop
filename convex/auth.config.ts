// Convex verifies Clerk-issued JWTs. The issuer domain is an env var set on the
// Convex deployment (npx convex env set CLERK_JWT_ISSUER_DOMAIN ...), never hard-coded.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
