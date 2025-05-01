import path from "node:path";
import fs from "node:fs/promises";

import ignoreWalk from "ignore-walk";
import ts from "typescript";

import { logger, config } from "../utils";

const PROGRESS_GROUP_COUNT = 100;
const MAX_NODE_SIZE = 20;

export const harvestTypeScript = async () => {
  const allFilePaths = ignoreWalk.sync({
    path: path.join(config.sourceDirPath, "src", "components"),
    ignoreFiles: [".gitignore"],
  });
  const jsFilePaths = allFilePaths.filter((filePath) =>
    [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(filePath)),
  );
  logger.info("Read source code file paths");

  logger.info("Processing source code files");

  let processedFilesCount = 0;
  let skippedFilesCount = 0;
  let harvest = "";

  for (const filePath of jsFilePaths) {
    const absFilePath = path.join(
      config.sourceDirPath,
      "src",
      "components",
      filePath,
    );

    const fileContent = await fs.readFile(absFilePath, "utf-8");

    if (fileContent.length === 0) {
      skippedFilesCount++;
      continue;
    }

    const sourceFile = ts.createSourceFile(
      path.basename(absFilePath),
      fileContent,
      ts.ScriptTarget.Latest,
      true,
    );

    function traverse(node: ts.Node) {
      let nodeFullText = node.getFullText();
      let linesNum = nodeFullText.split(/\r\n|\r|\n/).length;

      // TODO: OVERLAP
      if (linesNum <= MAX_NODE_SIZE) {
        harvest += `Path: ${filePath}\nKind: ${ts.SyntaxKind[node.kind]}\nLines: ${linesNum}\nFragment:\n${nodeFullText.trim()}\n\n${"#".repeat(80)}\n\n`;
      } else {
        ts.forEachChild(node, (childNode) => traverse(childNode));
      }
    }

    if (sourceFile) {
      traverse(sourceFile);
    }

    processedFilesCount++;

    if (processedFilesCount % PROGRESS_GROUP_COUNT === 0) {
      logger.info(
        `Processed ${processedFilesCount} files of ${jsFilePaths.length}`,
      );
    }
  }

  logger.info(
    `Processed ${processedFilesCount} files, skipped ${skippedFilesCount}`,
  );

  await fs.writeFile("results.txt", harvest);

  logger.info("Saved result file");

  process.exit(0);
};
