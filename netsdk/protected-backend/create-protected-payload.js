'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PACKAGE_MAGIC = Buffer.from('JQPACK01', 'ascii');
const KEY_PLACEHOLDER = '__JQTOOLS_AES_KEY_HEX__';
const PYTHON_MODULES = [
  'server.py',
  'integrated_system.py',
  'config.py',
  'control.py',
  'tap_massage.py'
];

/**
 * 读取并验证命令行目录参数。
 * @param {number} index 参数下标。
 * @param {string} name 参数名称。
 * @returns {string} 绝对目录路径。
 */
function requiredDirectory(index, name) {
  const value = process.argv[index];
  if (!value) {
    throw new Error(`缺少参数: ${name}`);
  }

  const resolved = path.resolve(value);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`目录不存在: ${resolved}`);
  }

  return resolved;
}

/**
 * 返回需要放入加密包的第一方 Node.js 模块。
 * @param {string} repoRoot 项目根目录。
 * @returns {string[]} 相对于项目根目录的模块路径。
 */
function collectFirstPartyModules(repoRoot) {
  const modules = [
    'server/serialServer.js',
    'server/HttpResult.js',
    'pyWorker.js'
  ];
  const utilRoot = path.join(repoRoot, 'util');

  for (const entry of fs.readdirSync(utilRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      modules.push(`util/${entry.name}`);
    }
  }

  return modules.sort();
}

/**
 * 读取第一方模块源码并构造内存归档。
 * @param {string} repoRoot 项目根目录。
 * @param {string[]} modulePaths 模块相对路径。
 * @returns {Record<string, string>} 模块源码映射。
 */
function readModuleSources(repoRoot, modulePaths) {
  const sources = {};

  for (const modulePath of modulePaths) {
    const sourcePath = path.join(repoRoot, ...modulePath.split('/'));
    if (!fs.statSync(sourcePath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`待保护模块不存在: ${sourcePath}`);
    }
    sources[modulePath] = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
  }

  return sources;
}

/**
 * 使用 AES-256-GCM 加密压缩后的业务模块归档。
 * @param {object} payload 待加密对象。
 * @param {Buffer} key 32 字节密钥。
 * @returns {Buffer} 带格式头、IV 和认证标签的加密包。
 */
function encryptPayload(payload, key) {
  const iv = crypto.randomBytes(12);
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(PACKAGE_MAGIC);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([PACKAGE_MAGIC, iv, authTag, encrypted]);
}

/**
 * 写入 SEA 主脚本和配置文件。
 * @param {string} workRoot 临时工作目录。
 * @param {Buffer} key 加密密钥。
 * @returns {{hostScript: string, seaConfig: string, seaBlob: string}} 生成文件路径。
 */
function writeSeaInputs(workRoot, key) {
  const templatePath = path.join(__dirname, 'sea-host.template.js');
  const template = fs.readFileSync(templatePath, 'utf8');
  const placeholderCount = template.split(KEY_PLACEHOLDER).length - 1;
  if (placeholderCount !== 1) {
    throw new Error(`SEA 模板密钥占位符数量错误: ${placeholderCount}`);
  }

  fs.mkdirSync(workRoot, { recursive: true });
  const hostScript = path.join(workRoot, 'sea-host.generated.js');
  const seaConfig = path.join(workRoot, 'sea-config.json');
  const seaBlob = path.join(workRoot, 'sea-prep.blob');
  fs.writeFileSync(hostScript, template.replace(KEY_PLACEHOLDER, key.toString('hex')), 'utf8');
  fs.writeFileSync(seaConfig, JSON.stringify({
    main: hostScript,
    output: seaBlob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true
  }, null, 2), 'utf8');

  return { hostScript, seaConfig, seaBlob };
}

/**
 * 生成加密业务包、无密钥清单和 Node SEA 构建输入。
 * @returns {void}
 */
function main() {
  const repoRoot = requiredDirectory(2, 'repoRoot');
  const backendRoot = requiredDirectory(3, 'backendRoot');
  const workRoot = path.resolve(process.argv[4] || '');
  if (!process.argv[4]) {
    throw new Error('缺少参数: workRoot');
  }

  const modulePaths = collectFirstPartyModules(repoRoot);
  const payload = {
    format: 1,
    entry: 'server/serialServer.js',
    modules: readModuleSources(repoRoot, modulePaths)
  };
  const key = crypto.randomBytes(32);
  const packed = encryptPayload(payload, key);
  const packagePath = path.join(backendRoot, 'backend.jqpack');
  const manifestPath = path.join(backendRoot, 'protection-manifest.json');
  const seaFiles = writeSeaInputs(workRoot, key);

  fs.writeFileSync(packagePath, packed);
  fs.writeFileSync(manifestPath, JSON.stringify({
    format: 1,
    protection: 'AES-256-GCM + Node.js SEA host',
    nodeVersion: process.version,
    entry: payload.entry,
    protectedNodeModules: modulePaths,
    protectedPythonModules: PYTHON_MODULES.map((name) => name.replace(/\.py$/, '.pyc')),
    packageSha256: crypto.createHash('sha256').update(packed).digest('hex')
  }, null, 2), 'utf8');

  process.stdout.write(`${JSON.stringify({
    packagePath,
    manifestPath,
    ...seaFiles,
    protectedNodeModuleCount: modulePaths.length
  })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
