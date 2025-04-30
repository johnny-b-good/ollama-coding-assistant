import path from "node:path";
import fs from "node:fs/promises";

import ollama from "ollama";
import ignoreWalk from "ignore-walk";
import { ChromaClient, type AddRecordsParams } from "chromadb-client";
import { v4 as uuidv4 } from "uuid";
import CRC32 from "crc-32";

import { config, logger } from "./utils";

const PROGRESS_GROUP_COUNT = 100;

async function main() {
  const chroma = new ChromaClient({ path: config.chromadbPath });
  logger.info("Connected to ChromaDB");

  const oldCollection = await chroma.getCollection({
    name: config.chromadbCollectionName,
  });
  if (oldCollection) {
    await chroma.deleteCollection({ name: config.chromadbCollectionName });
    logger.info("Deleted old collection");
  }

  const collection = await chroma.createCollection({
    name: config.chromadbCollectionName,
  });
  logger.info("Created new collection");

  const allFilePaths = ignoreWalk.sync({
    path: config.sourceDirPath,
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
    const absFilePath = path.join(config.sourceDirPath, filePath);

    const fileContent = await fs.readFile(absFilePath, "utf-8");

    if (fileContent.length === 0) {
      skippedFilesCount++;
      continue;
    }

    const fileStats = await fs.stat(absFilePath);

    const checksum = CRC32.str(fileContent);

    const { embeddings } = await ollama.embed({
      model: config.embeddingsModel,
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
    `Done. Processed ${jsFilePaths.length - skippedFilesCount} files, skipped ${skippedFilesCount}`,
  );
}

main().catch((err) => {
  console.error(err);
});
