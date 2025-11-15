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
