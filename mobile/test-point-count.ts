/**
 * Test script to analyze the deer image point count
 * Run with: npx ts-node test-point-count.ts
 */

import { countAntlerPointsAccurately } from "./src/api/deer-analysis";

const testImage = "./assets/image-1765518825.jpeg";

async function runTest() {
  console.log("===========================================");
  console.log("DEER ANTLER POINT COUNT TEST");
  console.log("===========================================");
  console.log("Image:", testImage);
  console.log("-------------------------------------------");

  try {
    console.log("\nCalling AI point counting function...\n");
    const result = await countAntlerPointsAccurately(testImage);

    console.log("===========================================");
    console.log("RESULTS:");
    console.log("===========================================");
    console.log("Left Antler Points:", result.leftAntlerPoints);
    console.log("Right Antler Points:", result.rightAntlerPoints);
    console.log("Total Points:", result.totalCount);
    console.log("Confidence:", result.confidence);
    console.log("-------------------------------------------");
    console.log("Left G-tines detected:", result.leftGtines.join(", "));
    console.log("Right G-tines detected:", result.rightGtines.join(", "));
    console.log("-------------------------------------------");
    console.log("AI Explanation:");
    console.log(result.explanation);
    console.log("===========================================");

    // Check for symmetry (potential issue)
    if (result.leftAntlerPoints === result.rightAntlerPoints) {
      console.log("\n⚠️  WARNING: AI reported SYMMETRICAL count!");
      console.log("Most deer racks are asymmetrical - verify this is correct.");
    } else {
      console.log("\n✅ AI reported ASYMMETRICAL count (good sign)");
    }

  } catch (error: any) {
    console.error("Test failed:", error.message);
  }
}

runTest();
