import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distDir = path.join(root, "dist");
const generatedSrcDir = path.join(root, "src", "generated", "client");
const generatedDistDir = path.join(distDir, "generated", "client");

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(path.join(distDir, "generated"), { recursive: true, force: true });
fs.cpSync(generatedSrcDir, generatedDistDir, { recursive: true });
