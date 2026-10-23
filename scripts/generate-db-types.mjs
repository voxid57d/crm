import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Write only on success; never truncate checked-in types after a CLI failure.
const result = spawnSync(
  process.execPath,
  [
    "node_modules/supabase/dist/supabase.js",
    "gen",
    "types",
    "typescript",
    "--local",
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) {
  process.stderr.write(
    result.stderr ||
      result.error?.message ||
      "Type generation failed. Start local Supabase first.\n",
  );
  process.exit(1);
}
writeFileSync("src/lib/supabase/database.types.ts", result.stdout);
