## Этап 1. Минимальный прототип с конфигурацией
### Цель
Создать минимальное CLI-приложение и сделать его настраиваемым.
### Требование
1. Источником настраиваемых пользователем параметров являются опции
командной строки.
2. К настраиваемым параметрам относятся:
– Имя анализируемого пакета.
– URL-адрес репозитория или путь к файлу тестового репозитория.
– Режим работы с тестовым репозиторием.
– Версия пакета.
– Режим вывода зависимостей в формате ASCII-дерева.
– Максимальная глубина анализа зависимостей.
3. (только для этого этапа) При запуске приложения вывести все параметры,
настраиваемые пользователем, в формате ключ-значение.
4. Реализовать и продемонстрировать обработку ошибок для всех параметров.
5. Результат выполнения этапа сохранить в репозиторий стандартно
оформленным коммитом.
### Результат запуска
<img width="1793" height="242" alt="image" src="https://github.com/user-attachments/assets/1b4d929a-3c03-45ce-8aac-d971cad0a24a" />

### Код программы

```java
package src;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public class SecondStage {

    private static final Set<String> VALID_KEYS = Set.of(
            "--package-name", "--repo-url", "--repo-path",
            "--mode", "--version", "--ascii", "--max-depth"
    );
    private static final Map<String, String> params = new HashMap<>();


    public static void main(String[] args) {
        try {
            if(args.length == 0) {
                throw new IllegalArgumentException("Отсутсвуют параметры");
            }

            for(String argument: args) {
                String[] parameters = argument.split("=");

                if(parameters.length != 2) {
                    throw new IllegalArgumentException("Отсутствует значение для параметра");
                }

                String key = parameters[0];
                String value = parameters[1];

                if (!VALID_KEYS.contains(key)){
                    throw new IllegalArgumentException("Неизвестный параметр: " + key);
                }

                params.put(key, value);
            }

            validateParameters();
            String packageName = params.get("--package-name");
            String version = params.get("--version");

            if (packageName == null || version == null) {
                throw new IllegalArgumentException("Необходимо указать --package-name и --version");
            }

            String baseUrl = params.getOrDefault("--repo-url", "https://registry.npmjs.org/");
            if (!baseUrl.endsWith("/")) baseUrl += "/";

            String packageUrl = baseUrl + packageName;
            System.out.println("\nПолучаю данные о пакете: " + packageUrl);

            String json = fetchJson(packageUrl);

            System.out.println("\nПрямые зависимости для " + packageName + "@" + version + ":");

            printDependencies(json, version);


        } catch (IllegalArgumentException e) {
            System.err.println("[Ошибка] " + e.getMessage());
            printUsage();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static void printDependencies(String json, String version) {
        String versionKey = "\"" + version + "\":{";
        int startVersion = json.indexOf(versionKey);
        if (startVersion == -1) {
            System.out.println("Версия " + version + " не найдена.");
            return;
        }

        int depsIndex = json.indexOf("\"devDependencies\"", startVersion);

        if (depsIndex == -1) {
            System.out.println("Зависимости не найдены.");
            return;
        }

        int startBrace = json.indexOf("{", depsIndex);
        int endBrace = findMatchingBrace(json, startBrace);
        if (startBrace == -1 || endBrace == -1) {
            System.out.println("Ошибка при разборе зависимостей.");
            return;
        }

        String depsJson = json.substring(startBrace + 1, endBrace);
        String[] deps = depsJson.split(",");

        for (String dep : deps) {
            String[] pair = dep.split(":");
            if (pair.length == 2) {
//                String name = pair[0].replace("\"", "").trim();
//                String ver = pair[1].replace("\"", "").trim();
                System.out.println(pair[0] + " = " + pair[1]);
            }
        }
    }

    private static int findMatchingBrace(String s, int start) {
        int level = 0;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '{') level++;
            else if (c == '}') {
                level--;
                if (level == 0) return i;
            }
        }
        return -1;
    }


    private static String fetchJson(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {

            StringBuilder response = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
            return response.toString();
        }
    }

    private static void validateParameters() {
        if(params.containsKey("--max-depth")) {
            try {
                int num = Integer.valueOf(params.get("--max-Depth"));
                if(num <= 0) {
                    throw new NumberFormatException();
                }
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("Неверное значение для параметра: --max-depth");
            }
        }
    }

    private static void printUsage() {
        System.out.println("""
                Использование:
                java -jar DependencyVisualizer.jar --{parameter}={value} {parameter}={value}
                """);
    }
}
```
## Этап 2. Сбор данных
### Цель
Реализовать основную логику получения данных о зависимостях для их
дальнейшего анализа и визуализации. Запрещено пользоваться менеджерами
пакетов и сторонними библиотеками для получения информации о зависимостях
пакетов.
### Требования
1. Использовать формат пакетов JavaScript (npm).
2. Информацию необходимо получить для заданной пользователем версии
пакета.
3. Извлечь информацию о прямых зависимостях заданного пользователем
пакета, используя URL-адрес репозитория.
4. (только для этого этапа) Вывести на экран все прямые зависимости
заданного пользователем пакета.
5. Результат выполнения этапа сохранить в репозиторий стандартно
оформленным коммитом.
### Результат запуска
<img width="946" height="206" alt="image" src="https://github.com/user-attachments/assets/a8213e8a-0ff7-4231-8b30-70742fb08205" />

