import { buildDatabase, queryDatabase } from "./actions";

async function main() {
  // await buildDatabase();
  await queryDatabase();
}

main().catch((err) => {
  console.error(err);
});
