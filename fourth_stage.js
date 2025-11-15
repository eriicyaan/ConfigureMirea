const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const VALID_KEYS = new Set([
    '--package-name', '--repo-url', '--repo-path',
    '--mode', '--version', '--ascii', '--max-depth',
    '--show-order', '--compare-npm'
]);

class IllegalArgumentException extends Error {
    constructor(message) {
        super(message);
        this.name = 'IllegalArgumentException';
    }
}

class FourthStage {
    constructor() {
        this.params = {};
        this.fetchCache = new Map(); 
    }

    async main(args) {
        try {
            this.parseArgs(args);
            this.validateParameters();

            const mode = (this.params['--mode'] || 'real').toLowerCase();

            if (mode === 'test') {
                await this.runTestMode();
            } else {
                await this.runRealMode();
            }

        } catch (error) {
            if (error instanceof IllegalArgumentException) {
                console.error('[Ошибка]', error.message);
                this.printUsage();
            } else {
                console.error('[Критическая ошибка]', error && error.stack ? error.stack : error);
            }
            process.exitCode = 1;
        }
    }

    async runTestMode() {
        const repoPath = this.params['--repo-path'];
        if (!repoPath) throw new IllegalArgumentException('В тестовом режиме необходимо указать --repo-path');

        await this.validateFileExists(repoPath);

        const graph = await this.loadGraphFromFile(repoPath);
        const startPackage = this.params['--package-name'];
        const ignoreSubstring = this.params['--ignore-substring'] || null;
        const maxDepth = this.params['--max-depth'] ? parseInt(this.params['--max-depth'], 10) : 100;
        const ascii = (this.params['--ascii'] || 'true').toLowerCase() !== 'false';

        if (!graph[startPackage]) {
            throw new IllegalArgumentException(`Указанный пакет '${startPackage}' не найден в тестовом графе`);
        }

        if (this.params['--show-order']) {
            console.log(`\n🔍 Анализ порядка загрузки для пакета '${startPackage}' (тестовый режим):`);
            const { order, cycles } = this.getLoadOrder(graph, startPackage, { ignoreSubstring, maxDepth });
            if (cycles.length) {
                console.log('   ❌ Циклы обнаружены:');
                cycles.forEach(c => console.log(`     • ${c.join(' → ')}`));
            } else {
                console.log('   ✅ Топологический порядок загрузки:');
                order.forEach((p, i) => console.log(`     ${i + 1}. ${p}`));
            }
        } else {
            console.log(`\nГраф зависимостей (тестовый режим) для пакета '${startPackage}':`);
            if (ascii) {
                this.printAsciiFromGraph(graph, startPackage, { maxDepth, ignoreSubstring });
            } else {
                this.dfsIterative(graph, startPackage, ignoreSubstring, maxDepth);
            }
        }
    }

    async runRealMode() {
        const packageName = this.params['--package-name'];
        const version = this.params['--version'];

        if (!packageName) throw new IllegalArgumentException('Необходимо указать --package-name в реальном режиме');
        if (!version && !this.params['--compare-npm']) throw new IllegalArgumentException('В реальном режиме необходимо указать --version');

        if (this.params['--compare-npm']) {
            await this.compareWithNpm(packageName, version);
            return;
        }

        let baseUrl = this.params['--repo-url'] || 'https://registry.npmjs.org/';
        if (!baseUrl.endsWith('/')) baseUrl += '/';

        const maxDepth = this.params['--max-depth'] ? parseInt(this.params['--max-depth'], 10) : 100;
        const ascii = (this.params['--ascii'] || 'true').toLowerCase() !== 'false';
        const ignoreSubstring = this.params['--ignore-substring'] || null;

        console.log(`\nРеальный режим. Пакет: ${packageName}@${version}. registry=${baseUrl} max-depth=${maxDepth}`);

        const graph = await this.buildGraphFromRegistry(packageName, version, baseUrl, maxDepth);

        if (!graph || Object.keys(graph).length === 0) {
            console.log(`Не удалось извлечь зависимости для ${packageName}@${version} или их нет.`);
            return;
        }

        if (this.params['--show-order']) {
            console.log(`\n🔍 Анализ порядка загрузки для пакета '${packageName}@${version}' (реальный режим):`);
            const { order, cycles } = this.getLoadOrder(graph, packageName, { ignoreSubstring, maxDepth });
            if (cycles.length) {
                console.log('   ❌ Циклы обнаружены:');
                cycles.forEach(c => console.log(`     • ${c.join(' → ')}`));
            } else {
                console.log('   ✅ Топологический порядок загрузки:');
                order.forEach((p, i) => console.log(`     ${i + 1}. ${p}`));
            }
        } else {
            console.log('Граф зависимостей (полный):');
            if (ascii) {
                this.printAsciiFromGraph(graph, packageName, { maxDepth, ignoreSubstring });
            } else {
                this.dfsIterative(graph, packageName, ignoreSubstring, maxDepth);
            }
        }
    }

