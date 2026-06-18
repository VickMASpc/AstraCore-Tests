import { ExternalServiceError, ValidationError } from "../utils/errors.js";

export class GeminiToolDisabledError extends ValidationError {
  public constructor(message: string) {
    super(message);
    this.name = "GeminiToolDisabledError";
  }
}

export class GeminiTimeoutError extends ExternalServiceError {
  public constructor(message = "Gemini request timed out") {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

export class GeminiResponseParseError extends ValidationError {
  public constructor(message: string) {
    super(message);
    this.name = "GeminiResponseParseError";
  }
}
