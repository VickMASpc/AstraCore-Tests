import { describe, expect, it } from "vitest";
import {
  AppError,
  ExternalServiceError,
  PermissionError,
  RateLimitError,
  ValidationError,
  toError
} from "../../src/utils/errors.js";

describe("typed errors", () => {
  it("preserves codes across app error types", () => {
    expect(new AppError("boom").code).toBe("APP_ERROR");
    expect(new ValidationError("bad").code).toBe("VALIDATION_ERROR");
    expect(new PermissionError("no").code).toBe("PERMISSION_ERROR");
    expect(new RateLimitError("slow").code).toBe("RATE_LIMIT_ERROR");
    expect(new ExternalServiceError("down").code).toBe("EXTERNAL_SERVICE_ERROR");
  });
});

describe("toError", () => {
  it("normalizes unknown values", () => {
    expect(toError("boom")).toBeInstanceOf(Error);
    expect(toError(new Error("x")).message).toBe("x");
  });
});
