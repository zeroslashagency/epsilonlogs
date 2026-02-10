import { classifyApiPayload } from "../src/index.js";
import fs from "fs";
import path from "path";

const fixturePath = path.resolve("fixtures/wo-306.json");
const payload = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

console.log("Classifying WO 306 from fixture...");
const rows = classifyApiPayload(payload);

console.log("\nClassification results:");
rows.forEach((row, i) => {
  console.log(`Row ${i + 1}: [${row.rowKind}] ${row.classification} - ${row.reasonCode}`);
  if (row.rowKind === "WO") {
    console.log(`  Actual Duration: ${row.workOrder.durationSec}s`);
    console.log(`  Target Duration: ${row.workOrder.targetDurationSec}s`);
  } else if (row.rowKind === "EXTENSION") {
    console.log(`  Comment: ${row.extension?.extensionComment}`);
  }
});
