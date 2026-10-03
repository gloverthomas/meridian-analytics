import { describe, expect, it } from "vitest";
import { tidyStreaming } from "./markdown";

describe("tidyStreaming", () => {
  it("closes open bold and hides partial citations", () => {
    expect(tidyStreaming("**KAN-16: Create")).toBe("**KAN-16: Create**");
    expect(tidyStreaming("Done. **")).toBe("Done. ");
    expect(tidyStreaming("**Done.** [linear:LI")).toBe("**Done.** ");
    expect(tidyStreaming("**Done.** [linear:KAN-1]")).toBe("**Done.** [linear:KAN-1]");
  });
});
