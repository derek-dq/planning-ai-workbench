import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";

/** Repository 私有的最小文件操作集合；不向客户端暴露。 */
export type ProjectFileSystemPort = {
  ensureDirectory(directory: string): Promise<void>;
  listJsonFileNames(directory: string): Promise<string[]>;
  readText(filePath: string): Promise<string>;
  writeTempText(filePath: string, content: string): Promise<void>;
  replaceFile(temporaryPath: string, targetPath: string): Promise<void>;
  removeFile(filePath: string): Promise<void>;
};

export function createNodeProjectFileSystem(): ProjectFileSystemPort {
  return {
    async ensureDirectory(directory) {
      await mkdir(directory, { recursive: true });
    },
    async listJsonFileNames(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name);
    },
    async readText(filePath) {
      return readFile(filePath, "utf8");
    },
    async writeTempText(filePath, content) {
      await writeFile(filePath, content, "utf8");
    },
    async replaceFile(temporaryPath, targetPath) {
      await rename(temporaryPath, targetPath);
    },
    async removeFile(filePath) {
      await rm(filePath, { force: true });
    },
  };
}
