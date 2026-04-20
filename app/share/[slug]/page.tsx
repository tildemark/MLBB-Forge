import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchBuildBySlug } from "@/lib/actions";
import { encodeShareState } from "@/lib/share";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const build = (await fetchBuildBySlug(slug)) as
    | (Awaited<ReturnType<typeof fetchBuildBySlug>> & { heroName?: string })
    | null;

  if (!build) {
    return { title: "Build not found – MLBB Forge" };
  }

  const heroName = build.heroName ?? "Unknown Hero";
  const itemNames = build.items
    .sort((a, b) => a.slot - b.slot)
    .map((bi) => bi.item.name)
    .join(", ");

  const title = `${build.title} – ${heroName} Build | MLBB Forge`;
  const description = build.description
    ? build.description
    : `${heroName} build by ${build.authorName ?? "a player"}: ${itemNames}.`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://forge.sanchez.ph";
  // Use the hero portrait as OG image if available
  const ogImage = `${appUrl}/api/og?slug=${encodeURIComponent(slug)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl}/share/${slug}`,
      siteName: "MLBB Forge",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/** The share page renders OG meta (for crawlers) + client-redirects humans to the full app. */
export default async function SharePage({ params }: Props) {
  const { slug } = await params;
  const build = await fetchBuildBySlug(slug);
  if (!build) notFound();

  const b = build as typeof build & { heroSlug?: string };
  const heroSlug = b.heroSlug ?? "";

  // Encode the full build state so /?b= restores hero + items + spell + emblem + talents
  const encoded = encodeShareState({
    h: heroSlug,
    lv: build.heroLevel,
    items: [0, 1, 2, 3, 4, 5].map((slot) => build.items.find((i) => i.slot === slot)?.item.slug ?? null),
    spell: build.spell?.slug ?? null,
    emblem: build.emblem?.slug ?? null,
    nodes: [build.talents.standard1?.id, build.talents.standard2?.id, build.talents.core?.id].filter(Boolean) as string[],
  });

  const dest = `/?b=${encoded}`;

  // FB/social crawlers read the OG tags from generateMetadata above (200 response).
  // Browsers are redirected by the inline script — crawlers don't execute JS.
  return (
    <div style={{ display: "none" }}>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script dangerouslySetInnerHTML={{ __html: `window.location.replace(${JSON.stringify(dest)})` }} />
      <p>
        Redirecting… <a href={dest}>Click here if not redirected.</a>
      </p>
    </div>
  );
}