    async buildGraphFromRegistry(rootName, rootVersion, baseUrl, maxDepth = 100) {
        const graph = {};
        const toProcess = [{ name: rootName, version: rootVersion, depth: 0 }];
        const seen = new Set(); 

        while (toProcess.length > 0) {
            const { name, version, depth } = toProcess.shift();
            const key = `${name}@${version || 'latest'}`;
            if (seen.has(key)) continue;
            seen.add(key);

            if (depth > maxDepth) continue;

            const meta = await this.getPackageMeta(name, version, baseUrl);
            if (!meta) {
                graph[name] = graph[name] || [];
                continue;
            }

            const deps = meta.deps || [];
            graph[name] = deps;

            for (const dep of deps) {
                if (!dep) continue;
                toProcess.push({ name: dep, version: null, depth: depth + 1 });
            }
        }

        return graph;
    }

    async getPackageMeta(pkgName, ver, baseUrl) {
        const cacheKey = `${pkgName}@${ver || 'latest'}@${baseUrl}`;
        if (this.fetchCache.has(cacheKey)) return this.fetchCache.get(cacheKey);

        const pkgUrl = baseUrl + encodeURIComponent(pkgName);
        let data;
        try {
            data = await this.fetchJson(pkgUrl);
        } catch (e) {
            this.fetchCache.set(cacheKey, null);
            return null;
        }

        let parsed;
        try {
            parsed = JSON.parse(data);
        } catch (e) {
            this.fetchCache.set(cacheKey, null);
            return null;
        }

        // choose version
        let chosenVersion = ver;
        if (!chosenVersion) {
            chosenVersion = (parsed['dist-tags'] && parsed['dist-tags'].latest) || null;
            if (!chosenVersion) {
                const vs = Object.keys(parsed.versions || {});
                chosenVersion = vs.length ? vs.sort().pop() : null;
            }
        }

        const versionObj = (parsed.versions && parsed.versions[chosenVersion]) || null;
        const depsObj = versionObj && versionObj.dependencies ? versionObj.dependencies : {};
        const deps = Object.keys(depsObj || {});
        const meta = { deps, resolvedVersion: chosenVersion };
        this.fetchCache.set(cacheKey, meta);
        return meta;
    }

    getLoadOrder(graph, start, opts = {}) {
        const ignoreSubstring = opts.ignoreSubstring || null;
        const maxDepth = opts.maxDepth || Infinity;

        const reachable = new Set();
        const q = [{ node: start, depth: 0 }];
        while (q.length) {
            const { node, depth } = q.shift();
            if (reachable.has(node)) continue;
            if (depth > maxDepth) continue;
            reachable.add(node);
            const deps = graph[node] || [];
            for (const d of deps) {
                if (ignoreSubstring && d.includes(ignoreSubstring)) continue;
                q.push({ node: d, depth: depth + 1 });
            }
        }

        const indeg = {};
        for (const n of reachable) indeg[n] = 0;
        for (const n of reachable) {
            for (const dep of graph[n] || []) {
                if (!reachable.has(dep)) continue;
                if (ignoreSubstring && dep.includes(ignoreSubstring)) continue;
                indeg[dep] = (indeg[dep] || 0) + 1;
            }
        }

        const zero = [];
        for (const [n, d] of Object.entries(indeg)) {
            if (d === 0) zero.push(n);
        }

        const order = [];
        while (zero.length) {
            const n = zero.shift();
            order.push(n);
            for (const dep of graph[n] || []) {
                if (!reachable.has(dep)) continue;
                if (ignoreSubstring && dep.includes(ignoreSubstring)) continue;
                indeg[dep]--;
                if (indeg[dep] === 0) zero.push(dep);
            }
        }

        const cycles = [];
        const remaining = [...reachable].filter(n => !order.includes(n));
        if (remaining.length) {
            const visited = new Set();
            const stack = [];
            const onStack = new Set();

            const dfs = (v) => {
                visited.add(v);
                stack.push(v);
                onStack.add(v);
                for (const w of graph[v] || []) {
                    if (!reachable.has(w)) continue;
                    if (!visited.has(w)) {
                        dfs(w);
                    } else if (onStack.has(w)) {
                        // extract cycle
                        const idx = stack.indexOf(w);
                        if (idx !== -1) {
                            const cyc = stack.slice(idx);
                            cycles.push(cyc.concat(w)); // close cycle
                        }
                    }
                }
                stack.pop();
                onStack.delete(v);
            };

            for (const v of remaining) {
                if (!visited.has(v)) dfs(v);
            }
        }

        return { order, cycles };
    }


