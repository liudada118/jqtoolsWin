'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * 计算指定文件的 SHA-256，供保护清单记录最终 SEA 宿主文件。
 * @param {string} filePath 文件绝对路径。
 * @returns {string} 小写十六进制哈希。
 */
function calculateSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * 将注入完成后的宿主哈希写入保护清单。
 * @returns {void}
 */
function main() {
  const manifestPath = process.argv[2];
  const hostPath = process.argv[3];
  if (!manifestPath || !hostPath) {
    throw new Error('Usage: node finalize-protection-manifest.js <manifest-path> <host-path>');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.hostSha256 = calculateSha256(hostPath);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`Protection manifest finalized: ${manifestPath}\n`);
}

main();
