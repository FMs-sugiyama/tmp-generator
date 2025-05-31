#!/usr/bin/env bun

console.log("DEBUG: Starting upload.ts");

// Parse command line arguments
const args = process.argv.slice(2);
const sourceDirFlag = args.find((arg) => arg.startsWith('--source-dir='));
const sourceDir = sourceDirFlag ? sourceDirFlag.split('=')[1] : 'policy';

console.log(`DEBUG: Using source directory: ${sourceDir}`);

// Check environment variables
const openaiKey = process.env.OPENAI_API_KEY;
console.log(`DEBUG: OPENAI_API_KEY present: ${!!openaiKey}`);

// Simulate reading policy documents
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath));
      } else if (item.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.log(`DEBUG: Error reading directory ${dir}: ${error}`);
  }
  
  return files;
}

// Look for policy documents using specified source directory
const policyDir = `./${sourceDir}`;
const markdownFiles = findMarkdownFiles(policyDir);

console.log(`DEBUG: Found ${markdownFiles.length} markdown files in ${policyDir}:`);
markdownFiles.forEach(file => console.log(`  - ${file}`));

if (markdownFiles.length > 0) {
  console.log("DEBUG: Reading MD files - OK");
} else {
  console.log("DEBUG: Reading MD files - NG (no files found)");
}

// Simulate vector store creation
const vectorStoreId = `vs_${Date.now()}`;
const config = {
  id: vectorStoreId,
  created_at: new Date().toISOString(),
  files_count: markdownFiles.length,
  status: "simulated"
};

// Ensure config directory exists
import { mkdirSync, writeFileSync } from 'fs';

try {
  mkdirSync('./config', { recursive: true });
  writeFileSync('./config/vectorStore.json', JSON.stringify(config, null, 2));
  console.log(`DEBUG: Created vector store config: ${vectorStoreId}`);
  console.log("DEBUG: Vector Store creation - OK (simulated)");
} catch (error) {
  console.log(`DEBUG: Vector Store creation - NG: ${error}`);
  process.exit(1);
}