    async compareWithNpm(packageName, version) {
        console.log(`\n🔍 Сравнение с npm для ${packageName}@${version}...`);

        const tmpBase = os.tmpdir();
        const tmpPrefix = path.join(tmpBase, 'npm-compare-');
        let tempDir;
        try {
            tempDir = await fs.mkdtemp(tmpPrefix);
        } catch (e) {
            console.error('Не удалось создать временную директорию:', e.message);
            return;
        }

        try {
            const pkgJson = {
                name: 'compare-test',
                version: '1.0.0',
                description: 'temp for dependency order comparison',
                private: true,
                dependencies: {
                    [packageName]: version
                }
            };
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf8');

            console.log('📦 Запускаю npm install (может занять время)...');
            try {
                execSync('npm install --no-audit --no-fund', { cwd: tempDir, stdio: 'inherit', timeout: 10 * 60 * 1000 });
            } catch (npmErr) {
                console.warn('npm install завершился с кодом ошибки или предупреждением (продолжаем анализ) — см. вывод выше');
            }

            let lsOutput = null;
            try {
                lsOutput = execSync('npm ls --all --json', { cwd: tempDir, encoding: 'utf8', timeout: 60 * 1000 });
            } catch (err) {
                if (err.stdout) lsOutput = err.stdout.toString();
                else if (err.stderr) lsOutput = err.stderr.toString();
                else lsOutput = null;
            }

            if (!lsOutput) {
                console.warn('Не удалось получить дерево npm (npm ls не вернул JSON)');
                return;
            }

            let npmTree;
            try {
                npmTree = JSON.parse(lsOutput);
            } catch (e) {
                console.warn('Не удалось распарсить JSON из npm ls:', e.message);
                return;
            }

            const baseUrl = this.params['--repo-url'] || 'https://registry.npmjs.org/';
            const ourGraph = await this.buildGraphFromRegistry(packageName, version, baseUrl, this.params['--max-depth'] ? parseInt(this.params['--max-depth'], 10) : 100);

            const npmOrderList = this.extractOrderFromNpmTree(npmTree, packageName);

            const { order: ourOrder, cycles } = this.getLoadOrder(ourGraph, packageName, { ignoreSubstring: this.params['--ignore-substring'] || null });

            console.log('\n🔁 Сравнение порядка:');
            console.log(`   • Порядок npm (кол-во): ${npmOrderList.length}`);
            console.log(`   • Наш порядок (кол-во): ${ourOrder.length}`);
            console.log('\n   npm (первые 20):');
            npmOrderList.slice(0, 20).forEach((p, i) => console.log(`     ${i + 1}. ${p}`));
            console.log('\n   Наш (первые 20):');
            ourOrder.slice(0, 20).forEach((p, i) => console.log(`     ${i + 1}. ${p}`));

            const npmSet = new Set(npmOrderList);
            const ourSet = new Set(ourOrder);
            const onlyInNpm = [...npmSet].filter(x => !ourSet.has(x));
            const onlyInOurs = [...ourSet].filter(x => !npmSet.has(x));

            console.log('\n   Отличия (пакеты присутствуют только в одной из двух версий):');
            console.log(`     • В npm, но нет у нас: ${onlyInNpm.length ? onlyInNpm.slice(0, 20).join(', ') : '(нет)'}`);
            console.log(`     • У нас, но нет в npm: ${onlyInOurs.length ? onlyInOurs.slice(0, 20).join(', ') : '(нет)'}`);

            if (cycles.length) {
                console.log('\n   ❗ У нас обнаружены циклы в графе (влияет на порядок):');
                cycles.forEach(c => console.log(`     • ${c.join(' → ')}`));
            }

            console.log('\n   Пояснения возможных расхождений:');
            console.log('     • npm использует hoisting/flattening/lockfile/peerDependencies/optionalDeps, что меняет итоговую структуру.');
            console.log('     • мы используем топологический порядок на основе зависимостей, npm может устанавливать параллельно и хостить пакеты.');
            console.log('     • package-lock.json и npm cache влияют на разрешение версий и порядок.');
            console.log('     • peerDependencies / optionalDependencies могут обрабатываться по-другому.');

        } finally {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (e) {
            }
        }
    }

