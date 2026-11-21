import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Route protection here is a UX convenience only (redirect to sign-in).
// The real authorization boundary is inside every Convex function.
const isProtected = createRouteMatcher(["/board(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
