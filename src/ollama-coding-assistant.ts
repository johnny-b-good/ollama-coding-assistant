import { buildDatabase, queryDatabase, harvestTypeScript } from "./actions";

async function main() {
  // await buildDatabase();
  // await queryDatabase();
  await harvestTypeScript();
}

main().catch((err) => {
  console.error(err);
});