    extractOrderFromNpmTree(npmTree, rootPackageName) {
        const result = [];
        const visited = new Set();

        function traverse(node, depth = 0) {
            if (!node || !node.dependencies) return;
            for (const [name, info] of Object.entries(node.dependencies)) {
                if (visited.has(name)) continue;
                visited.add(name);
                result.push(name);
                traverse(info, depth + 1);
            }
        }

        traverse(npmTree);
        return result;
    }

    fetchJson(urlStr, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const protocol = urlStr.startsWith('https:') ? https : http;
            const req = protocol.get(urlStr, (res) => {
                if (res.statusCode !== 200) {
                    // collect body for message
                    let body = '';
                    res.on('data', (c) => body += c);
                    res.on('end', () => reject(new Error(`HTTP ${res.statusCode} при запросе ${urlStr}`)));
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

    async loadGraphFromFile(filePath) {
        const graph = {};

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const lines = data.split(/\r?\n/);

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                const parts = trimmedLine.split(':');
                if (parts.length < 1) continue;
                const pkg = parts.shift().trim();
                const depsPart = parts.join(':').trim();
                const deps = depsPart ? depsPart.split(/\s+/).filter(Boolean) : [];
                graph[pkg] = deps;
            }

            console.log(`Загружен граф из файла: ${Object.keys(graph).length} пакетов`);
            return graph;
        } catch (error) {
            throw new Error(`Ошибка чтения файла: ${error.message}`);
        }
    }

    findMatchingBrace(s, start) {
        let level = 0;
        for (let i = start; i < s.length; i++) {
            const c = s.charAt(i);
            if (c === '{') level++;
            else if (c === '}') {
                level--;
                if (level === 0) return i;
            }
        }
        return -1;
    }

    extractDependencies(jsonStr, version) {
        try {
            const parsed = JSON.parse(jsonStr);
            const ver = version;
            const versionObj = parsed && parsed.versions && parsed.versions[ver];
            if (!versionObj) return {};
            const depsObj = versionObj.dependencies || {};
            const deps = Object.keys(depsObj);
            const graph = {};
            graph[this.params['--package-name']] = deps;
            return graph;
        } catch (e) {
            return {};
        }
    }


    dfsIterative(graph, start, ignoreSubstring = null, maxDepth = 100) {
        const stack = [{ node: start, depth: 0 }];
        const visited = new Set();

        while (stack.length > 0) {
            const { node, depth } = stack.pop();

            if (visited.has(node)) {
                console.log(`↪ Циклическая зависимость: ${node}`);
                continue;
            }

            visited.add(node);

            const deps = graph[node] || [];
            for (const dep of deps) {
                if (ignoreSubstring && dep.includes(ignoreSubstring)) {
                    console.log(`${'  '.repeat(depth)}- ${dep} [игнорировано]`);
                    continue;
                }
                console.log(`${'  '.repeat(depth)}- ${node} -> ${dep}`);
                if (depth + 1 < maxDepth) stack.push({ node: dep, depth: depth + 1 });
            }
        }
    }


    printAsciiFromGraph(graph, start, opts = {}) {
        const maxDepth = opts.maxDepth || 100;
        const ignoreSubstring = opts.ignoreSubstring || null;

        // We'll implement an iterative stack that keeps prefix information
        const stack = [{ node: start, depth: 0, iter: 0, deps: (graph[start] || []) }];
        const pathSet = new Set();

        // print root
        console.log(start);

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];

            if (!frame.deps || frame.iter >= frame.deps.length) {
                // done with this node
                pathSet.delete(frame.node);
                stack.pop();
                continue;
            }

            const child = frame.deps[frame.iter++];
            const depth = frame.depth + 1;

            if (ignoreSubstring && child.includes(ignoreSubstring)) {
                console.log(`${'│   '.repeat(frame.depth)}└── ${child} [игнорировано]`);
                continue;
            }

            const prefix = '│   '.repeat(frame.depth) + '└── ';

            if (!graph[child] || graph[child].length === 0) {
                console.log(prefix + `${child} (leaf)`);
                continue;
            }

            if (pathSet.has(child)) {
                console.log(prefix + `${child} (циклическая зависимость)`);
                continue;
            }

            console.log(prefix + child);
            pathSet.add(child);
            const childDeps = graph[child] || [];
            if (depth <= maxDepth) {
                stack.push({ node: child, depth, iter: 0, deps: childDeps });
            } else {
                console.log('│   '.repeat(depth - 1) + '└── ... (max depth reached)');
            }
        }
    }

