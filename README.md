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
