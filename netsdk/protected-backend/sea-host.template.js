'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Module = require('node:module');

const PACKAGE_MAGIC = Buffer.from('JQPACK01', 'ascii');
const PACKAGE_NAME = 'backend.jqpack';
const ENCRYPTION_KEY = Buffer.from('__JQTOOLS_AES_KEY_HEX__', 'hex');

/**
 * 将归档内路径统一为 POSIX 相对路径，避免不同 Windows 路径格式导致模块匹配失败。
 * @param {string} value 待规范化的路径。
 * @returns {string} 规范化后的归档路径。
 */
function normalizeArchivePath(value) {
  return path.posix.normalize(String(value).replaceAll('\\', '/')).replace(/^\.?\//, '');
}

/**
 * 解密并解析客户后端业务代码包。
 * @param {string} packagePath 加密包绝对路径。
 * @returns {{format: number, entry: string, modules: Record<string, string>}} 解密后的模块归档。
 */
function readProtectedPackage(packagePath) {
  const packed = fs.readFileSync(packagePath);
  const minimumLength = PACKAGE_MAGIC.length + 12 + 16 + 1;

  if (packed.length < minimumLength || !packed.subarray(0, PACKAGE_MAGIC.length).equals(PACKAGE_MAGIC)) {
    throw new Error(`受保护后端包格式无效: ${packagePath}`);
  }

  const ivOffset = PACKAGE_MAGIC.length;
  const tagOffset = ivOffset + 12;
  const cipherOffset = tagOffset + 16;
  const iv = packed.subarray(ivOffset, tagOffset);
  const authTag = packed.subarray(tagOffset, cipherOffset);
  const encrypted = packed.subarray(cipherOffset);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAAD(PACKAGE_MAGIC);
  decipher.setAuthTag(authTag);

  const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const payload = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));

  if (payload?.format !== 1 || typeof payload.entry !== 'string' || !payload.modules) {
    throw new Error('受保护后端包内容无效');
  }

  return payload;
}

/**
 * 创建只从内存归档读取本项目模块的 CommonJS 加载器。
 * 第三方依赖仍由 Node 标准加载器从 node_modules 读取，以兼容串口和 SQLite 原生扩展。
 * @param {string} backendRoot 客户后端根目录。
 * @param {{entry: string, modules: Record<string, string>}} payload 模块归档。
 * @returns {(modulePath: string, parent?: NodeModule|null, isMain?: boolean) => unknown} 模块加载函数。
 */
function createProtectedLoader(backendRoot, payload) {
  const sources = new Map(
    Object.entries(payload.modules).map(([modulePath, source]) => [
      normalizeArchivePath(modulePath),
      source
    ])
  );
  const moduleCache = new Map();

  /**
   * 解析受保护模块之间的相对引用。
   * @param {string} request require 请求。
   * @param {string} parentPath 父模块归档路径。
   * @returns {string|null} 命中的模块路径；非相对引用返回 null。
   */
  function resolveProtectedRequest(request, parentPath) {
    if (!request.startsWith('./') && !request.startsWith('../')) {
      return null;
    }

    const basePath = normalizeArchivePath(path.posix.join(path.posix.dirname(parentPath), request));
    const candidates = [basePath, `${basePath}.js`, path.posix.join(basePath, 'index.js')];
    const match = candidates.find((candidate) => sources.has(candidate));

    if (!match) {
      const error = new Error(`受保护模块不存在: ${request} (from ${parentPath})`);
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }

    return match;
  }

  /**
   * 编译并执行一个内存中的 CommonJS 模块。
   * @param {string} modulePath 归档内模块路径。
   * @param {NodeModule|null} parent 父模块。
   * @param {boolean} isMain 是否为后端入口模块。
   * @returns {unknown} 模块导出对象。
   */
  function loadProtectedModule(modulePath, parent = null, isMain = false) {
    const normalizedPath = normalizeArchivePath(modulePath);
    const cached = moduleCache.get(normalizedPath);
    if (cached) {
      return cached.exports;
    }

    const source = sources.get(normalizedPath);
    if (typeof source !== 'string') {
      throw new Error(`受保护模块未打包: ${normalizedPath}`);
    }

    const filename = path.join(backendRoot, ...normalizedPath.split('/'));
    const protectedModule = new Module(filename, parent);
    const standardRequire = Module.createRequire(filename);

    protectedModule.id = isMain ? '.' : filename;
    protectedModule.filename = filename;
    protectedModule.paths = Module._nodeModulePaths(path.dirname(filename));
    protectedModule.require = (request) => {
      const protectedPath = resolveProtectedRequest(request, normalizedPath);
      return protectedPath
        ? loadProtectedModule(protectedPath, protectedModule)
        : standardRequire(request);
    };

    moduleCache.set(normalizedPath, protectedModule);
    try {
      protectedModule._compile(source, filename);
      protectedModule.loaded = true;
      return protectedModule.exports;
    } catch (error) {
      moduleCache.delete(normalizedPath);
      throw error;
    }
  }

  return loadProtectedModule;
}

/**
 * 启动受保护的真实串口、HTTP、WebSocket 和 Python 算法服务。
 * @returns {void}
 */
function main() {
  const backendRoot = path.resolve(
    process.env.JQTOOLS_REAL_BACKEND_ROOT || path.dirname(process.execPath)
  );
  const packagePath = path.join(backendRoot, PACKAGE_NAME);
  const payload = readProtectedPackage(packagePath);
  const loadProtectedModule = createProtectedLoader(backendRoot, payload);

  console.log(`[protected-backend] root: ${backendRoot}`);
  console.log(`[protected-backend] package: ${PACKAGE_NAME}`);
  loadProtectedModule(payload.entry, null, true);
}

try {
  main();
} catch (error) {
  console.error('[protected-backend] startup failed:', error?.stack || error);
  process.exitCode = 1;
}
