import { sha256 } from "./checksum";

describe("sha256", () => {
  it("[EARS-7] sha256 should return 64-character lowercase hex digest", () => {
    const result = sha256("test input");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("[EARS-8] sha256 should be deterministic (same input same output)", () => {
    const a = sha256("hello world");
    const b = sha256("hello world");
    expect(a).toBe(b);
  });
});
