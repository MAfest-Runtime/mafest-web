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

// explain-response-validator
var validate = validate20;
var explain_response_validator_default = validate20;
var func1 = require_ucs2length().default;
var pattern4 = new RegExp("^[a-z0-9_]+$", "u");
var pattern5 = new RegExp("^https?://\\S+$", "u");
var pattern6 = new RegExp("^\\d{4}-\\d{2}-\\d{2}$", "u");
function validate22(
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
  const evaluated0 = validate22.evaluated;
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
        (data.id === void 0 && (missing0 = "id")) ||
        (data.title === void 0 && (missing0 = "title")) ||
        (data.summary === void 0 && (missing0 = "summary")) ||
        (data.detail === void 0 && (missing0 = "detail")) ||
        (data.sources === void 0 && (missing0 = "sources")) ||
        (data.reviewed_at === void 0 && (missing0 = "reviewed_at"))
      ) {
        validate22.errors = [
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
            !(
              key0 === "id" ||
              key0 === "title" ||
              key0 === "summary" ||
              key0 === "detail" ||
              key0 === "sources" ||
              key0 === "reviewed_at"
            )
          ) {
            validate22.errors = [
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
          if (data.id !== void 0) {
            let data0 = data.id;
            const _errs2 = errors;
            if (errors === _errs2) {
              if (typeof data0 === "string") {
                if (func1(data0) > 64) {
                  validate22.errors = [
                    {
                      instancePath: instancePath + "/id",
                      schemaPath: "#/properties/id/maxLength",
                      keyword: "maxLength",
                      params: { limit: 64 },
                    },
                  ];
                  return false;
                } else {
                  if (!pattern4.test(data0)) {
                    validate22.errors = [
                      {
                        instancePath: instancePath + "/id",
                        schemaPath: "#/properties/id/pattern",
                        keyword: "pattern",
                        params: { pattern: "^[a-z0-9_]+$" },
                      },
                    ];
                    return false;
                  }
                }
              } else {
                validate22.errors = [
                  {
                    instancePath: instancePath + "/id",
                    schemaPath: "#/properties/id/type",
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
            if (data.title !== void 0) {
              let data1 = data.title;
              const _errs4 = errors;
              if (errors === _errs4) {
                if (typeof data1 === "string") {
                  if (func1(data1) > 30) {
                    validate22.errors = [
                      {
                        instancePath: instancePath + "/title",
                        schemaPath: "#/properties/title/maxLength",
                        keyword: "maxLength",
                        params: { limit: 30 },
                      },
                    ];
                    return false;
                  } else {
                    if (func1(data1) < 1) {
                      validate22.errors = [
                        {
                          instancePath: instancePath + "/title",
                          schemaPath: "#/properties/title/minLength",
                          keyword: "minLength",
                          params: { limit: 1 },
                        },
                      ];
                      return false;
                    }
                  }
                } else {
                  validate22.errors = [
                    {
                      instancePath: instancePath + "/title",
                      schemaPath: "#/properties/title/type",
                      keyword: "type",
                      params: { type: "string" },
                    },
                  ];
                  return false;
                }
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.summary !== void 0) {
                let data2 = data.summary;
                const _errs6 = errors;
                if (errors === _errs6) {
                  if (typeof data2 === "string") {
                    if (func1(data2) > 120) {
                      validate22.errors = [
                        {
                          instancePath: instancePath + "/summary",
                          schemaPath: "#/properties/summary/maxLength",
                          keyword: "maxLength",
                          params: { limit: 120 },
                        },
                      ];
                      return false;
                    } else {
                      if (func1(data2) < 1) {
                        validate22.errors = [
                          {
                            instancePath: instancePath + "/summary",
                            schemaPath: "#/properties/summary/minLength",
                            keyword: "minLength",
                            params: { limit: 1 },
                          },
                        ];
                        return false;
                      }
                    }
                  } else {
                    validate22.errors = [
                      {
                        instancePath: instancePath + "/summary",
                        schemaPath: "#/properties/summary/type",
                        keyword: "type",
                        params: { type: "string" },
                      },
                    ];
                    return false;
                  }
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.detail !== void 0) {
                  let data3 = data.detail;
                  const _errs8 = errors;
                  if (errors === _errs8) {
                    if (typeof data3 === "string") {
                      if (func1(data3) > 600) {
                        validate22.errors = [
                          {
                            instancePath: instancePath + "/detail",
                            schemaPath: "#/properties/detail/maxLength",
                            keyword: "maxLength",
                            params: { limit: 600 },
                          },
                        ];
                        return false;
                      } else {
                        if (func1(data3) < 1) {
                          validate22.errors = [
                            {
                              instancePath: instancePath + "/detail",
                              schemaPath: "#/properties/detail/minLength",
                              keyword: "minLength",
                              params: { limit: 1 },
                            },
                          ];
                          return false;
                        }
                      }
                    } else {
                      validate22.errors = [
                        {
                          instancePath: instancePath + "/detail",
                          schemaPath: "#/properties/detail/type",
                          keyword: "type",
                          params: { type: "string" },
                        },
                      ];
                      return false;
                    }
                  }
                  var valid0 = _errs8 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.sources !== void 0) {
                    let data4 = data.sources;
                    const _errs10 = errors;
                    if (errors === _errs10) {
                      if (Array.isArray(data4)) {
                        if (data4.length > 3) {
                          validate22.errors = [
                            {
                              instancePath: instancePath + "/sources",
                              schemaPath: "#/properties/sources/maxItems",
                              keyword: "maxItems",
                              params: { limit: 3 },
                            },
                          ];
                          return false;
                        } else {
                          if (data4.length < 1) {
                            validate22.errors = [
                              {
                                instancePath: instancePath + "/sources",
                                schemaPath: "#/properties/sources/minItems",
                                keyword: "minItems",
                                params: { limit: 1 },
                              },
                            ];
                            return false;
                          } else {
                            var valid1 = true;
                            const len0 = data4.length;
                            for (let i0 = 0; i0 < len0; i0++) {
                              let data5 = data4[i0];
                              const _errs12 = errors;
                              const _errs13 = errors;
                              if (errors === _errs13) {
                                if (
                                  data5 &&
                                  typeof data5 == "object" &&
                                  !Array.isArray(data5)
                                ) {
                                  let missing1;
                                  if (
                                    (data5.title === void 0 &&
                                      (missing1 = "title")) ||
                                    (data5.url === void 0 && (missing1 = "url"))
                                  ) {
                                    validate22.errors = [
                                      {
                                        instancePath:
                                          instancePath + "/sources/" + i0,
                                        schemaPath:
                                          "#/$defs/ConceptSource/required",
                                        keyword: "required",
                                        params: { missingProperty: missing1 },
                                      },
                                    ];
                                    return false;
                                  } else {
                                    const _errs15 = errors;
                                    for (const key1 in data5) {
                                      if (
                                        !(key1 === "title" || key1 === "url")
                                      ) {
                                        validate22.errors = [
                                          {
                                            instancePath:
                                              instancePath + "/sources/" + i0,
                                            schemaPath:
                                              "#/$defs/ConceptSource/additionalProperties",
                                            keyword: "additionalProperties",
                                            params: {
                                              additionalProperty: key1,
                                            },
                                          },
                                        ];
                                        return false;
                                        break;
                                      }
                                    }
                                    if (_errs15 === errors) {
                                      if (data5.title !== void 0) {
                                        let data6 = data5.title;
                                        const _errs16 = errors;
                                        if (errors === _errs16) {
                                          if (typeof data6 === "string") {
                                            if (func1(data6) > 60) {
                                              validate22.errors = [
                                                {
                                                  instancePath:
                                                    instancePath +
                                                    "/sources/" +
                                                    i0 +
                                                    "/title",
                                                  schemaPath:
                                                    "#/$defs/ConceptSource/properties/title/maxLength",
                                                  keyword: "maxLength",
                                                  params: { limit: 60 },
                                                },
                                              ];
                                              return false;
                                            } else {
                                              if (func1(data6) < 1) {
                                                validate22.errors = [
                                                  {
                                                    instancePath:
                                                      instancePath +
                                                      "/sources/" +
                                                      i0 +
                                                      "/title",
                                                    schemaPath:
                                                      "#/$defs/ConceptSource/properties/title/minLength",
                                                    keyword: "minLength",
                                                    params: { limit: 1 },
                                                  },
                                                ];
                                                return false;
                                              }
                                            }
                                          } else {
                                            validate22.errors = [
                                              {
                                                instancePath:
                                                  instancePath +
                                                  "/sources/" +
                                                  i0 +
                                                  "/title",
                                                schemaPath:
                                                  "#/$defs/ConceptSource/properties/title/type",
                                                keyword: "type",
                                                params: { type: "string" },
                                              },
                                            ];
                                            return false;
                                          }
                                        }
                                        var valid3 = _errs16 === errors;
                                      } else {
                                        var valid3 = true;
                                      }
                                      if (valid3) {
                                        if (data5.url !== void 0) {
                                          let data7 = data5.url;
                                          const _errs18 = errors;
                                          if (errors === _errs18) {
                                            if (typeof data7 === "string") {
                                              if (func1(data7) > 300) {
                                                validate22.errors = [
                                                  {
                                                    instancePath:
                                                      instancePath +
                                                      "/sources/" +
                                                      i0 +
                                                      "/url",
                                                    schemaPath:
                                                      "#/$defs/ConceptSource/properties/url/maxLength",
                                                    keyword: "maxLength",
                                                    params: { limit: 300 },
                                                  },
                                                ];
                                                return false;
                                              } else {
                                                if (!pattern5.test(data7)) {
                                                  validate22.errors = [
                                                    {
                                                      instancePath:
                                                        instancePath +
                                                        "/sources/" +
                                                        i0 +
                                                        "/url",
                                                      schemaPath:
                                                        "#/$defs/ConceptSource/properties/url/pattern",
                                                      keyword: "pattern",
                                                      params: {
                                                        pattern:
                                                          "^https?://\\S+$",
                                                      },
                                                    },
                                                  ];
                                                  return false;
                                                }
                                              }
                                            } else {
                                              validate22.errors = [
                                                {
                                                  instancePath:
                                                    instancePath +
                                                    "/sources/" +
                                                    i0 +
                                                    "/url",
                                                  schemaPath:
                                                    "#/$defs/ConceptSource/properties/url/type",
                                                  keyword: "type",
                                                  params: { type: "string" },
                                                },
                                              ];
                                              return false;
                                            }
                                          }
                                          var valid3 = _errs18 === errors;
                                        } else {
                                          var valid3 = true;
                                        }
                                      }
                                    }
                                  }
                                } else {
                                  validate22.errors = [
                                    {
                                      instancePath:
                                        instancePath + "/sources/" + i0,
                                      schemaPath: "#/$defs/ConceptSource/type",
                                      keyword: "type",
                                      params: { type: "object" },
                                    },
                                  ];
                                  return false;
                                }
                              }
                              var valid1 = _errs12 === errors;
                              if (!valid1) {
                                break;
                              }
                            }
                          }
                        }
                      } else {
                        validate22.errors = [
                          {
                            instancePath: instancePath + "/sources",
                            schemaPath: "#/properties/sources/type",
                            keyword: "type",
                            params: { type: "array" },
                          },
                        ];
                        return false;
                      }
                    }
                    var valid0 = _errs10 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.reviewed_at !== void 0) {
                      let data8 = data.reviewed_at;
                      const _errs20 = errors;
                      const _errs21 = errors;
                      if (errors === _errs21) {
                        if (typeof data8 === "string") {
                          if (!pattern6.test(data8)) {
                            validate22.errors = [
                              {
                                instancePath: instancePath + "/reviewed_at",
                                schemaPath: "#/$defs/IsoDate/pattern",
                                keyword: "pattern",
                                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                              },
                            ];
                            return false;
                          }
                        } else {
                          validate22.errors = [
                            {
                              instancePath: instancePath + "/reviewed_at",
                              schemaPath: "#/$defs/IsoDate/type",
                              keyword: "type",
                              params: { type: "string" },
                            },
                          ];
                          return false;
                        }
                      }
                      var valid0 = _errs20 === errors;
                    } else {
                      var valid0 = true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate22.errors = [
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
  validate22.errors = vErrors;
  return errors === 0;
}
validate22.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
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
      if (data.topics === void 0 && (missing0 = "topics")) {
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
          if (!(key0 === "topics")) {
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
          if (data.topics !== void 0) {
            let data0 = data.topics;
            const _errs2 = errors;
            if (errors === _errs2) {
              if (Array.isArray(data0)) {
                if (data0.length > 2) {
                  validate21.errors = [
                    {
                      instancePath: instancePath + "/topics",
                      schemaPath: "#/properties/topics/maxItems",
                      keyword: "maxItems",
                      params: { limit: 2 },
                    },
                  ];
                  return false;
                } else {
                  var valid1 = true;
                  const len0 = data0.length;
                  for (let i0 = 0; i0 < len0; i0++) {
                    const _errs4 = errors;
                    if (
                      !validate22(data0[i0], {
                        instancePath: instancePath + "/topics/" + i0,
                        parentData: data0,
                        parentDataProperty: i0,
                        rootData,
                        dynamicAnchors,
                      })
                    ) {
                      vErrors =
                        vErrors === null
                          ? validate22.errors
                          : vErrors.concat(validate22.errors);
                      errors = vErrors.length;
                    }
                    var valid1 = _errs4 === errors;
                    if (!valid1) {
                      break;
                    }
                  }
                }
              } else {
                validate21.errors = [
                  {
                    instancePath: instancePath + "/topics",
                    schemaPath: "#/properties/topics/type",
                    keyword: "type",
                    params: { type: "array" },
                  },
                ];
                return false;
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
export { explain_response_validator_default as default, validate };
