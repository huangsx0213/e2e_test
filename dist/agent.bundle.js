import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module) {
    var fs2 = __require("fs");
    var path2 = __require("path");
    var os = __require("os");
    var crypto2 = __require("crypto");
    var TIPS = [
      "\u25C8 encrypted .env [www.dotenvx.com]",
      "\u25C8 secrets for agents [www.dotenvx.com]",
      "\u2301 auth for agents [www.vestauth.com]",
      "\u2318 custom filepath { path: '/custom/path/.env' }",
      "\u2318 enable debugging { debug: true }",
      "\u2318 override existing { override: true }",
      "\u2318 suppress logs { quiet: true }",
      "\u2318 multiple files { path: ['.env.local', '.env'] }"
    ];
    function _getRandomTip() {
      return TIPS[Math.floor(Math.random() * TIPS.length)];
    }
    function parseBoolean(value) {
      if (typeof value === "string") {
        return !["false", "0", "no", "off", ""].includes(value.toLowerCase());
      }
      return Boolean(value);
    }
    function supportsAnsi() {
      return process.stdout.isTTY;
    }
    function dim(text) {
      return supportsAnsi() ? `\x1B[2m${text}\x1B[0m` : text;
    }
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.error(`\u26A0 ${message}`);
    }
    function _debug(message) {
      console.log(`\u2506 ${message}`);
    }
    function _log(message) {
      console.log(`\u25C7 ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs2.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
      }
      if (fs2.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path2.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
      const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (debug || !quiet) {
        _log("loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path2.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
      let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("no encoding is specified (UTF-8 is used by default)");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path3 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs2.readFileSync(path3, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`failed to load ${path3} ${e.message}`);
          }
          lastError = e;
        }
      }
      const populated = DotenvModule.populate(processEnv, parsedAll, options);
      debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
      quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
      if (debug || !quiet) {
        const keysCount = Object.keys(populated).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path2.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")} ${dim(`// tip: ${_getRandomTip()}`)}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config2(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`you set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto2.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      const populated = {};
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
            populated[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
      }
      return populated;
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config: config2,
      decrypt,
      parse,
      populate
    };
    module.exports.configDotenv = DotenvModule.configDotenv;
    module.exports._configVault = DotenvModule._configVault;
    module.exports._parseVault = DotenvModule._parseVault;
    module.exports.config = DotenvModule.config;
    module.exports.decrypt = DotenvModule.decrypt;
    module.exports.parse = DotenvModule.parse;
    module.exports.populate = DotenvModule.populate;
    module.exports = DotenvModule;
  }
});

// node_modules/dotenv/lib/env-options.js
var require_env_options = __commonJS({
  "node_modules/dotenv/lib/env-options.js"(exports2, module) {
    var options = {};
    if (process.env.DOTENV_CONFIG_ENCODING != null) {
      options.encoding = process.env.DOTENV_CONFIG_ENCODING;
    }
    if (process.env.DOTENV_CONFIG_PATH != null) {
      options.path = process.env.DOTENV_CONFIG_PATH;
    }
    if (process.env.DOTENV_CONFIG_QUIET != null) {
      options.quiet = process.env.DOTENV_CONFIG_QUIET;
    }
    if (process.env.DOTENV_CONFIG_DEBUG != null) {
      options.debug = process.env.DOTENV_CONFIG_DEBUG;
    }
    if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
      options.override = process.env.DOTENV_CONFIG_OVERRIDE;
    }
    if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
      options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
    }
    module.exports = options;
  }
});

// node_modules/dotenv/lib/cli-options.js
var require_cli_options = __commonJS({
  "node_modules/dotenv/lib/cli-options.js"(exports2, module) {
    var re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
    module.exports = function optionMatcher(args2) {
      const options = args2.reduce(function(acc, cur) {
        const matches = cur.match(re);
        if (matches) {
          acc[matches[1]] = matches[2];
        }
        return acc;
      }, {});
      if (!("quiet" in options)) {
        options.quiet = "true";
      }
      return options;
    };
  }
});

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress2, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress2) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress2, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress2, options, cb) {
        if (!compress2) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event2 = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event2.prototype, "target", { enumerable: true });
    Object.defineProperty(Event2.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event2 {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event2 {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event2 {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event2("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event: Event2,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push2(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push2(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push2(params, header.slice(start, end), true);
            if (code === 44) {
              push2(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push2(params, paramName, value);
            if (code === 44) {
              push2(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push2(offers, token, params);
      } else {
        if (paramName === void 0) {
          push2(params, token, true);
        } else if (mustUnescape) {
          push2(params, paramName, token.replace(/\\/g, ""));
        } else {
          push2(params, paramName, token);
        }
        push2(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws2, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws2.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws2.pause();
      });
      ws2.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws2.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws2.readyState === ws2.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws2.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws2.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws2.terminate();
      };
      duplex._final = function(callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws2._socket === null) return;
        if (ws2._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws2._socket.once("finish", function finish() {
            callback();
          });
          ws2.close();
        }
      };
      duplex._read = function() {
        if (ws2.isPaused) ws2.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws2.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index2 = req.url.indexOf("?");
          const pathname = index2 !== -1 ? req.url.slice(0, index2) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws2 = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws2._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws2._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws2.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws2);
          ws2.on("close", () => {
            this.clients.delete(ws2);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws2, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/dayjs/dayjs.min.js
var require_dayjs_min = __commonJS({
  "node_modules/dayjs/dayjs.min.js"(exports2, module) {
    !(function(t, e) {
      "object" == typeof exports2 && "undefined" != typeof module ? module.exports = e() : "function" == typeof define && define.amd ? define(e) : (t = "undefined" != typeof globalThis ? globalThis : t || self).dayjs = e();
    })(exports2, (function() {
      "use strict";
      var t = 1e3, e = 6e4, n = 36e5, r = "millisecond", i = "second", s = "minute", u = "hour", a = "day", o = "week", c = "month", f = "quarter", h = "year", d = "date", l = "Invalid Date", $ = /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/, y = /\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g, M = { name: "en", weekdays: "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"), months: "January_February_March_April_May_June_July_August_September_October_November_December".split("_"), ordinal: function(t2) {
        var e2 = ["th", "st", "nd", "rd"], n2 = t2 % 100;
        return "[" + t2 + (e2[(n2 - 20) % 10] || e2[n2] || e2[0]) + "]";
      } }, m = function(t2, e2, n2) {
        var r2 = String(t2);
        return !r2 || r2.length >= e2 ? t2 : "" + Array(e2 + 1 - r2.length).join(n2) + t2;
      }, v = { s: m, z: function(t2) {
        var e2 = -t2.utcOffset(), n2 = Math.abs(e2), r2 = Math.floor(n2 / 60), i2 = n2 % 60;
        return (e2 <= 0 ? "+" : "-") + m(r2, 2, "0") + ":" + m(i2, 2, "0");
      }, m: function t2(e2, n2) {
        if (e2.date() < n2.date()) return -t2(n2, e2);
        var r2 = 12 * (n2.year() - e2.year()) + (n2.month() - e2.month()), i2 = e2.clone().add(r2, c), s2 = n2 - i2 < 0, u2 = e2.clone().add(r2 + (s2 ? -1 : 1), c);
        return +(-(r2 + (n2 - i2) / (s2 ? i2 - u2 : u2 - i2)) || 0);
      }, a: function(t2) {
        return t2 < 0 ? Math.ceil(t2) || 0 : Math.floor(t2);
      }, p: function(t2) {
        return { M: c, y: h, w: o, d: a, D: d, h: u, m: s, s: i, ms: r, Q: f }[t2] || String(t2 || "").toLowerCase().replace(/s$/, "");
      }, u: function(t2) {
        return void 0 === t2;
      } }, g = "en", D = {};
      D[g] = M;
      var p = "$isDayjsObject", S = function(t2) {
        return t2 instanceof _ || !(!t2 || !t2[p]);
      }, w = function t2(e2, n2, r2) {
        var i2;
        if (!e2) return g;
        if ("string" == typeof e2) {
          var s2 = e2.toLowerCase();
          D[s2] && (i2 = s2), n2 && (D[s2] = n2, i2 = s2);
          var u2 = e2.split("-");
          if (!i2 && u2.length > 1) return t2(u2[0]);
        } else {
          var a2 = e2.name;
          D[a2] = e2, i2 = a2;
        }
        return !r2 && i2 && (g = i2), i2 || !r2 && g;
      }, O = function(t2, e2) {
        if (S(t2)) return t2.clone();
        var n2 = "object" == typeof e2 ? e2 : {};
        return n2.date = t2, n2.args = arguments, new _(n2);
      }, b = v;
      b.l = w, b.i = S, b.w = function(t2, e2) {
        return O(t2, { locale: e2.$L, utc: e2.$u, x: e2.$x, $offset: e2.$offset });
      };
      var _ = (function() {
        function M2(t2) {
          this.$L = w(t2.locale, null, true), this.parse(t2), this.$x = this.$x || t2.x || {}, this[p] = true;
        }
        var m2 = M2.prototype;
        return m2.parse = function(t2) {
          this.$d = (function(t3) {
            var e2 = t3.date, n2 = t3.utc;
            if (null === e2) return /* @__PURE__ */ new Date(NaN);
            if (b.u(e2)) return /* @__PURE__ */ new Date();
            if (e2 instanceof Date) return new Date(e2);
            if ("string" == typeof e2 && !/Z$/i.test(e2)) {
              var r2 = e2.match($);
              if (r2) {
                var i2 = r2[2] - 1 || 0, s2 = (r2[7] || "0").substring(0, 3);
                return n2 ? new Date(Date.UTC(r2[1], i2, r2[3] || 1, r2[4] || 0, r2[5] || 0, r2[6] || 0, s2)) : new Date(r2[1], i2, r2[3] || 1, r2[4] || 0, r2[5] || 0, r2[6] || 0, s2);
              }
            }
            return new Date(e2);
          })(t2), this.init();
        }, m2.init = function() {
          var t2 = this.$d;
          this.$y = t2.getFullYear(), this.$M = t2.getMonth(), this.$D = t2.getDate(), this.$W = t2.getDay(), this.$H = t2.getHours(), this.$m = t2.getMinutes(), this.$s = t2.getSeconds(), this.$ms = t2.getMilliseconds();
        }, m2.$utils = function() {
          return b;
        }, m2.isValid = function() {
          return !(this.$d.toString() === l);
        }, m2.isSame = function(t2, e2) {
          var n2 = O(t2);
          return this.startOf(e2) <= n2 && n2 <= this.endOf(e2);
        }, m2.isAfter = function(t2, e2) {
          return O(t2) < this.startOf(e2);
        }, m2.isBefore = function(t2, e2) {
          return this.endOf(e2) < O(t2);
        }, m2.$g = function(t2, e2, n2) {
          return b.u(t2) ? this[e2] : this.set(n2, t2);
        }, m2.unix = function() {
          return Math.floor(this.valueOf() / 1e3);
        }, m2.valueOf = function() {
          return this.$d.getTime();
        }, m2.startOf = function(t2, e2) {
          var n2 = this, r2 = !!b.u(e2) || e2, f2 = b.p(t2), l2 = function(t3, e3) {
            var i2 = b.w(n2.$u ? Date.UTC(n2.$y, e3, t3) : new Date(n2.$y, e3, t3), n2);
            return r2 ? i2 : i2.endOf(a);
          }, $2 = function(t3, e3) {
            return b.w(n2.toDate()[t3].apply(n2.toDate("s"), (r2 ? [0, 0, 0, 0] : [23, 59, 59, 999]).slice(e3)), n2);
          }, y2 = this.$W, M3 = this.$M, m3 = this.$D, v2 = "set" + (this.$u ? "UTC" : "");
          switch (f2) {
            case h:
              return r2 ? l2(1, 0) : l2(31, 11);
            case c:
              return r2 ? l2(1, M3) : l2(0, M3 + 1);
            case o:
              var g2 = this.$locale().weekStart || 0, D2 = (y2 < g2 ? y2 + 7 : y2) - g2;
              return l2(r2 ? m3 - D2 : m3 + (6 - D2), M3);
            case a:
            case d:
              return $2(v2 + "Hours", 0);
            case u:
              return $2(v2 + "Minutes", 1);
            case s:
              return $2(v2 + "Seconds", 2);
            case i:
              return $2(v2 + "Milliseconds", 3);
            default:
              return this.clone();
          }
        }, m2.endOf = function(t2) {
          return this.startOf(t2, false);
        }, m2.$set = function(t2, e2) {
          var n2, o2 = b.p(t2), f2 = "set" + (this.$u ? "UTC" : ""), l2 = (n2 = {}, n2[a] = f2 + "Date", n2[d] = f2 + "Date", n2[c] = f2 + "Month", n2[h] = f2 + "FullYear", n2[u] = f2 + "Hours", n2[s] = f2 + "Minutes", n2[i] = f2 + "Seconds", n2[r] = f2 + "Milliseconds", n2)[o2], $2 = o2 === a ? this.$D + (e2 - this.$W) : e2;
          if (o2 === c || o2 === h) {
            var y2 = this.clone().set(d, 1);
            y2.$d[l2]($2), y2.init(), this.$d = y2.set(d, Math.min(this.$D, y2.daysInMonth())).$d;
          } else l2 && this.$d[l2]($2);
          return this.init(), this;
        }, m2.set = function(t2, e2) {
          return this.clone().$set(t2, e2);
        }, m2.get = function(t2) {
          return this[b.p(t2)]();
        }, m2.add = function(r2, f2) {
          var d2, l2 = this;
          r2 = Number(r2);
          var $2 = b.p(f2), y2 = function(t2) {
            var e2 = O(l2);
            return b.w(e2.date(e2.date() + Math.round(t2 * r2)), l2);
          };
          if ($2 === c) return this.set(c, this.$M + r2);
          if ($2 === h) return this.set(h, this.$y + r2);
          if ($2 === a) return y2(1);
          if ($2 === o) return y2(7);
          var M3 = (d2 = {}, d2[s] = e, d2[u] = n, d2[i] = t, d2)[$2] || 1, m3 = this.$d.getTime() + r2 * M3;
          return b.w(m3, this);
        }, m2.subtract = function(t2, e2) {
          return this.add(-1 * t2, e2);
        }, m2.format = function(t2) {
          var e2 = this, n2 = this.$locale();
          if (!this.isValid()) return n2.invalidDate || l;
          var r2 = t2 || "YYYY-MM-DDTHH:mm:ssZ", i2 = b.z(this), s2 = this.$H, u2 = this.$m, a2 = this.$M, o2 = n2.weekdays, c2 = n2.months, f2 = n2.meridiem, h2 = function(t3, n3, i3, s3) {
            return t3 && (t3[n3] || t3(e2, r2)) || i3[n3].slice(0, s3);
          }, d2 = function(t3) {
            return b.s(s2 % 12 || 12, t3, "0");
          }, $2 = f2 || function(t3, e3, n3) {
            var r3 = t3 < 12 ? "AM" : "PM";
            return n3 ? r3.toLowerCase() : r3;
          };
          return r2.replace(y, (function(t3, r3) {
            return r3 || (function(t4) {
              switch (t4) {
                case "YY":
                  return String(e2.$y).slice(-2);
                case "YYYY":
                  return b.s(e2.$y, 4, "0");
                case "M":
                  return a2 + 1;
                case "MM":
                  return b.s(a2 + 1, 2, "0");
                case "MMM":
                  return h2(n2.monthsShort, a2, c2, 3);
                case "MMMM":
                  return h2(c2, a2);
                case "D":
                  return e2.$D;
                case "DD":
                  return b.s(e2.$D, 2, "0");
                case "d":
                  return String(e2.$W);
                case "dd":
                  return h2(n2.weekdaysMin, e2.$W, o2, 2);
                case "ddd":
                  return h2(n2.weekdaysShort, e2.$W, o2, 3);
                case "dddd":
                  return o2[e2.$W];
                case "H":
                  return String(s2);
                case "HH":
                  return b.s(s2, 2, "0");
                case "h":
                  return d2(1);
                case "hh":
                  return d2(2);
                case "a":
                  return $2(s2, u2, true);
                case "A":
                  return $2(s2, u2, false);
                case "m":
                  return String(u2);
                case "mm":
                  return b.s(u2, 2, "0");
                case "s":
                  return String(e2.$s);
                case "ss":
                  return b.s(e2.$s, 2, "0");
                case "SSS":
                  return b.s(e2.$ms, 3, "0");
                case "Z":
                  return i2;
              }
              return null;
            })(t3) || i2.replace(":", "");
          }));
        }, m2.utcOffset = function() {
          return 15 * -Math.round(this.$d.getTimezoneOffset() / 15);
        }, m2.diff = function(r2, d2, l2) {
          var $2, y2 = this, M3 = b.p(d2), m3 = O(r2), v2 = (m3.utcOffset() - this.utcOffset()) * e, g2 = this - m3, D2 = function() {
            return b.m(y2, m3);
          };
          switch (M3) {
            case h:
              $2 = D2() / 12;
              break;
            case c:
              $2 = D2();
              break;
            case f:
              $2 = D2() / 3;
              break;
            case o:
              $2 = (g2 - v2) / 6048e5;
              break;
            case a:
              $2 = (g2 - v2) / 864e5;
              break;
            case u:
              $2 = g2 / n;
              break;
            case s:
              $2 = g2 / e;
              break;
            case i:
              $2 = g2 / t;
              break;
            default:
              $2 = g2;
          }
          return l2 ? $2 : b.a($2);
        }, m2.daysInMonth = function() {
          return this.endOf(c).$D;
        }, m2.$locale = function() {
          return D[this.$L];
        }, m2.locale = function(t2, e2) {
          if (!t2) return this.$L;
          var n2 = this.clone(), r2 = w(t2, e2, true);
          return r2 && (n2.$L = r2), n2;
        }, m2.clone = function() {
          return b.w(this.$d, this);
        }, m2.toDate = function() {
          return new Date(this.valueOf());
        }, m2.toJSON = function() {
          return this.isValid() ? this.toISOString() : null;
        }, m2.toISOString = function() {
          return this.$d.toISOString();
        }, m2.toString = function() {
          return this.$d.toUTCString();
        }, M2;
      })(), k = _.prototype;
      return O.prototype = k, [["$ms", r], ["$s", i], ["$m", s], ["$H", u], ["$W", a], ["$M", c], ["$y", h], ["$D", d]].forEach((function(t2) {
        k[t2[1]] = function(e2) {
          return this.$g(e2, t2[0], t2[1]);
        };
      })), O.extend = function(t2, e2) {
        return t2.$i || (t2(e2, _, O), t2.$i = true), O;
      }, O.locale = w, O.isDayjs = S, O.unix = function(t2) {
        return O(1e3 * t2);
      }, O.en = D[g], O.Ls = D, O.p = {}, O;
    }));
  }
});

// node_modules/dayjs/plugin/utc.js
var require_utc = __commonJS({
  "node_modules/dayjs/plugin/utc.js"(exports2, module) {
    !(function(t, i) {
      "object" == typeof exports2 && "undefined" != typeof module ? module.exports = i() : "function" == typeof define && define.amd ? define(i) : (t = "undefined" != typeof globalThis ? globalThis : t || self).dayjs_plugin_utc = i();
    })(exports2, (function() {
      "use strict";
      var t = "minute", i = /[+-]\d\d(?::?\d\d)?/g, e = /([+-]|\d\d)/g;
      return function(s, f, n) {
        var u = f.prototype;
        n.utc = function(t2) {
          var i2 = { date: t2, utc: true, args: arguments };
          return new f(i2);
        }, u.utc = function(i2) {
          var e2 = n(this.toDate(), { locale: this.$L, utc: true });
          return i2 ? e2.add(this.utcOffset(), t) : e2;
        }, u.local = function() {
          return n(this.toDate(), { locale: this.$L, utc: false });
        };
        var r = u.parse;
        u.parse = function(t2) {
          t2.utc && (this.$u = true), this.$utils().u(t2.$offset) || (this.$offset = t2.$offset), r.call(this, t2);
        };
        var o = u.init;
        u.init = function() {
          if (this.$u) {
            var t2 = this.$d;
            this.$y = t2.getUTCFullYear(), this.$M = t2.getUTCMonth(), this.$D = t2.getUTCDate(), this.$W = t2.getUTCDay(), this.$H = t2.getUTCHours(), this.$m = t2.getUTCMinutes(), this.$s = t2.getUTCSeconds(), this.$ms = t2.getUTCMilliseconds();
          } else o.call(this);
        };
        var a = u.utcOffset;
        u.utcOffset = function(s2, f2) {
          var n2 = this.$utils().u;
          if (n2(s2)) return this.$u ? 0 : n2(this.$offset) ? a.call(this) : this.$offset;
          if ("string" == typeof s2 && (s2 = (function(t2) {
            void 0 === t2 && (t2 = "");
            var s3 = t2.match(i);
            if (!s3) return null;
            var f3 = ("" + s3[0]).match(e) || ["-", 0, 0], n3 = f3[0], u3 = 60 * +f3[1] + +f3[2];
            return 0 === u3 ? 0 : "+" === n3 ? u3 : -u3;
          })(s2), null === s2)) return this;
          var u2 = Math.abs(s2) <= 16 ? 60 * s2 : s2;
          if (0 === u2) return this.utc(f2);
          var r2 = this.clone();
          if (f2) return r2.$offset = u2, r2.$u = false, r2;
          var o2 = this.$u ? this.toDate().getTimezoneOffset() : -1 * this.utcOffset();
          return (r2 = this.local().add(u2 + o2, t)).$offset = u2, r2.$x.$localOffset = o2, r2;
        };
        var h = u.format;
        u.format = function(t2) {
          var i2 = t2 || (this.$u ? "YYYY-MM-DDTHH:mm:ss[Z]" : "");
          return h.call(this, i2);
        }, u.valueOf = function() {
          var t2 = this.$utils().u(this.$offset) ? 0 : this.$offset + (this.$x.$localOffset || this.$d.getTimezoneOffset());
          return this.$d.valueOf() - 6e4 * t2;
        }, u.isUTC = function() {
          return !!this.$u;
        }, u.toISOString = function() {
          return this.toDate().toISOString();
        }, u.toString = function() {
          return this.toDate().toUTCString();
        };
        var l = u.toDate;
        u.toDate = function(t2) {
          return "s" === t2 && this.$offset ? n(this.format("YYYY-MM-DD HH:mm:ss:SSS")).toDate() : l.call(this);
        };
        var c = u.diff;
        u.diff = function(t2, i2, e2) {
          if (t2 && this.$u === t2.$u) return c.call(this, t2, i2, e2);
          var s2 = this.local(), f2 = n(t2).local();
          return c.call(s2, f2, i2, e2);
        };
      };
    }));
  }
});

// node_modules/dayjs/plugin/timezone.js
var require_timezone = __commonJS({
  "node_modules/dayjs/plugin/timezone.js"(exports2, module) {
    !(function(t, e) {
      "object" == typeof exports2 && "undefined" != typeof module ? module.exports = e() : "function" == typeof define && define.amd ? define(e) : (t = "undefined" != typeof globalThis ? globalThis : t || self).dayjs_plugin_timezone = e();
    })(exports2, (function() {
      "use strict";
      var t = { year: 0, month: 1, day: 2, hour: 3, minute: 4, second: 5 }, e = {};
      return function(n, i, o) {
        var r, a = function(t2, n2, i2) {
          void 0 === i2 && (i2 = {});
          var o2 = new Date(t2), r2 = (function(t3, n3) {
            void 0 === n3 && (n3 = {});
            var i3 = n3.timeZoneName || "short", o3 = t3 + "|" + i3, r3 = e[o3];
            return r3 || (r3 = new Intl.DateTimeFormat("en-US", { hour12: false, timeZone: t3, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: i3 }), e[o3] = r3), r3;
          })(n2, i2);
          return r2.formatToParts(o2);
        }, u = function(e2, n2) {
          for (var i2 = a(e2, n2), r2 = [], u2 = 0; u2 < i2.length; u2 += 1) {
            var f2 = i2[u2], s2 = f2.type, m = f2.value, c = t[s2];
            c >= 0 && (r2[c] = parseInt(m, 10));
          }
          var d = r2[3], l = 24 === d ? 0 : d, h = r2[0] + "-" + r2[1] + "-" + r2[2] + " " + l + ":" + r2[4] + ":" + r2[5] + ":000", v = +e2;
          return (o.utc(h).valueOf() - (v -= v % 1e3)) / 6e4;
        }, f = i.prototype;
        f.tz = function(t2, e2) {
          void 0 === t2 && (t2 = r);
          var n2, i2 = this.utcOffset(), a2 = this.toDate(), u2 = a2.toLocaleString("en-US", { timeZone: t2 }), f2 = Math.round((a2 - new Date(u2)) / 1e3 / 60), s2 = 15 * -Math.round(a2.getTimezoneOffset() / 15) - f2;
          if (!Number(s2)) n2 = this.utcOffset(0, e2);
          else if (n2 = o(u2, { locale: this.$L }).$set("millisecond", this.$ms).utcOffset(s2, true), e2) {
            var m = n2.utcOffset();
            n2 = n2.add(i2 - m, "minute");
          }
          return n2.$x.$timezone = t2, n2;
        }, f.offsetName = function(t2) {
          var e2 = this.$x.$timezone || o.tz.guess(), n2 = a(this.valueOf(), e2, { timeZoneName: t2 }).find((function(t3) {
            return "timezonename" === t3.type.toLowerCase();
          }));
          return n2 && n2.value;
        };
        var s = f.startOf;
        f.startOf = function(t2, e2) {
          if (!this.$x || !this.$x.$timezone) return s.call(this, t2, e2);
          var n2 = o(this.format("YYYY-MM-DD HH:mm:ss:SSS"), { locale: this.$L });
          return s.call(n2, t2, e2).tz(this.$x.$timezone, true);
        }, o.tz = function(t2, e2, n2) {
          var i2 = n2 && e2, a2 = n2 || e2 || r, f2 = u(+o(), a2);
          if ("string" != typeof t2) return o(t2).tz(a2);
          var s2 = (function(t3, e3, n3) {
            var i3 = t3 - 60 * e3 * 1e3, o2 = u(i3, n3);
            if (e3 === o2) return [i3, e3];
            var r2 = u(i3 -= 60 * (o2 - e3) * 1e3, n3);
            return o2 === r2 ? [i3, o2] : [t3 - 60 * Math.min(o2, r2) * 1e3, Math.max(o2, r2)];
          })(o.utc(t2, i2).valueOf(), f2, a2), m = s2[0], c = s2[1], d = o(m).utcOffset(c);
          return d.$x.$timezone = a2, d;
        }, o.tz.guess = function() {
          return Intl.DateTimeFormat().resolvedOptions().timeZone;
        }, o.tz.setDefault = function(t2) {
          r = t2;
        };
      };
    }));
  }
});

// node_modules/fast-xml-parser/src/util.js
function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index2 = 0; index2 < len; index2++) {
      allmatches.push(match[index2]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}
function isExist(v) {
  return typeof v !== "undefined";
}
var nameStartChar, nameChar, nameRegexp, regexName, isName, DANGEROUS_PROPERTY_NAMES, criticalProperties;
var init_util = __esm({
  "node_modules/fast-xml-parser/src/util.js"() {
    "use strict";
    nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
    nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
    nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
    regexName = new RegExp("^" + nameRegexp + "$");
    isName = function(string) {
      const match = regexName.exec(string);
      return !(match === null || typeof match === "undefined");
    };
    DANGEROUS_PROPERTY_NAMES = [
      // '__proto__',
      // 'constructor',
      // 'prototype',
      "hasOwnProperty",
      "toString",
      "valueOf",
      "__defineGetter__",
      "__defineSetter__",
      "__lookupGetter__",
      "__lookupSetter__"
    ];
    criticalProperties = ["__proto__", "constructor", "prototype"];
  }
});

// node_modules/fast-xml-parser/src/validator.js
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i = 0; i < xmlData.length; i++) {
    if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === "<") {
      let tagStartPos = i;
      i++;
      if (xmlData[i] === "!") {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === "/") {
          closingTag = true;
          i++;
        }
        let tagName = "";
        for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
        }
        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject(
                "InvalidTag",
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos)
              );
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) {
          } else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            if (xmlData[i + 1] === "!") {
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === "?") {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === "&") {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        }
        if (xmlData[i] === "<") {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
}
function isWhiteSpace(char) {
  return char === " " || char === "	" || char === "\n" || char === "\r";
}
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == "?" || xmlData[i] == " ") {
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}
function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  }
  return i;
}
function readAttributeStr(xmlData, i) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) {
      } else {
        startChar = "";
      }
    } else if (xmlData[i] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i,
    tagClosed
  };
}
function validateAttributeString(attrStr, options) {
  const matches = getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === "x") {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ";")
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i) {
  i++;
  if (xmlData[i] === ";")
    return -1;
  if (xmlData[i] === "#") {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ";")
      break;
    return -1;
  }
  return i;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return isName(attrName);
}
function validateTagName(tagname) {
  return isName(tagname);
}
function getLineNumberForPosition(xmlData, index2) {
  const lines = xmlData.substring(0, index2).split(/\r?\n/);
  return {
    line: lines.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}
var defaultOptions, doubleQuote, singleQuote, validAttrStrRegxp;
var init_validator = __esm({
  "node_modules/fast-xml-parser/src/validator.js"() {
    "use strict";
    init_util();
    defaultOptions = {
      allowBooleanAttributes: false,
      //A tag can have attributes without any value
      unpairedTags: []
    };
    doubleQuote = '"';
    singleQuote = "'";
    validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
  }
});

// node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
function validatePropertyName(propertyName, optionName) {
  if (typeof propertyName !== "string") {
    return;
  }
  const normalized = propertyName.toLowerCase();
  if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
  if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
}
function normalizeProcessEntities(value) {
  if (typeof value === "boolean") {
    return {
      enabled: value,
      // true or false
      maxEntitySize: 1e4,
      maxExpansionDepth: 10,
      maxTotalExpansions: 1e3,
      maxExpandedLength: 1e5,
      maxEntityCount: 100,
      allowedTags: null,
      tagFilter: null
    };
  }
  if (typeof value === "object" && value !== null) {
    return {
      enabled: value.enabled !== false,
      maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
      maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
      maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
      maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
      maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
      allowedTags: value.allowedTags ?? null,
      tagFilter: value.tagFilter ?? null
    };
  }
  return normalizeProcessEntities(true);
}
var defaultOnDangerousProperty, defaultOptions2, buildOptions;
var init_OptionsBuilder = __esm({
  "node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js"() {
    init_util();
    defaultOnDangerousProperty = (name) => {
      if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
        return "__" + name;
      }
      return name;
    };
    defaultOptions2 = {
      preserveOrder: false,
      attributeNamePrefix: "@_",
      attributesGroupName: false,
      textNodeName: "#text",
      ignoreAttributes: true,
      removeNSPrefix: false,
      // remove NS from tag name or attribute name if true
      allowBooleanAttributes: false,
      //a tag can have attributes without any value
      //ignoreRootElement : false,
      parseTagValue: true,
      parseAttributeValue: false,
      trimValues: true,
      //Trim string values of tag and attributes
      cdataPropName: false,
      numberParseOptions: {
        hex: true,
        leadingZeros: true,
        eNotation: true
      },
      tagValueProcessor: function(tagName, val) {
        return val;
      },
      attributeValueProcessor: function(attrName, val) {
        return val;
      },
      stopNodes: [],
      //nested tags will not be parsed even for errors
      alwaysCreateTextNode: false,
      isArray: () => false,
      commentPropName: false,
      unpairedTags: [],
      processEntities: true,
      htmlEntities: false,
      ignoreDeclaration: false,
      ignorePiTags: false,
      transformTagName: false,
      transformAttributeName: false,
      updateTag: function(tagName, jPath, attrs) {
        return tagName;
      },
      // skipEmptyListItem: false
      captureMetaData: false,
      maxNestedTags: 100,
      strictReservedNames: true,
      jPath: true,
      // if true, pass jPath string to callbacks; if false, pass matcher instance
      onDangerousProperty: defaultOnDangerousProperty
    };
    buildOptions = function(options) {
      const built = Object.assign({}, defaultOptions2, options);
      const propertyNameOptions = [
        { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
        { value: built.attributesGroupName, name: "attributesGroupName" },
        { value: built.textNodeName, name: "textNodeName" },
        { value: built.cdataPropName, name: "cdataPropName" },
        { value: built.commentPropName, name: "commentPropName" }
      ];
      for (const { value, name } of propertyNameOptions) {
        if (value) {
          validatePropertyName(value, name);
        }
      }
      if (built.onDangerousProperty === null) {
        built.onDangerousProperty = defaultOnDangerousProperty;
      }
      built.processEntities = normalizeProcessEntities(built.processEntities);
      if (built.stopNodes && Array.isArray(built.stopNodes)) {
        built.stopNodes = built.stopNodes.map((node) => {
          if (typeof node === "string" && node.startsWith("*.")) {
            return ".." + node.substring(2);
          }
          return node;
        });
      }
      return built;
    };
  }
});

// node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var METADATA_SYMBOL, XmlNode;
var init_xmlNode = __esm({
  "node_modules/fast-xml-parser/src/xmlparser/xmlNode.js"() {
    "use strict";
    if (typeof Symbol !== "function") {
      METADATA_SYMBOL = "@@xmlMetadata";
    } else {
      METADATA_SYMBOL = /* @__PURE__ */ Symbol("XML Node Metadata");
    }
    XmlNode = class {
      constructor(tagname) {
        this.tagname = tagname;
        this.child = [];
        this[":@"] = /* @__PURE__ */ Object.create(null);
      }
      add(key, val) {
        if (key === "__proto__") key = "#__proto__";
        this.child.push({ [key]: val });
      }
      addChild(node, startIndex) {
        if (node.tagname === "__proto__") node.tagname = "#__proto__";
        if (node[":@"] && Object.keys(node[":@"]).length > 0) {
          this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
        } else {
          this.child.push({ [node.tagname]: node.child });
        }
        if (startIndex !== void 0) {
          this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
        }
      }
      /** symbol used for metadata */
      static getMetaDataSymbol() {
        return METADATA_SYMBOL;
      }
    };
  }
});

// node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
function hasSeq(data, seq, i) {
  for (let j = 0; j < seq.length; j++) {
    if (seq[j] !== data[i + j + 1]) return false;
  }
  return true;
}
function validateEntityName(name) {
  if (isName(name))
    return name;
  else
    throw new Error(`Invalid entity name ${name}`);
}
var DocTypeReader, skipWhitespace;
var init_DocTypeReader = __esm({
  "node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js"() {
    init_util();
    DocTypeReader = class {
      constructor(options) {
        this.suppressValidationErr = !options;
        this.options = options;
      }
      readDocType(xmlData, i) {
        const entities = /* @__PURE__ */ Object.create(null);
        let entityCount = 0;
        if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
          i = i + 9;
          let angleBracketsCount = 1;
          let hasBody = false, comment = false;
          let exp = "";
          for (; i < xmlData.length; i++) {
            if (xmlData[i] === "<" && !comment) {
              if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
                i += 7;
                let entityName, val;
                [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
                if (val.indexOf("&") === -1) {
                  if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                    throw new Error(
                      `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                    );
                  }
                  const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                  entities[entityName] = {
                    regx: RegExp(`&${escaped};`, "g"),
                    val
                  };
                  entityCount++;
                }
              } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
                i += 8;
                const { index: index2 } = this.readElementExp(xmlData, i + 1);
                i = index2;
              } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
                i += 8;
              } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
                i += 9;
                const { index: index2 } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
                i = index2;
              } else if (hasSeq(xmlData, "!--", i)) comment = true;
              else throw new Error(`Invalid DOCTYPE`);
              angleBracketsCount++;
              exp = "";
            } else if (xmlData[i] === ">") {
              if (comment) {
                if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                  comment = false;
                  angleBracketsCount--;
                }
              } else {
                angleBracketsCount--;
              }
              if (angleBracketsCount === 0) {
                break;
              }
            } else if (xmlData[i] === "[") {
              hasBody = true;
            } else {
              exp += xmlData[i];
            }
          }
          if (angleBracketsCount !== 0) {
            throw new Error(`Unclosed DOCTYPE`);
          }
        } else {
          throw new Error(`Invalid Tag instead of DOCTYPE`);
        }
        return { entities, i };
      }
      readEntityExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
          i++;
        }
        let entityName = xmlData.substring(startIndex, i);
        validateEntityName(entityName);
        i = skipWhitespace(xmlData, i);
        if (!this.suppressValidationErr) {
          if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
            throw new Error("External entities are not supported");
          } else if (xmlData[i] === "%") {
            throw new Error("Parameter entities are not supported");
          }
        }
        let entityValue = "";
        [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
        if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
          throw new Error(
            `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
          );
        }
        i--;
        return [entityName, entityValue, i];
      }
      readNotationExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let notationName = xmlData.substring(startIndex, i);
        !this.suppressValidationErr && validateEntityName(notationName);
        i = skipWhitespace(xmlData, i);
        const identifierType = xmlData.substring(i, i + 6).toUpperCase();
        if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
          throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
        }
        i += identifierType.length;
        i = skipWhitespace(xmlData, i);
        let publicIdentifier = null;
        let systemIdentifier = null;
        if (identifierType === "PUBLIC") {
          [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
          i = skipWhitespace(xmlData, i);
          if (xmlData[i] === '"' || xmlData[i] === "'") {
            [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
          }
        } else if (identifierType === "SYSTEM") {
          [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
          if (!this.suppressValidationErr && !systemIdentifier) {
            throw new Error("Missing mandatory system identifier for SYSTEM notation");
          }
        }
        return { notationName, publicIdentifier, systemIdentifier, index: --i };
      }
      readIdentifierVal(xmlData, i, type) {
        let identifierVal = "";
        const startChar = xmlData[i];
        if (startChar !== '"' && startChar !== "'") {
          throw new Error(`Expected quoted string, found "${startChar}"`);
        }
        i++;
        const startIndex = i;
        while (i < xmlData.length && xmlData[i] !== startChar) {
          i++;
        }
        identifierVal = xmlData.substring(startIndex, i);
        if (xmlData[i] !== startChar) {
          throw new Error(`Unterminated ${type} value`);
        }
        i++;
        return [i, identifierVal];
      }
      readElementExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let elementName = xmlData.substring(startIndex, i);
        if (!this.suppressValidationErr && !isName(elementName)) {
          throw new Error(`Invalid element name: "${elementName}"`);
        }
        i = skipWhitespace(xmlData, i);
        let contentModel = "";
        if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
        else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
        else if (xmlData[i] === "(") {
          i++;
          const startIndex2 = i;
          while (i < xmlData.length && xmlData[i] !== ")") {
            i++;
          }
          contentModel = xmlData.substring(startIndex2, i);
          if (xmlData[i] !== ")") {
            throw new Error("Unterminated content model");
          }
        } else if (!this.suppressValidationErr) {
          throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
        }
        return {
          elementName,
          contentModel: contentModel.trim(),
          index: i
        };
      }
      readAttlistExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        let startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let elementName = xmlData.substring(startIndex, i);
        validateEntityName(elementName);
        i = skipWhitespace(xmlData, i);
        startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let attributeName = xmlData.substring(startIndex, i);
        if (!validateEntityName(attributeName)) {
          throw new Error(`Invalid attribute name: "${attributeName}"`);
        }
        i = skipWhitespace(xmlData, i);
        let attributeType = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
          attributeType = "NOTATION";
          i += 8;
          i = skipWhitespace(xmlData, i);
          if (xmlData[i] !== "(") {
            throw new Error(`Expected '(', found "${xmlData[i]}"`);
          }
          i++;
          let allowedNotations = [];
          while (i < xmlData.length && xmlData[i] !== ")") {
            const startIndex2 = i;
            while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
              i++;
            }
            let notation = xmlData.substring(startIndex2, i);
            notation = notation.trim();
            if (!validateEntityName(notation)) {
              throw new Error(`Invalid notation name: "${notation}"`);
            }
            allowedNotations.push(notation);
            if (xmlData[i] === "|") {
              i++;
              i = skipWhitespace(xmlData, i);
            }
          }
          if (xmlData[i] !== ")") {
            throw new Error("Unterminated list of notations");
          }
          i++;
          attributeType += " (" + allowedNotations.join("|") + ")";
        } else {
          const startIndex2 = i;
          while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            i++;
          }
          attributeType += xmlData.substring(startIndex2, i);
          const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
          if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
            throw new Error(`Invalid attribute type: "${attributeType}"`);
          }
        }
        i = skipWhitespace(xmlData, i);
        let defaultValue = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
          defaultValue = "#REQUIRED";
          i += 8;
        } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
          defaultValue = "#IMPLIED";
          i += 7;
        } else {
          [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
        }
        return {
          elementName,
          attributeName,
          attributeType,
          defaultValue,
          index: i
        };
      }
    };
    skipWhitespace = (data, index2) => {
      while (index2 < data.length && /\s/.test(data[index2])) {
        index2++;
      }
      return index2;
    };
  }
});