    async validateFileExists(filePath) {
        try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                throw new IllegalArgumentException('--repo-path должен указывать на файл, а не на директорию');
            }
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                throw new IllegalArgumentException(`Файл не найден: ${filePath}`);
            }
            throw new IllegalArgumentException(`Ошибка доступа к файлу: ${error.message}`);
        }
    }

    validateParameters() {
        const mode = (this.params['--mode'] || 'real').toLowerCase();
        if (!['real', 'test'].includes(mode)) {
            throw new IllegalArgumentException('Неверное значение для --mode. Допустимые значения: real, test');
        }

        if (mode === 'real') {
            if (!this.params['--package-name']) {
                throw new IllegalArgumentException('В реальном режиме необходимо указать --package-name');
            }
            if (!this.params['--version'] && !this.params['--compare-npm']) {
                throw new IllegalArgumentException('В реальном режиме необходимо указать --version (если не используется --compare-npm)');
            }
        } else {
            if (!this.params['--package-name']) {
                throw new IllegalArgumentException('В тестовом режиме необходимо указать --package-name');
            }
            if (!this.params['--repo-path']) {
                throw new IllegalArgumentException('В тестовом режиме необходимо указать --repo-path');
            }
        }

        if (this.params['--max-depth']) {
            const maxDepth = parseInt(this.params['--max-depth'], 10);
            if (isNaN(maxDepth) || maxDepth <= 0 || maxDepth > 1000) {
                throw new IllegalArgumentException('--max-depth должен быть положительным числом от 1 до 1000');
            }
        }

        if (this.params['--compare-npm'] && mode === 'test') {
            console.warn('⚠ Предупреждение: --compare-npm лучше работает в реальном режиме');
        }
    }

    parseArgs(args) {
        if (!args || args.length === 0) {
            throw new IllegalArgumentException('Отсутствуют параметры');
        }

        for (const argument of args) {
            // allow values with '=' by splitting only on first '='
            const eqIndex = argument.indexOf('=');
            if (eqIndex === -1) {
                throw new IllegalArgumentException('Отсутствует значение для параметра (ожидается формат --key=value)');
            }
            const key = argument.substring(0, eqIndex);
            const value = argument.substring(eqIndex + 1);

            if (!VALID_KEYS.has(key)) {
                throw new IllegalArgumentException(`Неизвестный параметр: ${key}`);
            }

            if (value === '') {
                throw new IllegalArgumentException(`Отсутствует значение для параметра ${key}`);
            }

            this.params[key] = value;
        }
    }

    printUsage() {
        console.log(`
Использование Fourth Stage:

Базовый анализ (тестовый файл):
  node fourth_stage.js --mode=test --package-name=A --repo-path=complex_graph.txt --show-order
  (показывает порядок загрузки/topological order и циклы)

Реальный режим (npm registry):
  node fourth_stage.js --mode=real --package-name=express --version=4.18.2 --show-order --max-depth=5
  (скачивает metadata из registry и строит граф / порядок загрузки)

Сравнение с npm:
  node fourth_stage.js --package-name=react --version=18.2.0 --compare-npm

Параметры:
  --show-order        : Показать порядок загрузки зависимостей
  --compare-npm       : Сравнить с реальным менеджером пакетов npm (создаётся врем. проект)
  --package-name      : Имя пакета для анализа
  --version           : Версия пакета (реальный режим)
  --repo-path         : Путь к файлу графа (тестовый режим)
  --mode              : Режим работы (real/test)
  --ignore-substring  : Игнорировать зависимости содержащие подстроку
  --max-depth         : Максимальная глубина анализа (по умолчанию 100)
  --repo-url          : (опционально) URL npm registry, по умолчанию https://registry.npmjs.org/

Пример файла графа (graph.txt):
  A: B C
  B: D E
  C: D F
  D:
  E: A
  F: G
`);
    }
}


if (require.main === module) {
    const app = new FourthStage();

    if (process.argv.length <= 2) {
        console.log('🚀 Fourth Stage - Анализ порядка загрузки зависимостей');
        (async () => {
            try {
                // create an example complex_graph.txt if missing
                const example = path.join(process.cwd(), 'complex_graph.txt');
                if (!fsSync.existsSync(example)) {
                    const complexContent = `A: B C
B: D E
C: D F
D:
E: A
F: G
G: H
H: F
I: J K
J: L
K: M
L:
M:`;
                    await fs.writeFile(example, complexContent, 'utf8');
                    console.log('✅ Создан сложный пример файла графа: complex_graph.txt');
                }
            } catch (e) { /* ignore */ }
            app.printUsage();
        })();
    } else {
        app.main(process.argv.slice(2));
    }
}

module.exports = FourthStage;
