const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let isPackaged = process.env.isPackaged == 'true'
const resourcesPath = process.resourcesPath || __dirname
console.log(resourcesPath,path.join(__dirname,  'python', 'app', 'server.py') ,path.join(resourcesPath, 'python', 'app', 'server.py'), !isPackaged , isPackaged , 'isPackaged')

/**
 * 返回当前运行模式使用的 Python 解释器路径。
 * @returns {string} Python 可执行文件路径。
 */
function pythonBin() {
  const isDev = !isPackaged;
  if (process.platform === 'win32') {
    return isDev
      ? path.join(__dirname,  'python', 'Python311', 'python.exe')
      : path.join(resourcesPath, 'python', 'Python311', 'python.exe');
  }
  return isDev
    ? path.join(__dirname,  'python', 'venv', 'bin', 'python')
    : path.join(resourcesPath, 'python', 'venv', 'bin', 'python');
}

/**
 * 返回 Python 算法入口。
 * 开发环境优先使用源码，客户包删除源码后自动切换到同目录的 sourceless pyc。
 * @returns {string} Python 算法入口路径。
 */
function serverPy() {
  const isDev = !isPackaged;
  const explicitEntry = process.env.JQTOOLS_PYTHON_ALGORITHM_ENTRY;
  if (explicitEntry) {
    return path.resolve(explicitEntry);
  }

  const sourceEntry = isDev
    ? path.join(__dirname,  'python', 'app', 'server.py')
    : path.join(resourcesPath, 'python', 'app', 'server.py');
  const bytecodeEntry = sourceEntry.replace(/\.py$/i, '.pyc');
  return fs.existsSync(sourceEntry) ? sourceEntry : bytecodeEntry;
}

let child = null;
let buf = '';
const pending = new Map();
let nextId = 1;
let starting = false;

let stderrTail = '';

/**
 * 仅保留 Python stderr 尾部，避免错误日志无限占用内存。
 * @param {string} s 新增错误文本。
 * @returns {void}
 */
function pushErr(s) { stderrTail = (stderrTail + s).slice(-4000); }

/**
 * 启动常驻 Python 算法进程并建立标准输入输出通信。
 * @returns {void}
 */
function startWorker() {
  if (child || starting) return;
  starting = true;

  const py = pythonBin();
  const sv = serverPy();
  console.log('[PY] start:', py, sv);
  if (!fs.existsSync(py)) console.error('[PY] pythonBin NOT FOUND:', py);
  if (!fs.existsSync(sv)) console.error('[PY] serverPy  NOT FOUND:', sv);

  child = spawn(py, ['-u', sv], {
    stdio: ['pipe','pipe','pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONNOUSERSITE: '1',
      PYTHONDONTWRITEBYTECODE: '1'
    },
    windowsHide: true
  });
  starting = false;
  buf = ''; stderrTail = '';

  child.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); }
      catch { console.error('[PY] bad JSON line:', line); continue; }
      const rec = pending.get(msg.id);
      if (!rec) continue;
      clearTimeout(rec.timer);
      pending.delete(msg.id);
      if (msg.ok === false) rec.reject(new Error(msg.error || 'python error'));
      else rec.resolve(msg.data);
    }
  });

  child.stderr.on('data', (d) => {
    const s = d.toString();
    pushErr(s);
    console.error('[PY:stderr]', s.trim());
  });

  child.on('exit', (code, sig) => {
    console.error(`[PY] worker EXIT code=${code} sig=${sig}\n[PY] stderr tail:\n${stderrTail}`);
    for (const [id, rec] of pending) {
      clearTimeout(rec.timer);
      rec.reject(new Error(`python worker exited (code=${code} sig=${sig})`));
    }
    pending.clear();
    child = null;
    setTimeout(startWorker, 500);
  });

  callPy('ping', {}, { timeoutMs: 5000 })
    .then(() => console.log('[PY] ready'))
    .catch(e => console.error('[PY] handshake failed:', e.message));
}

/**
 * 向 Python 写入一行请求，并在管道产生背压时等待 drain。
 * @param {string} line JSON 行文本。
 * @returns {Promise<boolean|void>} 写入完成结果。
 */
function writeLine(line) {
  return new Promise((resolve, reject) => {
    if (!child || !child.stdin) return reject(new Error('worker not running'));
    const ok = child.stdin.write(line);
    if (ok) return resolve(true);
    child.stdin.once('drain', resolve);
  });
}

/**
 * 调用 Python 算法函数。
 * @param {string} fn Python 服务公开的函数名。
 * @param {object} args 调用参数。
 * @param {{timeoutMs?: number}} options 超时配置。
 * @returns {Promise<unknown>} Python 返回的数据。
 */
function callPy(fn, args, { timeoutMs = 10000 } = {}) {
  if (!child) startWorker();
  const id = nextId++;
  return new Promise(async (resolve, reject) => {
    const rec = { resolve, reject };
    rec.timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout ${timeoutMs}ms`));
      try { child?.stdin.write(JSON.stringify({ id, fn: '_cancel' }) + '\n'); } catch {}
    }, timeoutMs);
    pending.set(id, rec);
    try {
      await writeLine(JSON.stringify({ id, fn, args }) + '\n');
    } catch (e) {
      clearTimeout(rec.timer);
      pending.delete(id);
      reject(new Error('stdin write failed: ' + e.message));
    }
  });
}

module.exports = { startWorker, callPy };
