#!/usr/bin/env bun

// Test script for fact-check functionality
import { factCheck } from '../src/lib/fact-check';

console.log("=== Fact Check Test ===");
console.log("Environment:", process.env.NODE_ENV || 'development');
console.log();

async function runTest() {
  try {
    const testStatement = "This is a test statement for fact checking.";
    console.log("Testing statement:", testStatement);
    console.log();
    
    const result = await factCheck(testStatement);
    
    console.log("=== Results ===");
    console.log("Is Factual:", result.isFactual);
    console.log("Confidence:", result.confidence.toFixed(2));
    console.log("Vector Store ID:", result.vectorStoreId);
    console.log("Sources:", result.sources.join(", "));
    console.log();
    console.log("✅ Fact check test completed successfully");
    
  } catch (error) {
    console.log("❌ Fact check test failed:", error);
    process.exit(1);
  }
}

runTest();