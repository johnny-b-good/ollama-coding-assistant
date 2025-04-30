import "dotenv/config";

import { logger } from "./logger";

export const config = {
  chromadbPath: process.env.CHROMADB_PATH ?? "",
  chromadbCollectionName: process.env.CHROMADB_COLLECTION_NAME ?? "",
  sourceDirPath: process.env.SOURCE_DIR_PATH ?? "",
  embeddingsModel: process.env.EMBEDDINGS_MODEL ?? "",
};

if (Object.values(config).indexOf("") !== -1) {
  logger.error("Missing env variable");
  process.exit(1);
}
