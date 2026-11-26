import type { ValidateFunction } from "ajv";
import type { ExplainResponse } from "../types";

declare const validate: ValidateFunction<ExplainResponse>;
export default validate;
