import { getHeroes, getItems, getEmblems, getSpells, getPatchVersion } from "@/lib/queries";
import { ForgeSandbox } from "@/components/ForgeSandbox";

export default async function HomePage() {
  const [heroes, items, emblems, spells, patchVersion] = await Promise.all([
    getHeroes(),
    getItems(),
    getEmblems(),
    getSpells(),
    getPatchVersion(),
  ]);

  return (
    <ForgeSandbox
      heroes={heroes}
      items={items}
      emblems={emblems}
      spells={spells}
      patchVersion={patchVersion}
    />
  );
}

