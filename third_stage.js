const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const VALID_KEYS = new Set([
'--package-name', '--repo-url', '--repo-path',
'--mode', '--version', '--ascii', '--max-depth', '--ignore-substring'
]);

class IllegalArgumentException extends Error {
    constructor(msg) {
        super(msg);
        this.name = 'IllegalArgumentException';
    }
}

async function main(argv = process.argv.slice(2)) {
    try {
        const params = parseArgs(argv);
        printParams(params);

        validateParameters(params);

        const mode = (params['--mode'] || 'real').toLowerCase();

        if (mode === 'test') {
        await runTestMode(params);
        } else {
        await runRealMode(params);
        }
    } catch (err) {
        console.error('[Ошибка]', err.message);
        printUsage();
        process.exitCode = 1;
    }
}

function parseArgs(args) {
    const params = {};
    if (args.length === 0) return params;

    for (const raw of args) {
        const [key, ...rest] = raw.split('=');
        if (!key) throw new IllegalArgumentException(`Неверный параметр: ${raw}`);
        if (!VALID_KEYS.has(key)) throw new IllegalArgumentException(`Неизвестный параметр: ${key}`);
        const value = rest.join('='); // allow = in value
        if (value === '') throw new IllegalArgumentException(`Отсутствует значение для параметра ${key}`);
        params[key] = value;
    }
    return params;
}

function printParams(params) {
    console.log('Параметры запуска:');
    if (Object.keys(params).length === 0) {
        console.log('  (пусто)');
        return;
    }
    for (const k of Object.keys(params)) {
        console.log(`  ${k} = ${params[k]}`);
    }
}

function validateParameters(params) {
    const mode = (params['--mode'] || 'real').toLowerCase();
    if (!['real', 'test'].includes(mode)) {
        throw new IllegalArgumentException('--mode должен быть real или test');
    }

    if (mode === 'real') {
        if (!params['--package-name']) throw new IllegalArgumentException('В реальном режиме необходимо указать --package-name');
        if (!params['--version']) throw new IllegalArgumentException('В реальном режиме необходимо указать --version');
        
        if (!/^[a-zA-Z0-9.\-\_]+$/.test(params['--version'])) {
        throw new IllegalArgumentException('Неверный формат --version');
        }
    } else {
        if (!params['--package-name']) throw new IllegalArgumentException('В тестовом режиме необходимо указать --package-name');
        if (!params['--repo-path']) throw new IllegalArgumentException('В тестовом режиме необходимо указать --repo-path');
    }

    if (params['--package-name']) {
        if (!/^[@a-zA-Z0-9\-\_\/\.]+$/.test(params['--package-name'])) {
        throw new IllegalArgumentException('Неверный формат --package-name');
        }
    }

    if (params['--max-depth']) {
        const n = parseInt(params['--max-depth'], 10);
        if (isNaN(n) || n <= 0 || n > 1000) {
        throw new IllegalArgumentException('--max-depth должен быть целым в диапазоне [1..1000]');
        }
    }

    if (params['--repo-url']) {
        try {
        const u = new URL(params['--repo-url']);
        if (!['http:', 'https:'].includes(u.protocol)) {
            throw new IllegalArgumentException('--repo-url должен быть http или https');
        }
        } catch (e) {
        throw new IllegalArgumentException('Неверный формат --repo-url');
        }
    }
}


async function runTestMode(params) {
    const repoPath = params['--repo-path'];
    await validateFileExists(repoPath);
    const graph = await loadGraphFromFile(repoPath);
    const start = params['--package-name'];
    if (!graph[start]) throw new IllegalArgumentException(`Пакет '${start}' не найден в файле графа`);
    const maxDepth = params['--max-depth'] ? parseInt(params['--max-depth'], 10) : 100;
    const ascii = (params['--ascii'] || 'true').toLowerCase() !== 'false';
    const ignoreSubstring = params['--ignore-substring'] || null;

    console.log(`\nЗапуск в тестовом режиме. Пакет: ${start}. max-depth=${maxDepth}, ascii=${ascii}`);
    if (ascii) {
        printAsciiFromGraph(graph, start, { maxDepth, ignoreSubstring });
    } else {
        printFlatDepsFromGraph(graph, start, { maxDepth, ignoreSubstring });
    }
}

