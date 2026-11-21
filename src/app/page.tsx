import { Footer, Wordmark } from "@/components/Brand";
import { HowItWorks, LandingCta, PublicShelf } from "@/components/Landing";

export default function Home() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Wordmark />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid items-center gap-12 pb-20 pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-16">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-5xl">
              Borrow what you need. Lend what you don&apos;t.
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-muted">
              A shared shelf for your street. Lend out the tools gathering dust and borrow the ones you need for the weekend.
            </p>
            <div className="mt-8">
              <LandingCta />
            </div>
          </div>
          <PublicShelf />
        </section>

        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
