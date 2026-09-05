import { ensureSeedData } from "../src/lib/seed";

async function main() {
  await ensureSeedData();
  console.log("Seed ok: campanha AP 2026 + tipo onboarding_campanha");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
