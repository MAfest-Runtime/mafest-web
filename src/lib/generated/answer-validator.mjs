// OpenAPI 정본에서 생성한다. npm run contract:generate
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) =>
  function __require() {
    return (
      mod ||
        (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
      mod.exports
    );
  };

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320) pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  },
});

// answer-validator
var validate = validate20;
var answer_validator_default = validate20;
var schema33 = {
  description:
    "GenerationOutcome.generation_mode: LLM_GENERATED\u2192llm, DETERMINISTIC_TEMPLATE\u2192template,\nLLM_ERROR\u2192fallback. [r9] \uBB38\uC7A5 \uAC80\uC99D\uC5D0\uC11C \uAC78\uB824 \uD15C\uD50C\uB9BF \uBB38\uC7A5\uC73C\uB85C \uB9C8\uBB34\uB9AC\uD55C \uB2F5\uB3C4 llm\uC774\uB2E4.\n",
  type: "string",
  enum: ["llm", "template", "fallback"],
};
var func1 = require_ucs2length().default;
function validate21(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (
        (data.text === void 0 && (missing0 = "text")) ||
        (data.generated_by === void 0 && (missing0 = "generated_by")) ||
        (data.notices === void 0 && (missing0 = "notices"))
      ) {
        validate21.errors = [
          {
            instancePath,
            schemaPath: "#/required",
            keyword: "required",
            params: { missingProperty: missing0 },
          },
        ];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (
            !(key0 === "text" || key0 === "generated_by" || key0 === "notices")
          ) {
            validate21.errors = [
              {
                instancePath,
                schemaPath: "#/additionalProperties",
                keyword: "additionalProperties",
                params: { additionalProperty: key0 },
              },
            ];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.text !== void 0) {
            let data0 = data.text;
            const _errs2 = errors;
            if (errors === _errs2) {
              if (typeof data0 === "string") {
                if (func1(data0) > 600) {
                  validate21.errors = [
                    {
                      instancePath: instancePath + "/text",
                      schemaPath: "#/properties/text/maxLength",
                      keyword: "maxLength",
                      params: { limit: 600 },
                    },
                  ];
                  return false;
                } else {
                  if (func1(data0) < 1) {
                    validate21.errors = [
                      {
                        instancePath: instancePath + "/text",
                        schemaPath: "#/properties/text/minLength",
                        keyword: "minLength",
                        params: { limit: 1 },
                      },
                    ];
                    return false;
                  }
                }
              } else {
                validate21.errors = [
                  {
                    instancePath: instancePath + "/text",
                    schemaPath: "#/properties/text/type",
                    keyword: "type",
                    params: { type: "string" },
                  },
                ];
                return false;
              }
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.generated_by !== void 0) {
              let data1 = data.generated_by;
              const _errs4 = errors;
              if (typeof data1 !== "string") {
                validate21.errors = [
                  {
                    instancePath: instancePath + "/generated_by",
                    schemaPath: "#/$defs/GeneratedBy/type",
                    keyword: "type",
                    params: { type: "string" },
                  },
                ];
                return false;
              }
              if (
                !(
                  data1 === "llm" ||
                  data1 === "template" ||
                  data1 === "fallback"
                )
              ) {
                validate21.errors = [
                  {
                    instancePath: instancePath + "/generated_by",
                    schemaPath: "#/$defs/GeneratedBy/enum",
                    keyword: "enum",
                    params: { allowedValues: schema33.enum },
                  },
                ];
                return false;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.notices !== void 0) {
                let data2 = data.notices;
                const _errs7 = errors;
                if (errors === _errs7) {
                  if (Array.isArray(data2)) {
                    var valid2 = true;
                    const len0 = data2.length;
                    for (let i0 = 0; i0 < len0; i0++) {
                      let data3 = data2[i0];
                      const _errs9 = errors;
                      const _errs10 = errors;
                      if (errors === _errs10) {
                        if (
                          data3 &&
                          typeof data3 == "object" &&
                          !Array.isArray(data3)
                        ) {
                          let missing1;
                          if (
                            (data3.code === void 0 && (missing1 = "code")) ||
                            (data3.text === void 0 && (missing1 = "text"))
                          ) {
                            validate21.errors = [
                              {
                                instancePath: instancePath + "/notices/" + i0,
                                schemaPath: "#/$defs/Notice/required",
                                keyword: "required",
                                params: { missingProperty: missing1 },
                              },
                            ];
                            return false;
                          } else {
                            const _errs12 = errors;
                            for (const key1 in data3) {
                              if (!(key1 === "code" || key1 === "text")) {
                                validate21.errors = [
                                  {
                                    instancePath:
                                      instancePath + "/notices/" + i0,
                                    schemaPath:
                                      "#/$defs/Notice/additionalProperties",
                                    keyword: "additionalProperties",
                                    params: { additionalProperty: key1 },
                                  },
                                ];
                                return false;
                                break;
                              }
                            }
                            if (_errs12 === errors) {
                              if (data3.code !== void 0) {
                                const _errs13 = errors;
                                if (typeof data3.code !== "string") {
                                  validate21.errors = [
                                    {
                                      instancePath:
                                        instancePath +
                                        "/notices/" +
                                        i0 +
                                        "/code",
                                      schemaPath:
                                        "#/$defs/Notice/properties/code/type",
                                      keyword: "type",
                                      params: { type: "string" },
                                    },
                                  ];
                                  return false;
                                }
                                var valid4 = _errs13 === errors;
                              } else {
                                var valid4 = true;
                              }
                              if (valid4) {
                                if (data3.text !== void 0) {
                                  let data5 = data3.text;
                                  const _errs15 = errors;
                                  if (errors === _errs15) {
                                    if (typeof data5 === "string") {
                                      if (func1(data5) < 1) {
                                        validate21.errors = [
                                          {
                                            instancePath:
                                              instancePath +
                                              "/notices/" +
                                              i0 +
                                              "/text",
                                            schemaPath:
                                              "#/$defs/Notice/properties/text/minLength",
                                            keyword: "minLength",
                                            params: { limit: 1 },
                                          },
                                        ];
                                        return false;
                                      }
                                    } else {
                                      validate21.errors = [
                                        {
                                          instancePath:
                                            instancePath +
                                            "/notices/" +
                                            i0 +
                                            "/text",
                                          schemaPath:
                                            "#/$defs/Notice/properties/text/type",
                                          keyword: "type",
                                          params: { type: "string" },
                                        },
                                      ];
                                      return false;
                                    }
                                  }
                                  var valid4 = _errs15 === errors;
                                } else {
                                  var valid4 = true;
                                }
                              }
                            }
                          }
                        } else {
                          validate21.errors = [
                            {
                              instancePath: instancePath + "/notices/" + i0,
                              schemaPath: "#/$defs/Notice/type",
                              keyword: "type",
                              params: { type: "object" },
                            },
                          ];
                          return false;
                        }
                      }
                      var valid2 = _errs9 === errors;
                      if (!valid2) {
                        break;
                      }
                    }
                  } else {
                    validate21.errors = [
                      {
                        instancePath: instancePath + "/notices",
                        schemaPath: "#/properties/notices/type",
                        keyword: "type",
                        params: { type: "array" },
                      },
                    ];
                    return false;
                  }
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate21.errors = [
        {
          instancePath,
          schemaPath: "#/type",
          keyword: "type",
          params: { type: "object" },
        },
      ];
      return false;
    }
  }
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate20(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (
    !validate21(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
    errors = vErrors.length;
  }
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
export { answer_validator_default as default, validate };
