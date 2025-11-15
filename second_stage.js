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