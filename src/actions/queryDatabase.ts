import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import ollama from "ollama";
import { ChromaClient } from "chromadb-client";

import { config, logger } from "../utils";

const NUMBER_OF_DOCUMENTS_TO_FETCH = 10;

export const queryDatabase = async () => {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const userQuery = await rl.question("Enter your query: ");
  logger.info("Query accepted");

  const chroma = new ChromaClient({ path: config.chromadbPath });
  logger.info("Connected to ChromaDB");

  const collection = await chroma.getCollection({
    name: config.chromadbCollectionName,
  });
  logger.info("Collection set");

  const { embeddings } = await ollama.embed({
    model: config.embeddingsModel,
    input: userQuery,
  });
  logger.info("Generated embeddings");

  const { documents, metadatas } = await collection.query({
    queryEmbeddings: embeddings,
    nResults: NUMBER_OF_DOCUMENTS_TO_FETCH,
  });
  logger.info("Query completed");

  const realDocuments = documents[0];
  const realMetadatas = metadatas[0];

  logger.info(
    {
      foundFiles: realMetadatas.map((m) => m?.filePath),
      foundDocuments: realDocuments,
    },
    "Found theese files",
  );

  // let prompt = `You've recieved this task from user: ${userQuery}. You also know contents of theese TypeScript source files:\n`;
  // for (let i = 0; i < documents[0].length; i++) {
  //   const document = realDocuments[i];
  //   const metadata = realMetadatas[i];
  //   prompt += `Source file #${i}\nFile path: ${metadata?.path}\nSource code:\n${document}\n\n`;
  // }

  // const response = await ollama.generate({
  //   model: config.mainModel,
  //   prompt: prompt,
  //   stream: true,
  // });
  // for await (const part of response) {
  //   process.stdout.write(part.response);
  // }
  // console.log("\n");

  logger.info("Done");

  process.exit(0);
};