async function validateFileExists(filePath) {
    try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) throw new IllegalArgumentException('--repo-path должен указывать на файл');
    } catch (err) {
        if (err.code === 'ENOENT') throw new IllegalArgumentException(`Файл не найден: ${filePath}`);
        throw new IllegalArgumentException(`Ошибка доступа к файлу: ${err.message}`);
    }
}

    async function loadGraphFromFile(filePath) {
    try {
        const txt = await fs.readFile(filePath, 'utf8');
        const graph = {};
        const lines = txt.split(/\r?\n/);
        for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split(':');
        if (parts.length < 1) continue;
        const pkg = parts[0].trim();
        const depsPart = parts.slice(1).join(':').trim();
        const deps = depsPart ? depsPart.split(/\s+/).filter(Boolean) : [];
        graph[pkg] = deps;
        }
        console.log(`Загружен граф (${Object.keys(graph).length} пакетов)`);
        return graph;
    } catch (err) {
        throw new Error(`Ошибка чтения файла: ${err.message}`);
    }
    }

async function runRealMode(params) {
    const packageName = params['--package-name'];
    const version = params['--version'];
    const baseUrl = (params['--repo-url'] || 'https://registry.npmjs.org/').replace(/\/+$/, '') + '/';
    const maxDepth = params['--max-depth'] ? parseInt(params['--max-depth'], 10) : 100;
    const ascii = (params['--ascii'] || 'true').toLowerCase() !== 'false';
    const ignoreSubstring = params['--ignore-substring'] || null;

    console.log(`\nРеальный режим. Пакет: ${packageName}@${version}. registry=${baseUrl} max-depth=${maxDepth} ascii=${ascii}`);

    const metaCache = new Map();

async function getDeps(pkgName, ver) {
        const cacheKey = `${pkgName}@${ver || 'LATEST'}`;
        if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);

        const pkgUrl = baseUrl + encodeURIComponent(pkgName);
        let data;
        try {
        data = await fetchJson(pkgUrl);
        } catch (err) {
        metaCache.set(cacheKey, null);
        return null;
        }

        let parsed;
        try {
        parsed = JSON.parse(data);
        } catch (e) {
        metaCache.set(cacheKey, null);
        return null;
        }

        let chosenVersion = ver;
        if (!chosenVersion) {
        chosenVersion = parsed['dist-tags'] && parsed['dist-tags'].latest;
        if (!chosenVersion) {
            const versions = Object.keys(parsed.versions || {});
            chosenVersion = versions.sort().pop();
        }
        }

        const versionObj = (parsed.versions && parsed.versions[chosenVersion]) || null;
        const depsObj = versionObj && versionObj.dependencies ? versionObj.dependencies : {};
        const deps = Object.keys(depsObj || {});
        metaCache.set(cacheKey, { deps, resolvedVersion: chosenVersion });
        return metaCache.get(cacheKey);
    }

    const rootMeta = await getDeps(packageName, version);
    if (!rootMeta) {
        throw new Error(`Не удалось получить метаданные для ${packageName} (${version})`);
    }
    const rootDeps = rootMeta.deps;
    console.log(`Прямые зависимости ${packageName}@${rootMeta.resolvedVersion}: ${rootDeps.length ? rootDeps.join(', ') : '(нет)'}`);

    const fetchChildren = async (pkg) => {

        const m = await getDeps(pkg, null);
        return m && m.deps ? m.deps : [];
    };

    if (ascii) {
        await printAsciiFromFetcher(packageName, { fetchChildren, maxDepth, ignoreSubstring });
    } else {
        await printFlatFromFetcher(packageName, { fetchChildren, maxDepth, ignoreSubstring });
    }
}

function fetchJson(urlStr, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const protocol = urlStr.startsWith('https:') ? https : http;
        const req = protocol.get(urlStr, (res) => {
        const { statusCode } = res;
        if (statusCode !== 200) {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => reject(new Error(`HTTP ${statusCode} при запросе ${urlStr}`)));
            return;
        }
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error('Таймаут подключения'));
        });
    });
    }

