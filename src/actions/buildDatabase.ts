import path from "node:path";
import fs from "node:fs/promises";

import ollama from "ollama";
import ignoreWalk from "ignore-walk";
import {
  ChromaClient,
  type AddRecordsParams,
  type Metadata,
} from "chromadb-client";
import { v4 as uuidv4 } from "uuid";
import CRC32 from "crc-32";
import ts from "typescript";

import { logger, config } from "../utils";

const PROGRESS_GROUP_COUNT = 100;
const MAX_NODE_SIZE = 30; // TODO: Test larger value?

export const buildDatabase = async () => {
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

    const fileExt = path.extname(filePath);
    const fileSize = fileStats.size;
    const fileCreatedAt = fileStats.birthtime.toISOString();
    const fileUpdatedAt = fileStats.mtime.toISOString();
    const fileChecksum = CRC32.str(fileContent);

    const sourceFile = ts.createSourceFile(
      path.basename(absFilePath),
      fileContent,
      ts.ScriptTarget.Latest,
      true,
    );

    const fragments: Array<{ kind: string; lines: number; content: string }> =
      [];

    function traverse(node: ts.Node) {
      let nodeFullText = node.getFullText();
      let linesNum = nodeFullText.split(/\r\n|\r|\n/).length;

      // TODO: ADD OVERLAP
      if (linesNum <= MAX_NODE_SIZE) {
        fragments.push({
          kind: ts.SyntaxKind[node.kind],
          lines: linesNum,
          content: nodeFullText,
        });
      } else {
        ts.forEachChild(node, (childNode) => traverse(childNode));
      }
    }

    traverse(sourceFile);

    const documents: Array<string> = [];
    const ids: Array<string> = [];
    const metadatas: Array<Metadata> = [];

    for (let i = 0; i < fragments.length; i++) {
      const fragment = fragments[i];

      ids.push(uuidv4());

      documents.push(fragment.content);

      metadatas.push({
        filePath,
        fileExt,
        fileSize,
        fileCreatedAt,
        fileUpdatedAt,
        fileChecksum,
        fragmentKind: fragment.kind,
        fragmentLines: fragment.lines,
      });
    }

    const { embeddings } = await ollama.embed({
      model: config.embeddingsModel,
      input: documents,
    });

    const newRecords: AddRecordsParams = {
      ids,
      documents,
      embeddings,
      metadatas,
    };

    await collection.add(newRecords);

    processedFilesCount++;

    if (processedFilesCount % PROGRESS_GROUP_COUNT === 0) {
      logger.info(
        `Processed ${processedFilesCount} files of ${jsFilePaths.length}`,
      );
    }
  }

  logger.info(
    `Done. Processed ${processedFilesCount} files, skipped ${skippedFilesCount}`,
  );

  process.exit(0);
};