### Код программы
```js
const https = require('https');
const http = require('http');

const VALID_KEYS = new Set([
    '--package-name', '--repo-url', '--repo-path',
    '--mode', '--version', '--ascii', '--max-depth'
]);

function main() {
    const args = process.argv.slice(2);
    const params = {};

    try {
        if (args.length === 0) {
            throw new Error('Отсутствуют параметры');
        }

        for (const argument of args) {
            const parameters = argument.split('=');

            if (parameters.length !== 2) {
                throw new Error('Отсутствует значение для параметра');
            }

            const key = parameters[0];
            const value = parameters[1];

            if (!VALID_KEYS.has(key)) {
                throw new Error(`Неизвестный параметр: ${key}`);
            }

            params[key] = value;
        }

        validateParameters(params);
        const packageName = params['--package-name'];
        const version = params['--version'];

        if (!packageName || !version) {
            throw new Error('Необходимо указать --package-name и --version');
        }

        let baseUrl = params['--repo-url'] || 'https://registry.npmjs.org/';
        if (!baseUrl.endsWith('/')) baseUrl += '/';

        const packageUrl = baseUrl + packageName;
        console.log(`\nПолучаю данные о пакете: ${packageUrl}`);

        fetchJson(packageUrl)
            .then(json => {
                console.log(`\nПрямые зависимости для ${packageName}@${version}:`);
                printDependencies(json, version);
            })
            .catch(error => {
                console.error('[Ошибка]', error.message);
            });

    } catch (error) {
        console.error('[Ошибка]', error.message);
        printUsage();
    }
}

function printDependencies(json, version) {
    const versionKey = `"${version}":{`;
    const startVersion = json.indexOf(versionKey);
    
    if (startVersion === -1) {
        console.log(`Версия ${version} не найдена.`);
        return;
    }

    const depsIndex = json.indexOf('"devDependencies"', startVersion);

    if (depsIndex === -1) {
        console.log('Зависимости не найдены.');
        return;
    }

    const startBrace = json.indexOf('{', depsIndex);
    const endBrace = findMatchingBrace(json, startBrace);
    
    if (startBrace === -1 || endBrace === -1) {
        console.log('Ошибка при разборе зависимостей.');
        return;
    }

    const depsJson = json.substring(startBrace + 1, endBrace);
    const deps = depsJson.split(',');

    for (const dep of deps) {
        if (dep.trim()) {
            const pair = dep.split(':');
            if (pair.length === 2) {
                console.log(`${pair[0]} = ${pair[1]}`);
            }
        }
    }
}

function findMatchingBrace(s, start) {
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

function fetchJson(urlStr) {
    return new Promise((resolve, reject) => {
        const protocol = urlStr.startsWith('https:') ? https : http;
        
        const req = protocol.get(urlStr, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ошибка: ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(data);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Таймаут подключения'));
        });
    });
}

function validateParameters(params) {
    if (params['--max-depth']) {
        const num = parseInt(params['--max-depth']);
        if (isNaN(num) || num <= 0) {
            throw new Error('Неверное значение для параметра: --max-depth');
        }
    }
}

function printUsage() {
    console.log(`
Использование:
node script.js --{parameter}={value} {parameter}={value}
    `);
}


if (require.main === module) {
    main();
}

module.exports = {
    main,
    printDependencies,
    findMatchingBrace,
    fetchJson,
    validateParameters
};
```
## Этап 3. Основные операции
### Цель
Построить граф зависимостей (с учетом транзитивности) и выполнить
основные операции над ним.
### Требование
1. Получение графа зависимостей реализовать алгоритмом DFS без рекурсии.
2. Проводить анализ с учетом максимальной глубины, заданной
пользователем.
3. Корректно обработать случаи наличия циклических зависимостей.
4. Поддержать режим тестирования. Вместо URL реального репозитория, дать
возможность пользователю указать путь к файлу описания графа
репозитория, где пакеты называются большими латинскими буквами.
Продемонстрировать функциональность этого этапа на различных случаях
работы с тестовым репозиторием.
5. Результат выполнения этапа сохранить в репозиторий стандартно
оформленным коммитом
### Результаты запуска
<img width="1142" height="580" alt="image" src="https://github.com/user-attachments/assets/f2fc9e80-70f1-4308-a77b-e1a57de38b6b" />
<img width="1369" height="1079" alt="image" src="https://github.com/user-attachments/assets/110e18e0-1b5a-4410-99e9-c1afb39e2f8f" />
<img width="1343" height="1078" alt="image" src="https://github.com/user-attachments/assets/e0d18eca-79c5-4e9a-8f2d-5ea254f3f1b3" />
<img width="912" height="1094" alt="image" src="https://github.com/user-attachments/assets/43ee7637-91e1-49b6-87cb-ffae5e5a9e3c" />

### Код программы

```js
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

```

## Этап 4.
### Цель
Выполнить дополнительные операции над графом зависимостей.
### Требования
1. (только для этого этапа) Поддержать режим вывода на экран порядка
загрузки зависимостей для заданного пакета. Сравнить результаты с
реальным менеджером пакетов. Если есть расхождения в результатах,
объяснить их наличие.
2. Продемонстрировать функциональность этого этапа на различных случаях
работы с тестовым репозиторием.
3. Результат выполнения этапа сохранить в репозиторий стандартно
оформленным коммитом.

### Результаты запуска
<img width="1345" height="603" alt="image" src="https://github.com/user-attachments/assets/ffe7932b-61e0-4cc3-945b-16a53ec0d5da" />
<img width="1287" height="1075" alt="image" src="https://github.com/user-attachments/assets/9a2c2c71-90f5-4cc5-ba98-a80383a8b40d" />
<img width="1405" height="382" alt="image" src="https://github.com/user-attachments/assets/dc9ffba1-a8cf-42a3-aca0-1337ee0679a4" />
<img width="1276" height="593" alt="image" src="https://github.com/user-attachments/assets/3ab16f75-8dd0-4212-8820-5ab987811038" />

### Код программы
```js

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

```