// node_modules/strnum/strnum.js
function toNumber(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string") return str;
  let trimmedStr = str.trim();
  if (trimmedStr.length === 0) return str;
  else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
  else if (trimmedStr === "0") return 0;
  else if (options.hex && hexRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 16);
  } else if (!isFinite(trimmedStr)) {
    return handleInfinity(str, Number(trimmedStr), options);
  } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
    return resolveEnotation(str, trimmedStr, options);
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1] || "";
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      const decimalAdjacentToLeadingZeros = sign ? (
        // 0., -00., 000.
        str[leadingZeros.length + 1] === "."
      ) : str[leadingZeros.length] === ".";
      if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
        return str;
      } else {
        const num = Number(trimmedStr);
        const parsedStr = String(num);
        if (num === 0) return num;
        if (parsedStr.search(/[eE]/) !== -1) {
          if (options.eNotation) return num;
          else return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (parsedStr === "0") return num;
          else if (parsedStr === numTrimmedByZeros) return num;
          else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
          else return str;
        }
        let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
        if (leadingZeros) {
          return n === parsedStr || sign + n === parsedStr ? num : str;
        } else {
          return n === parsedStr || n === sign + parsedStr ? num : str;
        }
      }
    } else {
      return str;
    }
  }
}
function resolveEnotation(str, trimmedStr, options) {
  if (!options.eNotation) return str;
  const notation = trimmedStr.match(eNotationRegx);
  if (notation) {
    let sign = notation[1] || "";
    const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
    const leadingZeros = notation[2];
    const eAdjacentToLeadingZeros = sign ? (
      // 0E.
      str[leadingZeros.length + 1] === eChar
    ) : str[leadingZeros.length] === eChar;
    if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
    else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
      return Number(trimmedStr);
    } else if (leadingZeros.length > 0) {
      if (options.leadingZeros && !eAdjacentToLeadingZeros) {
        trimmedStr = (notation[1] || "") + notation[3];
        return Number(trimmedStr);
      } else return str;
    } else {
      return Number(trimmedStr);
    }
  } else {
    return str;
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    numStr = numStr.replace(/0+$/, "");
    if (numStr === ".") numStr = "0";
    else if (numStr[0] === ".") numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
function parse_int(numStr, base) {
  if (parseInt) return parseInt(numStr, base);
  else if (Number.parseInt) return Number.parseInt(numStr, base);
  else if (window && window.parseInt) return window.parseInt(numStr, base);
  else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
function handleInfinity(str, num, options) {
  const isPositive = num === Infinity;
  switch (options.infinity.toLowerCase()) {
    case "null":
      return null;
    case "infinity":
      return num;
    // Return Infinity or -Infinity
    case "string":
      return isPositive ? "Infinity" : "-Infinity";
    case "original":
    default:
      return str;
  }
}
var hexRegex, numRegex, consider, eNotationRegx;
var init_strnum = __esm({
  "node_modules/strnum/strnum.js"() {
    hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
    numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
    consider = {
      hex: true,
      // oct: false,
      leadingZeros: true,
      decimalPoint: ".",
      eNotation: true,
      //skipLike: /regex/,
      infinity: "original"
      // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
    };
    eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
  }
});

// node_modules/fast-xml-parser/src/ignoreAttributes.js
function getIgnoreAttributesFn(ignoreAttributes) {
  if (typeof ignoreAttributes === "function") {
    return ignoreAttributes;
  }
  if (Array.isArray(ignoreAttributes)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}
var init_ignoreAttributes = __esm({
  "node_modules/fast-xml-parser/src/ignoreAttributes.js"() {
  }
});

// node_modules/path-expression-matcher/src/Expression.js
var Expression;
var init_Expression = __esm({
  "node_modules/path-expression-matcher/src/Expression.js"() {
    Expression = class {
      /**
       * Create a new Expression
       * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
       * @param {Object} options - Configuration options
       * @param {string} options.separator - Path separator (default: '.')
       */
      constructor(pattern, options = {}) {
        this.pattern = pattern;
        this.separator = options.separator || ".";
        this.segments = this._parse(pattern);
        this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
        this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
        this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
      }
      /**
       * Parse pattern string into segments
       * @private
       * @param {string} pattern - Pattern to parse
       * @returns {Array} Array of segment objects
       */
      _parse(pattern) {
        const segments = [];
        let i = 0;
        let currentPart = "";
        while (i < pattern.length) {
          if (pattern[i] === this.separator) {
            if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
              if (currentPart.trim()) {
                segments.push(this._parseSegment(currentPart.trim()));
                currentPart = "";
              }
              segments.push({ type: "deep-wildcard" });
              i += 2;
            } else {
              if (currentPart.trim()) {
                segments.push(this._parseSegment(currentPart.trim()));
              }
              currentPart = "";
              i++;
            }
          } else {
            currentPart += pattern[i];
            i++;
          }
        }
        if (currentPart.trim()) {
          segments.push(this._parseSegment(currentPart.trim()));
        }
        return segments;
      }
      /**
       * Parse a single segment
       * @private
       * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
       * @returns {Object} Segment object
       */
      _parseSegment(part) {
        const segment = { type: "tag" };
        let bracketContent = null;
        let withoutBrackets = part;
        const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
        if (bracketMatch) {
          withoutBrackets = bracketMatch[1] + bracketMatch[3];
          if (bracketMatch[2]) {
            const content = bracketMatch[2].slice(1, -1);
            if (content) {
              bracketContent = content;
            }
          }
        }
        let namespace = void 0;
        let tagAndPosition = withoutBrackets;
        if (withoutBrackets.includes("::")) {
          const nsIndex = withoutBrackets.indexOf("::");
          namespace = withoutBrackets.substring(0, nsIndex).trim();
          tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
          if (!namespace) {
            throw new Error(`Invalid namespace in pattern: ${part}`);
          }
        }
        let tag = void 0;
        let positionMatch = null;
        if (tagAndPosition.includes(":")) {
          const colonIndex = tagAndPosition.lastIndexOf(":");
          const tagPart = tagAndPosition.substring(0, colonIndex).trim();
          const posPart = tagAndPosition.substring(colonIndex + 1).trim();
          const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
          if (isPositionKeyword) {
            tag = tagPart;
            positionMatch = posPart;
          } else {
            tag = tagAndPosition;
          }
        } else {
          tag = tagAndPosition;
        }
        if (!tag) {
          throw new Error(`Invalid segment pattern: ${part}`);
        }
        segment.tag = tag;
        if (namespace) {
          segment.namespace = namespace;
        }
        if (bracketContent) {
          if (bracketContent.includes("=")) {
            const eqIndex = bracketContent.indexOf("=");
            segment.attrName = bracketContent.substring(0, eqIndex).trim();
            segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
          } else {
            segment.attrName = bracketContent.trim();
          }
        }
        if (positionMatch) {
          const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
          if (nthMatch) {
            segment.position = "nth";
            segment.positionValue = parseInt(nthMatch[1], 10);
          } else {
            segment.position = positionMatch;
          }
        }
        return segment;
      }
      /**
       * Get the number of segments
       * @returns {number}
       */
      get length() {
        return this.segments.length;
      }
      /**
       * Check if expression contains deep wildcard
       * @returns {boolean}
       */
      hasDeepWildcard() {
        return this._hasDeepWildcard;
      }
      /**
       * Check if expression has attribute conditions
       * @returns {boolean}
       */
      hasAttributeCondition() {
        return this._hasAttributeCondition;
      }
      /**
       * Check if expression has position selectors
       * @returns {boolean}
       */
      hasPositionSelector() {
        return this._hasPositionSelector;
      }
      /**
       * Get string representation
       * @returns {string}
       */
      toString() {
        return this.pattern;
      }
    };
  }
});

// node_modules/path-expression-matcher/src/Matcher.js
var MUTATING_METHODS, Matcher;
var init_Matcher = __esm({
  "node_modules/path-expression-matcher/src/Matcher.js"() {
    MUTATING_METHODS = /* @__PURE__ */ new Set(["push", "pop", "reset", "updateCurrent", "restore"]);
    Matcher = class {
      /**
       * Create a new Matcher
       * @param {Object} options - Configuration options
       * @param {string} options.separator - Default path separator (default: '.')
       */
      constructor(options = {}) {
        this.separator = options.separator || ".";
        this.path = [];
        this.siblingStacks = [];
      }
      /**
       * Push a new tag onto the path
       * @param {string} tagName - Name of the tag
       * @param {Object} attrValues - Attribute key-value pairs for current node (optional)
       * @param {string} namespace - Namespace for the tag (optional)
       */
      push(tagName, attrValues = null, namespace = null) {
        this._pathStringCache = null;
        if (this.path.length > 0) {
          const prev = this.path[this.path.length - 1];
          prev.values = void 0;
        }
        const currentLevel = this.path.length;
        if (!this.siblingStacks[currentLevel]) {
          this.siblingStacks[currentLevel] = /* @__PURE__ */ new Map();
        }
        const siblings = this.siblingStacks[currentLevel];
        const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
        const counter = siblings.get(siblingKey) || 0;
        let position = 0;
        for (const count of siblings.values()) {
          position += count;
        }
        siblings.set(siblingKey, counter + 1);
        const node = {
          tag: tagName,
          position,
          counter
        };
        if (namespace !== null && namespace !== void 0) {
          node.namespace = namespace;
        }
        if (attrValues !== null && attrValues !== void 0) {
          node.values = attrValues;
        }
        this.path.push(node);
      }
      /**
       * Pop the last tag from the path
       * @returns {Object|undefined} The popped node
       */
      pop() {
        if (this.path.length === 0) {
          return void 0;
        }
        this._pathStringCache = null;
        const node = this.path.pop();
        if (this.siblingStacks.length > this.path.length + 1) {
          this.siblingStacks.length = this.path.length + 1;
        }
        return node;
      }
      /**
       * Update current node's attribute values
       * Useful when attributes are parsed after push
       * @param {Object} attrValues - Attribute values
       */
      updateCurrent(attrValues) {
        if (this.path.length > 0) {
          const current = this.path[this.path.length - 1];
          if (attrValues !== null && attrValues !== void 0) {
            current.values = attrValues;
          }
        }
      }
      /**
       * Get current tag name
       * @returns {string|undefined}
       */
      getCurrentTag() {
        return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
      }
      /**
       * Get current namespace
       * @returns {string|undefined}
       */
      getCurrentNamespace() {
        return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
      }
      /**
       * Get current node's attribute value
       * @param {string} attrName - Attribute name
       * @returns {*} Attribute value or undefined
       */
      getAttrValue(attrName) {
        if (this.path.length === 0) return void 0;
        const current = this.path[this.path.length - 1];
        return current.values?.[attrName];
      }
      /**
       * Check if current node has an attribute
       * @param {string} attrName - Attribute name
       * @returns {boolean}
       */
      hasAttr(attrName) {
        if (this.path.length === 0) return false;
        const current = this.path[this.path.length - 1];
        return current.values !== void 0 && attrName in current.values;
      }
      /**
       * Get current node's sibling position (child index in parent)
       * @returns {number}
       */
      getPosition() {
        if (this.path.length === 0) return -1;
        return this.path[this.path.length - 1].position ?? 0;
      }
      /**
       * Get current node's repeat counter (occurrence count of this tag name)
       * @returns {number}
       */
      getCounter() {
        if (this.path.length === 0) return -1;
        return this.path[this.path.length - 1].counter ?? 0;
      }
      /**
       * Get current node's sibling index (alias for getPosition for backward compatibility)
       * @returns {number}
       * @deprecated Use getPosition() or getCounter() instead
       */
      getIndex() {
        return this.getPosition();
      }
      /**
       * Get current path depth
       * @returns {number}
       */
      getDepth() {
        return this.path.length;
      }
      /**
       * Get path as string
       * @param {string} separator - Optional separator (uses default if not provided)
       * @param {boolean} includeNamespace - Whether to include namespace in output (default: true)
       * @returns {string}
       */
      toString(separator, includeNamespace = true) {
        const sep = separator || this.separator;
        const isDefault = sep === this.separator && includeNamespace === true;
        if (isDefault) {
          if (this._pathStringCache !== null && this._pathStringCache !== void 0) {
            return this._pathStringCache;
          }
          const result = this.path.map(
            (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
          ).join(sep);
          this._pathStringCache = result;
          return result;
        }
        return this.path.map(
          (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
        ).join(sep);
      }
      /**
       * Get path as array of tag names
       * @returns {string[]}
       */
      toArray() {
        return this.path.map((n) => n.tag);
      }
      /**
       * Reset the path to empty
       */
      reset() {
        this._pathStringCache = null;
        this.path = [];
        this.siblingStacks = [];
      }
      /**
       * Match current path against an Expression
       * @param {Expression} expression - The expression to match against
       * @returns {boolean} True if current path matches the expression
       */
      matches(expression) {
        const segments = expression.segments;
        if (segments.length === 0) {
          return false;
        }
        if (expression.hasDeepWildcard()) {
          return this._matchWithDeepWildcard(segments);
        }
        return this._matchSimple(segments);
      }
      /**
       * Match simple path (no deep wildcards)
       * @private
       */
      _matchSimple(segments) {
        if (this.path.length !== segments.length) {
          return false;
        }
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          const node = this.path[i];
          const isCurrentNode = i === this.path.length - 1;
          if (!this._matchSegment(segment, node, isCurrentNode)) {
            return false;
          }
        }
        return true;
      }
      /**
       * Match path with deep wildcards
       * @private
       */
      _matchWithDeepWildcard(segments) {
        let pathIdx = this.path.length - 1;
        let segIdx = segments.length - 1;
        while (segIdx >= 0 && pathIdx >= 0) {
          const segment = segments[segIdx];
          if (segment.type === "deep-wildcard") {
            segIdx--;
            if (segIdx < 0) {
              return true;
            }
            const nextSeg = segments[segIdx];
            let found = false;
            for (let i = pathIdx; i >= 0; i--) {
              const isCurrentNode = i === this.path.length - 1;
              if (this._matchSegment(nextSeg, this.path[i], isCurrentNode)) {
                pathIdx = i - 1;
                segIdx--;
                found = true;
                break;
              }
            }
            if (!found) {
              return false;
            }
          } else {
            const isCurrentNode = pathIdx === this.path.length - 1;
            if (!this._matchSegment(segment, this.path[pathIdx], isCurrentNode)) {
              return false;
            }
            pathIdx--;
            segIdx--;
          }
        }
        return segIdx < 0;
      }
      /**
       * Match a single segment against a node
       * @private
       * @param {Object} segment - Segment from Expression
       * @param {Object} node - Node from path
       * @param {boolean} isCurrentNode - Whether this is the current (last) node
       * @returns {boolean}
       */
      _matchSegment(segment, node, isCurrentNode) {
        if (segment.tag !== "*" && segment.tag !== node.tag) {
          return false;
        }
        if (segment.namespace !== void 0) {
          if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
            return false;
          }
        }
        if (segment.attrName !== void 0) {
          if (!isCurrentNode) {
            return false;
          }
          if (!node.values || !(segment.attrName in node.values)) {
            return false;
          }
          if (segment.attrValue !== void 0) {
            const actualValue = node.values[segment.attrName];
            if (String(actualValue) !== String(segment.attrValue)) {
              return false;
            }
          }
        }
        if (segment.position !== void 0) {
          if (!isCurrentNode) {
            return false;
          }
          const counter = node.counter ?? 0;
          if (segment.position === "first" && counter !== 0) {
            return false;
          } else if (segment.position === "odd" && counter % 2 !== 1) {
            return false;
          } else if (segment.position === "even" && counter % 2 !== 0) {
            return false;
          } else if (segment.position === "nth") {
            if (counter !== segment.positionValue) {
              return false;
            }
          }
        }
        return true;
      }
      /**
       * Create a snapshot of current state
       * @returns {Object} State snapshot
       */
      snapshot() {
        return {
          path: this.path.map((node) => ({ ...node })),
          siblingStacks: this.siblingStacks.map((map) => new Map(map))
        };
      }
      /**
       * Restore state from snapshot
       * @param {Object} snapshot - State snapshot
       */
      restore(snapshot) {
        this._pathStringCache = null;
        this.path = snapshot.path.map((node) => ({ ...node }));
        this.siblingStacks = snapshot.siblingStacks.map((map) => new Map(map));
      }
      /**
       * Return a read-only view of this matcher.
       *
       * The returned object exposes all query/inspection methods but throws a
       * TypeError if any state-mutating method is called (`push`, `pop`, `reset`,
       * `updateCurrent`, `restore`).  Property reads (e.g. `.path`, `.separator`)
       * are allowed but the returned arrays/objects are frozen so callers cannot
       * mutate internal state through them either.
       *
       * @returns {ReadOnlyMatcher} A proxy that forwards read operations and blocks writes.
       *
       * @example
       * const matcher = new Matcher();
       * matcher.push("root", {});
       *
       * const ro = matcher.readOnly();
       * ro.matches(expr);      // ✓ works
       * ro.getCurrentTag();    // ✓ works
       * ro.push("child", {}); // ✗ throws TypeError
       * ro.reset();            // ✗ throws TypeError
       */
      readOnly() {
        const self2 = this;
        return new Proxy(self2, {
          get(target, prop, receiver) {
            if (MUTATING_METHODS.has(prop)) {
              return () => {
                throw new TypeError(
                  `Cannot call '${prop}' on a read-only Matcher. Obtain a writable instance to mutate state.`
                );
              };
            }
            const value = Reflect.get(target, prop, receiver);
            if (prop === "path" || prop === "siblingStacks") {
              return Object.freeze(
                Array.isArray(value) ? value.map(
                  (item) => item instanceof Map ? Object.freeze(new Map(item)) : Object.freeze({ ...item })
                  // freeze a copy of each node
                ) : value
              );
            }
            if (typeof value === "function") {
              return value.bind(target);
            }
            return value;
          },
          // Prevent any property assignment on the read-only view
          set(_target, prop) {
            throw new TypeError(
              `Cannot set property '${String(prop)}' on a read-only Matcher.`
            );
          },
          // Prevent property deletion
          deleteProperty(_target, prop) {
            throw new TypeError(
              `Cannot delete property '${String(prop)}' from a read-only Matcher.`
            );
          }
        });
      }
    };
  }
});

// node_modules/path-expression-matcher/src/index.js
var init_src = __esm({
  "node_modules/path-expression-matcher/src/index.js"() {
    init_Expression();
    init_Matcher();
  }
});

// node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
function extractRawAttributes(prefixedAttrs, options) {
  if (!prefixedAttrs) return {};
  const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
  if (!attrs) return {};
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(options.attributeNamePrefix)) {
      const rawName = key.substring(options.attributeNamePrefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function extractNamespace(rawTagName) {
  if (!rawTagName || typeof rawTagName !== "string") return void 0;
  const colonIndex = rawTagName.indexOf(":");
  if (colonIndex !== -1 && colonIndex > 0) {
    const ns = rawTagName.substring(0, colonIndex);
    if (ns !== "xmlns") {
      return ns;
    }
  }
  return void 0;
}
function addExternalEntities(externalEntities) {
  const entKeys = Object.keys(externalEntities);
  for (let i = 0; i < entKeys.length; i++) {
    const ent = entKeys[i];
    const escaped = ent.replace(/[.\-+*:]/g, "\\.");
    this.lastEntities[ent] = {
      regex: new RegExp("&" + escaped + ";", "g"),
      val: externalEntities[ent]
    };
  }
}
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  if (val !== void 0) {
    if (this.options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      const newval = this.options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
      if (newval === null || newval === void 0) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (this.options.trimValues) {
        return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
function buildAttributesMap(attrStr, jPath, tagName) {
  if (this.options.ignoreAttributes !== true && typeof attrStr === "string") {
    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    const processedVals = new Array(len);
    let hasRawAttrs = false;
    const rawAttrsForMatcher = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      const oldVal = matches[i][4];
      if (attrName.length && oldVal !== void 0) {
        let val = oldVal;
        if (this.options.trimValues) val = val.trim();
        val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
        processedVals[i] = val;
        rawAttrsForMatcher[attrName] = val;
        hasRawAttrs = true;
      }
    }
    if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
      jPath.updateCurrent(rawAttrsForMatcher);
    }
    const jPathStr = this.options.jPath ? jPath.toString() : this.readonlyMatcher;
    let hasAttrs = false;
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
      let aName = this.options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (this.options.transformAttributeName) {
          aName = this.options.transformAttributeName(aName);
        }
        aName = sanitizeName(aName, this.options);
        if (matches[i][4] !== void 0) {
          const oldVal = processedVals[i];
          const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPathStr);
          if (newVal === null || newVal === void 0) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(oldVal, this.options.parseAttributeValue, this.options.numberParseOptions);
          }
          hasAttrs = true;
        } else if (this.options.allowBooleanAttributes) {
          attrs[aName] = true;
          hasAttrs = true;
        }
      }
    }
    if (!hasAttrs) return;
    if (this.options.attributesGroupName) {
      const attrCollection = {};
      attrCollection[this.options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
function addChild(currentNode, childNode, matcher, startIndex) {
  if (!this.options.captureMetaData) startIndex = void 0;
  const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
  const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
  if (result === false) {
  } else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}
function replaceEntitiesValue(val, tagName, jPath) {
  const entityConfig = this.options.processEntities;
  if (!entityConfig || !entityConfig.enabled) {
    return val;
  }
  if (entityConfig.allowedTags) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
    if (!allowed) {
      return val;
    }
  }
  if (entityConfig.tagFilter) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
      return val;
    }
  }
  for (const entityName of Object.keys(this.docTypeEntities)) {
    const entity = this.docTypeEntities[entityName];
    const matches = val.match(entity.regx);
    if (matches) {
      this.entityExpansionCount += matches.length;
      if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
        throw new Error(
          `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
        );
      }
      const lengthBefore = val.length;
      val = val.replace(entity.regx, entity.val);
      if (entityConfig.maxExpandedLength) {
        this.currentExpandedLength += val.length - lengthBefore;
        if (this.currentExpandedLength > entityConfig.maxExpandedLength) {
          throw new Error(
            `Total expanded content size exceeded: ${this.currentExpandedLength} > ${entityConfig.maxExpandedLength}`
          );
        }
      }
    }
  }
  if (val.indexOf("&") === -1) return val;
  for (const entityName of Object.keys(this.lastEntities)) {
    const entity = this.lastEntities[entityName];
    const matches = val.match(entity.regex);
    if (matches) {
      this.entityExpansionCount += matches.length;
      if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
        throw new Error(
          `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
        );
      }
    }
    val = val.replace(entity.regex, entity.val);
  }
  if (val.indexOf("&") === -1) return val;
  if (this.options.htmlEntities) {
    for (const entityName of Object.keys(this.htmlEntities)) {
      const entity = this.htmlEntities[entityName];
      const matches = val.match(entity.regex);
      if (matches) {
        this.entityExpansionCount += matches.length;
        if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
          throw new Error(
            `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
          );
        }
      }
      val = val.replace(entity.regex, entity.val);
    }
  }
  val = val.replace(this.ampEntity.regex, this.ampEntity.val);
  return val;
}
function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
  if (textData) {
    if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
    textData = this.parseTextData(
      textData,
      parentNode.tagname,
      matcher,
      false,
      parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
      isLeafNode
    );
    if (textData !== void 0 && textData !== "")
      parentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode(stopNodeExpressions, matcher) {
  if (!stopNodeExpressions || stopNodeExpressions.length === 0) return false;
  for (let i = 0; i < stopNodeExpressions.length; i++) {
    if (matcher.matches(stopNodeExpressions[i])) {
      return true;
    }
  }
  return false;
}
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary;
  let tagExp = "";
  for (let index2 = i; index2 < xmlData.length; index2++) {
    let ch = xmlData[index2];
    if (attrBoundary) {
      if (ch === attrBoundary) attrBoundary = "";
    } else if (ch === '"' || ch === "'") {
      attrBoundary = ch;
    } else if (ch === closingChar[0]) {
      if (closingChar[1]) {
        if (xmlData[index2 + 1] === closingChar[1]) {
          return {
            data: tagExp,
            index: index2
          };
        }
      } else {
        return {
          data: tagExp,
          index: index2
        };
      }
    } else if (ch === "	") {
      ch = " ";
    }
    tagExp += ch;
  }
}
function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }
  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent,
    rawTagName
  };
}
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  let openTagCount = 1;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === "<") {
      if (xmlData[i + 1] === "/") {
        const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            };
          }
        }
        i = closeIndex;
      } else if (xmlData[i + 1] === "?") {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 3) === "!--") {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 2) === "![") {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, ">");
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true") return true;
    else if (newval === "false") return false;
    else return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}
function fromCodePoint(str, base, prefix) {
  const codePoint = Number.parseInt(str, base);
  if (codePoint >= 0 && codePoint <= 1114111) {
    return String.fromCodePoint(codePoint);
  } else {
    return prefix + str + ";";
  }
}
function transformTagName(fn, tagName, tagExp, options) {
  if (fn) {
    const newTagName = fn(tagName);
    if (tagExp === tagName) {
      tagExp = newTagName;
    }
    tagName = newTagName;
  }
  tagName = sanitizeName(tagName, options);
  return { tagName, tagExp };
}
function sanitizeName(name, options) {
  if (criticalProperties.includes(name)) {
    throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return options.onDangerousProperty(name);
  }
  return name;
}
var OrderedObjParser, attrsRegx, parseXml;
var init_OrderedObjParser = __esm({
  "node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js"() {
    "use strict";
    init_util();
    init_xmlNode();
    init_DocTypeReader();
    init_strnum();
    init_ignoreAttributes();
    init_src();
    OrderedObjParser = class {
      constructor(options) {
        this.options = options;
        this.currentNode = null;
        this.tagsNodeStack = [];
        this.docTypeEntities = {};
        this.lastEntities = {
          "apos": { regex: /&(apos|#39|#x27);/g, val: "'" },
          "gt": { regex: /&(gt|#62|#x3E);/g, val: ">" },
          "lt": { regex: /&(lt|#60|#x3C);/g, val: "<" },
          "quot": { regex: /&(quot|#34|#x22);/g, val: '"' }
        };
        this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
        this.htmlEntities = {
          "space": { regex: /&(nbsp|#160);/g, val: " " },
          // "lt" : { regex: /&(lt|#60);/g, val: "<" },
          // "gt" : { regex: /&(gt|#62);/g, val: ">" },
          // "amp" : { regex: /&(amp|#38);/g, val: "&" },
          // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
          // "apos" : { regex: /&(apos|#39);/g, val: "'" },
          "cent": { regex: /&(cent|#162);/g, val: "\xA2" },
          "pound": { regex: /&(pound|#163);/g, val: "\xA3" },
          "yen": { regex: /&(yen|#165);/g, val: "\xA5" },
          "euro": { regex: /&(euro|#8364);/g, val: "\u20AC" },
          "copyright": { regex: /&(copy|#169);/g, val: "\xA9" },
          "reg": { regex: /&(reg|#174);/g, val: "\xAE" },
          "inr": { regex: /&(inr|#8377);/g, val: "\u20B9" },
          "num_dec": { regex: /&#([0-9]{1,7});/g, val: (_, str) => fromCodePoint(str, 10, "&#") },
          "num_hex": { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, str) => fromCodePoint(str, 16, "&#x") }
        };
        this.addExternalEntities = addExternalEntities;
        this.parseXml = parseXml;
        this.parseTextData = parseTextData;
        this.resolveNameSpace = resolveNameSpace;
        this.buildAttributesMap = buildAttributesMap;
        this.isItStopNode = isItStopNode;
        this.replaceEntitiesValue = replaceEntitiesValue;
        this.readStopNodeData = readStopNodeData;
        this.saveTextToParentTag = saveTextToParentTag;
        this.addChild = addChild;
        this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
        this.entityExpansionCount = 0;
        this.currentExpandedLength = 0;
        this.matcher = new Matcher();
        this.readonlyMatcher = this.matcher.readOnly();
        this.isCurrentNodeStopNode = false;
        if (this.options.stopNodes && this.options.stopNodes.length > 0) {
          this.stopNodeExpressions = [];
          for (let i = 0; i < this.options.stopNodes.length; i++) {
            const stopNodeExp = this.options.stopNodes[i];
            if (typeof stopNodeExp === "string") {
              this.stopNodeExpressions.push(new Expression(stopNodeExp));
            } else if (stopNodeExp instanceof Expression) {
              this.stopNodeExpressions.push(stopNodeExp);
            }
          }
        }
      }
    };
    attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
    parseXml = function(xmlData) {
      xmlData = xmlData.replace(/\r\n?/g, "\n");
      const xmlObj = new XmlNode("!xml");
      let currentNode = xmlObj;
      let textData = "";
      this.matcher.reset();
      this.entityExpansionCount = 0;
      this.currentExpandedLength = 0;
      const docTypeReader = new DocTypeReader(this.options.processEntities);
      for (let i = 0; i < xmlData.length; i++) {
        const ch = xmlData[i];
        if (ch === "<") {
          if (xmlData[i + 1] === "/") {
            const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
            let tagName = xmlData.substring(i + 2, closeIndex).trim();
            if (this.options.removeNSPrefix) {
              const colonIndex = tagName.indexOf(":");
              if (colonIndex !== -1) {
                tagName = tagName.substr(colonIndex + 1);
              }
            }
            tagName = transformTagName(this.options.transformTagName, tagName, "", this.options).tagName;
            if (currentNode) {
              textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            }
            const lastTagName = this.matcher.getCurrentTag();
            if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) {
              throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
            }
            if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
              this.matcher.pop();
              this.tagsNodeStack.pop();
            }
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            currentNode = this.tagsNodeStack.pop();
            textData = "";
            i = closeIndex;
          } else if (xmlData[i + 1] === "?") {
            let tagData = readTagExp(xmlData, i, false, "?>");
            if (!tagData) throw new Error("Pi Tag is not closed.");
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags) {
            } else {
              const childNode = new XmlNode(tagData.tagName);
              childNode.add(this.options.textNodeName, "");
              if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName);
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, i);
            }
            i = tagData.closeIndex + 1;
          } else if (xmlData.substr(i + 1, 3) === "!--") {
            const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
            if (this.options.commentPropName) {
              const comment = xmlData.substring(i + 4, endIndex - 2);
              textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
              currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
            }
            i = endIndex;
          } else if (xmlData.substr(i + 1, 2) === "!D") {
            const result = docTypeReader.readDocType(xmlData, i);
            this.docTypeEntities = result.entities;
            i = result.i;
          } else if (xmlData.substr(i + 1, 2) === "![") {
            const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
            const tagExp = xmlData.substring(i + 9, closeIndex);
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
            if (val == void 0) val = "";
            if (this.options.cdataPropName) {
              currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
            } else {
              currentNode.add(this.options.textNodeName, val);
            }
            i = closeIndex + 2;
          } else {
            let result = readTagExp(xmlData, i, this.options.removeNSPrefix);
            if (!result) {
              const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlData.length, i + 50));
              throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
            }
            let tagName = result.tagName;
            const rawTagName = result.rawTagName;
            let tagExp = result.tagExp;
            let attrExpPresent = result.attrExpPresent;
            let closeIndex = result.closeIndex;
            ({ tagName, tagExp } = transformTagName(this.options.transformTagName, tagName, tagExp, this.options));
            if (this.options.strictReservedNames && (tagName === this.options.commentPropName || tagName === this.options.cdataPropName || tagName === this.options.textNodeName || tagName === this.options.attributesGroupName)) {
              throw new Error(`Invalid tag name: ${tagName}`);
            }
            if (currentNode && textData) {
              if (currentNode.tagname !== "!xml") {
                textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
              }
            }
            const lastTag = currentNode;
            if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
              currentNode = this.tagsNodeStack.pop();
              this.matcher.pop();
            }
            let isSelfClosing = false;
            if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
              isSelfClosing = true;
              if (tagName[tagName.length - 1] === "/") {
                tagName = tagName.substr(0, tagName.length - 1);
                tagExp = tagName;
              } else {
                tagExp = tagExp.substr(0, tagExp.length - 1);
              }
              attrExpPresent = tagName !== tagExp;
            }
            let prefixedAttrs = null;
            let rawAttrs = {};
            let namespace = void 0;
            namespace = extractNamespace(rawTagName);
            if (tagName !== xmlObj.tagname) {
              this.matcher.push(tagName, {}, namespace);
            }
            if (tagName !== tagExp && attrExpPresent) {
              prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
              if (prefixedAttrs) {
                rawAttrs = extractRawAttributes(prefixedAttrs, this.options);
              }
            }
            if (tagName !== xmlObj.tagname) {
              this.isCurrentNodeStopNode = this.isItStopNode(this.stopNodeExpressions, this.matcher);
            }
            const startIndex = i;
            if (this.isCurrentNodeStopNode) {
              let tagContent = "";
              if (isSelfClosing) {
                i = result.closeIndex;
              } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
                i = result.closeIndex;
              } else {
                const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
                if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
                i = result2.i;
                tagContent = result2.tagContent;
              }
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              childNode.add(this.options.textNodeName, tagContent);
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            } else {
              if (isSelfClosing) {
                ({ tagName, tagExp } = transformTagName(this.options.transformTagName, tagName, tagExp, this.options));
                const childNode = new XmlNode(tagName);
                if (prefixedAttrs) {
                  childNode[":@"] = prefixedAttrs;
                }
                this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
                this.matcher.pop();
                this.isCurrentNodeStopNode = false;
              } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
                const childNode = new XmlNode(tagName);
                if (prefixedAttrs) {
                  childNode[":@"] = prefixedAttrs;
                }
                this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
                this.matcher.pop();
                this.isCurrentNodeStopNode = false;
                i = result.closeIndex;
                continue;
              } else {
                const childNode = new XmlNode(tagName);
                if (this.tagsNodeStack.length > this.options.maxNestedTags) {
                  throw new Error("Maximum nested tags exceeded");
                }
                this.tagsNodeStack.push(currentNode);
                if (prefixedAttrs) {
                  childNode[":@"] = prefixedAttrs;
                }
                this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
                currentNode = childNode;
              }
              textData = "";
              i = closeIndex;
            }
          }
        } else {
          textData += xmlData[i];
        }
      }
      return xmlObj.child;
    };
  }
});

// node_modules/fast-xml-parser/src/xmlparser/node2json.js
function stripAttributePrefix(attrs, prefix) {
  if (!attrs || typeof attrs !== "object") return {};
  if (!prefix) return attrs;
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(prefix)) {
      const rawName = key.substring(prefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function prettify(node, options, matcher, readonlyMatcher) {
  return compress(node, options, matcher, readonlyMatcher);
}
function compress(arr, options, matcher, readonlyMatcher) {
  let text;
  const compressedObj = {};
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);
    if (property !== void 0 && property !== options.textNodeName) {
      const rawAttrs = stripAttributePrefix(
        tagObj[":@"] || {},
        options.attributeNamePrefix
      );
      matcher.push(property, rawAttrs);
    }
    if (property === options.textNodeName) {
      if (text === void 0) text = tagObj[property];
      else text += "" + tagObj[property];
    } else if (property === void 0) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, matcher, readonlyMatcher);
      const isLeaf = isLeafTag(val, options);
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }
      if (tagObj[METADATA_SYMBOL2] !== void 0 && typeof val === "object" && val !== null) {
        val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
      }
      if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
        if (options.isArray(property, jPathOrMatcher, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
      if (property !== void 0 && property !== options.textNodeName) {
        matcher.pop();
      }
    }
  }
  if (typeof text === "string") {
    if (text.length > 0) compressedObj[options.textNodeName] = text;
  } else if (text !== void 0) compressedObj[options.textNodeName] = text;
  return compressedObj;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@") return key;
  }
}
function assignAttributes(obj, attrMap, readonlyMatcher, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];
      const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
      const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
      if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  if (propCount === 0) {
    return true;
  }
  if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
    return true;
  }
  return false;
}
var METADATA_SYMBOL2;
var init_node2json = __esm({
  "node_modules/fast-xml-parser/src/xmlparser/node2json.js"() {
    "use strict";
    init_xmlNode();
    METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
  }
});

// node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var XMLParser;
var init_XMLParser = __esm({
  "node_modules/fast-xml-parser/src/xmlparser/XMLParser.js"() {
    init_OptionsBuilder();
    init_OrderedObjParser();
    init_node2json();
    init_validator();
    init_xmlNode();
    XMLParser = class {
      constructor(options) {
        this.externalEntities = {};
        this.options = buildOptions(options);
      }
      /**
       * Parse XML dats to JS object 
       * @param {string|Uint8Array} xmlData 
       * @param {boolean|Object} validationOption 
       */
      parse(xmlData, validationOption) {
        if (typeof xmlData !== "string" && xmlData.toString) {
          xmlData = xmlData.toString();
        } else if (typeof xmlData !== "string") {
          throw new Error("XML data is accepted in String or Bytes[] form.");
        }
        if (validationOption) {
          if (validationOption === true) validationOption = {};
          const result = validate(xmlData, validationOption);
          if (result !== true) {
            throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
          }
        }
        const orderedObjParser = new OrderedObjParser(this.options);
        orderedObjParser.addExternalEntities(this.externalEntities);
        const orderedResult = orderedObjParser.parseXml(xmlData);
        if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
        else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
      }
      /**
       * Add Entity which is not by default supported by this library
       * @param {string} key 
       * @param {string} value 
       */
      addEntity(key, value) {
        if (value.indexOf("&") !== -1) {
          throw new Error("Entity value can't have '&'");
        } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
          throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
        } else if (value === "&") {
          throw new Error("An entity with value '&' is not permitted");
        } else {
          this.externalEntities[key] = value;
        }
      }
      /**
       * Returns a Symbol that can be used to access the metadata
       * property on a node.
       * 
       * If Symbol is not available in the environment, an ordinary property is used
       * and the name of the property is here returned.
       * 
       * The XMLMetaData property is only present when `captureMetaData`
       * is true in the options.
       */
      static getMetaDataSymbol() {
        return XmlNode.getMetaDataSymbol();
      }
    };
  }
});

// node_modules/fast-xml-builder/src/orderedJs2Xml.js
function toXml(jArray, options) {
  let indentation = "";
  if (options.format && options.indentBy.length > 0) {
    indentation = EOL;
  }
  const stopNodeExpressions = [];
  if (options.stopNodes && Array.isArray(options.stopNodes)) {
    for (let i = 0; i < options.stopNodes.length; i++) {
      const node = options.stopNodes[i];
      if (typeof node === "string") {
        stopNodeExpressions.push(new Expression(node));
      } else if (node instanceof Expression) {
        stopNodeExpressions.push(node);
      }
    }
  }
  const matcher = new Matcher();
  return arrToStr(jArray, options, indentation, matcher, stopNodeExpressions);
}
function arrToStr(arr, options, indentation, matcher, stopNodeExpressions) {
  let xmlStr = "";
  let isPreviousElementTag = false;
  if (options.maxNestedTags && matcher.getDepth() > options.maxNestedTags) {
    throw new Error("Maximum nested tags exceeded");
  }
  if (!Array.isArray(arr)) {
    if (arr !== void 0 && arr !== null) {
      let text = arr.toString();
      text = replaceEntitiesValue2(text, options);
      return text;
    }
    return "";
  }
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const tagName = propName2(tagObj);
    if (tagName === void 0) continue;
    const attrValues = extractAttributeValues(tagObj[":@"], options);
    matcher.push(tagName, attrValues);
    const isStopNode = checkStopNode(matcher, stopNodeExpressions);
    if (tagName === options.textNodeName) {
      let tagText = tagObj[tagName];
      if (!isStopNode) {
        tagText = options.tagValueProcessor(tagName, tagText);
        tagText = replaceEntitiesValue2(tagText, options);
      }
      if (isPreviousElementTag) {
        xmlStr += indentation;
      }
      xmlStr += tagText;
      isPreviousElementTag = false;
      matcher.pop();
      continue;
    } else if (tagName === options.cdataPropName) {
      if (isPreviousElementTag) {
        xmlStr += indentation;
      }
      xmlStr += `<![CDATA[${tagObj[tagName][0][options.textNodeName]}]]>`;
      isPreviousElementTag = false;
      matcher.pop();
      continue;
    } else if (tagName === options.commentPropName) {
      xmlStr += indentation + `<!--${tagObj[tagName][0][options.textNodeName]}-->`;
      isPreviousElementTag = true;
      matcher.pop();
      continue;
    } else if (tagName[0] === "?") {
      const attStr2 = attr_to_str(tagObj[":@"], options, isStopNode);
      const tempInd = tagName === "?xml" ? "" : indentation;
      let piTextNodeName = tagObj[tagName][0][options.textNodeName];
      piTextNodeName = piTextNodeName.length !== 0 ? " " + piTextNodeName : "";
      xmlStr += tempInd + `<${tagName}${piTextNodeName}${attStr2}?>`;
      isPreviousElementTag = true;
      matcher.pop();
      continue;
    }
    let newIdentation = indentation;
    if (newIdentation !== "") {
      newIdentation += options.indentBy;
    }
    const attStr = attr_to_str(tagObj[":@"], options, isStopNode);
    const tagStart = indentation + `<${tagName}${attStr}`;
    let tagValue;
    if (isStopNode) {
      tagValue = getRawContent(tagObj[tagName], options);
    } else {
      tagValue = arrToStr(tagObj[tagName], options, newIdentation, matcher, stopNodeExpressions);
    }
    if (options.unpairedTags.indexOf(tagName) !== -1) {
      if (options.suppressUnpairedNode) xmlStr += tagStart + ">";
      else xmlStr += tagStart + "/>";
    } else if ((!tagValue || tagValue.length === 0) && options.suppressEmptyNode) {
      xmlStr += tagStart + "/>";
    } else if (tagValue && tagValue.endsWith(">")) {
      xmlStr += tagStart + `>${tagValue}${indentation}</${tagName}>`;
    } else {
      xmlStr += tagStart + ">";
      if (tagValue && indentation !== "" && (tagValue.includes("/>") || tagValue.includes("</"))) {
        xmlStr += indentation + options.indentBy + tagValue + indentation;
      } else {
        xmlStr += tagValue;
      }
      xmlStr += `</${tagName}>`;
    }
    isPreviousElementTag = true;
    matcher.pop();
  }
  return xmlStr;
}
function extractAttributeValues(attrMap, options) {
  if (!attrMap || options.ignoreAttributes) return null;
  const attrValues = {};
  let hasAttrs = false;
  for (let attr in attrMap) {
    if (!Object.prototype.hasOwnProperty.call(attrMap, attr)) continue;
    const cleanAttrName = attr.startsWith(options.attributeNamePrefix) ? attr.substr(options.attributeNamePrefix.length) : attr;
    attrValues[cleanAttrName] = attrMap[attr];
    hasAttrs = true;
  }
  return hasAttrs ? attrValues : null;
}
function getRawContent(arr, options) {
  if (!Array.isArray(arr)) {
    if (arr !== void 0 && arr !== null) {
      return arr.toString();
    }
    return "";
  }
  let content = "";
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const tagName = propName2(item);
    if (tagName === options.textNodeName) {
      content += item[tagName];
    } else if (tagName === options.cdataPropName) {
      content += item[tagName][0][options.textNodeName];
    } else if (tagName === options.commentPropName) {
      content += item[tagName][0][options.textNodeName];
    } else if (tagName && tagName[0] === "?") {
      continue;
    } else if (tagName) {
      const attStr = attr_to_str_raw(item[":@"], options);
      const nestedContent = getRawContent(item[tagName], options);
      if (!nestedContent || nestedContent.length === 0) {
        content += `<${tagName}${attStr}/>`;
      } else {
        content += `<${tagName}${attStr}>${nestedContent}</${tagName}>`;
      }
    }
  }
  return content;
}
function attr_to_str_raw(attrMap, options) {
  let attrStr = "";
  if (attrMap && !options.ignoreAttributes) {
    for (let attr in attrMap) {
      if (!Object.prototype.hasOwnProperty.call(attrMap, attr)) continue;
      let attrVal = attrMap[attr];
      if (attrVal === true && options.suppressBooleanAttributes) {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}`;
      } else {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
      }
    }
  }
  return attrStr;
}
function propName2(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (key !== ":@") return key;
  }
}
function attr_to_str(attrMap, options, isStopNode) {
  let attrStr = "";
  if (attrMap && !options.ignoreAttributes) {
    for (let attr in attrMap) {
      if (!Object.prototype.hasOwnProperty.call(attrMap, attr)) continue;
      let attrVal;
      if (isStopNode) {
        attrVal = attrMap[attr];
      } else {
        attrVal = options.attributeValueProcessor(attr, attrMap[attr]);
        attrVal = replaceEntitiesValue2(attrVal, options);
      }
      if (attrVal === true && options.suppressBooleanAttributes) {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}`;
      } else {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
      }
    }
  }
  return attrStr;
}
function checkStopNode(matcher, stopNodeExpressions) {
  if (!stopNodeExpressions || stopNodeExpressions.length === 0) return false;
  for (let i = 0; i < stopNodeExpressions.length; i++) {
    if (matcher.matches(stopNodeExpressions[i])) {
      return true;
    }
  }
  return false;
}
function replaceEntitiesValue2(textValue, options) {
  if (textValue && textValue.length > 0 && options.processEntities) {
    for (let i = 0; i < options.entities.length; i++) {
      const entity = options.entities[i];
      textValue = textValue.replace(entity.regex, entity.val);
    }
  }
  return textValue;
}
var EOL;
var init_orderedJs2Xml = __esm({
  "node_modules/fast-xml-builder/src/orderedJs2Xml.js"() {
    init_src();
    EOL = "\n";
  }
});

// node_modules/fast-xml-builder/src/ignoreAttributes.js
function getIgnoreAttributesFn2(ignoreAttributes) {
  if (typeof ignoreAttributes === "function") {
    return ignoreAttributes;
  }
  if (Array.isArray(ignoreAttributes)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}
var init_ignoreAttributes2 = __esm({
  "node_modules/fast-xml-builder/src/ignoreAttributes.js"() {
  }
});

// node_modules/fast-xml-builder/src/fxb.js
function Builder(options) {
  this.options = Object.assign({}, defaultOptions3, options);
  if (this.options.stopNodes && Array.isArray(this.options.stopNodes)) {
    this.options.stopNodes = this.options.stopNodes.map((node) => {
      if (typeof node === "string" && node.startsWith("*.")) {
        return ".." + node.substring(2);
      }
      return node;
    });
  }
  this.stopNodeExpressions = [];
  if (this.options.stopNodes && Array.isArray(this.options.stopNodes)) {
    for (let i = 0; i < this.options.stopNodes.length; i++) {
      const node = this.options.stopNodes[i];
      if (typeof node === "string") {
        this.stopNodeExpressions.push(new Expression(node));
      } else if (node instanceof Expression) {
        this.stopNodeExpressions.push(node);
      }
    }
  }
  if (this.options.ignoreAttributes === true || this.options.attributesGroupName) {
    this.isAttribute = function() {
      return false;
    };
  } else {
    this.ignoreAttributesFn = getIgnoreAttributesFn2(this.options.ignoreAttributes);
    this.attrPrefixLen = this.options.attributeNamePrefix.length;
    this.isAttribute = isAttribute;
  }
  this.processTextOrObjNode = processTextOrObjNode;
  if (this.options.format) {
    this.indentate = indentate;
    this.tagEndChar = ">\n";
    this.newLine = "\n";
  } else {
    this.indentate = function() {
      return "";
    };
    this.tagEndChar = ">";
    this.newLine = "";
  }
}
function processTextOrObjNode(object, key, level, matcher) {
  const attrValues = this.extractAttributes(object);
  matcher.push(key, attrValues);
  const isStopNode = this.checkStopNode(matcher);
  if (isStopNode) {
    const rawContent = this.buildRawContent(object);
    const attrStr = this.buildAttributesForStopNode(object);
    matcher.pop();
    return this.buildObjectNode(rawContent, key, attrStr, level);
  }
  const result = this.j2x(object, level + 1, matcher);
  matcher.pop();
  if (object[this.options.textNodeName] !== void 0 && Object.keys(object).length === 1) {
    return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level, matcher);
  } else {
    return this.buildObjectNode(result.val, key, result.attrStr, level);
  }
}
function indentate(level) {
  return this.options.indentBy.repeat(level);
}
function isAttribute(name) {
  if (name.startsWith(this.options.attributeNamePrefix) && name !== this.options.textNodeName) {
    return name.substr(this.attrPrefixLen);
  } else {
    return false;
  }
}
var defaultOptions3;
var init_fxb = __esm({
  "node_modules/fast-xml-builder/src/fxb.js"() {
    "use strict";
    init_orderedJs2Xml();
    init_ignoreAttributes2();
    init_src();
    defaultOptions3 = {
      attributeNamePrefix: "@_",
      attributesGroupName: false,
      textNodeName: "#text",
      ignoreAttributes: true,
      cdataPropName: false,
      format: false,
      indentBy: "  ",
      suppressEmptyNode: false,
      suppressUnpairedNode: true,
      suppressBooleanAttributes: true,
      tagValueProcessor: function(key, a) {
        return a;
      },
      attributeValueProcessor: function(attrName, a) {
        return a;
      },
      preserveOrder: false,
      commentPropName: false,
      unpairedTags: [],
      entities: [
        { regex: new RegExp("&", "g"), val: "&amp;" },
        //it must be on top
        { regex: new RegExp(">", "g"), val: "&gt;" },
        { regex: new RegExp("<", "g"), val: "&lt;" },
        { regex: new RegExp("'", "g"), val: "&apos;" },
        { regex: new RegExp('"', "g"), val: "&quot;" }
      ],
      processEntities: true,
      stopNodes: [],
      // transformTagName: false,
      // transformAttributeName: false,
      oneListGroup: false,
      maxNestedTags: 100,
      jPath: true
      // When true, callbacks receive string jPath; when false, receive Matcher instance
    };
    Builder.prototype.build = function(jObj) {
      if (this.options.preserveOrder) {
        return toXml(jObj, this.options);
      } else {
        if (Array.isArray(jObj) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1) {
          jObj = {
            [this.options.arrayNodeName]: jObj
          };
        }
        const matcher = new Matcher();
        return this.j2x(jObj, 0, matcher).val;
      }
    };
    Builder.prototype.j2x = function(jObj, level, matcher) {
      let attrStr = "";
      let val = "";
      if (this.options.maxNestedTags && matcher.getDepth() >= this.options.maxNestedTags) {
        throw new Error("Maximum nested tags exceeded");
      }
      const jPath = this.options.jPath ? matcher.toString() : matcher;
      const isCurrentStopNode = this.checkStopNode(matcher);
      for (let key in jObj) {
        if (!Object.prototype.hasOwnProperty.call(jObj, key)) continue;
        if (typeof jObj[key] === "undefined") {
          if (this.isAttribute(key)) {
            val += "";
          }
        } else if (jObj[key] === null) {
          if (this.isAttribute(key)) {
            val += "";
          } else if (key === this.options.cdataPropName) {
            val += "";
          } else if (key[0] === "?") {
            val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
          } else {
            val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
          }
        } else if (jObj[key] instanceof Date) {
          val += this.buildTextValNode(jObj[key], key, "", level, matcher);
        } else if (typeof jObj[key] !== "object") {
          const attr = this.isAttribute(key);
          if (attr && !this.ignoreAttributesFn(attr, jPath)) {
            attrStr += this.buildAttrPairStr(attr, "" + jObj[key], isCurrentStopNode);
          } else if (!attr) {
            if (key === this.options.textNodeName) {
              let newval = this.options.tagValueProcessor(key, "" + jObj[key]);
              val += this.replaceEntitiesValue(newval);
            } else {
              matcher.push(key);
              const isStopNode = this.checkStopNode(matcher);
              matcher.pop();
              if (isStopNode) {
                const textValue = "" + jObj[key];
                if (textValue === "") {
                  val += this.indentate(level) + "<" + key + this.closeTag(key) + this.tagEndChar;
                } else {
                  val += this.indentate(level) + "<" + key + ">" + textValue + "</" + key + this.tagEndChar;
                }
              } else {
                val += this.buildTextValNode(jObj[key], key, "", level, matcher);
              }
            }
          }
        } else if (Array.isArray(jObj[key])) {
          const arrLen = jObj[key].length;
          let listTagVal = "";
          let listTagAttr = "";
          for (let j = 0; j < arrLen; j++) {
            const item = jObj[key][j];
            if (typeof item === "undefined") {
            } else if (item === null) {
              if (key[0] === "?") val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
              else val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
            } else if (typeof item === "object") {
              if (this.options.oneListGroup) {
                matcher.push(key);
                const result = this.j2x(item, level + 1, matcher);
                matcher.pop();
                listTagVal += result.val;
                if (this.options.attributesGroupName && item.hasOwnProperty(this.options.attributesGroupName)) {
                  listTagAttr += result.attrStr;
                }
              } else {
                listTagVal += this.processTextOrObjNode(item, key, level, matcher);
              }
            } else {
              if (this.options.oneListGroup) {
                let textValue = this.options.tagValueProcessor(key, item);
                textValue = this.replaceEntitiesValue(textValue);
                listTagVal += textValue;
              } else {
                matcher.push(key);
                const isStopNode = this.checkStopNode(matcher);
                matcher.pop();
                if (isStopNode) {
                  const textValue = "" + item;
                  if (textValue === "") {
                    listTagVal += this.indentate(level) + "<" + key + this.closeTag(key) + this.tagEndChar;
                  } else {
                    listTagVal += this.indentate(level) + "<" + key + ">" + textValue + "</" + key + this.tagEndChar;
                  }
                } else {
                  listTagVal += this.buildTextValNode(item, key, "", level, matcher);
                }
              }
            }
          }
          if (this.options.oneListGroup) {
            listTagVal = this.buildObjectNode(listTagVal, key, listTagAttr, level);
          }
          val += listTagVal;
        } else {
          if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
            const Ks = Object.keys(jObj[key]);
            const L = Ks.length;
            for (let j = 0; j < L; j++) {
              attrStr += this.buildAttrPairStr(Ks[j], "" + jObj[key][Ks[j]], isCurrentStopNode);
            }
          } else {
            val += this.processTextOrObjNode(jObj[key], key, level, matcher);
          }
        }
      }
      return { attrStr, val };
    };
    Builder.prototype.buildAttrPairStr = function(attrName, val, isStopNode) {
      if (!isStopNode) {
        val = this.options.attributeValueProcessor(attrName, "" + val);
        val = this.replaceEntitiesValue(val);
      }
      if (this.options.suppressBooleanAttributes && val === "true") {
        return " " + attrName;
      } else return " " + attrName + '="' + val + '"';
    };
    Builder.prototype.extractAttributes = function(obj) {
      if (!obj || typeof obj !== "object") return null;
      const attrValues = {};
      let hasAttrs = false;
      if (this.options.attributesGroupName && obj[this.options.attributesGroupName]) {
        const attrGroup = obj[this.options.attributesGroupName];
        for (let attrKey in attrGroup) {
          if (!Object.prototype.hasOwnProperty.call(attrGroup, attrKey)) continue;
          const cleanKey = attrKey.startsWith(this.options.attributeNamePrefix) ? attrKey.substring(this.options.attributeNamePrefix.length) : attrKey;
          attrValues[cleanKey] = attrGroup[attrKey];
          hasAttrs = true;
        }
      } else {
        for (let key in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
          const attr = this.isAttribute(key);
          if (attr) {
            attrValues[attr] = obj[key];
            hasAttrs = true;
          }
        }
      }
      return hasAttrs ? attrValues : null;
    };
    Builder.prototype.buildRawContent = function(obj) {
      if (typeof obj === "string") {
        return obj;
      }
      if (typeof obj !== "object" || obj === null) {
        return String(obj);
      }
      if (obj[this.options.textNodeName] !== void 0) {
        return obj[this.options.textNodeName];
      }
      let content = "";
      for (let key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        if (this.isAttribute(key)) continue;
        if (this.options.attributesGroupName && key === this.options.attributesGroupName) continue;
        const value = obj[key];
        if (key === this.options.textNodeName) {
          content += value;
        } else if (Array.isArray(value)) {
          for (let item of value) {
            if (typeof item === "string" || typeof item === "number") {
              content += `<${key}>${item}</${key}>`;
            } else if (typeof item === "object" && item !== null) {
              const nestedContent = this.buildRawContent(item);
              const nestedAttrs = this.buildAttributesForStopNode(item);
              if (nestedContent === "") {
                content += `<${key}${nestedAttrs}/>`;
              } else {
                content += `<${key}${nestedAttrs}>${nestedContent}</${key}>`;
              }
            }
          }
        } else if (typeof value === "object" && value !== null) {
          const nestedContent = this.buildRawContent(value);
          const nestedAttrs = this.buildAttributesForStopNode(value);
          if (nestedContent === "") {
            content += `<${key}${nestedAttrs}/>`;
          } else {
            content += `<${key}${nestedAttrs}>${nestedContent}</${key}>`;
          }
        } else {
          content += `<${key}>${value}</${key}>`;
        }
      }
      return content;
    };
    Builder.prototype.buildAttributesForStopNode = function(obj) {
      if (!obj || typeof obj !== "object") return "";
      let attrStr = "";
      if (this.options.attributesGroupName && obj[this.options.attributesGroupName]) {
        const attrGroup = obj[this.options.attributesGroupName];
        for (let attrKey in attrGroup) {
          if (!Object.prototype.hasOwnProperty.call(attrGroup, attrKey)) continue;
          const cleanKey = attrKey.startsWith(this.options.attributeNamePrefix) ? attrKey.substring(this.options.attributeNamePrefix.length) : attrKey;
          const val = attrGroup[attrKey];
          if (val === true && this.options.suppressBooleanAttributes) {
            attrStr += " " + cleanKey;
          } else {
            attrStr += " " + cleanKey + '="' + val + '"';
          }
        }
      } else {
        for (let key in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
          const attr = this.isAttribute(key);
          if (attr) {
            const val = obj[key];
            if (val === true && this.options.suppressBooleanAttributes) {
              attrStr += " " + attr;
            } else {
              attrStr += " " + attr + '="' + val + '"';
            }
          }
        }
      }
      return attrStr;
    };
    Builder.prototype.buildObjectNode = function(val, key, attrStr, level) {
      if (val === "") {
        if (key[0] === "?") return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
        else {
          return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
        }
      } else {
        let tagEndExp = "</" + key + this.tagEndChar;
        let piClosingChar = "";
        if (key[0] === "?") {
          piClosingChar = "?";
          tagEndExp = "";
        }
        if ((attrStr || attrStr === "") && val.indexOf("<") === -1) {
          return this.indentate(level) + "<" + key + attrStr + piClosingChar + ">" + val + tagEndExp;
        } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
          return this.indentate(level) + `<!--${val}-->` + this.newLine;
        } else {
          return this.indentate(level) + "<" + key + attrStr + piClosingChar + this.tagEndChar + val + this.indentate(level) + tagEndExp;
        }
      }
    };
    Builder.prototype.closeTag = function(key) {
      let closeTag = "";
      if (this.options.unpairedTags.indexOf(key) !== -1) {
        if (!this.options.suppressUnpairedNode) closeTag = "/";
      } else if (this.options.suppressEmptyNode) {
        closeTag = "/";
      } else {
        closeTag = `></${key}`;
      }
      return closeTag;
    };
    Builder.prototype.checkStopNode = function(matcher) {
      if (!this.stopNodeExpressions || this.stopNodeExpressions.length === 0) return false;
      for (let i = 0; i < this.stopNodeExpressions.length; i++) {
        if (matcher.matches(this.stopNodeExpressions[i])) {
          return true;
        }
      }
      return false;
    };
    Builder.prototype.buildTextValNode = function(val, key, attrStr, level, matcher) {
      if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
        return this.indentate(level) + `<![CDATA[${val}]]>` + this.newLine;
      } else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
        return this.indentate(level) + `<!--${val}-->` + this.newLine;
      } else if (key[0] === "?") {
        return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
      } else {
        let textValue = this.options.tagValueProcessor(key, val);
        textValue = this.replaceEntitiesValue(textValue);
        if (textValue === "") {
          return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
        } else {
          return this.indentate(level) + "<" + key + attrStr + ">" + textValue + "</" + key + this.tagEndChar;
        }
      }
    };
    Builder.prototype.replaceEntitiesValue = function(textValue) {
      if (textValue && textValue.length > 0 && this.options.processEntities) {
        for (let i = 0; i < this.options.entities.length; i++) {
          const entity = this.options.entities[i];
          textValue = textValue.replace(entity.regex, entity.val);
        }
      }
      return textValue;
    };
  }
});

// node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js
var json2xml_default;
var init_json2xml = __esm({
  "node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js"() {
    init_fxb();
    init_fxb();
    json2xml_default = Builder;
  }
});

// node_modules/fast-xml-parser/src/fxp.js
var fxp_exports = {};
__export(fxp_exports, {
  XMLBuilder: () => json2xml_default,
  XMLParser: () => XMLParser,
  XMLValidator: () => XMLValidator
});
var XMLValidator;
var init_fxp = __esm({
  "node_modules/fast-xml-parser/src/fxp.js"() {
    "use strict";
    init_validator();
    init_XMLParser();
    init_json2xml();
    XMLValidator = {
      validate
    };
  }
});

// node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign(
      {},
      require_env_options(),
      require_cli_options()(process.argv)
    )
  );
})();

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// agent/AgentLogger.ts
var AgentLogger = class {
  constructor(reportId, sendFn) {
    this.logPosition = 0;
    this.reportId = reportId;
    this.sendFn = sendFn;
  }
  log(event) {
    const fullEvent = {
      ...event,
      timestamp: Date.now()
    };
    this.sendFn("LOG_STREAM", {
      reportId: this.reportId,
      position: this.logPosition++,
      log: fullEvent
    });
  }
  progress(event) {
    this.sendFn("PROGRESS_STREAM", {
      reportId: this.reportId,
      progress: event
    });
  }
  complete(summary) {
    const { status, passRate, totalCases, passedCases, failedCases, reportId } = summary;
    const statusIcon = status === "COMPLETED" ? "\u2705" : status === "FAILED" ? "\u274C" : "\u26D4";
    console.log(`[AGENT] ${statusIcon} Execution finished for report: ${reportId} | Status: ${status} | Pass Rate: ${passRate}% | Stats: ${passedCases}/${totalCases} passed`);
    this.sendFn("EXECUTION_COMPLETE", {
      reportId,
      status,
      passRate,
      totalCases,
      passedCases,
      failedCases
    });
  }
};

// server/modules/execution/interpolator.ts
var import_dayjs = __toESM(require_dayjs_min(), 1);
var import_utc = __toESM(require_utc(), 1);
var import_timezone = __toESM(require_timezone(), 1);
import crypto from "crypto";

// node_modules/jsonpath-plus/dist/index-node-esm.js
import vm from "vm";
var Hooks = class {
  /**
   * @callback HookCallback
   * @this {*|Jsep} this
   * @param {Jsep} env
   * @returns: void
   */
  /**
   * Adds the given callback to the list of callbacks for the given hook.
   *
   * The callback will be invoked when the hook it is registered for is run.
   *
   * One callback function can be registered to multiple hooks and the same hook multiple times.
   *
   * @param {string|object} name The name of the hook, or an object of callbacks keyed by name
   * @param {HookCallback|boolean} callback The callback function which is given environment variables.
   * @param {?boolean} [first=false] Will add the hook to the top of the list (defaults to the bottom)
   * @public
   */
  add(name, callback, first) {
    if (typeof arguments[0] != "string") {
      for (let name2 in arguments[0]) {
        this.add(name2, arguments[0][name2], arguments[1]);
      }
    } else {
      (Array.isArray(name) ? name : [name]).forEach(function(name2) {
        this[name2] = this[name2] || [];
        if (callback) {
          this[name2][first ? "unshift" : "push"](callback);
        }
      }, this);
    }
  }
  /**
   * Runs a hook invoking all registered callbacks with the given environment variables.
   *
   * Callbacks will be invoked synchronously and in the order in which they were registered.
   *
   * @param {string} name The name of the hook.
   * @param {Object<string, any>} env The environment variables of the hook passed to all callbacks registered.
   * @public
   */
  run(name, env) {
    this[name] = this[name] || [];
    this[name].forEach(function(callback) {
      callback.call(env && env.context ? env.context : env, env);
    });
  }
};
var Plugins = class {
  constructor(jsep2) {
    this.jsep = jsep2;
    this.registered = {};
  }
  /**
   * @callback PluginSetup
   * @this {Jsep} jsep
   * @returns: void
   */
  /**
   * Adds the given plugin(s) to the registry
   *
   * @param {object} plugins
   * @param {string} plugins.name The name of the plugin
   * @param {PluginSetup} plugins.init The init function
   * @public
   */
  register(...plugins) {
    plugins.forEach((plugin2) => {
      if (typeof plugin2 !== "object" || !plugin2.name || !plugin2.init) {
        throw new Error("Invalid JSEP plugin format");
      }
      if (this.registered[plugin2.name]) {
        return;
      }
      plugin2.init(this.jsep);
      this.registered[plugin2.name] = plugin2;
    });
  }
};
var Jsep = class _Jsep {
  /**
   * @returns {string}
   */
  static get version() {
    return "1.4.0";
  }
  /**
   * @returns {string}
   */
  static toString() {
    return "JavaScript Expression Parser (JSEP) v" + _Jsep.version;
  }
  // ==================== CONFIG ================================
  /**
   * @method addUnaryOp
   * @param {string} op_name The name of the unary op to add
   * @returns {Jsep}
   */
  static addUnaryOp(op_name) {
    _Jsep.max_unop_len = Math.max(op_name.length, _Jsep.max_unop_len);
    _Jsep.unary_ops[op_name] = 1;
    return _Jsep;
  }
  /**
   * @method jsep.addBinaryOp
   * @param {string} op_name The name of the binary op to add
   * @param {number} precedence The precedence of the binary op (can be a float). Higher number = higher precedence
   * @param {boolean} [isRightAssociative=false] whether operator is right-associative
   * @returns {Jsep}
   */
  static addBinaryOp(op_name, precedence, isRightAssociative) {
    _Jsep.max_binop_len = Math.max(op_name.length, _Jsep.max_binop_len);
    _Jsep.binary_ops[op_name] = precedence;
    if (isRightAssociative) {
      _Jsep.right_associative.add(op_name);
    } else {
      _Jsep.right_associative.delete(op_name);
    }
    return _Jsep;
  }
  /**
   * @method addIdentifierChar
   * @param {string} char The additional character to treat as a valid part of an identifier
   * @returns {Jsep}
   */
  static addIdentifierChar(char) {
    _Jsep.additional_identifier_chars.add(char);
    return _Jsep;
  }
  /**
   * @method addLiteral
   * @param {string} literal_name The name of the literal to add
   * @param {*} literal_value The value of the literal
   * @returns {Jsep}
   */
  static addLiteral(literal_name, literal_value) {
    _Jsep.literals[literal_name] = literal_value;
    return _Jsep;
  }
  /**
   * @method removeUnaryOp
   * @param {string} op_name The name of the unary op to remove
   * @returns {Jsep}
   */
  static removeUnaryOp(op_name) {
    delete _Jsep.unary_ops[op_name];
    if (op_name.length === _Jsep.max_unop_len) {
      _Jsep.max_unop_len = _Jsep.getMaxKeyLen(_Jsep.unary_ops);
    }
    return _Jsep;
  }
  /**
   * @method removeAllUnaryOps
   * @returns {Jsep}
   */
  static removeAllUnaryOps() {
    _Jsep.unary_ops = {};
    _Jsep.max_unop_len = 0;
    return _Jsep;
  }
  /**
   * @method removeIdentifierChar
   * @param {string} char The additional character to stop treating as a valid part of an identifier
   * @returns {Jsep}
   */
  static removeIdentifierChar(char) {
    _Jsep.additional_identifier_chars.delete(char);
    return _Jsep;
  }
  /**
   * @method removeBinaryOp
   * @param {string} op_name The name of the binary op to remove
   * @returns {Jsep}
   */
  static removeBinaryOp(op_name) {
    delete _Jsep.binary_ops[op_name];
    if (op_name.length === _Jsep.max_binop_len) {
      _Jsep.max_binop_len = _Jsep.getMaxKeyLen(_Jsep.binary_ops);
    }
    _Jsep.right_associative.delete(op_name);
    return _Jsep;
  }
  /**
   * @method removeAllBinaryOps
   * @returns {Jsep}
   */
  static removeAllBinaryOps() {
    _Jsep.binary_ops = {};
    _Jsep.max_binop_len = 0;
    return _Jsep;
  }
  /**
   * @method removeLiteral
   * @param {string} literal_name The name of the literal to remove
   * @returns {Jsep}
   */
  static removeLiteral(literal_name) {
    delete _Jsep.literals[literal_name];
    return _Jsep;
  }
  /**
   * @method removeAllLiterals
   * @returns {Jsep}
   */
  static removeAllLiterals() {
    _Jsep.literals = {};
    return _Jsep;
  }
  // ==================== END CONFIG ============================
  /**
   * @returns {string}
   */
  get char() {
    return this.expr.charAt(this.index);
  }
  /**
   * @returns {number}
   */
  get code() {
    return this.expr.charCodeAt(this.index);
  }
  /**
   * @param {string} expr a string with the passed in express
   * @returns Jsep
   */
  constructor(expr) {
    this.expr = expr;
    this.index = 0;
  }
  /**
   * static top-level parser
   * @returns {jsep.Expression}
   */
  static parse(expr) {
    return new _Jsep(expr).parse();
  }
  /**
   * Get the longest key length of any object
   * @param {object} obj
   * @returns {number}
   */
  static getMaxKeyLen(obj) {
    return Math.max(0, ...Object.keys(obj).map((k) => k.length));
  }
  /**
   * `ch` is a character code in the next three functions
   * @param {number} ch
   * @returns {boolean}
   */
  static isDecimalDigit(ch) {
    return ch >= 48 && ch <= 57;
  }
  /**
   * Returns the precedence of a binary operator or `0` if it isn't a binary operator. Can be float.
   * @param {string} op_val
   * @returns {number}
   */
  static binaryPrecedence(op_val) {
    return _Jsep.binary_ops[op_val] || 0;
  }
  /**
   * Looks for start of identifier
   * @param {number} ch
   * @returns {boolean}
   */
  static isIdentifierStart(ch) {
    return ch >= 65 && ch <= 90 || // A...Z
    ch >= 97 && ch <= 122 || // a...z
    ch >= 128 && !_Jsep.binary_ops[String.fromCharCode(ch)] || // any non-ASCII that is not an operator
    _Jsep.additional_identifier_chars.has(String.fromCharCode(ch));
  }
  /**
   * @param {number} ch
   * @returns {boolean}
   */
  static isIdentifierPart(ch) {
    return _Jsep.isIdentifierStart(ch) || _Jsep.isDecimalDigit(ch);
  }
  /**
   * throw error at index of the expression
   * @param {string} message
   * @throws
   */
  throwError(message) {
    const error = new Error(message + " at character " + this.index);
    error.index = this.index;
    error.description = message;
    throw error;
  }
  /**
   * Run a given hook
   * @param {string} name
   * @param {jsep.Expression|false} [node]
   * @returns {?jsep.Expression}
   */
  runHook(name, node) {
    if (_Jsep.hooks[name]) {
      const env = {
        context: this,
        node
      };
      _Jsep.hooks.run(name, env);
      return env.node;
    }
    return node;
  }
  /**
   * Runs a given hook until one returns a node
   * @param {string} name
   * @returns {?jsep.Expression}
   */
  searchHook(name) {
    if (_Jsep.hooks[name]) {
      const env = {
        context: this
      };
      _Jsep.hooks[name].find(function(callback) {
        callback.call(env.context, env);
        return env.node;
      });
      return env.node;
    }
  }
  /**
   * Push `index` up to the next non-space character
   */
  gobbleSpaces() {
    let ch = this.code;
    while (ch === _Jsep.SPACE_CODE || ch === _Jsep.TAB_CODE || ch === _Jsep.LF_CODE || ch === _Jsep.CR_CODE) {
      ch = this.expr.charCodeAt(++this.index);
    }
    this.runHook("gobble-spaces");
  }
  /**
   * Top-level method to parse all expressions and returns compound or single node
   * @returns {jsep.Expression}
   */
  parse() {
    this.runHook("before-all");
    const nodes = this.gobbleExpressions();
    const node = nodes.length === 1 ? nodes[0] : {
      type: _Jsep.COMPOUND,
      body: nodes
    };
    return this.runHook("after-all", node);
  }
  /**
   * top-level parser (but can be reused within as well)
   * @param {number} [untilICode]
   * @returns {jsep.Expression[]}
   */
  gobbleExpressions(untilICode) {
    let nodes = [], ch_i, node;
    while (this.index < this.expr.length) {
      ch_i = this.code;
      if (ch_i === _Jsep.SEMCOL_CODE || ch_i === _Jsep.COMMA_CODE) {
        this.index++;
      } else {
        if (node = this.gobbleExpression()) {
          nodes.push(node);
        } else if (this.index < this.expr.length) {
          if (ch_i === untilICode) {
            break;
          }
          this.throwError('Unexpected "' + this.char + '"');
        }
      }
    }
    return nodes;
  }
  /**
   * The main parsing function.
   * @returns {?jsep.Expression}
   */
  gobbleExpression() {
    const node = this.searchHook("gobble-expression") || this.gobbleBinaryExpression();
    this.gobbleSpaces();
    return this.runHook("after-expression", node);
  }
  /**
   * Search for the operation portion of the string (e.g. `+`, `===`)
   * Start by taking the longest possible binary operations (3 characters: `===`, `!==`, `>>>`)
   * and move down from 3 to 2 to 1 character until a matching binary operation is found
   * then, return that binary operation
   * @returns {string|boolean}
   */
  gobbleBinaryOp() {
    this.gobbleSpaces();
    let to_check = this.expr.substr(this.index, _Jsep.max_binop_len);
    let tc_len = to_check.length;
    while (tc_len > 0) {
      if (_Jsep.binary_ops.hasOwnProperty(to_check) && (!_Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !_Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
        this.index += tc_len;
        return to_check;
      }
      to_check = to_check.substr(0, --tc_len);
    }
    return false;
  }
  /**
   * This function is responsible for gobbling an individual expression,
   * e.g. `1`, `1+2`, `a+(b*2)-Math.sqrt(2)`
   * @returns {?jsep.BinaryExpression}
   */
  gobbleBinaryExpression() {
    let node, biop, prec, stack, biop_info, left, right, i, cur_biop;
    left = this.gobbleToken();
    if (!left) {
      return left;
    }
    biop = this.gobbleBinaryOp();
    if (!biop) {
      return left;
    }
    biop_info = {
      value: biop,
      prec: _Jsep.binaryPrecedence(biop),
      right_a: _Jsep.right_associative.has(biop)
    };
    right = this.gobbleToken();
    if (!right) {
      this.throwError("Expected expression after " + biop);
    }
    stack = [left, biop_info, right];
    while (biop = this.gobbleBinaryOp()) {
      prec = _Jsep.binaryPrecedence(biop);
      if (prec === 0) {
        this.index -= biop.length;
        break;
      }
      biop_info = {
        value: biop,
        prec,
        right_a: _Jsep.right_associative.has(biop)
      };
      cur_biop = biop;
      const comparePrev = (prev) => biop_info.right_a && prev.right_a ? prec > prev.prec : prec <= prev.prec;
      while (stack.length > 2 && comparePrev(stack[stack.length - 2])) {
        right = stack.pop();
        biop = stack.pop().value;
        left = stack.pop();
        node = {
          type: _Jsep.BINARY_EXP,
          operator: biop,
          left,
          right
        };
        stack.push(node);
      }
      node = this.gobbleToken();
      if (!node) {
        this.throwError("Expected expression after " + cur_biop);
      }
      stack.push(biop_info, node);
    }
    i = stack.length - 1;
    node = stack[i];
    while (i > 1) {
      node = {
        type: _Jsep.BINARY_EXP,
        operator: stack[i - 1].value,
        left: stack[i - 2],
        right: node
      };
      i -= 2;
    }
    return node;
  }
  /**
   * An individual part of a binary expression:
   * e.g. `foo.bar(baz)`, `1`, `"abc"`, `(a % 2)` (because it's in parenthesis)
   * @returns {boolean|jsep.Expression}
   */
  gobbleToken() {
    let ch, to_check, tc_len, node;
    this.gobbleSpaces();
    node = this.searchHook("gobble-token");
    if (node) {
      return this.runHook("after-token", node);
    }
    ch = this.code;
    if (_Jsep.isDecimalDigit(ch) || ch === _Jsep.PERIOD_CODE) {
      return this.gobbleNumericLiteral();
    }
    if (ch === _Jsep.SQUOTE_CODE || ch === _Jsep.DQUOTE_CODE) {
      node = this.gobbleStringLiteral();
    } else if (ch === _Jsep.OBRACK_CODE) {
      node = this.gobbleArray();
    } else {
      to_check = this.expr.substr(this.index, _Jsep.max_unop_len);
      tc_len = to_check.length;
      while (tc_len > 0) {
        if (_Jsep.unary_ops.hasOwnProperty(to_check) && (!_Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !_Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
          this.index += tc_len;
          const argument = this.gobbleToken();
          if (!argument) {
            this.throwError("missing unaryOp argument");
          }
          return this.runHook("after-token", {
            type: _Jsep.UNARY_EXP,
            operator: to_check,
            argument,
            prefix: true
          });
        }
        to_check = to_check.substr(0, --tc_len);
      }
      if (_Jsep.isIdentifierStart(ch)) {
        node = this.gobbleIdentifier();
        if (_Jsep.literals.hasOwnProperty(node.name)) {
          node = {
            type: _Jsep.LITERAL,
            value: _Jsep.literals[node.name],
            raw: node.name
          };
        } else if (node.name === _Jsep.this_str) {
          node = {
            type: _Jsep.THIS_EXP
          };
        }
      } else if (ch === _Jsep.OPAREN_CODE) {
        node = this.gobbleGroup();
      }
    }
    if (!node) {
      return this.runHook("after-token", false);
    }
    node = this.gobbleTokenProperty(node);
    return this.runHook("after-token", node);
  }
  /**
   * Gobble properties of of identifiers/strings/arrays/groups.
   * e.g. `foo`, `bar.baz`, `foo['bar'].baz`
   * It also gobbles function calls:
   * e.g. `Math.acos(obj.angle)`
   * @param {jsep.Expression} node
   * @returns {jsep.Expression}
   */
  gobbleTokenProperty(node) {
    this.gobbleSpaces();
    let ch = this.code;
    while (ch === _Jsep.PERIOD_CODE || ch === _Jsep.OBRACK_CODE || ch === _Jsep.OPAREN_CODE || ch === _Jsep.QUMARK_CODE) {
      let optional;
      if (ch === _Jsep.QUMARK_CODE) {
        if (this.expr.charCodeAt(this.index + 1) !== _Jsep.PERIOD_CODE) {
          break;
        }
        optional = true;
        this.index += 2;
        this.gobbleSpaces();
        ch = this.code;
      }
      this.index++;
      if (ch === _Jsep.OBRACK_CODE) {
        node = {
          type: _Jsep.MEMBER_EXP,
          computed: true,
          object: node,
          property: this.gobbleExpression()
        };
        if (!node.property) {
          this.throwError('Unexpected "' + this.char + '"');
        }
        this.gobbleSpaces();
        ch = this.code;
        if (ch !== _Jsep.CBRACK_CODE) {
          this.throwError("Unclosed [");
        }
        this.index++;
      } else if (ch === _Jsep.OPAREN_CODE) {
        node = {
          type: _Jsep.CALL_EXP,
          "arguments": this.gobbleArguments(_Jsep.CPAREN_CODE),
          callee: node
        };
      } else if (ch === _Jsep.PERIOD_CODE || optional) {
        if (optional) {
          this.index--;
        }
        this.gobbleSpaces();
        node = {
          type: _Jsep.MEMBER_EXP,
          computed: false,
          object: node,
          property: this.gobbleIdentifier()
        };
      }
      if (optional) {
        node.optional = true;
      }
      this.gobbleSpaces();
      ch = this.code;
    }
    return node;
  }
  /**
   * Parse simple numeric literals: `12`, `3.4`, `.5`. Do this by using a string to
   * keep track of everything in the numeric literal and then calling `parseFloat` on that string
   * @returns {jsep.Literal}
   */
  gobbleNumericLiteral() {
    let number = "", ch, chCode;
    while (_Jsep.isDecimalDigit(this.code)) {
      number += this.expr.charAt(this.index++);
    }
    if (this.code === _Jsep.PERIOD_CODE) {
      number += this.expr.charAt(this.index++);
      while (_Jsep.isDecimalDigit(this.code)) {
        number += this.expr.charAt(this.index++);
      }
    }
    ch = this.char;
    if (ch === "e" || ch === "E") {
      number += this.expr.charAt(this.index++);
      ch = this.char;
      if (ch === "+" || ch === "-") {
        number += this.expr.charAt(this.index++);
      }
      while (_Jsep.isDecimalDigit(this.code)) {
        number += this.expr.charAt(this.index++);
      }
      if (!_Jsep.isDecimalDigit(this.expr.charCodeAt(this.index - 1))) {
        this.throwError("Expected exponent (" + number + this.char + ")");
      }
    }
    chCode = this.code;
    if (_Jsep.isIdentifierStart(chCode)) {
      this.throwError("Variable names cannot start with a number (" + number + this.char + ")");
    } else if (chCode === _Jsep.PERIOD_CODE || number.length === 1 && number.charCodeAt(0) === _Jsep.PERIOD_CODE) {
      this.throwError("Unexpected period");
    }
    return {
      type: _Jsep.LITERAL,
      value: parseFloat(number),
      raw: number
    };
  }
  /**
   * Parses a string literal, staring with single or double quotes with basic support for escape codes
   * e.g. `"hello world"`, `'this is\nJSEP'`
   * @returns {jsep.Literal}
   */
  gobbleStringLiteral() {
    let str = "";
    const startIndex = this.index;
    const quote = this.expr.charAt(this.index++);
    let closed = false;
    while (this.index < this.expr.length) {
      let ch = this.expr.charAt(this.index++);
      if (ch === quote) {
        closed = true;
        break;
      } else if (ch === "\\") {
        ch = this.expr.charAt(this.index++);
        switch (ch) {
          case "n":
            str += "\n";
            break;
          case "r":
            str += "\r";
            break;
          case "t":
            str += "	";
            break;
          case "b":
            str += "\b";
            break;
          case "f":
            str += "\f";
            break;
          case "v":
            str += "\v";
            break;
          default:
            str += ch;
        }
      } else {
        str += ch;
      }
    }
    if (!closed) {
      this.throwError('Unclosed quote after "' + str + '"');
    }
    return {
      type: _Jsep.LITERAL,
      value: str,
      raw: this.expr.substring(startIndex, this.index)
    };
  }
  /**
   * Gobbles only identifiers
   * e.g.: `foo`, `_value`, `$x1`
   * Also, this function checks if that identifier is a literal:
   * (e.g. `true`, `false`, `null`) or `this`
   * @returns {jsep.Identifier}
   */
  gobbleIdentifier() {
    let ch = this.code, start = this.index;
    if (_Jsep.isIdentifierStart(ch)) {
      this.index++;
    } else {
      this.throwError("Unexpected " + this.char);
    }
    while (this.index < this.expr.length) {
      ch = this.code;
      if (_Jsep.isIdentifierPart(ch)) {
        this.index++;
      } else {
        break;
      }
    }
    return {
      type: _Jsep.IDENTIFIER,
      name: this.expr.slice(start, this.index)
    };
  }
  /**
   * Gobbles a list of arguments within the context of a function call
   * or array literal. This function also assumes that the opening character
   * `(` or `[` has already been gobbled, and gobbles expressions and commas
   * until the terminator character `)` or `]` is encountered.
   * e.g. `foo(bar, baz)`, `my_func()`, or `[bar, baz]`
   * @param {number} termination
   * @returns {jsep.Expression[]}
   */
  gobbleArguments(termination) {
    const args2 = [];
    let closed = false;
    let separator_count = 0;
    while (this.index < this.expr.length) {
      this.gobbleSpaces();
      let ch_i = this.code;
      if (ch_i === termination) {
        closed = true;
        this.index++;
        if (termination === _Jsep.CPAREN_CODE && separator_count && separator_count >= args2.length) {
          this.throwError("Unexpected token " + String.fromCharCode(termination));
        }
        break;
      } else if (ch_i === _Jsep.COMMA_CODE) {
        this.index++;
        separator_count++;
        if (separator_count !== args2.length) {
          if (termination === _Jsep.CPAREN_CODE) {
            this.throwError("Unexpected token ,");
          } else if (termination === _Jsep.CBRACK_CODE) {
            for (let arg = args2.length; arg < separator_count; arg++) {
              args2.push(null);
            }
          }
        }
      } else if (args2.length !== separator_count && separator_count !== 0) {
        this.throwError("Expected comma");
      } else {
        const node = this.gobbleExpression();
        if (!node || node.type === _Jsep.COMPOUND) {
          this.throwError("Expected comma");
        }
        args2.push(node);
      }
    }
    if (!closed) {
      this.throwError("Expected " + String.fromCharCode(termination));
    }
    return args2;
  }
  /**
   * Responsible for parsing a group of things within parentheses `()`
   * that have no identifier in front (so not a function call)
   * This function assumes that it needs to gobble the opening parenthesis
   * and then tries to gobble everything within that parenthesis, assuming
   * that the next thing it should see is the close parenthesis. If not,
   * then the expression probably doesn't have a `)`
   * @returns {boolean|jsep.Expression}
   */
  gobbleGroup() {
    this.index++;
    let nodes = this.gobbleExpressions(_Jsep.CPAREN_CODE);
    if (this.code === _Jsep.CPAREN_CODE) {
      this.index++;
      if (nodes.length === 1) {
        return nodes[0];
      } else if (!nodes.length) {
        return false;
      } else {
        return {
          type: _Jsep.SEQUENCE_EXP,
          expressions: nodes
        };
      }
    } else {
      this.throwError("Unclosed (");
    }
  }
  /**
   * Responsible for parsing Array literals `[1, 2, 3]`
   * This function assumes that it needs to gobble the opening bracket
   * and then tries to gobble the expressions as arguments.
   * @returns {jsep.ArrayExpression}
   */
  gobbleArray() {
    this.index++;
    return {
      type: _Jsep.ARRAY_EXP,
      elements: this.gobbleArguments(_Jsep.CBRACK_CODE)
    };
  }
};
var hooks = new Hooks();
Object.assign(Jsep, {
  hooks,
  plugins: new Plugins(Jsep),
  // Node Types
  // ----------
  // This is the full set of types that any JSEP node can be.
  // Store them here to save space when minified
  COMPOUND: "Compound",
  SEQUENCE_EXP: "SequenceExpression",
  IDENTIFIER: "Identifier",
  MEMBER_EXP: "MemberExpression",
  LITERAL: "Literal",
  THIS_EXP: "ThisExpression",
  CALL_EXP: "CallExpression",
  UNARY_EXP: "UnaryExpression",
  BINARY_EXP: "BinaryExpression",
  ARRAY_EXP: "ArrayExpression",
  TAB_CODE: 9,
  LF_CODE: 10,
  CR_CODE: 13,
  SPACE_CODE: 32,
  PERIOD_CODE: 46,
  // '.'
  COMMA_CODE: 44,
  // ','
  SQUOTE_CODE: 39,
  // single quote
  DQUOTE_CODE: 34,
  // double quotes
  OPAREN_CODE: 40,
  // (
  CPAREN_CODE: 41,
  // )
  OBRACK_CODE: 91,
  // [
  CBRACK_CODE: 93,
  // ]
  QUMARK_CODE: 63,
  // ?
  SEMCOL_CODE: 59,
  // ;
  COLON_CODE: 58,
  // :
  // Operations
  // ----------
  // Use a quickly-accessible map to store all of the unary operators
  // Values are set to `1` (it really doesn't matter)
  unary_ops: {
    "-": 1,
    "!": 1,
    "~": 1,
    "+": 1
  },
  // Also use a map for the binary operations but set their values to their
  // binary precedence for quick reference (higher number = higher precedence)
  // see [Order of operations](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence)
  binary_ops: {
    "||": 1,
    "??": 1,
    "&&": 2,
    "|": 3,
    "^": 4,
    "&": 5,
    "==": 6,
    "!=": 6,
    "===": 6,
    "!==": 6,
    "<": 7,
    ">": 7,
    "<=": 7,
    ">=": 7,
    "<<": 8,
    ">>": 8,
    ">>>": 8,
    "+": 9,
    "-": 9,
    "*": 10,
    "/": 10,
    "%": 10,
    "**": 11
  },
  // sets specific binary_ops as right-associative
  right_associative: /* @__PURE__ */ new Set(["**"]),
  // Additional valid identifier chars, apart from a-z, A-Z and 0-9 (except on the starting char)
  additional_identifier_chars: /* @__PURE__ */ new Set(["$", "_"]),
  // Literals
  // ----------
  // Store the values to return for the various literals we may encounter
  literals: {
    "true": true,
    "false": false,
    "null": null
  },
  // Except for `this`, which is special. This could be changed to something like `'self'` as well
  this_str: "this"
});
Jsep.max_unop_len = Jsep.getMaxKeyLen(Jsep.unary_ops);
Jsep.max_binop_len = Jsep.getMaxKeyLen(Jsep.binary_ops);
var jsep = (expr) => new Jsep(expr).parse();
var stdClassProps = Object.getOwnPropertyNames(class Test {
});
Object.getOwnPropertyNames(Jsep).filter((prop) => !stdClassProps.includes(prop) && jsep[prop] === void 0).forEach((m) => {
  jsep[m] = Jsep[m];
});
jsep.Jsep = Jsep;
var CONDITIONAL_EXP = "ConditionalExpression";
var ternary = {
  name: "ternary",
  init(jsep2) {
    jsep2.hooks.add("after-expression", function gobbleTernary(env) {
      if (env.node && this.code === jsep2.QUMARK_CODE) {
        this.index++;
        const test = env.node;
        const consequent = this.gobbleExpression();
        if (!consequent) {
          this.throwError("Expected expression");
        }
        this.gobbleSpaces();
        if (this.code === jsep2.COLON_CODE) {
          this.index++;
          const alternate = this.gobbleExpression();
          if (!alternate) {
            this.throwError("Expected expression");
          }
          env.node = {
            type: CONDITIONAL_EXP,
            test,
            consequent,
            alternate
          };
          if (test.operator && jsep2.binary_ops[test.operator] <= 0.9) {
            let newTest = test;
            while (newTest.right.operator && jsep2.binary_ops[newTest.right.operator] <= 0.9) {
              newTest = newTest.right;
            }
            env.node.test = newTest.right;
            newTest.right = env.node;
            env.node = test;
          }
        } else {
          this.throwError("Expected :");
        }
      }
    });
  }
};
jsep.plugins.register(ternary);
var FSLASH_CODE = 47;
var BSLASH_CODE = 92;
var index = {
  name: "regex",
  init(jsep2) {
    jsep2.hooks.add("gobble-token", function gobbleRegexLiteral(env) {
      if (this.code === FSLASH_CODE) {
        const patternIndex = ++this.index;
        let inCharSet = false;
        while (this.index < this.expr.length) {
          if (this.code === FSLASH_CODE && !inCharSet) {
            const pattern = this.expr.slice(patternIndex, this.index);
            let flags = "";
            while (++this.index < this.expr.length) {
              const code = this.code;
              if (code >= 97 && code <= 122 || code >= 65 && code <= 90 || code >= 48 && code <= 57) {
                flags += this.char;
              } else {
                break;
              }
            }
            let value;
            try {
              value = new RegExp(pattern, flags);
            } catch (e) {
              this.throwError(e.message);
            }
            env.node = {
              type: jsep2.LITERAL,
              value,
              raw: this.expr.slice(patternIndex - 1, this.index)
            };
            env.node = this.gobbleTokenProperty(env.node);
            return env.node;
          }
          if (this.code === jsep2.OBRACK_CODE) {
            inCharSet = true;
          } else if (inCharSet && this.code === jsep2.CBRACK_CODE) {
            inCharSet = false;
          }
          this.index += this.code === BSLASH_CODE ? 2 : 1;
        }
        this.throwError("Unclosed Regex");
      }
    });
  }
};
var PLUS_CODE = 43;
var MINUS_CODE = 45;
var plugin = {
  name: "assignment",
  assignmentOperators: /* @__PURE__ */ new Set(["=", "*=", "**=", "/=", "%=", "+=", "-=", "<<=", ">>=", ">>>=", "&=", "^=", "|=", "||=", "&&=", "??="]),
  updateOperators: [PLUS_CODE, MINUS_CODE],
  assignmentPrecedence: 0.9,
  init(jsep2) {
    const updateNodeTypes = [jsep2.IDENTIFIER, jsep2.MEMBER_EXP];
    plugin.assignmentOperators.forEach((op) => jsep2.addBinaryOp(op, plugin.assignmentPrecedence, true));
    jsep2.hooks.add("gobble-token", function gobbleUpdatePrefix(env) {
      const code = this.code;
      if (plugin.updateOperators.some((c) => c === code && c === this.expr.charCodeAt(this.index + 1))) {
        this.index += 2;
        env.node = {
          type: "UpdateExpression",
          operator: code === PLUS_CODE ? "++" : "--",
          argument: this.gobbleTokenProperty(this.gobbleIdentifier()),
          prefix: true
        };
        if (!env.node.argument || !updateNodeTypes.includes(env.node.argument.type)) {
          this.throwError(`Unexpected ${env.node.operator}`);
        }
      }
    });
    jsep2.hooks.add("after-token", function gobbleUpdatePostfix(env) {
      if (env.node) {
        const code = this.code;
        if (plugin.updateOperators.some((c) => c === code && c === this.expr.charCodeAt(this.index + 1))) {
          if (!updateNodeTypes.includes(env.node.type)) {
            this.throwError(`Unexpected ${env.node.operator}`);
          }
          this.index += 2;
          env.node = {
            type: "UpdateExpression",
            operator: code === PLUS_CODE ? "++" : "--",
            argument: env.node,
            prefix: false
          };
        }
      }
    });
    jsep2.hooks.add("after-expression", function gobbleAssignment(env) {
      if (env.node) {
        updateBinariesToAssignments(env.node);
      }
    });
    function updateBinariesToAssignments(node) {
      if (plugin.assignmentOperators.has(node.operator)) {
        node.type = "AssignmentExpression";
        updateBinariesToAssignments(node.left);
        updateBinariesToAssignments(node.right);
      } else if (!node.operator) {
        Object.values(node).forEach((val) => {
          if (val && typeof val === "object") {
            updateBinariesToAssignments(val);
          }
        });
      }
    }
  }
};
jsep.plugins.register(index, plugin);
jsep.addUnaryOp("typeof");
jsep.addUnaryOp("void");
jsep.addLiteral("null", null);
jsep.addLiteral("undefined", void 0);
var BLOCKED_PROTO_PROPERTIES = /* @__PURE__ */ new Set(["constructor", "__proto__", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);
var SafeEval = {
  /**
   * @param {jsep.Expression} ast
   * @param {Record<string, any>} subs
   */
  evalAst(ast, subs) {
    switch (ast.type) {
      case "BinaryExpression":
      case "LogicalExpression":
        return SafeEval.evalBinaryExpression(ast, subs);
      case "Compound":
        return SafeEval.evalCompound(ast, subs);
      case "ConditionalExpression":
        return SafeEval.evalConditionalExpression(ast, subs);
      case "Identifier":
        return SafeEval.evalIdentifier(ast, subs);
      case "Literal":
        return SafeEval.evalLiteral(ast, subs);
      case "MemberExpression":
        return SafeEval.evalMemberExpression(ast, subs);
      case "UnaryExpression":
        return SafeEval.evalUnaryExpression(ast, subs);
      case "ArrayExpression":
        return SafeEval.evalArrayExpression(ast, subs);
      case "CallExpression":
        return SafeEval.evalCallExpression(ast, subs);
      case "AssignmentExpression":
        return SafeEval.evalAssignmentExpression(ast, subs);
      default:
        throw SyntaxError("Unexpected expression", ast);
    }
  },
  evalBinaryExpression(ast, subs) {
    const result = {
      "||": (a, b) => a || b(),
      "&&": (a, b) => a && b(),
      "|": (a, b) => a | b(),
      "^": (a, b) => a ^ b(),
      "&": (a, b) => a & b(),
      // eslint-disable-next-line eqeqeq -- API
      "==": (a, b) => a == b(),
      // eslint-disable-next-line eqeqeq -- API
      "!=": (a, b) => a != b(),
      "===": (a, b) => a === b(),
      "!==": (a, b) => a !== b(),
      "<": (a, b) => a < b(),
      ">": (a, b) => a > b(),
      "<=": (a, b) => a <= b(),
      ">=": (a, b) => a >= b(),
      "<<": (a, b) => a << b(),
      ">>": (a, b) => a >> b(),
      ">>>": (a, b) => a >>> b(),
      "+": (a, b) => a + b(),
      "-": (a, b) => a - b(),
      "*": (a, b) => a * b(),
      "/": (a, b) => a / b(),
      "%": (a, b) => a % b()
    }[ast.operator](SafeEval.evalAst(ast.left, subs), () => SafeEval.evalAst(ast.right, subs));
    return result;
  },
  evalCompound(ast, subs) {
    let last;
    for (let i = 0; i < ast.body.length; i++) {
      if (ast.body[i].type === "Identifier" && ["var", "let", "const"].includes(ast.body[i].name) && ast.body[i + 1] && ast.body[i + 1].type === "AssignmentExpression") {
        i += 1;
      }
      const expr = ast.body[i];
      last = SafeEval.evalAst(expr, subs);
    }
    return last;
  },
  evalConditionalExpression(ast, subs) {
    if (SafeEval.evalAst(ast.test, subs)) {
      return SafeEval.evalAst(ast.consequent, subs);
    }
    return SafeEval.evalAst(ast.alternate, subs);
  },
  evalIdentifier(ast, subs) {
    if (Object.hasOwn(subs, ast.name)) {
      return subs[ast.name];
    }
    throw ReferenceError(`${ast.name} is not defined`);
  },
  evalLiteral(ast) {
    return ast.value;
  },
  evalMemberExpression(ast, subs) {
    const prop = String(
      // NOTE: `String(value)` throws error when
      // value has overwritten the toString method to return non-string
      // i.e. `value = {toString: () => []}`
      ast.computed ? SafeEval.evalAst(ast.property) : ast.property.name
      // `object.property` property is Identifier
    );
    const obj = SafeEval.evalAst(ast.object, subs);
    if (obj === void 0 || obj === null) {
      throw TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
    }
    if (!Object.hasOwn(obj, prop) && BLOCKED_PROTO_PROPERTIES.has(prop)) {
      throw TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
    }
    const result = obj[prop];
    if (typeof result === "function") {
      return result.bind(obj);
    }
    return result;
  },
  evalUnaryExpression(ast, subs) {
    const result = {
      "-": (a) => -SafeEval.evalAst(a, subs),
      "!": (a) => !SafeEval.evalAst(a, subs),
      "~": (a) => ~SafeEval.evalAst(a, subs),
      // eslint-disable-next-line no-implicit-coercion -- API
      "+": (a) => +SafeEval.evalAst(a, subs),
      typeof: (a) => typeof SafeEval.evalAst(a, subs),
      // eslint-disable-next-line no-void, sonarjs/void-use -- feature
      void: (a) => void SafeEval.evalAst(a, subs)
    }[ast.operator](ast.argument);
    return result;
  },
  evalArrayExpression(ast, subs) {
    return ast.elements.map((el) => SafeEval.evalAst(el, subs));
  },
  evalCallExpression(ast, subs) {
    const args2 = ast.arguments.map((arg) => SafeEval.evalAst(arg, subs));
    const func = SafeEval.evalAst(ast.callee, subs);
    if (func === Function) {
      throw new Error("Function constructor is disabled");
    }
    return func(...args2);
  },
  evalAssignmentExpression(ast, subs) {
    if (ast.left.type !== "Identifier") {
      throw SyntaxError("Invalid left-hand side in assignment");
    }
    const id = ast.left.name;
    const value = SafeEval.evalAst(ast.right, subs);
    subs[id] = value;
    return subs[id];
  }
};
var SafeScript = class {
  /**
   * @param {string} expr Expression to evaluate
   */
  constructor(expr) {
    this.code = expr;
    this.ast = jsep(this.code);
  }
  /**
   * @param {object} context Object whose items will be added
   *   to evaluation
   * @returns {EvaluatedResult} Result of evaluated code
   */
  runInNewContext(context) {
    const keyMap = Object.assign(/* @__PURE__ */ Object.create(null), context);
    return SafeEval.evalAst(this.ast, keyMap);
  }
};
function push(arr, item) {
  arr = arr.slice();
  arr.push(item);
  return arr;
}
function unshift(item, arr) {
  arr = arr.slice();
  arr.unshift(item);
  return arr;
}
var NewError = class extends Error {
  /**
   * @param {AnyResult} value The evaluated scalar value
   */
  constructor(value) {
    super('JSONPath should not be called with "new" (it prevents return of (unwrapped) scalar values)');
    this.avoidNew = true;
    this.value = value;
    this.name = "NewError";
  }
};
function JSONPath(opts, expr, obj, callback, otherTypeCallback) {
  if (!(this instanceof JSONPath)) {
    try {
      return new JSONPath(opts, expr, obj, callback, otherTypeCallback);
    } catch (e) {
      if (!e.avoidNew) {
        throw e;
      }
      return e.value;
    }
  }
  if (typeof opts === "string") {
    otherTypeCallback = callback;
    callback = obj;
    obj = expr;
    expr = opts;
    opts = null;
  }
  const optObj = opts && typeof opts === "object";
  opts = opts || {};
  this.json = opts.json || obj;
  this.path = opts.path || expr;
  this.resultType = opts.resultType || "value";
  this.flatten = opts.flatten || false;
  this.wrap = Object.hasOwn(opts, "wrap") ? opts.wrap : true;
  this.sandbox = opts.sandbox || {};
  this.eval = opts.eval === void 0 ? "safe" : opts.eval;
  this.ignoreEvalErrors = typeof opts.ignoreEvalErrors === "undefined" ? false : opts.ignoreEvalErrors;
  this.parent = opts.parent || null;
  this.parentProperty = opts.parentProperty || null;
  this.callback = opts.callback || callback || null;
  this.otherTypeCallback = opts.otherTypeCallback || otherTypeCallback || function() {
    throw new TypeError("You must supply an otherTypeCallback callback option with the @other() operator.");
  };
  if (opts.autostart !== false) {
    const args2 = {
      path: optObj ? opts.path : expr
    };
    if (!optObj) {
      args2.json = obj;
    } else if ("json" in opts) {
      args2.json = opts.json;
    }
    const ret = this.evaluate(args2);
    if (!ret || typeof ret !== "object") {
      throw new NewError(ret);
    }
    return ret;
  }
}
JSONPath.prototype.evaluate = function(expr, json, callback, otherTypeCallback) {
  let currParent = this.parent, currParentProperty = this.parentProperty;
  let {
    flatten,
    wrap
  } = this;
  this.currResultType = this.resultType;
  this.currEval = this.eval;
  this.currSandbox = this.sandbox;
  callback = callback || this.callback;
  this.currOtherTypeCallback = otherTypeCallback || this.otherTypeCallback;
  json = json || this.json;
  expr = expr || this.path;
  if (expr && typeof expr === "object" && !Array.isArray(expr)) {
    if (!expr.path && expr.path !== "") {
      throw new TypeError('You must supply a "path" property when providing an object argument to JSONPath.evaluate().');
    }
    if (!Object.hasOwn(expr, "json")) {
      throw new TypeError('You must supply a "json" property when providing an object argument to JSONPath.evaluate().');
    }
    ({
      json
    } = expr);
    flatten = Object.hasOwn(expr, "flatten") ? expr.flatten : flatten;
    this.currResultType = Object.hasOwn(expr, "resultType") ? expr.resultType : this.currResultType;
    this.currSandbox = Object.hasOwn(expr, "sandbox") ? expr.sandbox : this.currSandbox;
    wrap = Object.hasOwn(expr, "wrap") ? expr.wrap : wrap;
    this.currEval = Object.hasOwn(expr, "eval") ? expr.eval : this.currEval;
    callback = Object.hasOwn(expr, "callback") ? expr.callback : callback;
    this.currOtherTypeCallback = Object.hasOwn(expr, "otherTypeCallback") ? expr.otherTypeCallback : this.currOtherTypeCallback;
    currParent = Object.hasOwn(expr, "parent") ? expr.parent : currParent;
    currParentProperty = Object.hasOwn(expr, "parentProperty") ? expr.parentProperty : currParentProperty;
    expr = expr.path;
  }
  currParent = currParent || null;
  currParentProperty = currParentProperty || null;
  if (Array.isArray(expr)) {
    expr = JSONPath.toPathString(expr);
  }
  if (!expr && expr !== "" || !json) {
    return void 0;
  }
  const exprList = JSONPath.toPathArray(expr);
  if (exprList[0] === "$" && exprList.length > 1) {
    exprList.shift();
  }
  this._hasParentSelector = null;
  const result = this._trace(exprList, json, ["$"], currParent, currParentProperty, callback).filter(function(ea) {
    return ea && !ea.isParentSelector;
  });
  if (!result.length) {
    return wrap ? [] : void 0;
  }
  if (!wrap && result.length === 1 && !result[0].hasArrExpr) {
    return this._getPreferredOutput(result[0]);
  }
  return result.reduce((rslt, ea) => {
    const valOrPath = this._getPreferredOutput(ea);
    if (flatten && Array.isArray(valOrPath)) {
      rslt = rslt.concat(valOrPath);
    } else {
      rslt.push(valOrPath);
    }
    return rslt;
  }, []);
};
JSONPath.prototype._getPreferredOutput = function(ea) {
  const resultType = this.currResultType;
  switch (resultType) {
    case "all": {
      const path2 = Array.isArray(ea.path) ? ea.path : JSONPath.toPathArray(ea.path);
      ea.pointer = JSONPath.toPointer(path2);
      ea.path = typeof ea.path === "string" ? ea.path : JSONPath.toPathString(ea.path);
      return ea;
    }
    case "value":
    case "parent":
    case "parentProperty":
      return ea[resultType];
    case "path":
      return JSONPath.toPathString(ea[resultType]);
    case "pointer":
      return JSONPath.toPointer(ea.path);
    default:
      throw new TypeError("Unknown result type");
  }
};
JSONPath.prototype._handleCallback = function(fullRetObj, callback, type) {
  if (callback) {
    const preferredOutput = this._getPreferredOutput(fullRetObj);
    fullRetObj.path = typeof fullRetObj.path === "string" ? fullRetObj.path : JSONPath.toPathString(fullRetObj.path);
    callback(preferredOutput, type, fullRetObj);
  }
};
JSONPath.prototype._trace = function(expr, val, path2, parent, parentPropName, callback, hasArrExpr, literalPriority) {
  let retObj;
  if (!expr.length) {
    retObj = {
      path: path2,
      value: val,
      parent,
      parentProperty: parentPropName,
      hasArrExpr
    };
    this._handleCallback(retObj, callback, "value");
    return retObj;
  }
  const loc = expr[0], x = expr.slice(1);
  const ret = [];
  function addRet(elems) {
    if (Array.isArray(elems)) {
      elems.forEach((t) => {
        ret.push(t);
      });
    } else {
      ret.push(elems);
    }
  }
  if ((typeof loc !== "string" || literalPriority) && val && Object.hasOwn(val, loc)) {
    addRet(this._trace(x, val[loc], push(path2, loc), val, loc, callback, hasArrExpr));
  } else if (loc === "*") {
    this._walk(val, (m) => {
      addRet(this._trace(x, val[m], push(path2, m), val, m, callback, true, true));
    });
  } else if (loc === "..") {
    addRet(this._trace(x, val, path2, parent, parentPropName, callback, hasArrExpr));
    this._walk(val, (m) => {
      if (typeof val[m] === "object") {
        addRet(this._trace(expr.slice(), val[m], push(path2, m), val, m, callback, true));
      }
    });
  } else if (loc === "^") {
    this._hasParentSelector = true;
    return {
      path: path2.slice(0, -1),
      expr: x,
      isParentSelector: true
    };
  } else if (loc === "~") {
    retObj = {
      path: push(path2, loc),
      value: parentPropName,
      parent,
      parentProperty: null
    };
    this._handleCallback(retObj, callback, "property");
    return retObj;
  } else if (loc === "$") {
    addRet(this._trace(x, val, path2, null, null, callback, hasArrExpr));
  } else if (/^(-?\d*):(-?\d*):?(\d*)$/u.test(loc)) {
    addRet(this._slice(loc, x, val, path2, parent, parentPropName, callback));
  } else if (loc.indexOf("?(") === 0) {
    if (this.currEval === false) {
      throw new Error("Eval [?(expr)] prevented in JSONPath expression.");
    }
    const safeLoc = loc.replace(/^\?\((.*?)\)$/u, "$1");
    const nested = /@.?([^?]*)[['](\??\(.*?\))(?!.\)\])[\]']/gu.exec(safeLoc);
    if (nested) {
      this._walk(val, (m) => {
        const npath = [nested[2]];
        const nvalue = nested[1] ? val[m][nested[1]] : val[m];
        const filterResults = this._trace(npath, nvalue, path2, parent, parentPropName, callback, true);
        if (filterResults.length > 0) {
          addRet(this._trace(x, val[m], push(path2, m), val, m, callback, true));
        }
      });
    } else {
      this._walk(val, (m) => {
        if (this._eval(safeLoc, val[m], m, path2, parent, parentPropName)) {
          addRet(this._trace(x, val[m], push(path2, m), val, m, callback, true));
        }
      });
    }
  } else if (loc[0] === "(") {
    if (this.currEval === false) {
      throw new Error("Eval [(expr)] prevented in JSONPath expression.");
    }
    addRet(this._trace(unshift(this._eval(loc, val, path2.at(-1), path2.slice(0, -1), parent, parentPropName), x), val, path2, parent, parentPropName, callback, hasArrExpr));
  } else if (loc[0] === "@") {
    let addType = false;
    const valueType = loc.slice(1, -2);
    switch (valueType) {
      case "scalar":
        if (!val || !["object", "function"].includes(typeof val)) {
          addType = true;
        }
        break;
      case "boolean":
      case "string":
      case "undefined":
      case "function":
        if (typeof val === valueType) {
          addType = true;
        }
        break;
      case "integer":
        if (Number.isFinite(val) && !(val % 1)) {
          addType = true;
        }
        break;
      case "number":
        if (Number.isFinite(val)) {
          addType = true;
        }
        break;
      case "nonFinite":
        if (typeof val === "number" && !Number.isFinite(val)) {
          addType = true;
        }
        break;
      case "object":
        if (val && typeof val === valueType) {
          addType = true;
        }
        break;
      case "array":
        if (Array.isArray(val)) {
          addType = true;
        }
        break;
      case "other":
        addType = this.currOtherTypeCallback(val, path2, parent, parentPropName);
        break;
      case "null":
        if (val === null) {
          addType = true;
        }
        break;
      /* c8 ignore next 2 */
      default:
        throw new TypeError("Unknown value type " + valueType);
    }
    if (addType) {
      retObj = {
        path: path2,
        value: val,
        parent,
        parentProperty: parentPropName
      };
      this._handleCallback(retObj, callback, "value");
      return retObj;
    }
  } else if (loc[0] === "`" && val && Object.hasOwn(val, loc.slice(1))) {
    const locProp = loc.slice(1);
    addRet(this._trace(x, val[locProp], push(path2, locProp), val, locProp, callback, hasArrExpr, true));
  } else if (loc.includes(",")) {
    const parts = loc.split(",");
    for (const part of parts) {
      addRet(this._trace(unshift(part, x), val, path2, parent, parentPropName, callback, true));
    }
  } else if (!literalPriority && val && Object.hasOwn(val, loc)) {
    addRet(this._trace(x, val[loc], push(path2, loc), val, loc, callback, hasArrExpr, true));
  }
  if (this._hasParentSelector) {
    for (let t = 0; t < ret.length; t++) {
      const rett = ret[t];
      if (rett && rett.isParentSelector) {
        const tmp = this._trace(rett.expr, val, rett.path, parent, parentPropName, callback, hasArrExpr);
        if (Array.isArray(tmp)) {
          ret[t] = tmp[0];
          const tl = tmp.length;
          for (let tt = 1; tt < tl; tt++) {
            t++;
            ret.splice(t, 0, tmp[tt]);
          }
        } else {
          ret[t] = tmp;
        }
      }
    }
  }
  return ret;
};
JSONPath.prototype._walk = function(val, f) {
  if (Array.isArray(val)) {
    const n = val.length;
    for (let i = 0; i < n; i++) {
      f(i);
    }
  } else if (val && typeof val === "object") {
    Object.keys(val).forEach((m) => {
      f(m);
    });
  }
};
JSONPath.prototype._slice = function(loc, expr, val, path2, parent, parentPropName, callback) {
  if (!Array.isArray(val)) {
    return void 0;
  }
  const len = val.length, parts = loc.split(":"), step = parts[2] && Number.parseInt(parts[2]) || 1;
  let start = parts[0] && Number.parseInt(parts[0]) || 0, end = parts[1] && Number.parseInt(parts[1]) || len;
  start = start < 0 ? Math.max(0, start + len) : Math.min(len, start);
  end = end < 0 ? Math.max(0, end + len) : Math.min(len, end);
  const ret = [];
  for (let i = start; i < end; i += step) {
    const tmp = this._trace(unshift(i, expr), val, path2, parent, parentPropName, callback, true);
    tmp.forEach((t) => {
      ret.push(t);
    });
  }
  return ret;
};
JSONPath.prototype._eval = function(code, _v, _vname, path2, parent, parentPropName) {
  this.currSandbox._$_parentProperty = parentPropName;
  this.currSandbox._$_parent = parent;
  this.currSandbox._$_property = _vname;
  this.currSandbox._$_root = this.json;
  this.currSandbox._$_v = _v;
  const containsPath = code.includes("@path");
  if (containsPath) {
    this.currSandbox._$_path = JSONPath.toPathString(path2.concat([_vname]));
  }
  const scriptCacheKey = this.currEval + "Script:" + code;
  if (!JSONPath.cache[scriptCacheKey]) {
    let script = code.replaceAll("@parentProperty", "_$_parentProperty").replaceAll("@parent", "_$_parent").replaceAll("@property", "_$_property").replaceAll("@root", "_$_root").replaceAll(/@([.\s)[])/gu, "_$_v$1");
    if (containsPath) {
      script = script.replaceAll("@path", "_$_path");
    }
    if (this.currEval === "safe" || this.currEval === true || this.currEval === void 0) {
      JSONPath.cache[scriptCacheKey] = new this.safeVm.Script(script);
    } else if (this.currEval === "native") {
      JSONPath.cache[scriptCacheKey] = new this.vm.Script(script);
    } else if (typeof this.currEval === "function" && this.currEval.prototype && Object.hasOwn(this.currEval.prototype, "runInNewContext")) {
      const CurrEval = this.currEval;
      JSONPath.cache[scriptCacheKey] = new CurrEval(script);
    } else if (typeof this.currEval === "function") {
      JSONPath.cache[scriptCacheKey] = {
        runInNewContext: (context) => this.currEval(script, context)
      };
    } else {
      throw new TypeError(`Unknown "eval" property "${this.currEval}"`);
    }
  }
  try {
    return JSONPath.cache[scriptCacheKey].runInNewContext(this.currSandbox);
  } catch (e) {
    if (this.ignoreEvalErrors) {
      return false;
    }
    throw new Error("jsonPath: " + e.message + ": " + code);
  }
};
JSONPath.cache = {};
JSONPath.toPathString = function(pathArr) {
  const x = pathArr, n = x.length;
  let p = "$";
  for (let i = 1; i < n; i++) {
    if (!/^(~|\^|@.*?\(\))$/u.test(x[i])) {
      p += /^[0-9*]+$/u.test(x[i]) ? "[" + x[i] + "]" : "['" + x[i] + "']";
    }
  }
  return p;
};
JSONPath.toPointer = function(pointer) {
  const x = pointer, n = x.length;
  let p = "";
  for (let i = 1; i < n; i++) {
    if (!/^(~|\^|@.*?\(\))$/u.test(x[i])) {
      p += "/" + x[i].toString().replaceAll("~", "~0").replaceAll("/", "~1");
    }
  }
  return p;
};
JSONPath.toPathArray = function(expr) {
  const {
    cache
  } = JSONPath;
  if (cache[expr]) {
    return cache[expr].concat();
  }
  const subx = [];
  const normalized = expr.replaceAll(/@(?:null|boolean|number|string|integer|undefined|nonFinite|scalar|array|object|function|other)\(\)/gu, ";$&;").replaceAll(/[['](\??\(.*?\))[\]'](?!.\])/gu, function($0, $1) {
    return "[#" + (subx.push($1) - 1) + "]";
  }).replaceAll(/\[['"]([^'\]]*)['"]\]/gu, function($0, prop) {
    return "['" + prop.replaceAll(".", "%@%").replaceAll("~", "%%@@%%") + "']";
  }).replaceAll("~", ";~;").replaceAll(/['"]?\.['"]?(?![^[]*\])|\[['"]?/gu, ";").replaceAll("%@%", ".").replaceAll("%%@@%%", "~").replaceAll(/(?:;)?(\^+)(?:;)?/gu, function($0, ups) {
    return ";" + ups.split("").join(";") + ";";
  }).replaceAll(/;;;|;;/gu, ";..;").replaceAll(/;$|'?\]|'$/gu, "");
  const exprList = normalized.split(";").map(function(exp) {
    const match = exp.match(/#(\d+)/u);
    return !match || !match[1] ? exp : subx[match[1]];
  });
  cache[expr] = exprList;
  return cache[expr].concat();
};
JSONPath.prototype.safeVm = {
  Script: SafeScript
};
JSONPath.prototype.vm = vm;

// server/modules/execution/interpolator.ts
import_dayjs.default.extend(import_utc.default);
import_dayjs.default.extend(import_timezone.default);
var VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
var MAX_ITERATIONS = 5;
var generators = {
  $uuid: () => crypto.randomUUID(),
  $guid: () => crypto.randomUUID(),
  $timestamp: () => Date.now().toString(),
  $timestampSec: () => Math.floor(Date.now() / 1e3).toString(),
  $now: (formatStr, tzStr) => {
    let d = (0, import_dayjs.default)();
    if (tzStr) d = d.tz(tzStr);
    return formatStr ? d.format(formatStr) : d.toISOString();
  },
  $randomInt: (minStr, maxStr) => {
    const min = parseInt(minStr || "0", 10);
    const max = parseInt(maxStr || "100", 10);
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  },
  $randomFloat: (minStr, maxStr, decStr) => {
    const min = parseFloat(minStr || "0");
    const max = parseFloat(maxStr || "100");
    const dec = parseInt(decStr || "2", 10);
    return (Math.random() * (max - min) + min).toFixed(dec);
  },
  $randomString: (lengthStr) => {
    const length = parseInt(lengthStr || "8", 10);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomUpper: (lengthStr) => {
    const length = parseInt(lengthStr || "8", 10);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomLower: (lengthStr) => {
    const length = parseInt(lengthStr || "8", 10);
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomAlpha: (lengthStr) => {
    const length = parseInt(lengthStr || "8", 10);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomEmail: () => `test_${crypto.randomBytes(4).toString("hex")}@example.com`,
  $randomPhone: () => `1${Math.floor(Math.random() * 9e9) + 1e9}`,
  $randomName: () => {
    const names = ["Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Helen", "Ivan", "Judy"];
    return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1e3);
  },
  $randomMac: () => Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(":"),
  $randomBool: () => Math.random() > 0.5 ? "true" : "false",
  $randomAddress: () => {
    const streets = ["Maple St", "Oak Ave", "Main St", "Washington Blvd", "Lakeview Dr", "Parkway Ave"];
    const cities = ["Springfield", "Riverside", "Georgetown", "Franklin", "Clinton", "Salem"];
    return `${Math.floor(Math.random() * 9e3) + 100} ${streets[Math.floor(Math.random() * streets.length)]}, ${cities[Math.floor(Math.random() * cities.length)]}`;
  },
  $randomWords: (countStr) => {
    const count = parseInt(countStr || "3", 10);
    const words = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew", "kiwi", "lemon", "mango", "orange", "papaya", "quince", "raspberry", "strawberry", "tangerine", "ugli", "vanilla", "watermelon"];
    return Array.from({ length: count }, () => words[Math.floor(Math.random() * words.length)]).join(" ");
  },
  $date: (formatStr, offsetStr, unit, tzStr) => {
    let d = (0, import_dayjs.default)();
    if (offsetStr && unit) {
      d = d.add(parseInt(offsetStr, 10), unit);
    }
    if (tzStr) d = d.tz(tzStr);
    return formatStr ? d.format(formatStr) : d.toISOString();
  }
};
var transformers = {
  base64: (val) => Buffer.from(val).toString("base64"),
  base64Decode: (val) => Buffer.from(val, "base64").toString("utf8"),
  md5: (val) => crypto.createHash("md5").update(val).digest("hex"),
  sha1: (val) => crypto.createHash("sha1").update(val).digest("hex"),
  sha256: (val) => crypto.createHash("sha256").update(val).digest("hex"),
  hmac: (val, secret, algo) => crypto.createHmac(algo || "sha256", secret || "").update(val).digest("hex"),
  urlEncode: (val) => encodeURIComponent(val),
  urlDecode: (val) => decodeURIComponent(val),
  uppercase: (val) => val.toUpperCase(),
  lowercase: (val) => val.toLowerCase(),
  substring: (val, startStr, endStr) => {
    const start = parseInt(startStr || "0", 10);
    const end = endStr ? parseInt(endStr, 10) : void 0;
    return val.substring(start, end);
  },
  replace: (val, search, replace) => val.split(search).join(replace || ""),
  trim: (val) => val.trim(),
  date: (val, formatStr, tzStr) => {
    let d = (0, import_dayjs.default)(val);
    if (tzStr) d = d.tz(tzStr);
    return d.format(formatStr || "YYYY-MM-DDTHH:mm:ssZ");
  },
  split: (val, sep, indexStr) => {
    const arr = val.split(sep || ",");
    const idx = parseInt(indexStr || "0", 10);
    return arr[idx] || "";
  },
  default: (val, defValue) => val ? val : defValue || "",
  length: (val) => val.length.toString(),
  toJson: (val) => {
    try {
      return JSON.stringify(JSON.parse(val));
    } catch {
      return JSON.stringify(val);
    }
  },
  jsonPath: (val, path2) => {
    try {
      const res = JSONPath({ path: path2 || "$", json: JSON.parse(val) });
      return res.length > 0 ? typeof res[0] === "object" ? JSON.stringify(res[0]) : String(res[0]) : "";
    } catch {
      return "";
    }
  },
  round: (val) => Math.round(parseFloat(val || "0")).toString(),
  floor: (val) => Math.floor(parseFloat(val || "0")).toString(),
  ceil: (val) => Math.ceil(parseFloat(val || "0")).toString(),
  abs: (val) => Math.abs(parseFloat(val || "0")).toString()
};
function parseCall(expr) {
  const match = expr.match(/^([a-zA-Z0-9_$]+)(?:\((.*)\))?$/);
  if (!match) return { name: expr, args: [] };
  const name = match[1];
  const argsStr = match[2] || "";
  const args2 = argsStr ? argsStr.split(",").map((s) => {
    let trimmed = s.trim();
    if (trimmed.startsWith("'") && trimmed.endsWith("'") || trimmed.startsWith('"') && trimmed.endsWith('"')) {
      trimmed = trimmed.slice(1, -1);
    }
    return trimmed;
  }) : [];
  return { name, args: args2 };
}
function interpolate(template, vars, onSetVar) {
  if (!template) return "";
  let result = template;
  let iteration = 0;
  while (iteration < MAX_ITERATIONS) {
    const previous = result;
    result = result.replace(VARIABLE_PATTERN, (_, expression) => {
      const parts = expression.split("|").map((p) => p.trim());
      const baseExpr = parts[0];
      let currentValue;
      if (baseExpr.startsWith("$")) {
        const { name, args: args2 } = parseCall(baseExpr);
        if (generators[name]) {
          currentValue = generators[name](...args2);
        } else {
          return `{{${expression}}}`;
        }
      } else {
        currentValue = vars[baseExpr];
        if (currentValue === void 0) {
          return `{{${expression}}}`;
        }
      }
      for (let i = 1; i < parts.length; i++) {
        const { name, args: args2 } = parseCall(parts[i]);
        if (name === "set" && onSetVar && currentValue !== void 0) {
          const varName = args2[0];
          const scope = args2[1] || "case";
          if (varName) {
            const resolvedValue = hasUnresolvedVars(currentValue) ? interpolate(currentValue, vars) : currentValue;
            onSetVar(varName, resolvedValue, scope.toUpperCase());
          }
        } else if (transformers[name] && currentValue !== void 0) {
          currentValue = transformers[name](currentValue, ...args2);
        }
      }
      return currentValue !== void 0 ? currentValue : `{{${expression}}}`;
    });
    if (result === previous) break;
    iteration++;
  }
  return result;
}
function hasUnresolvedVars(str) {
  if (!str) return false;
  return VARIABLE_PATTERN.test(str);
}

// server/modules/execution/context.ts
var LAYER_PRIORITY = [
  "DYNAMIC",
  "ENVIRONMENT",
  "RUNTIME_ENVIRONMENT",
  "SUITE",
  "SUITE_DATA",
  "RUNTIME_SUITE",
  "MODULE_DEFAULT",
  "SCENARIO",
  "SCENARIO_DATA",
  "RUNTIME_SCENARIO",
  "OVERRIDE",
  "CALLER_OVERRIDE",
  "CASE"
];
var ExecutionContext = class _ExecutionContext {
  constructor() {
    this.dynamicVariableConfigs = {};
    this.dynamicVariableCaches = {};
    this.currentScenarioName = null;
    this.currentSuiteName = null;
    this.currentCaseName = null;
    this.currentStepId = null;
    this.layers = {};
    for (const layer of LAYER_PRIORITY) {
      this.layers[layer] = {};
    }
    this.namespaces = {};
  }
  /**
   * Register a callback to be notified when a variable is set.
   */
  onVariableSet(callback) {
    this.onVariableSetCallback = callback;
  }
  /**
   * Set the current scenario, suite and case names for namespacing.
   */
  setCurrentContext(scenarioName, suiteName, caseName) {
    this.currentScenarioName = scenarioName;
    this.currentSuiteName = suiteName;
    this.currentCaseName = caseName;
  }
  /**
   * Set the current step ID for logging.
   */
  setCurrentStep(stepId) {
    this.currentStepId = stepId;
  }
  /**
   * Get the current step ID.
   */
  getCurrentStep() {
    return this.currentStepId;
  }
  /**
   * Inject a shared runtime variables object (useful for cross-suite sharing in scenarios)
   */
  setSharedRuntimeVars(sharedVars) {
    this.layers["RUNTIME_SUITE"] = { ...this.layers["RUNTIME_SUITE"], ...sharedVars };
  }
  /**
   * Get all current dynamic variable caches.
   */
  getDynamicVariableCaches() {
    return { ...this.dynamicVariableCaches };
  }
  /**
   * Inject dynamic variable caches.
   */
  setDynamicVariableCaches(caches) {
    this.dynamicVariableCaches = { ...this.dynamicVariableCaches, ...caches };
  }
  /**
   * Clear case-scoped variables and caches. Call this after each case finishes.
   */
  clearCaseVars() {
    this.layers["CASE"] = {};
    for (const [name, config2] of Object.entries(this.dynamicVariableConfigs)) {
      if (config2.evaluationStrategy === "ONCE_PER_CASE") {
        delete this.dynamicVariableCaches[name];
      }
    }
  }
  /**
   * Clear suite-scoped variables and caches. Call this after each suite finishes.
   */
  clearSuiteVars() {
    this.layers["RUNTIME_SUITE"] = {};
    for (const [name, config2] of Object.entries(this.dynamicVariableConfigs)) {
      if (config2.evaluationStrategy === "ONCE_PER_SUITE") {
        delete this.dynamicVariableCaches[name];
      }
    }
  }
  /**
   * Clear scenario-scoped variables and caches. Call this after each scenario finishes.
   */
  clearScenarioVars() {
    this.layers["RUNTIME_SCENARIO"] = {};
    for (const [name, config2] of Object.entries(this.dynamicVariableConfigs)) {
      if (config2.evaluationStrategy === "ONCE_PER_SCENARIO") {
        delete this.dynamicVariableCaches[name];
      }
    }
  }
  /**
   * Create context from typical execution scenario inputs.
   */
  static create(options) {
    const ctx = new _ExecutionContext();
    if (options.dynamicVariableConfigs) ctx.dynamicVariableConfigs = { ...options.dynamicVariableConfigs };
    if (options.dynamicVariables) ctx.layers["DYNAMIC"] = { ...options.dynamicVariables };
    if (options.environmentVariables) ctx.layers["ENVIRONMENT"] = { ...options.environmentVariables };
    if (options.suiteVariables) ctx.layers["SUITE"] = { ...options.suiteVariables };
    if (options.suiteDataRow) ctx.layers["SUITE_DATA"] = { ...options.suiteDataRow };
    if (options.scenarioVariables) ctx.layers["SCENARIO"] = { ...options.scenarioVariables };
    if (options.scenarioDataRow) ctx.layers["SCENARIO_DATA"] = { ...options.scenarioDataRow };
    if (options.scenarioOverrides) {
      ctx.layers["OVERRIDE"] = Object.fromEntries(
        Object.entries(options.scenarioOverrides).filter(([_, v]) => v !== "")
      );
    }
    return ctx;
  }
  /**
   * Merge all layers (in priority order) into a single flat record.
   */
  resolveAll() {
    const merged = {};
    for (const layerName of LAYER_PRIORITY) {
      for (const [k, v] of Object.entries(this.layers[layerName])) {
        if (layerName === "DYNAMIC" && this.dynamicVariableCaches[k] !== void 0) {
          merged[k] = this.dynamicVariableCaches[k];
        } else {
          merged[k] = v;
        }
      }
    }
    for (const [ns, vars] of Object.entries(this.namespaces)) {
      for (const [k, v] of Object.entries(vars)) {
        merged[`${ns}.${k}`] = v;
      }
    }
    return merged;
  }
  /**
   * Returns a detailed map of variables with their source information.
   * Values are interpolated to show their resolved state.
   */
  resolveDetailed() {
    const detailed = {};
    const allVars = this.resolveAll();
    for (const layerName of LAYER_PRIORITY) {
      for (const [k, v] of Object.entries(this.layers[layerName])) {
        if (layerName === "DYNAMIC" && this.dynamicVariableCaches[k] !== void 0) {
          detailed[k] = { value: this.dynamicVariableCaches[k], source: layerName };
        } else {
          detailed[k] = { value: interpolate(v, allVars), source: layerName };
        }
      }
    }
    return detailed;
  }
  /**
   * Resolve a single variable key.
   */
  resolve(key) {
    for (let i = LAYER_PRIORITY.length - 1; i >= 0; i--) {
      const layerName = LAYER_PRIORITY[i];
      const value = this.layers[layerName][key];
      if (value !== void 0) {
        if (layerName === "DYNAMIC" && this.dynamicVariableConfigs[key]) {
          const config2 = this.dynamicVariableConfigs[key];
          const strategy = config2.evaluationStrategy;
          if (strategy === "EVERY_TIME" || strategy === "ONCE_PER_RUN") {
            return value;
          }
          if (this.dynamicVariableCaches[key] !== void 0) {
            return this.dynamicVariableCaches[key];
          }
          const flatVars = this.resolveAll();
          const resolved = interpolate(value, flatVars);
          this.dynamicVariableCaches[key] = resolved;
          return resolved;
        }
        return value;
      }
    }
    return void 0;
  }
  /**
   * Formats a name into a namespace prefix (lowercase, spaces to underscores).
   */
  formatNamespace(name) {
    return name.replace(/\s+/g, "_").toLowerCase();
  }
  /**
   * 动态变量固化与命名空间自动前缀核心逻辑 (Set Runtime Variable & Auto-Prefixing)
   *
   * 解决的问题：
   * 1. 动态变量（如 {{$uuid()}}）默认每次求值都会生成新值。通过此方法将其“固化”到指定层级，实现复用。
   * 2. 自动命名空间前缀：为了避免不同 Case/Suite 提取的变量同名冲突，系统会自动根据其所在的层级
   *    （Scenario / Suite / Case）附加对应的名称前缀。
   *
   * @param key 变量名 (Variable Name)
   * @param value 固化后的值 (Resolved Value)
   * @param scope 作用域 (Scope: CASE, SUITE, SCENARIO, ENVIRONMENT)。默认是 CASE。
   * @param explicitNamespace 显式命名空间 (Explicit Namespace)。主要用于 RUN_MODULE 导出变量时指定别名。
   */
  setRuntimeVar(key, value, scope = "CASE", explicitNamespace) {
    let prefix = explicitNamespace ? this.formatNamespace(explicitNamespace) : null;
    if (scope === "CASE") {
      this.layers["CASE"][key] = value;
      if (!prefix && this.currentCaseName) prefix = this.formatNamespace(this.currentCaseName);
      if (prefix) this.layers["CASE"][`${prefix}.${key}`] = value;
    } else if (scope === "SUITE") {
      this.layers["RUNTIME_SUITE"][key] = value;
      if (!prefix && this.currentSuiteName) prefix = this.formatNamespace(this.currentSuiteName);
      if (prefix) this.layers["RUNTIME_SUITE"][`${prefix}.${key}`] = value;
    } else if (scope === "SCENARIO") {
      this.layers["RUNTIME_SCENARIO"][key] = value;
      if (!prefix && this.currentScenarioName) prefix = this.formatNamespace(this.currentScenarioName);
      if (prefix) this.layers["RUNTIME_SCENARIO"][`${prefix}.${key}`] = value;
    } else if (scope === "ENVIRONMENT") {
      this.layers["RUNTIME_ENVIRONMENT"][key] = value;
    }
    if (this.onVariableSetCallback) {
      this.onVariableSetCallback(key, value, scope);
    }
  }
  /**
   * Interpolate a template string using all resolved variables.
   */
  interpolate(template) {
    return interpolate(template, this.resolveAll(), (key, value, scope) => {
      this.setRuntimeVar(key, value, scope);
    });
  }
  /**
   * Create a child context for RUN_MODULE execution.
   * The child inherits ONLY global variables (Sandboxing), then layers module param defaults
   * and caller-provided overrides on top.
   */
  createChildContext(moduleParamDefaults, callerOverrides) {
    const parentVars = this.resolveAll();
    const resolvedOverrides = {};
    for (const [k, v] of Object.entries(callerOverrides)) {
      if (v !== "") {
        resolvedOverrides[k] = interpolate(v, parentVars, (key, value, scope) => {
          this.setRuntimeVar(key, value, scope);
        });
      }
    }
    const childContext = new _ExecutionContext();
    childContext.layers["DYNAMIC"] = { ...this.layers["DYNAMIC"] };
    childContext.layers["ENVIRONMENT"] = { ...this.layers["ENVIRONMENT"] };
    childContext.layers["RUNTIME_ENVIRONMENT"] = { ...this.layers["RUNTIME_ENVIRONMENT"] };
    childContext.layers["RUNTIME_SUITE"] = { ...this.layers["RUNTIME_SUITE"] };
    childContext.layers["RUNTIME_SCENARIO"] = { ...this.layers["RUNTIME_SCENARIO"] };
    childContext.layers["MODULE_DEFAULT"] = { ...moduleParamDefaults };
    childContext.layers["CALLER_OVERRIDE"] = resolvedOverrides;
    childContext.namespaces = JSON.parse(JSON.stringify(this.namespaces));
    childContext.setCurrentContext(this.currentScenarioName, this.currentSuiteName, this.currentCaseName);
    childContext.setCurrentStep(this.currentStepId);
    if (this.onVariableSetCallback) {
      childContext.onVariableSet(this.onVariableSetCallback);
    }
    return childContext;
  }
  /**
   * 模块调用的显式命名空间合并 (Merge Child Extracted Vars)
   *
   * 解决的问题：
   * 当用户拖拽一个 RUN_MODULE 步骤时，前端 UI 提供一个 "Namespace (导出别名)" 字段。
   * 该模块内提取的变量，返回父级时自动变为 `namespace.变量名`，从而解决模块复用时的变量冲突。
   *
   * @param childContext 子模块的执行上下文
   * @param namespace 显式指定的命名空间别名
   */
  mergeChildExtractedVars(childContext, namespace) {
    const prefix = namespace ? this.formatNamespace(namespace) : null;
    const mergeLayer = (layerName, targetScope) => {
      for (const [k, v] of Object.entries(childContext.layers[layerName])) {
        if (prefix) {
          if (!k.includes(".")) {
            this.setRuntimeVar(k, v, targetScope, namespace);
          }
        } else {
          this.layers[layerName][k] = v;
        }
      }
    };
    mergeLayer("CASE", "CASE");
    mergeLayer("RUNTIME_SUITE", "SUITE");
    mergeLayer("RUNTIME_SCENARIO", "SCENARIO");
  }
};

// server/modules/execution/assertions.ts
init_fxp();
function evaluateAssertions(context, assertions) {
  const results = [];
  for (const assertion of assertions) {
    let actualValue;
    try {
      switch (assertion.source) {
        case "API_STATUS":
          actualValue = context.status;
          break;
        case "API_HEADER":
          if (!assertion.expression) {
            throw new Error(`Expression (header name) is required for API_HEADER source.`);
          }
          const headerKey = Object.keys(context.headers).find(
            (k) => k.toLowerCase() === assertion.expression.toLowerCase()
          );
          actualValue = headerKey ? context.headers[headerKey] : void 0;
          break;
        case "API_BODY_JSON":
          if (!assertion.expression) {
            throw new Error(`Expression (JSONPath) is required for API_BODY_JSON source.`);
          }
          try {
            const parsedBody = JSON.parse(context.body);
            const jsonPathResults = JSONPath({ path: assertion.expression, json: parsedBody });
            actualValue = jsonPathResults.length > 0 ? jsonPathResults[0] : void 0;
          } catch (e) {
            throw new Error(`Could not parse response body as JSON. ${e}`);
          }
          break;
        case "API_BODY_XML":
          if (!assertion.expression) {
            throw new Error(`Expression (XPath-like) is required for API_BODY_XML source.`);
          }
          try {
            const parser = new XMLParser();
            const parsedXml = parser.parse(context.body);
            actualValue = assertion.expression.split(".").reduce((obj, key) => obj && obj[key] !== "undefined" ? obj[key] : void 0, parsedXml);
          } catch (e) {
            throw new Error(`Could not parse response body as XML. ${e}`);
          }
          break;
        default:
          throw new Error(`Unknown source ${assertion.source}`);
      }
      const expected = assertion.expectedValue;
      const actualStr = actualValue !== void 0 && actualValue !== null ? String(actualValue) : "";
      const expectedStr = expected !== void 0 && expected !== null ? String(expected) : "";
      switch (assertion.operator) {
        case "EQUALS":
          if (actualStr !== expectedStr) {
            throw new Error(`Expected '${expectedStr}', but got '${actualStr}'`);
          }
          break;
        case "NOT_EQUALS":
          if (actualStr === expectedStr) {
            throw new Error(`Expected not to equal '${expectedStr}'`);
          }
          break;
        case "CONTAINS":
          if (!actualStr.includes(expectedStr)) {
            throw new Error(`Expected '${actualStr}' to contain '${expectedStr}'`);
          }
          break;
        case "NOT_CONTAINS":
          if (actualStr.includes(expectedStr)) {
            throw new Error(`Expected '${actualStr}' not to contain '${expectedStr}'`);
          }
          break;
        case "EXISTS":
          if (actualValue === void 0 || actualValue === null) {
            throw new Error(`Expected value to exist at expression '${assertion.expression}'`);
          }
          break;
        case "NOT_EXISTS":
          if (actualValue !== void 0 && actualValue !== null) {
            throw new Error(`Expected value not to exist at expression '${assertion.expression}', but found '${actualStr}'`);
          }
          break;
        case "MATCHES_REGEX":
          if (!expected) {
            throw new Error(`Expected value (regex pattern) is required for MATCHES_REGEX.`);
          }
          const regex = new RegExp(expected);
          if (!regex.test(actualStr)) {
            throw new Error(`Expected '${actualStr}' to match regex '${expected}'`);
          }
          break;
        default:
          throw new Error(`Unknown operator ${assertion.operator}`);
      }
      results.push({ passed: true, message: "Passed", actualValue, assertion });
    } catch (e) {
      results.push({ passed: false, message: e.message, actualValue, assertion });
    }
  }
  return results;
}

// server/modules/execution/api-executor.ts
init_fxp();
var REQUEST_TIMEOUT_MS = 3e4;
function methodFromAction(action) {
  return action.replace("API_", "");
}
async function executeApiStep(step, context, assets, environment, logger, indent = "  ", onEnvVarExtracted) {
  const allVars = context.resolveAll();
  let resolvedTarget = context.interpolate(step.target || "");
  let resolvedData = context.interpolate(step.data || "");
  let apiVars = {};
  const isVariableMode = step.headerProfileId || step.bodyTemplateId || step.endpointId;
  if (isVariableMode) {
    try {
      apiVars = JSON.parse(resolvedData || "{}");
    } catch {
    }
  }
  if (step.endpointId) {
    const endpoint = assets.endpoints.find((e) => e.id === step.endpointId);
    if (endpoint) {
      const baseUrl = (endpoint.baseUrls?.[environment] || endpoint.baseUrls?.["default"] || "").replace(/\/$/, "");
      const cleanPath = resolvedTarget.replace(/^\//, "");
      resolvedTarget = `${baseUrl}/${cleanPath}`;
      if (endpoint.parameters && endpoint.parameters.length > 0) {
        const params = new URLSearchParams();
        for (const p of endpoint.parameters) {
          if (!p.enabled) continue;
          let val = p.value;
          val = resolveTemplateVars(val, apiVars, context);
          params.append(p.key, val);
        }
        const qs = params.toString();
        if (qs) {
          resolvedTarget += resolvedTarget.includes("?") ? `&${qs}` : `?${qs}`;
        }
      }
    }
  }
  resolvedTarget = resolveTemplateVars(resolvedTarget, apiVars, context);
  const requestHeaders = {};
  if (step.headerProfileId) {
    const profile = assets.headers.find((h) => h.id === step.headerProfileId);
    if (profile?.headers) {
      for (const h of profile.headers) {
        if (h.enabled === false) continue;
        requestHeaders[h.key] = resolveTemplateVars(h.value, apiVars, context);
      }
    }
  }
  let requestBody = "";
  if (step.bodyTemplateId) {
    const template = assets.bodies.find((b) => b.id === step.bodyTemplateId);
    if (template) {
      const bodyContent = template.content || "";
      const mergedForBody = { ...allVars, ...template.defaultValues, ...apiVars };
      requestBody = interpolate(bodyContent, mergedForBody, (k, v, s) => context.setRuntimeVar(k, v, s));
    }
  } else if (isVariableMode) {
    requestBody = "";
  } else {
    requestBody = resolvedData;
  }
  if (requestBody && !requestHeaders["Content-Type"] && !requestHeaders["content-type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }
  const method = methodFromAction(step.action);
  const fetchOptions = {
    method,
    headers: requestHeaders,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  };
  if (method !== "GET" && method !== "HEAD" && requestBody) {
    fetchOptions.body = requestBody;
  }
  const start = performance.now();
  const response = await fetch(resolvedTarget, fetchOptions);
  const durationMs = Math.round(performance.now() - start);
  const responseBody = await response.text();
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const assertionLogs = [];
  const extractionLogs = [];
  if (step.assertions && step.assertions.length > 0) {
    const results = evaluateAssertions({
      body: responseBody,
      headers: responseHeaders,
      status: response.status
    }, step.assertions);
    results.forEach((res) => {
      const { assertion, actualValue, passed, message } = res;
      const source = assertion.source;
      const expr = assertion.expression ? ` ${assertion.expression}` : "";
      const op = assertion.operator;
      const expectedStr = assertion.expectedValue !== void 0 ? `Expected: '${assertion.expectedValue}'` : "";
      const actualStr = actualValue !== void 0 ? `Actual: '${typeof actualValue === "object" ? JSON.stringify(actualValue) : actualValue}'` : "";
      const detailParts = [expectedStr, actualStr].filter(Boolean);
      const logSuffix = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
      if (passed) {
        assertionLogs.push({
          status: "PASS",
          level: "success",
          message: `${indent}  \u2705 Assertion Passed: [${source}]${expr} ${op}${logSuffix}`
        });
      } else {
        const isMismatch = message.includes("Expected") && message.includes("but got");
        const errorDetail = isMismatch ? "" : ` \u2014 ${message}`;
        assertionLogs.push({
          status: "FAIL",
          level: "error",
          message: `${indent}  \u274C Assertion Failed: [${source}]${expr} ${op}${logSuffix}${errorDetail}`
        });
      }
    });
  }
  if (step.extractors && step.extractors.length > 0) {
    let parsedJsonBody = null;
    let jsonParsed = false;
    for (const extractor of step.extractors) {
      if (!extractor.name) continue;
      let extractedValue;
      try {
        if ((extractor.source === "API_BODY_JSON" || extractor.source === "API_BODY_XML") && extractor.expression) {
          if (!jsonParsed) {
            try {
              parsedJsonBody = JSON.parse(responseBody);
            } catch {
              if (responseBody.trim().startsWith("<")) {
                try {
                  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
                  parsedJsonBody = parser.parse(responseBody);
                } catch (xmlErr) {
                }
              }
            }
            jsonParsed = true;
          }
          if (parsedJsonBody) {
            const result = JSONPath({ path: extractor.expression, json: parsedJsonBody });
            if (result && result.length > 0) {
              extractedValue = typeof result[0] === "object" ? JSON.stringify(result[0]) : String(result[0]);
            }
          }
        } else if (extractor.source === "API_HEADER" && extractor.expression) {
          const headerKey = extractor.expression.toLowerCase();
          const foundKey = Object.keys(responseHeaders).find((k) => k.toLowerCase() === headerKey);
          if (foundKey) {
            extractedValue = responseHeaders[foundKey];
          }
        } else if (extractor.source === "API_BODY_REGEX" && extractor.expression) {
          const regex = new RegExp(extractor.expression);
          const match = responseBody.match(regex);
          if (match && match.length > 1) {
            extractedValue = match[1];
          } else if (match && match.length === 1) {
            extractedValue = match[0];
          }
        }
        if (extractedValue !== void 0) {
          context.setRuntimeVar(extractor.name, extractedValue, extractor.scope);
          if (extractor.scope === "ENVIRONMENT" && onEnvVarExtracted) {
            onEnvVarExtracted(extractor.name, extractedValue);
          }
          extractionLogs.push({
            status: "INFO",
            level: "info",
            message: `${indent}  \u{1F4E5} Extracted Variable: ${extractor.name} = ${extractedValue.length > 50 ? extractedValue.substring(0, 50) + "..." : extractedValue}`
          });
        } else {
          extractionLogs.push({
            status: "WARN",
            level: "warn",
            message: `${indent}  \u26A0\uFE0F Extractor failed to find value for: ${extractor.name}`
          });
        }
      } catch (err) {
        console.error(`Extractor ${extractor.name} failed:`, err);
        extractionLogs.push({
          status: "WARN",
          level: "warn",
          message: `${indent}  \u26A0\uFE0F Extractor error for ${extractor.name}: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }
  }
  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,
    durationMs,
    resolvedUrl: resolvedTarget,
    resolvedMethod: method,
    resolvedHeaders: requestHeaders,
    resolvedBody: requestBody,
    assertionLogs,
    extractionLogs
  };
}
function resolveTemplateVars(value, apiVars, context) {
  if (!value) return "";
  const merged = { ...context.resolveAll(), ...apiVars };
  return interpolate(value, merged, (k, v, s) => context.setRuntimeVar(k, v, s));
}

// shared/core/executor.ts
var MAX_MODULE_DEPTH = 20;
async function executeSingleCase(payload, logger, signal, uiExecutor, onEnvVarExtracted) {
  const suite = payload.suite || payload.suites?.find((s) => s.id === payload.request.suiteId);
  if (!suite) throw new Error(`Suite ${payload.request.suiteId} not found`);
  const testCase = suite.cases.find((c) => c.id === payload.request.caseId);
  if (!testCase) throw new Error(`Case ${payload.request.caseId} not found`);
  const suiteDefaults = (suite.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {}
  );
  const firstRowData = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows[0] : {};
  const context = ExecutionContext.create({
    environmentVariables: payload.environmentVariables,
    dynamicVariables: payload.dynamicVariables,
    dynamicVariableConfigs: payload.dynamicVariableConfigs,
    suiteVariables: suiteDefaults,
    suiteDataRow: firstRowData
  });
  context.setCurrentContext(null, suite.name, testCase.name);
  context.onVariableSet((key, value, scope) => {
    logger.log({
      stepId: context.getCurrentStep() || "var-set",
      status: "INFO",
      level: "info",
      message: `\u2728 Variable Set: ${key} = ${value} (${scope})`
    });
  });
  logger.log({ stepId: "env", status: "INFO", message: `\u{1F527} Environment: ${payload.request.environment}` });
  logger.log({ stepId: `case-${testCase.id}`, status: "INFO", message: `\u{1F9EA} Running Case: ${testCase.name}` });
  let passed = true;
  try {
    if (suite.setupSteps && suite.setupSteps.length > 0) {
      logger.log({ stepId: "suite-setup", status: "INFO", message: "\u2699\uFE0F Running Suite Setup Steps" });
      await executeSteps(suite.setupSteps, context, payload, logger, signal, uiExecutor, 0, onEnvVarExtracted);
    }
    if (testCase.setupSteps && testCase.setupSteps.length > 0) {
      logger.log({ stepId: "case-setup", status: "INFO", message: "\u2699\uFE0F Running Case Setup Steps" });
      await executeSteps(testCase.setupSteps, context, payload, logger, signal, uiExecutor, 0, onEnvVarExtracted);
    }
    await executeSteps(testCase.steps, context, payload, logger, signal, uiExecutor, 0, onEnvVarExtracted);
    if (testCase.teardownSteps && testCase.teardownSteps.length > 0) {
      logger.log({ stepId: "case-teardown", status: "INFO", message: "\u{1F9F9} Running Case Teardown Steps" });
      await executeSteps(testCase.teardownSteps, context, payload, logger, signal, uiExecutor, 0);
    }
    if (suite.teardownSteps && suite.teardownSteps.length > 0) {
      logger.log({ stepId: "suite-teardown", status: "INFO", message: "\u{1F9F9} Running Suite Teardown Steps" });
      await executeSteps(suite.teardownSteps, context, payload, logger, signal, uiExecutor, 0, onEnvVarExtracted);
    }
  } catch (error) {
    passed = false;
    const msg = error instanceof Error ? error.message : String(error);
    logger.log({ stepId: "case-fail", status: "FAIL", message: `\u274C Case Failed: ${msg}` });
  } finally {
    context.clearCaseVars();
  }
  logger.log({
    stepId: "finish",
    status: passed ? "PASS" : "FAIL",
    message: passed ? "\u{1F3C1} Execution Completed Successfully" : "\u{1F3C1} Execution Completed with Failures"
  });
  return {
    reportId: "",
    status: passed ? "COMPLETED" : "FAILED",
    passRate: passed ? 100 : 0,
    totalCases: 1,
    passedCases: passed ? 1 : 0,
    failedCases: passed ? 0 : 1,
    durationMs: 0
  };
}
async function executeSuite(payload, logger, signal, uiExecutor, onEnvVarExtracted) {
  const suite = payload.suite || payload.suites?.find((s) => s.id === payload.request.suiteId);
  if (!suite) throw new Error(`Suite ${payload.request.suiteId} not found`);
  return await runSuiteWithContext(
    suite,
    null,
    // scenarioName
    {},
    // scenarioVariables
    {},
    // scenarioDataRow
    {},
    // scenarioOverrides
    "SUITE",
    payload,
    logger,
    signal,
    uiExecutor,
    {},
    // sharedRuntimeVars
    {},
    // sharedDynamicCaches
    onEnvVarExtracted
  );
}
async function runSuiteWithContext(suite, scenarioName, scenarioVariables, scenarioDataRow, scenarioOverrides, dataSource, payload, logger, signal, uiExecutor, sharedRuntimeVars, sharedDynamicCaches, onEnvVarExtracted) {
  logger.log({ stepId: `suite-${suite.id}`, status: "INFO", message: `\u{1F4E6} Executing Suite: ${suite.name}` });
  const suiteDefaults = (suite.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {}
  );
  let dataRows = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows : [{}];
  if (dataSource === "SCENARIO") {
    dataRows = [{}];
  }
  const totalCases = suite.cases.length * dataRows.length;
  let passedCases = 0;
  let failedCases = 0;
  let completedCases = 0;
  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    if (signal.aborted) throw new Error("Execution aborted");
    const rowData = dataRows[rowIdx];
    if (dataRows.length > 1) {
      logger.log({
        stepId: `data-row-${rowIdx}`,
        status: "INFO",
        message: `\u{1F4CA} Data Row ${rowIdx + 1}/${dataRows.length}`
      });
    }
    const context = ExecutionContext.create({
      environmentVariables: payload.environmentVariables,
      dynamicVariables: payload.dynamicVariables,
      dynamicVariableConfigs: payload.dynamicVariableConfigs,
      suiteVariables: suiteDefaults,
      suiteDataRow: rowData,
      scenarioVariables,
      scenarioDataRow,
      scenarioOverrides
    });
    context.setCurrentContext(scenarioName, suite.name, null);
    context.onVariableSet((key, value, scope) => {
      logger.log({
        stepId: context.getCurrentStep() || "var-set",
        status: "INFO",
        level: "info",
        message: `\u2728 Variable Set: ${key} = ${value} (${scope})`
      });
    });
    context.setSharedRuntimeVars(sharedRuntimeVars);
    context.setDynamicVariableCaches(sharedDynamicCaches);
    if (suite.setupSteps && suite.setupSteps.length > 0) {
      logger.log({ stepId: "suite-setup", status: "INFO", message: "\u2699\uFE0F Running Suite Setup Steps" });
      await executeSteps(suite.setupSteps, context, payload, logger, signal, uiExecutor, 0, onEnvVarExtracted);
    }
    for (const testCase of suite.cases) {
      if (signal.aborted) throw new Error("Execution aborted");
      context.setCurrentContext(scenarioName, suite.name, testCase.name);
      logger.log({
        stepId: `case-${testCase.id}`,
        status: "INFO",
        message: `  \u{1F9EA} Running Case: ${testCase.name}`
      });
      let casePassed = true;
      try {
        if (testCase.setupSteps && testCase.setupSteps.length > 0) {
          await executeSteps(testCase.setupSteps, context, payload, logger, signal, uiExecutor, 1);
        }
        await executeSteps(testCase.steps, context, payload, logger, signal, uiExecutor, 1);
        if (testCase.teardownSteps && testCase.teardownSteps.length > 0) {
          await executeSteps(testCase.teardownSteps, context, payload, logger, signal, uiExecutor, 1, onEnvVarExtracted);
        }
      } catch (error) {
        casePassed = false;
        const msg = error instanceof Error ? error.message : String(error);
        logger.log({
          stepId: `case-${testCase.id}-fail`,
          status: "FAIL",
          message: `  \u274C Case Failed: ${msg}`
        });
      } finally {
        context.clearCaseVars();
      }
      if (casePassed) passedCases++;
      else failedCases++;
      completedCases++;
      logger.progress({
        completed: completedCases,
        total: totalCases,
        percent: Math.round(completedCases / totalCases * 100)
      });
    }
    if (suite.teardownSteps && suite.teardownSteps.length > 0) {
      logger.log({ stepId: "suite-teardown", status: "INFO", message: "\u{1F9F9} Running Suite Teardown Steps" });
      await executeSteps(suite.teardownSteps, context, payload, logger, signal, uiExecutor, 0, onEnvVarExtracted);
    }
    Object.assign(sharedDynamicCaches, context.getDynamicVariableCaches());
    context.clearSuiteVars();
  }
  const allPassed = failedCases === 0;
  return {
    reportId: "",
    status: allPassed ? "COMPLETED" : "FAILED",
    passRate: totalCases > 0 ? Math.min(100, Math.round(passedCases / totalCases * 100)) : 100,
    totalCases,
    passedCases,
    failedCases,
    durationMs: 0
  };
}
async function executePlan(payload, logger, signal, uiExecutor, onEnvVarExtracted) {
  const plan = payload.project.plans?.find((p) => p.id === payload.request.planId);
  if (!plan) throw new Error(`Plan ${payload.request.planId} not found`);
  logger.log({
    stepId: "plan",
    status: "INFO",
    message: `\u{1F4CB} Executing Plan: ${plan.name}`
  });
  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;
  for (const planScenario of plan.scenarios || []) {
    if (signal.aborted) throw new Error("Execution aborted");
    const scenario = payload.project.scenarios?.find((s) => s.id === planScenario.scenarioId);
    if (!scenario) {
      logger.log({
        stepId: `ps-${planScenario.id}`,
        status: "FAIL",
        message: `\u274C Scenario ${planScenario.scenarioId} not found`
      });
      continue;
    }
    logger.log({
      stepId: `ps-${planScenario.id}`,
      status: "INFO",
      message: `\u{1F3AC} Executing Scenario: ${scenario.name}`
    });
    const scenarioVariables = (scenario.variables || []).reduce(
      (acc, v) => ({ ...acc, [v.key]: v.value }),
      {}
    );
    const scenarioDataRows = scenario.dataRows && scenario.dataRows.length > 0 ? scenario.dataRows : [{}];
    for (let sRowIdx = 0; sRowIdx < scenarioDataRows.length; sRowIdx++) {
      if (signal.aborted) throw new Error("Execution aborted");
      const scenarioRow = scenarioDataRows[sRowIdx];
      if (scenarioDataRows.length > 1) {
        logger.log({
          stepId: `scenario-row-${sRowIdx}`,
          status: "INFO",
          message: `\u{1F504} Scenario Iteration ${sRowIdx + 1}/${scenarioDataRows.length}`
        });
      }
      const sharedRuntimeVars = {};
      const sharedDynamicCaches = {};
      for (const scenarioSuite of scenario.suites || []) {
        if (signal.aborted) throw new Error("Execution aborted");
        const suite = payload.suite || payload.suites?.find((s) => s.id === scenarioSuite.suiteId);
        if (!suite) {
          logger.log({
            stepId: `ss-${scenarioSuite.id}`,
            status: "FAIL",
            message: `\u274C Suite ${scenarioSuite.suiteId} not found`
          });
          continue;
        }
        const suiteResult = await runSuiteWithContext(
          suite,
          scenario.name,
          scenarioVariables,
          scenarioRow,
          scenarioSuite.variableOverrides || {},
          scenarioSuite.dataSource || "SCENARIO",
          payload,
          logger,
          signal,
          uiExecutor,
          sharedRuntimeVars,
          sharedDynamicCaches,
          onEnvVarExtracted
        );
        totalCases += suiteResult.totalCases;
        passedCases += suiteResult.passedCases;
        failedCases += suiteResult.failedCases;
      }
    }
  }
  const allPassed = failedCases === 0;
  logger.log({
    stepId: "plan-finish",
    status: allPassed ? "PASS" : "FAIL",
    message: allPassed ? `\u{1F3C1} Plan Completed Successfully (${passedCases}/${totalCases} passed)` : `\u{1F3C1} Plan Completed with Failures (${passedCases}/${totalCases} passed)`
  });
  return {
    reportId: "",
    status: allPassed ? "COMPLETED" : "FAILED",
    passRate: totalCases > 0 ? Math.min(100, Math.round(passedCases / totalCases * 100)) : 100,
    totalCases,
    passedCases,
    failedCases,
    durationMs: 0
  };
}
async function executeScenario(payload, logger, signal, uiExecutor, onEnvVarExtracted) {
  const scenario = payload.project.scenarios?.find((s) => s.id === payload.request.scenarioId);
  if (!scenario) throw new Error(`Scenario ${payload.request.scenarioId} not found`);
  logger.log({
    stepId: "scenario",
    status: "INFO",
    message: `\u{1F3AC} Executing Scenario: ${scenario.name}`
  });
  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;
  const scenarioVariables = (scenario.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {}
  );
  const scenarioDataRows = scenario.dataRows && scenario.dataRows.length > 0 ? scenario.dataRows : [{}];
  for (let sRowIdx = 0; sRowIdx < scenarioDataRows.length; sRowIdx++) {
    if (signal.aborted) throw new Error("Execution aborted");
    const scenarioRow = scenarioDataRows[sRowIdx];
    if (scenarioDataRows.length > 1) {
      logger.log({
        stepId: `scenario-row-${sRowIdx}`,
        status: "INFO",
        message: `\u{1F504} Scenario Iteration ${sRowIdx + 1}/${scenarioDataRows.length}`
      });
    }
    const sharedRuntimeVars = {};
    const sharedDynamicCaches = {};
    for (const scenarioSuite of scenario.suites || []) {
      if (signal.aborted) throw new Error("Execution aborted");
      const suite = payload.suite || payload.suites?.find((s) => s.id === scenarioSuite.suiteId);
      if (!suite) {
        logger.log({
          stepId: `ss-${scenarioSuite.id}`,
          status: "FAIL",
          message: `\u274C Suite ${scenarioSuite.suiteId} not found`
        });
        continue;
      }
      const suiteResult = await runSuiteWithContext(
        suite,
        scenario.name,
        scenarioVariables,
        scenarioRow,
        scenarioSuite.variableOverrides || {},
        scenarioSuite.dataSource || "SCENARIO",
        payload,
        logger,
        signal,
        uiExecutor,
        sharedRuntimeVars,
        sharedDynamicCaches,
        onEnvVarExtracted
      );
      totalCases += suiteResult.totalCases;
      passedCases += suiteResult.passedCases;
      failedCases += suiteResult.failedCases;
    }
  }
  const allPassed = failedCases === 0;
  logger.log({
    stepId: "scenario-finish",
    status: allPassed ? "PASS" : "FAIL",
    message: allPassed ? `\u{1F3C1} Scenario Completed Successfully (${passedCases}/${totalCases} passed)` : `\u{1F3C1} Scenario Completed with Failures (${passedCases}/${totalCases} passed)`
  });
  return {
    reportId: "",
    status: allPassed ? "COMPLETED" : "FAILED",
    passRate: totalCases > 0 ? Math.min(100, Math.round(passedCases / totalCases * 100)) : 100,
    totalCases,
    passedCases,
    failedCases,
    durationMs: 0
  };
}
async function executeSteps(steps, context, payload, logger, signal, uiExecutor, depth, onEnvVarExtracted) {
  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) throw new Error("Execution aborted");
    const step = steps[i];
    const indent = "  ".repeat(depth);
    context.setCurrentStep(step.id);
    if (step.enabled === false) {
      logger.log({
        stepId: step.id,
        status: "SKIP",
        message: `${indent}\u23ED\uFE0F Step Skipped (disabled): ${step.action}`
      });
      continue;
    }
    if (step.action === "RUN_MODULE") {
      if (depth >= MAX_MODULE_DEPTH) {
        throw new Error(`Max module depth (${MAX_MODULE_DEPTH}) exceeded \u2014 possible infinite recursion`);
      }
      const moduleId = step.target;
      const module = payload.project.modules?.find((m) => m.id === moduleId);
      if (!module) {
        logger.log({ stepId: step.id, status: "FAIL", message: `${indent}\u274C Module Not Found: ${moduleId}` });
        throw new Error(`Module ${moduleId} not found`);
      }
      logger.log({ stepId: step.id, status: "RUNNING", message: `${indent}\u{1F4E6} Executing Module: ${module.name}` });
      const moduleDefaults = {};
      for (const p of module.params || []) {
        moduleDefaults[p.name] = p.defaultValue || "";
      }
      let overrides = {};
      try {
        if (step.data) overrides = JSON.parse(step.data);
      } catch {
      }
      const childContext = context.createChildContext(moduleDefaults, overrides);
      await executeSteps(module.steps || [], childContext, payload, logger, signal, uiExecutor, depth + 1, onEnvVarExtracted);
      context.mergeChildExtractedVars(childContext, step.namespace);
      logger.log({ stepId: step.id, status: "PASS", message: `${indent}\u2705 Module Completed: ${module.name}` });
      continue;
    }
    if (step.action.trim().toUpperCase() === "WAIT") {
      const ms = parseInt(context.interpolate(step.data || "1000"), 10) || 1e3;
      logger.log({ stepId: step.id, status: "RUNNING", message: `${indent}\u23F3 Waiting ${ms}ms` });
      await new Promise((resolve) => setTimeout(resolve, ms));
      logger.log({ stepId: step.id, status: "PASS", message: `${indent}\u2705 Wait completed` });
      continue;
    }
    if (step.action.startsWith("API_")) {
      const resolvedTarget = context.interpolate(step.target || "");
      logger.log({
        stepId: step.id,
        status: "RUNNING",
        level: "info",
        message: `${indent}\u{1F310} [${step.action}] ${resolvedTarget}`
      });
      let result = void 0;
      try {
        result = await executeApiStep(step, context, payload.assets, payload.request.environment, logger, indent, onEnvVarExtracted);
        const isSuccess = result.status >= 200 && result.status < 400;
        const bodyPreview = result.body.length > 200 ? result.body.slice(0, 200) + "\u2026" : result.body;
        logger.log({
          stepId: step.id,
          status: isSuccess ? "PASS" : "FAIL",
          level: isSuccess ? "success" : "error",
          message: `${indent}${isSuccess ? "\u2705" : "\u274C"} ${result.resolvedMethod} ${result.resolvedUrl} \u2192 ${result.status} ${result.statusText} (${result.durationMs}ms)`,
          metadata: {
            network: {
              url: result.resolvedUrl,
              method: result.resolvedMethod,
              status: result.status,
              requestHeaders: result.resolvedHeaders,
              requestBody: result.resolvedBody,
              responseHeaders: result.headers,
              responseBody: result.body,
              durationMs: result.durationMs
            },
            variables: context.resolveDetailed()
          }
        });
        if (logger) {
          result.assertionLogs.forEach((log) => logger.log({ ...log, stepId: step.id }));
          result.extractionLogs.forEach((log) => logger.log({ ...log, stepId: step.id }));
        }
        const anyAssertionFailed = result.assertionLogs.some((log) => log.status === "FAIL");
        if (!isSuccess) {
          throw new Error(`API request failed: ${result.status} ${result.statusText}`);
        }
        if (anyAssertionFailed) {
          const failureLog = result.assertionLogs.find((log) => log.status === "FAIL");
          const err = new Error(failureLog?.message.trim().replace(/^❌\s*/, "") || "Assertion Failed");
          err.isAssertionFailure = true;
          throw err;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (error instanceof Error && (msg.startsWith("API request failed:") || error.isAssertionFailure)) {
          throw error;
        }
        logger.log({
          stepId: step.id,
          status: "FAIL",
          level: "error",
          message: `${indent}\u274C Request Error: ${msg}`,
          metadata: {
            errorStack: error instanceof Error ? error.stack : void 0,
            variables: context.resolveAll()
          }
        });
        throw error;
      }
      continue;
    }
    let uiResult = void 0;
    try {
      const allSettings = [payload.settings];
      const settings = allSettings.find((s) => s.currentProjectId === payload.project.id) || allSettings[0];
      const isHeadless = settings ? settings.headlessMode !== false : true;
      const recordVideo = settings ? settings.recordVideo !== false : true;
      await uiExecutor.initialize({
        headless: isHeadless,
        viewportWidth: settings?.viewportWidth,
        viewportHeight: settings?.viewportHeight,
        recordVideo,
        logger
      });
      const resolvedTarget = context.interpolate(step.target || "");
      logger.log({
        stepId: step.id,
        status: "RUNNING",
        level: "info",
        message: `${indent}\u{1F4BB} [${step.action}] ${resolvedTarget ? resolvedTarget + " " : ""}${step.data ? "(" + context.interpolate(step.data) + ")" : ""}`
      });
      uiResult = await uiExecutor.executeStep(step, context, payload.project.pages || [], payload.request.environment, onEnvVarExtracted);
      let logMessage = `${indent}\u2705 [${step.action}] Completed (${uiResult.durationMs}ms)`;
      if (step.action.startsWith("ASSERT_") && uiResult.assertionDetails) {
        const { expected, actual, target } = uiResult.assertionDetails;
        const targetStr = target ? ` ${target}` : "";
        logMessage = `${indent}\u2705 Assertion Passed: [${step.action}]${targetStr} (Expected: '${expected}', Actual: '${actual}')`;
      }
      logger.log({
        stepId: step.id,
        status: "PASS",
        level: "success",
        message: logMessage,
        screenshot: uiResult.screenshot,
        metadata: {
          variables: context.resolveDetailed(),
          extractedValue: uiResult.extractedValue,
          assertionDetails: uiResult.assertionDetails
        }
      });
      if (logger && uiResult.logs) {
        uiResult.logs.forEach((log) => logger.log({ ...log, stepId: step.id }));
      }
      const anySmartWaitFailed = uiResult.logs?.some((l) => l.status === "FAIL" && l.message.includes("Smart Wait Assertion Failed"));
      if (anySmartWaitFailed) {
        const failure = uiResult.logs.find((l) => l.status === "FAIL" && l.message.includes("Smart Wait Assertion Failed"));
        const err = new Error(failure?.message.trim().replace(/^❌\s*/, "") || "Smart Wait Assertion Failed");
        err.isAssertionFailure = true;
        throw err;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.isAssertionFailure) {
        throw error;
      }
      const failScreenshot = await uiExecutor.captureStateScreenshot();
      let logMessage = `${indent}\u274C UI Action Failed: ${msg}`;
      if (step.action.startsWith("ASSERT_") && error.assertionDetails) {
        const { expected, actual, target } = error.assertionDetails;
        const targetStr = target ? ` ${target}` : "";
        logMessage = `${indent}\u274C Assertion Failed: [${step.action}]${targetStr} (Expected: '${expected}', Actual: '${actual}')`;
      }
      logger.log({
        stepId: step.id,
        status: "FAIL",
        level: "error",
        message: logMessage,
        screenshot: failScreenshot || void 0,
        metadata: {
          errorStack: error instanceof Error ? error.stack : void 0,
          variables: context.resolveDetailed(),
          assertionDetails: error.assertionDetails
        }
      });
      throw error;
    }
  }
}

// server/modules/execution/ui-executor.ts
import { chromium } from "playwright";
var DEFAULT_TIMEOUT = 1e4;
var SCREENSHOT_QUALITY = 50;
var UIExecutor = class {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.dialogHandler = null;
  }
  async initialize(options) {
    this.logger = options.logger;
    if (!this.browser) {
      const useResolution = options.headless && !!options.viewportWidth && !!options.viewportHeight;
      this.browser = await chromium.launch({
        headless: options.headless,
        args: options.headless ? [] : ["--start-maximized"]
      });
      this.context = await this.browser.newContext({
        viewport: useResolution ? { width: options.viewportWidth, height: options.viewportHeight } : null,
        // null viewport allows the page to scale to the maximized window
        recordVideo: options.recordVideo !== false ? { dir: "videos/" } : void 0
      });
      this.page = await this.context.newPage();
      if (this.logger) {
        this.page.on("console", (msg) => {
          this.logger?.log({
            stepId: "system-console",
            status: "INFO",
            level: msg.type() === "error" ? "error" : msg.type() === "warning" ? "warn" : "debug",
            message: `[Browser Console] ${msg.text()}`
          });
        });
        this.page.on("request", (request) => {
          this.logger?.log({
            stepId: "system-network",
            status: "INFO",
            level: "debug",
            message: `[Network Request] ${request.method()} ${request.url()}`,
            metadata: {
              network: {
                url: request.url(),
                method: request.method(),
                isMocked: false
              }
            }
          });
        });
        this.page.on("response", async (response) => {
          const request = response.request();
          this.logger?.log({
            stepId: "system-network",
            status: "INFO",
            level: response.status() >= 400 ? "warn" : "debug",
            message: `[Network Response] ${request.method()} ${request.url()} - ${response.status()}`,
            metadata: {
              network: {
                url: request.url(),
                method: request.method(),
                status: response.status(),
                isMocked: false
              }
            }
          });
        });
      }
    }
  }
  async executeStep(step, executionContext, pages, environment, onEnvVarExtracted) {
    if (!this.page) {
      throw new Error("UIExecutor not initialized. Call initialize() first.");
    }
    const startTime = Date.now();
    let extractedValue;
    let assertionDetails = void 0;
    const logs = [];
    let candidateLocators = [];
    if (step.target) {
      const interpolated = executionContext.interpolate(step.target);
      let elementDef;
      if (interpolated.includes(".")) {
        const dotIdx = interpolated.indexOf(".");
        const pageName = interpolated.slice(0, dotIdx).trim().toLowerCase();
        const elName = interpolated.slice(dotIdx + 1).trim().toLowerCase();
        const page = pages.find((p) => p.name.toLowerCase() === pageName);
        if (page) {
          elementDef = (page.elements || []).find((e) => e.name.toLowerCase() === elName);
        }
      }
      if (!elementDef) {
        const flatInterp = interpolated.toLowerCase();
        for (const p of pages) {
          elementDef = (p.elements || []).find(
            (e) => e.id === interpolated || e.name.toLowerCase() === flatInterp
          );
          if (elementDef) break;
        }
      }
      if (elementDef) {
        candidateLocators = [{ selectorType: elementDef.selectorType, value: elementDef.value }];
        if (elementDef.locators && elementDef.locators.length > 0) {
          for (const loc of elementDef.locators) {
            if (loc.value !== elementDef.value) {
              candidateLocators.push(loc);
            }
          }
        }
      } else {
        candidateLocators = [{ selectorType: "css", value: interpolated }];
      }
    }
    let data = step.data;
    if (data) {
      data = executionContext.interpolate(data);
    }
    const createLocator = (loc) => {
      const st = loc.selectorType.toLowerCase();
      const val = executionContext.interpolate(loc.value);
      if (st === "css" || st === "CSS") {
        return { locator: this.page.locator(val), methodInfo: `css(${val})` };
      } else if (st === "xpath") {
        return { locator: this.page.locator(`xpath=${val}`), methodInfo: `xpath(${val})` };
      } else if (st === "text") {
        return { locator: this.page.locator(`text=${val}`), methodInfo: `text(${val})` };
      } else if (st === "testid" || st === "getbytestid" || st === "data-test") {
        return { locator: this.page.getByTestId(val), methodInfo: `getByTestId(${val})` };
      } else if (["getbylabel", "getbyrole", "getbytext", "getbyplaceholder", "getbyalttext"].includes(st)) {
        switch (st) {
          case "getbylabel":
            return { locator: this.page.getByLabel(val), methodInfo: `getByLabel(${val})` };
          case "getbytext":
            return { locator: this.page.getByText(val), methodInfo: `getByText(${val})` };
          case "getbyplaceholder":
            return { locator: this.page.getByPlaceholder(val), methodInfo: `getByPlaceholder(${val})` };
          case "getbyalttext":
            return { locator: this.page.getByAltText(val), methodInfo: `getByAltText(${val})` };
          case "getbyrole": {
            let role = val;
            let options = {};
            if (val.includes("{")) {
              const parts = val.split(/,(?=\s*\{)/);
              role = parts[0].trim();
              const optionsStr = parts[1]?.trim();
              if (optionsStr) {
                const nameMatch = optionsStr.match(/(?:['"]?name['"]?)\s*:\s*(['"])(.*?)\1/);
                if (nameMatch) options.name = nameMatch[2];
                const exactMatch = optionsStr.match(/(?:['"]?exact['"]?)\s*:\s*(true|false)/);
                if (exactMatch) options.exact = exactMatch[1] === "true";
              }
            } else if (val.includes("[name=")) {
              const bracketMatch = val.match(/^(\w+)\[name=['"](.+)['"]\]$/);
              if (bracketMatch) {
                role = bracketMatch[1];
                options.name = bracketMatch[2];
              }
            }
            return { locator: this.page.getByRole(role, options), methodInfo: `getByRole(${role}, ${JSON.stringify(options)})` };
          }
        }
      }
      return { locator: this.page.locator(val), methodInfo: `locator(${val})` };
    };
    const getSmartLocator = async (options) => {
      let lastError = null;
      for (const locInfo of candidateLocators) {
        const { locator: base, methodInfo } = createLocator(locInfo);
        try {
          await base.first().waitFor({ state: "attached", timeout: lastError ? 2e3 : 5e3 });
          let finalLocator = base;
          const count = await base.count();
          if (count > 1) {
            const visibleFilter = base.filter({ visible: true });
            const visibleCount = await visibleFilter.count();
            if (visibleCount > 0) {
              finalLocator = visibleFilter;
            }
          }
          const target = finalLocator.first();
          if (!options?.skipActionabilityCheck) {
            await target.waitFor({ state: "visible", timeout: 3e3 }).catch(() => {
              console.warn(`Element found via ${methodInfo} but not visible.`);
            });
          }
          console.log(`[EXEC] Successfully resolved element via: ${methodInfo}`);
          return target;
        } catch (e) {
          lastError = e;
          console.warn(`[EXEC] Locator failed: ${methodInfo}. Trying next...`);
          continue;
        }
      }
      throw new Error(`Element not found after trying ${candidateLocators.length} locators for: ${step.target}. Last error: ${lastError?.message}`);
    };
    const performActionWithFallback = async (locator, action, fallbackEval, ...fallbackArgs) => {
      try {
        await action();
      } catch (e) {
        if (fallbackEval) {
          await locator.evaluate(fallbackEval, ...fallbackArgs);
        } else {
          throw e;
        }
      }
    };
    if (step.networkMocks && step.networkMocks.some((m) => m.enabled)) {
      for (const mock of step.networkMocks) {
        if (!mock.enabled || !mock.urlPattern) continue;
        const resolvedUrlPattern = executionContext.interpolate(mock.urlPattern);
        const pattern = new RegExp(resolvedUrlPattern);
        await this.page.route(pattern, async (route, request) => {
          if (mock.method && mock.method !== "ANY" && request.method().toUpperCase() !== mock.method.toUpperCase()) {
            return route.fallback();
          }
          if (mock.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
          }
          logs.push({
            status: "INFO",
            level: "info",
            message: `[Mock Hit] ${request.method()} ${request.url()} -> ${mock.status || 200}`
          });
          await route.fulfill({
            status: mock.status || 200,
            contentType: "application/json",
            body: executionContext.interpolate(mock.body || "{}")
          });
        });
      }
    }
    let waitPromise;
    if (step.waitForNetwork?.enabled && step.waitForNetwork.urlPattern) {
      const { urlPattern, method, expectedStatus, timeoutMs = 1e4 } = step.waitForNetwork;
      const resolvedUrlPattern = executionContext.interpolate(urlPattern);
      waitPromise = this.page.waitForResponse((response) => {
        const urlMatch = response.url().includes(resolvedUrlPattern) || new RegExp(resolvedUrlPattern).test(response.url());
        const methodMatch = !method || method === "ANY" || response.request().method().toUpperCase() === method.toUpperCase();
        const statusMatch = !expectedStatus || response.status() === expectedStatus;
        return urlMatch && methodMatch && statusMatch;
      }, { timeout: timeoutMs });
    }
    const resolvedSelector = step.target ? executionContext.interpolate(step.target) : "";
    const actionPromise = (async () => {
      switch (step.action) {
        case "OPEN":
          if (!data) throw new Error("Data (URL) is required for OPEN step");
          await this.page.goto(data, { waitUntil: "domcontentloaded" });
          break;
        case "WAIT":
          if (data) {
            const waitTime = parseInt(data, 10);
            if (!isNaN(waitTime)) {
              await this.page.waitForTimeout(waitTime);
            }
          }
          break;
        case "WAIT_FOR_VISIBLE": {
          const locator = await getSmartLocator({ skipActionabilityCheck: true });
          await locator.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
          break;
        }
        case "WAIT_FOR_INVISIBLE": {
          const locator = await getSmartLocator({ skipActionabilityCheck: true });
          await locator.waitFor({ state: "hidden", timeout: DEFAULT_TIMEOUT });
          break;
        }
        case "CLICK": {
          const locator = await getSmartLocator();
          await performActionWithFallback(
            locator,
            () => locator.click({ timeout: DEFAULT_TIMEOUT, force: true }),
            (node) => node.click()
          );
          break;
        }
        case "DOUBLE_CLICK": {
          const locator = await getSmartLocator();
          await locator.dblclick({ timeout: DEFAULT_TIMEOUT, force: true });
          break;
        }
        case "RIGHT_CLICK": {
          const locator = await getSmartLocator();
          await locator.click({ button: "right", timeout: DEFAULT_TIMEOUT, force: true });
          break;
        }
        case "TYPE": {
          if (data === void 0) throw new Error("Data is required for TYPE step");
          const locator = await getSmartLocator();
          await performActionWithFallback(
            locator,
            () => locator.fill(data, { timeout: DEFAULT_TIMEOUT, force: true }),
            (node, val) => {
              node.value = val;
              node.dispatchEvent(new Event("input", { bubbles: true }));
              node.dispatchEvent(new Event("change", { bubbles: true }));
            },
            data
          );
          break;
        }
        case "CLEAR": {
          const locator = await getSmartLocator();
          await performActionWithFallback(
            locator,
            () => locator.clear({ timeout: DEFAULT_TIMEOUT, force: true }),
            (node) => {
              node.value = "";
              node.dispatchEvent(new Event("input", { bubbles: true }));
              node.dispatchEvent(new Event("change", { bubbles: true }));
            }
          );
          break;
        }
        case "HOVER":
          await (await getSmartLocator()).hover({ timeout: DEFAULT_TIMEOUT, force: true });
          break;
        case "HIGHLIGHT": {
          const locator = await getSmartLocator({ skipActionabilityCheck: true });
          await locator.evaluate(async (node) => {
            if (node.scrollIntoView) {
              node.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            await new Promise((r) => setTimeout(r, 100));
            const originalBorder = node.style.border;
            const originalBackground = node.style.backgroundColor;
            for (let i = 0; i < 4; i++) {
              node.style.border = "3px solid red";
              node.style.backgroundColor = "yellow";
              await new Promise((r) => setTimeout(r, 250));
              node.style.border = originalBorder;
              node.style.backgroundColor = originalBackground;
              await new Promise((r) => setTimeout(r, 250));
            }
          });
          break;
        }
        case "SCROLL_TO": {
          const locator = await getSmartLocator();
          await locator.scrollIntoViewIfNeeded({ timeout: DEFAULT_TIMEOUT });
          break;
        }
        case "CHECK": {
          const locator = await getSmartLocator();
          await locator.check({ timeout: DEFAULT_TIMEOUT, force: true });
          break;
        }
        case "UNCHECK": {
          const locator = await getSmartLocator();
          await locator.uncheck({ timeout: DEFAULT_TIMEOUT, force: true });
          break;
        }
        case "TOGGLE": {
          const locator = await getSmartLocator();
          const isChecked = await locator.isChecked();
          if (isChecked) {
            await locator.uncheck({ timeout: DEFAULT_TIMEOUT, force: true });
          } else {
            await locator.check({ timeout: DEFAULT_TIMEOUT, force: true });
          }
          break;
        }
        case "SELECT_OPTION": {
          if (data === void 0) throw new Error("Data is required for SELECT_OPTION step");
          const locator = await getSmartLocator();
          await locator.selectOption(data, { timeout: DEFAULT_TIMEOUT });
          break;
        }
        case "PRESS_KEY":
          if (data) {
            if (step.target && resolvedSelector) {
              const locator = await getSmartLocator();
              await locator.focus({ timeout: DEFAULT_TIMEOUT });
            }
            await this.page.keyboard.press(data);
          } else if (resolvedSelector) {
            await this.page.keyboard.press(resolvedSelector);
          } else {
            throw new Error("Either data (key name) or target (element) is required for PRESS_KEY step");
          }
          break;
        case "ASSERT_VISIBLE": {
          const locator = await getSmartLocator();
          assertionDetails = { expected: "VISIBLE", actual: "VISIBLE", target: resolvedSelector };
          try {
            await locator.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
          } catch (e) {
            assertionDetails.actual = "HIDDEN/MISSING";
            e.assertionDetails = assertionDetails;
            throw e;
          }
          break;
        }
        case "ASSERT_INVISIBLE": {
          const locator = await getSmartLocator();
          assertionDetails = { expected: "HIDDEN", actual: "HIDDEN", target: resolvedSelector };
          try {
            await locator.waitFor({ state: "hidden", timeout: DEFAULT_TIMEOUT });
          } catch (e) {
            assertionDetails.actual = "VISIBLE";
            e.assertionDetails = assertionDetails;
            throw e;
          }
          break;
        }
        case "ASSERT_DISABLED": {
          const locator = await getSmartLocator();
          const isDisabled = await locator.isDisabled({ timeout: DEFAULT_TIMEOUT });
          assertionDetails = { expected: "DISABLED", actual: isDisabled ? "DISABLED" : "ENABLED", target: resolvedSelector };
          if (!isDisabled) {
            const err = new Error(`Assertion failed: Expected element to be DISABLED, but it is ENABLED`);
            err.assertionDetails = assertionDetails;
            throw err;
          }
          break;
        }
        case "ASSERT_TEXT":
          if (data === void 0) throw new Error("Data is required for ASSERT_TEXT step");
          {
            const locator = await getSmartLocator();
            const text = await locator.textContent({ timeout: DEFAULT_TIMEOUT }) || "";
            assertionDetails = { expected: `CONTAINS '${data}'`, actual: text, target: resolvedSelector };
            if (!text.includes(data)) {
              const err = new Error(`Assertion failed: Expected text to CONTAINS '${data}', but got '${text}'`);
              err.assertionDetails = assertionDetails;
              throw err;
            }
          }
          break;
        case "ASSERT_VALUE":
          if (data === void 0) throw new Error("Data is required for ASSERT_VALUE step");
          {
            const locator = await getSmartLocator();
            const val = await locator.inputValue({ timeout: DEFAULT_TIMEOUT });
            assertionDetails = { expected: `EQUALS '${data}'`, actual: val, target: resolvedSelector };
            if (val !== data) {
              const err = new Error(`Assertion failed: Expected value EQUALS '${data}', but got '${val}'`);
              err.assertionDetails = assertionDetails;
              throw err;
            }
          }
          break;
        case "ASSERT_URL":
          if (data === void 0) throw new Error("Data (expected URL) is required for ASSERT_URL step");
          {
            const currentUrl = this.page.url();
            assertionDetails = { expected: `CONTAINS '${data}'`, actual: currentUrl };
            if (!currentUrl.includes(data) && currentUrl !== data) {
              const err = new Error(`Assertion failed: Expected URL to CONTAINS '${data}', but got '${currentUrl}'`);
              err.assertionDetails = assertionDetails;
              throw err;
            }
          }
          break;
        case "ASSERT_TITLE":
          if (data === void 0) throw new Error("Data (expected title) is required for ASSERT_TITLE step");
          {
            const title = await this.page.title();
            assertionDetails = { expected: `CONTAINS '${data}'`, actual: title };
            if (!title.includes(data)) {
              const err = new Error(`Assertion failed: Expected title to CONTAINS '${data}', but got '${title}'`);
              err.assertionDetails = assertionDetails;
              throw err;
            }
          }
          break;
        case "EXTRACT_VAR":
          if (!data) throw new Error("Data (variable key) is required for EXTRACT_VAR step");
          {
            const locator = await getSmartLocator({ skipActionabilityCheck: true });
            const text = await locator.textContent({ timeout: DEFAULT_TIMEOUT });
            extractedValue = text?.trim() || "";
            executionContext.setRuntimeVar(data, extractedValue);
          }
          break;
        case "EVALUATE_JS":
          if (data) {
            const jsResult = await this.page.evaluate(data);
            extractedValue = String(jsResult);
          }
          break;
        case "SWITCH_TO_WINDOW": {
          const target = data || resolvedSelector;
          if (!target) throw new Error("Target URL or title is required for SWITCH_TO_WINDOW step");
          if (this.context) {
            const pages2 = this.context.pages();
            let found = false;
            for (const page of pages2) {
              const url = page.url();
              const title = await page.title();
              if (url.includes(target) || url === target || title.includes(target)) {
                this.page = page;
                found = true;
                break;
              }
            }
            if (!found) {
              throw new Error(`Window with URL or title matching "${target}" not found`);
            }
          }
          break;
        }
        case "SWITCH_TO_FRAME": {
          if (!resolvedSelector) throw new Error("Frame selector is required for SWITCH_TO_FRAME step");
          const locator = await getSmartLocator();
          const frameElement = await locator.elementHandle({ timeout: DEFAULT_TIMEOUT });
          if (!frameElement) throw new Error(`Frame element not found: ${resolvedSelector}`);
          const frame = await frameElement.contentFrame();
          if (!frame) throw new Error(`Could not access frame content: ${resolvedSelector}`);
          this.page = frame;
          break;
        }
        case "ACCEPT_ALERT":
          if (this.dialogHandler) {
            this.page.off("dialog", this.dialogHandler);
          }
          this.dialogHandler = async (dialog) => {
            await dialog.accept(data || "");
          };
          this.page.once("dialog", this.dialogHandler);
          break;
        case "DISMISS_ALERT":
          if (this.dialogHandler) {
            this.page.off("dialog", this.dialogHandler);
          }
          this.dialogHandler = async (dialog) => {
            await dialog.dismiss();
          };
          this.page.once("dialog", this.dialogHandler);
          break;
        case "ATTACH_FILE": {
          if (!data) throw new Error("Data (file path) is required for ATTACH_FILE step");
          const locator = await getSmartLocator();
          const filePaths = data.split(",").map((p) => p.trim());
          await locator.setInputFiles(filePaths, { timeout: DEFAULT_TIMEOUT });
          break;
        }
        case "DRAG_AND_DROP": {
          if (!data) throw new Error("Data (target selector) is required for DRAG_AND_DROP step");
          const sourceLocator = await getSmartLocator();
          const targetLocator = this.page.locator(data);
          await targetLocator.first().waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT });
          await sourceLocator.dragTo(targetLocator, { timeout: DEFAULT_TIMEOUT });
          break;
        }
        case "UPLOAD_FILE": {
          if (!data) throw new Error("Data (file path) is required for UPLOAD_FILE step");
          const locator = await getSmartLocator();
          const filePaths = data.split(",").map((p) => p.trim());
          await locator.setInputFiles(filePaths, { timeout: DEFAULT_TIMEOUT });
          break;
        }
        case "UI_EXTRACT":
          if (resolvedSelector) {
            await getSmartLocator({ skipActionabilityCheck: true });
          }
          break;
        default:
          throw new Error(`Unsupported UI action: ${step.action}`);
      }
    })();
    if (waitPromise) {
      try {
        const [apiResponse] = await Promise.all([waitPromise, actionPromise]);
        let responseText;
        try {
          responseText = await apiResponse.text();
        } catch (e) {
        }
        if (step.waitForNetwork?.assertions && step.waitForNetwork.assertions.length > 0) {
          const headers = {};
          for (const [key, value] of Object.entries(apiResponse.headers())) {
            headers[key] = value;
          }
          const results = evaluateAssertions({
            body: responseText || "",
            headers,
            status: apiResponse.status()
          }, step.waitForNetwork.assertions);
          results.forEach((res) => {
            const { assertion, actualValue, passed, message } = res;
            const source = assertion.source;
            const expr = assertion.expression ? ` ${assertion.expression}` : "";
            const op = assertion.operator;
            const expectedStr = assertion.expectedValue !== void 0 ? `Expected: '${assertion.expectedValue}'` : "";
            const actualStr = actualValue !== void 0 ? `Actual: '${typeof actualValue === "object" ? JSON.stringify(actualValue) : actualValue}'` : "";
            const detailParts = [expectedStr, actualStr].filter(Boolean);
            const logSuffix = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
            if (passed) {
              logs.push({
                status: "PASS",
                level: "success",
                message: `    \u2705 Smart Wait Assertion Passed: [${source}]${expr} ${op}${logSuffix}`
              });
            } else {
              const isMismatch = message.includes("Expected") && message.includes("but got");
              const errorDetail = isMismatch ? "" : ` \u2014 ${message}`;
              logs.push({
                status: "FAIL",
                level: "error",
                message: `    \u274C Smart Wait Assertion Failed: [${source}]${expr} ${op}${logSuffix}${errorDetail}`
              });
            }
          });
        }
        if (step.waitForNetwork?.extractors && step.waitForNetwork.extractors.length > 0) {
          let responseBody;
          let jsonParsed = false;
          try {
            if (responseText) {
              responseBody = JSON.parse(responseText);
              jsonParsed = true;
            }
          } catch (e) {
            if (responseText && responseText.trim().startsWith("<")) {
              try {
                const { XMLParser: XMLParser2 } = await Promise.resolve().then(() => (init_fxp(), fxp_exports));
                const parser = new XMLParser2({ ignoreAttributes: false, attributeNamePrefix: "@_" });
                responseBody = parser.parse(responseText);
                jsonParsed = true;
              } catch (xmlErr) {
              }
            }
          }
          for (const ext of step.waitForNetwork.extractors) {
            if (!ext.name) continue;
            let extVal;
            try {
              if ((ext.source === "API_BODY_JSON" || ext.source === "API_BODY_XML") && jsonParsed && responseBody && ext.expression) {
                const result = JSONPath({ path: ext.expression, json: responseBody });
                extVal = result && result.length > 0 ? String(result[0]) : void 0;
              } else if (ext.source === "API_BODY_REGEX" && responseText && ext.expression) {
                const match = new RegExp(ext.expression).exec(responseText);
                if (match && match[1]) {
                  extVal = match[1];
                } else if (match && match[0]) {
                  extVal = match[0];
                }
              } else if (ext.source === "API_HEADER" && ext.expression) {
                const headers = apiResponse.headers();
                extVal = headers[ext.expression.toLowerCase()];
              }
              if (extVal !== void 0) {
                executionContext.setRuntimeVar(ext.name, extVal, ext.scope);
                if (ext.scope === "ENVIRONMENT" && onEnvVarExtracted) {
                  onEnvVarExtracted(ext.name, extVal);
                }
                if (!extractedValue) extractedValue = extVal;
                logs.push({
                  status: "INFO",
                  level: "info",
                  message: `    \u{1F4E5} Smart Wait Extracted Variable: ${ext.name} = ${extVal.length > 50 ? extVal.substring(0, 50) + "..." : extVal}`
                });
              } else {
                logs.push({
                  status: "WARN",
                  level: "warn",
                  message: `    \u26A0\uFE0F Smart Wait Extractor failed to find value for: ${ext.name}`
                });
              }
            } catch (err) {
              console.error(`Network Extractor ${ext.name} failed:`, err);
              logs.push({
                status: "WARN",
                level: "warn",
                message: `    \u26A0\uFE0F Smart Wait Extractor error for ${ext.name}: ${err instanceof Error ? err.message : String(err)}`
              });
            }
          }
        }
      } catch (error) {
        if (error.message.includes("Timeout") || error.name === "TimeoutError") {
          throw new Error(`UI Action executed, but expected API (${step.waitForNetwork.urlPattern}) did not respond or status did not match within ${step.waitForNetwork.timeoutMs || 1e4}ms.`);
        }
        throw error;
      }
    } else {
      await actionPromise;
    }
    if (step.extractors && step.extractors.length > 0) {
      for (const extractor of step.extractors) {
        if (!extractor.name) continue;
        let extVal;
        try {
          if (extractor.source === "UI_PAGE_URL") {
            extVal = this.page.url();
          } else if (extractor.source === "UI_PAGE_TITLE") {
            extVal = await this.page.title();
          } else {
            if (!resolvedSelector) {
              console.warn(`Extractor ${extractor.name} requires a target element.`);
              continue;
            }
            const locator = await getSmartLocator({ skipActionabilityCheck: true });
            if (extractor.source === "UI_TEXT") {
              extVal = await locator.textContent({ timeout: DEFAULT_TIMEOUT }) || void 0;
            } else if (extractor.source === "UI_VALUE") {
              extVal = await locator.inputValue({ timeout: DEFAULT_TIMEOUT });
            } else if (extractor.source === "UI_ATTRIBUTE" && extractor.expression) {
              extVal = await locator.getAttribute(extractor.expression, { timeout: DEFAULT_TIMEOUT }) || void 0;
            }
          }
          if (extVal !== void 0) {
            executionContext.setRuntimeVar(extractor.name, extVal, extractor.scope);
            if (extractor.scope === "ENVIRONMENT" && onEnvVarExtracted) {
              onEnvVarExtracted(extractor.name, extVal);
            }
            if (!extractedValue) extractedValue = extVal;
            logs.push({
              status: "INFO",
              level: "info",
              message: `  \u{1F4E5} Extracted Variable: ${extractor.name} = ${extVal.length > 50 ? extVal.substring(0, 50) + "..." : extVal}`
            });
          } else {
            logs.push({
              status: "WARN",
              level: "warn",
              message: `  \u26A0\uFE0F Extractor failed to find value for: ${extractor.name}`
            });
          }
        } catch (err) {
          console.error(`UI Extractor ${extractor.name} failed:`, err);
          logs.push({
            status: "WARN",
            level: "warn",
            message: `  \u26A0\uFE0F Extractor error for ${extractor.name}: ${err instanceof Error ? err.message : String(err)}`
          });
        }
      }
    }
    const durationMs = Date.now() - startTime;
    let screenshotBase64;
    if (step.screenshot) {
      screenshotBase64 = await this.takeScreenshot();
    }
    return {
      durationMs,
      screenshot: screenshotBase64,
      extractedValue,
      assertionDetails,
      logs
    };
  }
  async takeScreenshot() {
    if (!this.page) return "";
    try {
      const buffer = await this.page.screenshot({ type: "jpeg", quality: SCREENSHOT_QUALITY });
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    } catch (e) {
      console.error("Screenshot failed:", e);
      return "";
    }
  }
  async captureStateScreenshot() {
    return this.takeScreenshot();
  }
  async cleanup() {
    try {
      if (this.dialogHandler && this.page) {
        this.page.off("dialog", this.dialogHandler);
        this.dialogHandler = null;
      }
      if (this.page) {
        await this.page.close().catch(() => {
        });
      }
      if (this.context) {
        await this.context.close().catch(() => {
        });
      }
      if (this.browser) {
        await this.browser.close().catch(() => {
        });
      }
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }
};

// agent/index.ts
import fs from "fs";
import path from "path";
var args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : void 0;
}
var config = {};
try {
  const configPath = path.join(process.cwd(), "agent-config.json");
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (e) {
}
var SERVER_URL = getArg("--url") || process.env.SERVER_URL || config.serverUrl || "ws://localhost:3000";
var AGENT_ID = getArg("--name") || process.env.AGENT_ID || config.agentName || `agent-${Math.random().toString(36).substring(7)}`;
var AGENT_SECRET = process.env.AGENT_SECRET || config.agentSecret || "";
var ws;
var isReconnect = false;
var pingInterval;
var currentAbortController = null;
var agentStatus = "idle";
var localTaskQueue = [];
var isProcessing = false;
var originalConsoleLog = console.log;
var originalConsoleWarn = console.warn;
var originalConsoleError = console.error;
function formatArgs(args2) {
  return args2.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
}
function emitAgentLog(level, args2) {
  const line = formatArgs(args2);
  sendMsg("AGENT_LOG", {
    agentId: AGENT_ID,
    timestamp: Date.now(),
    level,
    message: line
  });
}
console.log = (...args2) => {
  originalConsoleLog.apply(console, args2);
  emitAgentLog("info", args2);
};
console.warn = (...args2) => {
  originalConsoleWarn.apply(console, args2);
  emitAgentLog("warn", args2);
};
console.error = (...args2) => {
  originalConsoleError.apply(console, args2);
  emitAgentLog("error", args2);
};
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;
  while (localTaskQueue.length > 0) {
    const payload = localTaskQueue.shift();
    if (!payload) continue;
    agentStatus = "busy";
    sendMsg("AGENT_HEARTBEAT", { agentId: AGENT_ID, status: "busy" });
    console.log(`[AGENT] Starting execution of task: ${payload.runId}`);
    try {
      await handleExecution(payload);
    } catch (err) {
      console.error(`[AGENT] Fatal error executing task ${payload.runId}:`, err);
    }
  }
  isProcessing = false;
  agentStatus = "idle";
  sendMsg("AGENT_HEARTBEAT", { agentId: AGENT_ID, status: "idle" });
  console.log("[AGENT] Queue drained. Agent is now idle.");
}
function connect() {
  console.log(`[AGENT] Connecting to ${SERVER_URL} as ${AGENT_ID}...`);
  ws = new wrapper_default(SERVER_URL, {
    headers: {
      "x-agent-secret": AGENT_SECRET
    }
  });
  ws.on("open", () => {
    console.log("[AGENT] Connected to Server.");
    isReconnect = true;
    sendMsg("AGENT_REGISTER", { agentId: AGENT_ID, platform: process.platform });
    pingInterval = setInterval(() => {
      sendMsg("AGENT_HEARTBEAT", { agentId: AGENT_ID, status: agentStatus });
    }, 15e3);
  });
  ws.on("message", async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.event === "TASK_DISPATCH") {
        const payload = parsed.data.payload;
        console.log(`[AGENT] Received Task Dispatch: ${payload.request.type} (${payload.runId}) - Adding to local queue`);
        localTaskQueue.push(payload);
        processQueue();
      } else if (parsed.event === "TASK_ABORT") {
        const { reportId } = parsed.data;
        console.log(`[AGENT] Received Remote Abort Request for report: ${reportId}`);
        if (currentAbortController) {
          currentAbortController.abort();
        }
      }
    } catch (e) {
      console.error("[AGENT] Error handling message:", e);
    }
  });
  ws.on("close", () => {
    console.log("[AGENT] Connection closed. Reconnecting in 5s...");
    clearInterval(pingInterval);
    setTimeout(connect, 5e3);
  });
  ws.on("error", (err) => {
    console.error(`[AGENT] WS Error: ${err.message}`);
    ws.close();
  });
}
function sendMsg(event, data) {
  if (ws && ws.readyState === wrapper_default.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}
async function handleExecution(payload) {
  const logger = new AgentLogger(payload.reportId, sendMsg);
  const uiExecutor = new UIExecutor();
  currentAbortController = new AbortController();
  logger.log({ stepId: "agent-init", status: "INFO", message: `\u{1F680} Task picked up by Remote Agent: ${AGENT_ID}` });
  const onEnvVarExtracted = (name, value) => {
    console.log(`[AGENT] Extracted environment variable: ${name} = ${value}`);
  };
  try {
    let result;
    if (payload.request.type === "case") {
      result = await executeSingleCase(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
    } else if (payload.request.type === "suite") {
      result = await executeSuite(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
    } else if (payload.request.type === "scenario") {
      result = await executeScenario(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
    } else if (payload.request.type === "plan") {
      result = await executePlan(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
    }
    if (result) {
      result.reportId = payload.reportId;
      logger.complete(result);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown agent error";
    logger.log({ stepId: "agent-error", status: "FAIL", message: `\u274C Agent Exception: ${msg}` });
    logger.complete({
      reportId: payload.reportId,
      status: "FAILED",
      passRate: 0,
      totalCases: 0,
      passedCases: 0,
      failedCases: 1,
      durationMs: 0
    });
  } finally {
    await uiExecutor.cleanup();
    currentAbortController = null;
  }
}
connect();
