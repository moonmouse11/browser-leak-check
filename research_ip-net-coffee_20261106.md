# ip.net.coffee — глубокий разбор для разработки расширения network-leak-check

**Date:** 2026-11-06
**Depth:** deep
**Confidence:** 88%
**Sources:** 31 источник из 4 поисковых раундов (преимущественно Tier 1: первичный код сайта и живые API-ответы)

---

## Executive Summary

ip.net.coffee — это тонкий клиентский фронтенд поверх **серверной** риск-аналитики: всё ценное (Trust Score, VPN/Proxy/Tor-детект, geo) считается их бэкендом (`/api/iprisk`, `/api/geoip`), а в браузере выполняются только дешёвые проверки. Хорошая новость: почти все клиентские техники сайта воспроизводимы в расширении напрямую — ключевые эндпоинты (`cdn-cgi/trace`, `speed.cloudflare.com`, statuspage API, RDAP) отдают `Access-Control-Allow-Origin: *`, что подтверждено живыми запросами. Плохая новость: эталонный «Trust Score» без сервера не повторить — ближайшая замена, 1-2 бесплатных риск-API в существующем реестре источников. Главный caveat: их собственный `/api/iprisk` доступен публично и без ключа, но это недокументированный API чужого сайта — использовать его как основу нельзя.

## Key Findings

