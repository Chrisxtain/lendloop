import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk middleware only attaches the session. There is deliberately no path-based
// protection here: every piece of data is authorized inside the Convex function that
// reads or writes it (see convex/lib/auth.ts), and signed-out visitors to app pages
// get a sign-in prompt from the AppShell.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
