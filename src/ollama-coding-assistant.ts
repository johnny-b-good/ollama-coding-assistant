import ollama from "ollama";

async function main() {
  const response = await ollama.list();
  console.log(response.models);
}

main().catch((err) => {
  console.error(err);
});
