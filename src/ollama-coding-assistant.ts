import path from "node:path";
import fs from "node:fs/promises";

import ollama from "ollama";
import ignoreWalk from "ignore-walk";
import { ChromaClient, type AddRecordsParams } from "chromadb-client";
import { v4 as uuidv4 } from "uuid";
import pino from "pino";
import CRC32 from "crc-32";
import "dotenv/config";

const logger = pino({
  transport: {
    target: "pino-pretty",
  },
});

const ENV_CHROMADB_PATH = process.env.CHROMADB_PATH ?? "";
const ENV_CHROMADB_COLLECTION_NAME = process.env.CHROMADB_COLLECTION_NAME ?? "";
const ENV_SOURCE_DIR_PATH = process.env.SOURCE_DIR_PATH ?? "";

const PROGRESS_GROUP_COUNT = 100;
const EMBEDDINGS_MODEL = "mxbai-embed-large:latest";

if (
  !ENV_CHROMADB_PATH ||
  !ENV_CHROMADB_COLLECTION_NAME ||
  !ENV_SOURCE_DIR_PATH
) {
  logger.error("Missing env variable");
  process.exit(1);
}

async function main() {
  const chroma = new ChromaClient({ path: ENV_CHROMADB_PATH });
  logger.info("Connected to ChromaDB");

  const oldCollection = await chroma.getCollection({
    name: ENV_CHROMADB_COLLECTION_NAME,
  });
  if (oldCollection) {
    await chroma.deleteCollection({ name: ENV_CHROMADB_COLLECTION_NAME });
    logger.info("Deleted old collection");
  }

  const collection = await chroma.createCollection({
    name: ENV_CHROMADB_COLLECTION_NAME,
  });
  logger.info("Created new collection");

  const allFilePaths = ignoreWalk.sync({
    path: ENV_SOURCE_DIR_PATH,
    ignoreFiles: [".gitignore"],
  });
  const jsFilePaths = allFilePaths.filter((filePath) =>
    [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(filePath)),
  );
  logger.info("Read source code file paths");

  logger.info("Processing source code files");

  let processedFilesCount = 0;
  let skippedFilesCount = 0;

  for (const filePath of jsFilePaths) {
    const absFilePath = path.join(ENV_SOURCE_DIR_PATH, filePath);

    const fileContent = await fs.readFile(absFilePath, "utf-8");

    if (fileContent.length === 0) {
      skippedFilesCount++;
      continue;
    }

    const fileStats = await fs.stat(absFilePath);

    const checksum = CRC32.str(fileContent);

    const { embeddings } = await ollama.embed({
      model: EMBEDDINGS_MODEL,
      input: fileContent,
    });

    const newRecord: AddRecordsParams = {
      ids: [uuidv4()],
      documents: [fileContent],
      embeddings: embeddings,
      metadatas: [
        {
          path: filePath,
          size: fileStats.size,
          createdAt: fileStats.birthtime.toISOString(),
          updatedAt: fileStats.mtime.toISOString(),
          crc32: checksum,
        },
      ],
    };

    await collection.add(newRecord);

    processedFilesCount++;

    if (processedFilesCount % PROGRESS_GROUP_COUNT === 0) {
      logger.info(
        `Processed ${processedFilesCount} files of ${jsFilePaths.length}`,
      );
    }
  }

  logger.info(
    `Done. Processed ${jsFilePaths.length} files, skipped ${skippedFilesCount}`,
  );
}

main().catch((err) => {
  console.error(err);
});
