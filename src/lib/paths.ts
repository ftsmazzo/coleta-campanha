import path from "node:path";

export function rootDir() {
  return process.cwd();
}

export function dataDir() {
  return path.join(rootDir(), "data");
}

export function uploadsDir() {
  return path.join(dataDir(), "uploads");
}

export function tmpDir() {
  return path.join(dataDir(), "tmp");
}

export function nowDate() {
  return new Date();
}