function printAsciiFromGraph(graph, start, options = {}) {
    const maxDepth = options.maxDepth || 100;
    const ignoreSubstring = options.ignoreSubstring || null;

    const stack = [];
    const pathSet = new Set();
    const globalVisited = new Set();
    const rootDeps = graph[start] || [];
    stack.push({ node: start, deps: rootDeps, index: 0, depth: 0, prefixParts: [] });

    while (stack.length > 0) {
        const frame = stack[stack.length - 1];

        if (frame.index === 0) {
            printLine(frame.node, frame.depth, frame.prefixParts, { isRoot: frame.depth === 0 });
            pathSet.add(frame.node);
        }

        if (frame.depth >= maxDepth) {
        if (frame.index === 0 && (frame.deps || []).length > 0) {
            console.log(getPrefix(frame.depth, frame.prefixParts) + (frame.depth === 0 ? '' : '└── ') + '... (max depth reached)');
        }
        pathSet.delete(frame.node);
        globalVisited.add(frame.node);
        stack.pop();
        continue;
        }

        if (!frame.deps || frame.index >= frame.deps.length) {
        pathSet.delete(frame.node);
        globalVisited.add(frame.node);
        stack.pop();
        continue;
        }

        const child = frame.deps[frame.index++];
        if (ignoreSubstring && child.includes(ignoreSubstring)) {
        console.log(getPrefix(frame.depth + 1, frame.prefixParts.concat([frame.index < frame.deps.length])) + '└── ' + `${child} [игнорировано]`);
        continue;
        }

        const childPrefixParts = frame.prefixParts.concat([frame.index < frame.deps.length]);
        if (!graph[child]) {
        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child} (не найден в графе)`);
        continue;
        }

        if (pathSet.has(child)) {
        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child} (циклическая зависимость)`);
        continue;
        }

        if (globalVisited.has(child)) {
        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child} (уже обработан)`);
        continue;
        }

        const childDeps = graph[child] || [];
        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child}`);
        stack.push({ node: child, deps: childDeps, index: 0, depth: frame.depth + 1, prefixParts: childPrefixParts });
    }
    }


    async function printAsciiFromFetcher(start, opts = {}) {
    const maxDepth = opts.maxDepth || 100;
    const ignoreSubstring = opts.ignoreSubstring || null;
    const fetchChildren = opts.fetchChildren;
    if (typeof fetchChildren !== 'function') throw new Error('fetchChildren function required');

    const stack = [];
    const pathSet = new Set();
    const globalVisited = new Set();

    stack.push({ node: start, deps: null, index: 0, depth: 0, prefixParts: [], loading: true });

while (stack.length > 0) {
        const frame = stack[stack.length - 1];

        if (frame.deps === null) {
        try {
            const deps = await fetchChildren(frame.node);
            frame.deps = Array.isArray(deps) ? deps : [];
        } catch (e) {
            frame.deps = [];
        }
        }

        if (frame.index === 0) {
        printLine(frame.node, frame.depth, frame.prefixParts, { isRoot: frame.depth === 0 });
        pathSet.add(frame.node);
        }

        if (frame.depth >= maxDepth) {
        if (frame.index === 0 && (frame.deps || []).length > 0) {
            console.log(getPrefix(frame.depth, frame.prefixParts) + (frame.depth === 0 ? '' : '└── ') + '... (max depth reached)');
        }
        pathSet.delete(frame.node);
        globalVisited.add(frame.node);
        stack.pop();
        continue;
        }

        if (!frame.deps || frame.index >= frame.deps.length) {
        pathSet.delete(frame.node);
        globalVisited.add(frame.node);
        stack.pop();
        continue;
        }

        const child = frame.deps[frame.index++];

        if (ignoreSubstring && child.includes(ignoreSubstring)) {
        console.log(getPrefix(frame.depth + 1, frame.prefixParts.concat([frame.index < frame.deps.length])) + '└── ' + `${child} [игнорировано]`);
        continue;
        }

        const childPrefixParts = frame.prefixParts.concat([frame.index < frame.deps.length]);

        let childDeps;
        try {
        const info = await opts.fetchChildren(child); // returns array
        childDeps = Array.isArray(info) ? info : [];
        } catch (e) {
        childDeps = null;
        }

        if (!childDeps || childDeps.length === 0) {
        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child}${childDeps === null ? ' (не найден/ошибка)' : ''}`);
        continue;
        }

        if (pathSet.has(child)) {
        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child} (циклическая зависимость)`);
        continue;
        }

        if (globalVisited.has(child)) {
        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child} (уже обработан)`);
        continue;
        }

        console.log(getPrefix(frame.depth + 1, childPrefixParts) + '└── ' + `${child}`);
        stack.push({ node: child, deps: childDeps, index: 0, depth: frame.depth + 1, prefixParts: childPrefixParts });
    }
}

function printFlatDepsFromGraph(graph, start, options = {}) {
    const maxDepth = options.maxDepth || 100;
    const ignoreSubstring = options.ignoreSubstring || null;

    const stack = [{ node: start, deps: graph[start] || [], index: 0, depth: 0 }];
    const visited = new Set();
    const results = [];

    while (stack.length) {
        const frame = stack[stack.length - 1];
        if (frame.index === 0) {
        visited.add(frame.node);
        }
        if (frame.index >= frame.deps.length) {
        stack.pop();
        continue;
        }
        const child = frame.deps[frame.index++];
        if (ignoreSubstring && child.includes(ignoreSubstring)) continue;
        results.push({ parent: frame.node, child, depth: frame.depth + 1 });
        if (!visited.has(child) && frame.depth + 1 < maxDepth && graph[child]) {
        stack.push({ node: child, deps: graph[child], index: 0, depth: frame.depth + 1 });
        }
    }

    console.log('Список зависимостей (parent -> child):');
    for (const r of results) {
        console.log(`${'  '.repeat(r.depth - 1)}${r.parent} -> ${r.child}`);
    }
}

async function printFlatFromFetcher(start, opts = {}) {
    const maxDepth = opts.maxDepth || 100;
    const ignoreSubstring = opts.ignoreSubstring || null;
    const fetchChildren = opts.fetchChildren;
    if (typeof fetchChildren !== 'function') throw new Error('fetchChildren function required');

    const stack = [{ node: start, deps: null, index: 0, depth: 0 }];
    const visited = new Set();
    const results = [];

    while (stack.length) {
        const frame = stack[stack.length - 1];
        if (frame.deps === null) {
        frame.deps = await fetchChildren(frame.node) || [];
        }
        if (frame.index === 0) visited.add(frame.node);
        if (frame.index >= frame.deps.length) {
        stack.pop();
        continue;
        }
        const child = frame.deps[frame.index++];
        if (ignoreSubstring && child.includes(ignoreSubstring)) continue;
        results.push({ parent: frame.node, child, depth: frame.depth + 1 });
        if (!visited.has(child) && frame.depth + 1 < maxDepth) {
        stack.push({ node: child, deps: null, index: 0, depth: frame.depth + 1 });
        }
    }

    console.log('Список зависимостей (parent -> child):');
    for (const r of results) {
        console.log(`${'  '.repeat(r.depth - 1)}${r.parent} -> ${r.child}`);
    }
}

function getPrefix(depth, prefixParts) {
    let s = '';
    for (let i = 0; i < prefixParts.length - 1; i++) {
        s += prefixParts[i] ? '│   ' : '    ';
    }
    return s;
}

function printLine(node, depth, prefixParts, { isRoot = false } = {}) {
    if (isRoot) {
        console.log(node);
    } else {
        console.log(getPrefix(depth, prefixParts) + (depth === 0 ? '' : '└── ') + node);
    }
}


function printUsage() {
    console.log(`
    Использование:
    Реальный режим:
    node dep-visualizer.js --mode=real --package-name=<имя> --version=<версия> [--repo-url=<registry-url>] [--ascii=true|false] [--max-depth=10]

    Тестовый режим:
    node dep-visualizer.js --mode=test --package-name=<A> --repo-path=<путь-к-файлу> [--ascii=true|false] [--max-depth=10]

    Формат файла графа:
    A: B C D
    B: E F
    C: G
    D:
    E: A
    `);
}

module.exports = {
    main,
    parseArgs,
    validateParameters,
    loadGraphFromFile,
    printAsciiFromGraph,
    printAsciiFromFetcher,
    printFlatDepsFromGraph,
    printFlatFromFetcher,
    fetchJson
};


if (require.main === module) {
    main().catch(err => {
    console.error('[Критическая ошибка]', err);
    process.exitCode = 1;
    });
}