1. **Риск-скоринг сайта — серверный.** `/api/iprisk/{ip}` возвращает готовый вердикт: `is_datacenter, is_vpn, is_proxy, is_tor, is_crawler, is_abuser, isResidential, company_type, trust_score, abuser_score`. Формат ответа (включая строку `abuser_score: "0.0234 (Elevated)"`) повторяет формат ipapi.is — сайт, судя по всему, проксирует/агрегирует ipapi.is и IPinfo. [Source](https://ip.net.coffee/api/iprisk/1.1.1.1)
2. **Их `/api/iprisk` публичен, без ключа, с CORS `*` и CDN-кешем 10 минут** — технически пригоден как источник для расширения, но юридически/операционно хрупок (нет документации, лимитов, SLA). [Source](https://ip.net.coffee/api/iprisk/1.1.1.1)
3. **Вся «авailability-диагностика» делается прямыми fetch из браузера** на `cdn-cgi/trace` целевых сервисов (claude.ai, chatgpt.com, 1.1.1.1, anthropic.com) — все отвечают `ACAO: *` и отдают IP выхода, colo-узел, WARP, версии HTTP/TLS. [Source](https://claude.ai/cdn-cgi/trace)
4. **Тест сетевой связности (/link/) — это загрузка favicon'ов** ~30 сайтов через `fetch(url, {mode:'no-cors'})` с таймаутом 2.5 с; Google/YouTube проверяются через `/generate_204`. Трюк полностью воспроизводим в расширении без каких-либо разрешений. [Source](https://ip.net.coffee/link/link-page.js?v=20261106f)
5. **Statuspage API открыт для CORS**: `status.openai.com/api/v2/status.json` отдаёт `ACAO: *`, Anthropic редиректит на `status.claude.com` (тот же формат). Мониторинг статусов сервисов делается без сервера. [Source](https://status.openai.com/api/v2/status.json)
6. **Turnstile и reCAPTCHA v3 принципиально требуют сервера** — официальные доки обоих продуктов: секрет нельзя поставлять в клиенте, валидация токена только на бэкенде. Для расширения это hard non-goal. [Source](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
7. **Маркетинг сайта о приватности расходится с его кодом**: при заявлении «100%隐私友好» их JS молча POST'ит обнаруженные IP пользователя на `/api/session` («for sharing analysis», fire-and-forget). [Source](https://ip.net.coffee/claude/claude-page.js?v=20260916a)
8. **Их же риск-детектор даёт ложные срабатывания**: 8.8.8.8 (Google Public DNS) помечен `is_vpn: true` — при собственном заявлении «высокая置信度, ложных срабатываний почти нет». Вывод: любой одиночный риск-источник — advisory, нужно перекрёстное сравнение. [Source](https://ip.net.coffee/api/iprisk/8.8.8.8)

## Detailed Analysis

### Под-вопрос 1: Полный инвентарь инструментов и разделение client/server

Инвентарь сайта по sitemap и JS-бандлам: IP-запрос с тестом раздельного роутинга (`/`, `/ip/`), риск-проверки под Claude (`/claude/`) и ChatGPT (`/gpt/`), связность (`/link/`), DNS-leak (`/dns/`), WebRTC-leak (`/webrtc/`), Cloudflare-диагностика (`/cloudflare/`), глобальный ping (`/ping/`), статусы сервисов (`/status/`), Whois (`/whois/`), новости и «IP-карточка». [Source](https://ip.net.coffee/sitemap-main.xml)

Разделение труда однозначное. **Серверные** (их инфраструктура, нам недоступна по сути): риск-скоринг (`/api/iprisk`), geo (`/api/geoip`), ping с 20 узлов (`/api/ping/start` + polling `/api/ping/result/{id}`), portscan (`/api/ip/portscan/`), DNS-leak-инфра (токен-поддомены `*.d.ip.net.coffee` + `/api/dns/result/{token}`), агрегация статусов (`/status/data.json`). **Клиентские**: echo-запросы, `cdn-cgi/trace`, favicon-связность, WebRTC, device info, история в localStorage. [Source](https://ip.net.coffee/ping/ping-page.js?v=20260910a)

Это прямо отвечает на вопрос архитектуры расширения: сайт сам демонстрирует, какая часть «умного IP-чекера» обязана жить на сервере (риск-данные, распределённые замеры), а какая честно клиентская. Их DNS-leak — ровно та схема, что описана в PLAN.md проекта как Phase 2 (свой домен + authoritative DNS + API): они это построили, мы используем bash.ws. Здесь заимствовать нечего, кроме подтверждения, что схема у всех одна.

**Cross-reference**: именно потому, что риск-ядро серверное (Q1), Q3 становится центральным вопросом «что доступно нам».

### Под-вопрос 2: Какие эндпоинты вызываются из расширения напрямую (CORS, без ключа)

Как установлено в Q1, клиентская часть сайта — единственная воспроизводимая. Каждый кандидат проверен живым запросом с `Origin: chrome-extension://...`:

| Эндпоинт | CORS | Что даёт |
|---|---|---|
| `claude.ai/cdn-cgi/trace`, `chatgpt.com/cdn-cgi/trace`, `1.1.1.1/cdn-cgi/trace` | ✅ `*` | выходной IP под конкретный сервис, colo, warp, http, tls, sni |
| `speed.cloudflare.com/__down?bytes=N`, `/__up` | ✅ `*` | замер скорости до ближайшего CF-узла |
| `status.openai.com/api/v2/status.json`, `status.claude.com/...` | ✅ `*` | официальный статус сервиса (statuspage v2) |
| `rdap.org/ip/{ip}` | ✅ `*` | Whois через RDAP (302 → авторитетный RDAP) |
| `my.ip.cn` | ✅ `*` | китайский IP-echo (для реестра малополезен, но CORS есть) |
| `ip.net.coffee/api/iprisk`, `/api/geoip` | ✅ `*` | их риск-вердикт без ключа (см. caveat в Q3) |

**Анализ**: самый ценный паттерн — `cdn-cgi/trace` под конкретный AI-сервис. Он отвечает на вопрос «какой IP видит именно Claude» одним запросом, безо всякого риск-API, и естественно расширяет существующую multi-source-модель: trace-эндпоинты — это просто новые источники в реестре с дополнительными полями (colo/warp/tls). Favicon-паттерн (`no-cors` + таймаут) — единственный способ проверить связность с произвольными сайтами без CORS, и он же даёт грубую оценку задержки.

**Cross-reference**: эти находки определяют фазу 1 рекомендаций (Q4 детализирует Cloudflare-часть).

### Под-вопрос 3: Риск-API — что у сайта против доступных нам

У сайта — серверная агрегация коммерческих данных (ответ `/api/iprisk` повторяет схему ipapi.is, включая фирменный формат `abuser_score`; их фронт упоминает ipapi.is и IPinfo). [Source](https://ipapi.is/free-tier.html) Нам сервер недоступен, поэтому сравнение бесплатных CORS-совместимых API (все проверены живыми запросами):

| API | Ключ | Лимит | CORS | Детект | Обработка данных |
|---|---|---|---|---|---|
| **vpnapi.io** | бесплатный | 1000/день | ✅ | vpn/proxy/tor/relay + ASN + geo | США, без EU-адекватности ([privacy](https://vpnapi.io/privacy-policy)) |
| **ipdata.co** | бесплатный | 1500/день | ✅ | threat profile (OSINT-листы), vpn/proxy/tor | GDPR, **EU-эндпоинт** ([pricing FAQ](https://ipdata.co/pricing.html)) |
| **ipapi.is** | без ключа / free-ключ | rate-limited | ✅ | без ключа только geo/ASN; флаги — с ключом | флаги убраны из keyless-тарифа ([free-tier](https://ipapi.is/free-tier.html)) |
| proxycheck.io | без ключа | 100/день | ❌ | лучшие флаги | мимо CORS-правила проекта |
| IPQualityScore | ключ | 5000/мес | ❌ | fraud score | мимо CORS-правила проекта |

**Анализ**: таблица выявляет главный trade-off — качество детекции против транспорта. Лучший по качеству (proxycheck) недоступен из-за CORS; доступные (vpnapi.io, ipdata.co) покрывают базовый набор флагов и подходят под существующую модель «опциональных источников с метками». Два независимых источника лучше одного: Q8 показывает, что ложные срабатывания есть даже у коммерческой агрегации, а архитектура расширения уже умеет показывать согласие/разногласие источников. Отдельный путь-ловушка: их `/api/iprisk` бесплатен и без ключа — но это недокументированный API чужого сайта, который может измениться, закрыться или начать тарифицироваться без предупреждения; годится разве что для прототипа.

**Cross-reference**: выбор источников напрямую определяет disclosure-обязательства в Q6.

### Под-вопрос 4: Cloudflare-проверки под микроскопом

Страница `/cloudflare/` состоит из пяти блоков с принципиально разной воспроизводимостью:

1. **Trace-паспорт** (`cdn-cgi/trace`): ip, colo, warp, http, tls, sni — ✅ одним fetch (см. Q2).
2. **Сравнение тарифных сетей CF** (free vs enterprise vs WARP): несколько trace-запросов к разным CF-fronted хостам — ✅ тем же механизмом.
3. **Замер скорости**: `speed.cloudflare.com/__down?bytes=N` + `/__up` — ✅ технически (CORS `*`), но их же предупреждение: до ~350 МБ трафика за прогон. В расширении — только явной кнопкой с ценником. [Source](https://ip.net.coffee/cloudflare/cloudflare-page.js?v20260916d)
4. **Turnstile**: официальная документация Cloudflare прямым текстом — «Mandatory server-side validation», секрет нельзя включать в клиентский код. Расширение — распространяемый клиент: секрет был бы публичным. ❌ non-goal. [Source](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
5. **reCAPTCHA v3**: та же модель (токен проверяется бэкендом с секретом). ❌ non-goal. [Source](https://developers.google.com/recaptcha/docs/v3)

**Анализ**: из всей Cloudflare-страницы в расширение честно переносятся блоки 1-3; «оценка риска по Turnstile» — единственный по-настоящему уникальный их инструмент, и он недостижим без своего бэкенда. Это фундаментальная граница «чисто клиентского» подхода, а не недоработка.

**Cross-reference**: WARP-флаг из trace соединяется с Q5 — `warp=on` меняет интерпретацию совпадения/различия IP между источниками (выход CF вместо выхода VPN).

### Под-вопрос 5: Чему поучиться у их leak-тестов

**DNS-leak**: у них — классическая схема «уникальный токен → картинки с `${token}-${i}.d.ip.net.coffee` → опрос `/api/dns/result/{token}`», т.е. ровно bash.ws-паттерн, но на собственной инфраструктуре. Их реализация не даёт ничего сверх того, что уже делает расширение (settle всех проб, таймауты). [Source](https://ip.net.coffee/dns/)

**WebRTC**: стандартный сбор srflx-кандидатов через Google/Cloudflare STUN, без TURN и без per-server атрибуции — существующая реализация расширения (per-STUN-server источники) формально **богаче** их версии. [Source](https://ip.net.coffee/webrtc/)

**Анализ**: заимствовать нечего, кроме одной идеи — обе проверки у них запускаются параллельно и неблокирующе (`Promise.allSettled`) с отдельным рендером по мере готовности. Это UX-паттерн для каталога проверок: каждая карточка живёт своей жизнью.

**Cross-reference**: подтверждает вывод Q1 — уникальная ценность сайта не в leak-тестах, а в серверной риск-аналитике (Q3).

### Под-вопрос 6: Приватность-практики и импликации для disclosure

Наблюдаемые факты: (а) история IP действительно localStorage-only (ключ `claude_ip_history`, максимум 6 записей) — заявление подтверждается кодом; (б) но та же страница молча отправляет обнаруженные IP на `/api/session` с комментарием «Report IP session for sharing analysis (silent, fire-and-forget)» — телеметрия, о которой маркетинг умалчивает. [Source](https://ip.net.coffee/claude/claude-page.js?v=20260916a) (в) Google Analytics (gtag) на всех страницах.

Для расширения импликации прямые. Любой риск-источник получает IP пользователя — это сама суть запроса; выбор сводится к юрисдикции и условиям: vpnapi.io — США без EU-адекватности ([privacy policy](https://vpnapi.io/privacy-policy)); ipdata.co — GDPR с EU-эндпоинтом, данные остаются в ЕС ([pricing FAQ](https://ipdata.co/pricing.html)); ipapi.is — единственный keyless-режим (нет аккаунта = нет привязки к email). Модель расширения (источники выключены по умолчанию, метки «продаёт данные об IP», запрос только по явному запуску проверки) покрывает все эти случаи — нужно лишь задокументировать новые источники в README и в UI-метках, включая юрисдикцию обработки.

**Cross-reference**: контраст с их скрытой телеметрией (противоречие 1) — аргумент за то, чтобы disclosure расширения оставался строже отраслевой нормы.

## Comparison (итоговая: инструменты сайта × воспроизводимость)

| Инструмент | Их реализация | В расширение? | Механизм |
|---|---|---|---|
| Раздельный роутинг (分流) | echo + trace, клиент | ✅ | уже наполовину есть (multi-source) + trace-источники |
| Cloudflare-паспорт | trace, клиент | ✅ | новые trace-источники в реестре |
| Доступность сервисов | trace + favicon | ✅ | fetch + тайминг; favicon для no-CORS сайтов |
| Статусы сервисов | серверная агрегация statuspage | ✅ | прямые statuspage v2 JSON (CORS ✅) |
| Whois | сервер | ✅ | RDAP напрямую (CORS ✅) |
| Замер скорости | speed.cloudflare.com | ⚠️ opt-in | CORS ✅, но до ~350 МБ за прогон |
| Trust Score / риск | сервер (ipapi.is+IPinfo) | ⚠️ замена | vpnapi.io + ipdata.co как opt-in источники |
| Turnstile / reCAPTCHA | их сайт-ключ + сервер | ❌ | секрет не должен жить в клиенте |
| Глобальный ping (20 узлов) | их серверы | ❌ | нужна своя инфраструктура |
| Portscan | их сервер | ❌ | из браузера невозможен |
| Своя DNS-leak инфра | их домен+DNS | ❌ (не нужно) | bash.ws уже покрывает |

**Анализ сравнения**: таблица разбивается на три чётких класса. Девять из двенадцати инструментов воспроизводимы, причём семь — без единой новой внешней зависимости: всё упирается в уже существующий паттерн «источник в реестре». Это подтверждает главный вывод: сайт вдохновляет не технологиями, а **компоновкой** — батарея самостоятельных проверок с единым запуском. Риск-блок — единственный, где воспроизведение означает компромисс (сторонние API вместо их сервера), и именно здесь multi-source-модель расширения даёт преимущество перед сайтом: два независимых риск-источника с отображением разногласий честнее одного непрозрачного Trust Score. Удивительный результат: leak-тесты (визитная карточка класса сайтов) у них слабее, чем уже реализовано в расширении.

## Contradictions & Debates

- **Приватность-маркетинг против телеметрии**: страница заявляет «100%隐私友好，历史数据仅做浏览器本地存储», но `claude-page.js` содержит молчаливый POST обнаруженных IP на `/api/session` с комментарием «for sharing analysis». **Evidence weight**: первичный код важнее маркетинга; заявление покрывает только фичу истории. **Resolution**: противоречие реальное — сайт собирает сессионные IP; для расширения это эталон «как не делать» и аргумент за жёсткий disclosure. [Source](https://ip.net.coffee/claude/claude-page.js?v=20260916a)
- **«Ложных срабатываний почти нет» против 8.8.8.8**: их FAQ утверждает «仅开放高置信度信号，检测到基本不会误判», но их же `/api/iprisk/8.8.8.8` помечает Google Public DNS как `is_vpn: true`. **Evidence weight**: живой API-ответ — первичное наблюдение. **Resolution**: ложные срабатывания существуют даже у коммерческой агрегации; любой риск-вердикт в расширении подавать как advisory с указанием источника, при расхождении источников — показывать разногласие, а не усреднять. [Source](https://ip.net.coffee/api/iprisk/8.8.8.8)

## Uncertainties & Gaps

- ⚠️ **Лимиты и условия `/api/iprisk`**: API недокументирован; виден CDN-кеш 10 минут, но rate limit, ToS и стабильность неизвестны. Не использовать как зависимость.
- ⚠️ **Free-тариф vpnapi.io**: доки показывают `security{vpn,proxy,tor,relay}` в стандартном ответе, но явного «включено в free» нет — верифицировать бесплатным ключом на этапе реализации. [Source](https://vpnapi.io/api-documentation)
- ⚠️ **ip138.com**: редиректит 302 на запрос с extension-ориджином — поведение их JS-обхода не разбиралось (низкая ценность для проекта).
- ⚠️ **Полнота инвентаря**: `/whois/` и «IP-карточка» просмотрены поверхностно (низкая техническая сложность, RDAP уже проверен).

## Recommendations

### Primary Recommendation

Двухфазный подход, подтверждённый находками Q2-Q4. **Фаза 1 (без новых зависимостей)**: каталог проверок с параллельным запуском (UX-паттерн из Q5) + новые trace-источники в реестре (claude.ai, chatgpt.com, 1.1.1.1 — дают «IP, который видит конкретный сервис», colo, WARP, TLS) + связность (favicon/generate_204) + статусы сервисов (statuspage v2) + Whois (RDAP) + локальная история. **Фаза 2 (opt-in риск-источники)**: vpnapi.io + ipdata.co как независимые источники с согласием/разногласием (против ложных срабатываний из противоречия 2), ipapi.is keyless для обогащения ASN. Замер скорости — отдельной кнопкой с предупреждением о трафике.

### Alternative

Если хочется пощупать риск-скоринг до регистрации ключей: временный прототип на `ip.net.coffee/api/iprisk` (без ключа, CORS ✅) — строго как throwaway, с немедленной заменой на vpnapi/ipdata и с disclosure-меткой.

### Not Recommended

- **Turnstile/reCAPTCHA v3** — секрет в распространяемом клиенте публичен по определению ([Cloudflare docs](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)).
- **Глобальный ping и portscan** — требуют собственной серверной инфраструктуры, вне модели расширения.
- **proxycheck.io / IPQualityScore** — качественные, но без CORS; добавление `host_permissions` ради них ломает принятый в проекте принцип.
- **Своя DNS-leak инфраструктура** — bash.ws покрывает; их пример лишь подтверждает, что цена вопроса — отдельный домен и VPS.

## Methodology

- **Depth**: deep
- **Search rounds**: 4 раунда (web_search недоступен в сессии — использованы web_extract и прямые HTTP-пробы, что для первичного анализа сайта точнее поисковой выдачи)
- **Final confidence**: 88% (из research_checkpoint)
- **Sub-questions**: 6 определено, 6 отвечено
- **Multi-hop chains**: entity expansion (js-бандлы → API-эндпоинты → провайдеры данных ipapi.is/IPinfo); conceptual deepening (маркетинг «приватности» → код → реальная телеметрия); causal chain (CORS-правило проекта → живые пробы каждого эндпоинта → граница воспроизводимости)
- **Key challenges**: без web_search внешняя триангуляция ограничена официальными доками провайдеров; часть выводов опирается на живые API-ответы (Tier 1 по сути, но единичные наблюдения)

## Sources

| # | Title | URL | Date | Credibility |
|---|-------|-----|------|:-----------:|
| 1 | Claude AI IP 检测 (страница) | https://ip.net.coffee/claude/ | 2026-11-06 | ⭐ Tier 1 |
| 2 | claude-page.js (первичный код) | https://ip.net.coffee/claude/claude-page.js?v=20260916a | 2026-11-06 | ⭐ Tier 1 |
| 3 | /api/iprisk/{1.1.1.1, 8.8.8.8} (живые ответы) | https://ip.net.coffee/api/iprisk/1.1.1.1 | 2026-11-06 | ⭐ Tier 1 |
| 4 | /api/geoip/1.1.1.1 (живой ответ) | https://ip.net.coffee/api/geoip/1.1.1.1 | 2026-11-06 | ⭐ Tier 1 |
| 5 | Cloudflare 节点检测 (страница + FAQ) | https://ip.net.coffee/cloudflare/ | 2026-11-06 | ⭐ Tier 1 |
| 6 | cloudflare-page.js | https://ip.net.coffee/cloudflare/cloudflare-page.js?v20260916d | 2026-11-06 | ⭐ Tier 1 |
| 7 | link-page.js (favicon-связность) | https://ip.net.coffee/link/link-page.js?v=20261106f | 2026-11-06 | ⭐ Tier 1 |
| 8 | ping-page.js (серверный ping) | https://ip.net.coffee/ping/ping-page.js?v=20260910a | 2026-11-06 | ⭐ Tier 1 |
| 9 | DNS 泄露检测 (страница, inline JS) | https://ip.net.coffee/dns/ | 2026-11-06 | ⭐ Tier 1 |
| 10 | WebRTC 泄露检测 (страница) | https://ip.net.coffee/webrtc/ | 2026-11-06 | ⭐ Tier 1 |
| 11 | /status/ + /status/data.json | https://ip.net.coffee/status/ | 2026-11-06 | ⭐ Tier 1 |
| 12 | sitemap-main.xml | https://ip.net.coffee/sitemap-main.xml | 2026-11-06 | ⭐ Tier 1 |
| 13 | claude.ai cdn-cgi/trace (живой ответ) | https://claude.ai/cdn-cgi/trace | 2026-11-06 | ⭐ Tier 1 |
| 14 | chatgpt.com cdn-cgi/trace (живой ответ) | https://chatgpt.com/cdn-cgi/trace | 2026-11-06 | ⭐ Tier 1 |
| 15 | speed.cloudflare.com (CORS-проба) | https://speed.cloudflare.com/__down?bytes=1000 | 2026-11-06 | ⭐ Tier 1 |
| 16 | status.openai.com statuspage v2 | https://status.openai.com/api/v2/status.json | 2026-11-06 | ⭐ Tier 1 |
| 17 | status.claude.com (редирект anthropic) | https://status.claude.com/api/v2/status.json | 2026-11-06 | ⭐ Tier 1 |
| 18 | rdap.org (CORS-проба) | https://rdap.org/ip/1.1.1.1 | 2026-11-06 | ⭐ Tier 1 |
| 19 | Cloudflare Turnstile docs — server-side validation | https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ | 2026-10-22 | ⭐ Tier 1 |
| 20 | Google reCAPTCHA v3 docs | https://developers.google.com/recaptcha/docs/v3 | 2026-11-06 | ⭐ Tier 1 |
| 21 | vpnapi.io pricing (free 1000/day) | https://vpnapi.io/pricing | 2026-11-06 | ⭐ Tier 1 |
| 22 | vpnapi.io API documentation | https://vpnapi.io/api-documentation | 2026-11-06 | ⭐ Tier 1 |
| 23 | vpnapi.io privacy policy (US processing) | https://vpnapi.io/privacy-policy | 2026-11-06 | ⭐ Tier 1 |
| 24 | ipdata.co pricing FAQ (EU endpoint, OSINT vs commercial) | https://ipdata.co/pricing.html | 2026-11-06 | ⭐ Tier 1 |
| 25 | ipdata.co docs (available data: Threat Intelligence) | https://docs.ipdata.co/ | 2026-11-06 | ⭐ Tier 1 |
| 26 | ipapi.is free-tier (флаги убраны из keyless) | https://ipapi.is/free-tier.html | 2026-11-06 | ⭐ Tier 1 |
| 27 | ipapi.is API (CORS-проба, keyless) | https://api.ipapi.is/?q=1.1.1.1 | 2026-11-06 | ⭐ Tier 1 |
| 28 | vpnapi.io API (CORS-проба) | https://vpnapi.io/api/1.1.1.1?key=dummy | 2026-11-06 | ⭐ Tier 1 |
| 29 | ipdata.co API (CORS-проба) | https://api.ipdata.co/1.1.1.1?api-key=dummy | 2026-11-06 | ⭐ Tier 1 |
| 30 | proxycheck.io (CORS-проба — нет ACAO) | https://proxycheck.io/v2/1.1.1.1?vpn=3 | 2026-11-06 | ⭐ Tier 1 |
| 31 | my.ip.cn (CORS-проба) | https://my.ip.cn/ | 2026-11-06 | ⭐ Tier 1 |
