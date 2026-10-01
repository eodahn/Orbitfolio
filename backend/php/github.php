<?php
declare(strict_types=1);
require_once __DIR__ . "/core.php";
// OAuth behavior from back1/pages/github_{connect,callback}.php, adapted to JSON,
// session-bound PKCE, encrypted credentials, bounded requests and explicit errors.
function githubConfig(): array
{
    $origin = rtrim(getenv("APP_ORIGIN") ?: "", "/");
    $u = parse_url($origin);
    $valid =
        $u &&
        isset($u["host"]) &&
        !isset($u["user"]) &&
        !isset($u["query"]) &&
        empty($u["path"]) &&
        (($u["scheme"] ?? "") === "https" ||
            (($u["scheme"] ?? "") === "http" &&
                in_array($u["host"], ["localhost", "127.0.0.1"], true)));
    $key = getenv("GITHUB_TOKEN_ENCRYPTION_KEY") ?: "";
    return [
        "available" =>
            $valid &&
            (bool) getenv("GITHUB_CLIENT_ID") &&
            (bool) getenv("GITHUB_CLIENT_SECRET") &&
            (bool) preg_match('/^[a-f0-9]{64}$/i', $key),
        "origin" => $origin,
        "key" => $key,
        "client" => getenv("GITHUB_CLIENT_ID") ?: "",
        "secret" => getenv("GITHUB_CLIENT_SECRET") ?: "",
    ];
}
function b64(string $v): string
{
    return rtrim(strtr(base64_encode($v), "+/", "-_"), "=");
}
function encryptCredential(string $token, string $id): string
{
    $c = githubConfig();
    if (!$c["available"]) {
        fail(503, "Integração GitHub indisponível. Configure o servidor.");
    }
    $iv = random_bytes(12);
    $encrypted = openssl_encrypt(
        $token,
        "aes-256-gcm",
        hex2bin($c["key"]),
        OPENSSL_RAW_DATA,
        $iv,
        $tag,
        $id,
    );
    if ($encrypted === false) {
        fail(500, "Falha ao proteger credencial.");
    }
    return implode(".", array_map("b64", [$iv, $tag, $encrypted]));
}
function decryptCredential(string $value, string $id): string
{
    try {
        $parts = array_map(
            fn($v) => base64_decode(strtr($v, "-_", "+/"), true),
            explode(".", $value),
        );
        if (count($parts) !== 3) {
            throw new RuntimeException();
        }
        [$iv, $tag, $encrypted] = $parts;
        $key = githubConfig()["key"];
        if (strlen($key) !== 64 || strlen($iv) !== 12 || strlen($tag) !== 16) {
            throw new RuntimeException();
        }
        $result = openssl_decrypt(
            $encrypted,
            "aes-256-gcm",
            hex2bin($key),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            $id,
        );
        if (!$result) {
            throw new RuntimeException();
        }
        return $result;
    } catch (Throwable) {
        fail(401, "Reconecte sua conta GitHub.");
    }
}
function githubToken(): string
{
    $id = authenticated();
    if (!githubConfig()["available"]) {
        fail(503, "Integração GitHub indisponível. Configure o servidor.");
    }
    $r = one("SELECT encrypted_token FROM orbit_github WHERE user_id=?", [$id]);
    if (!$r) {
        fail(401, "Conecte sua conta GitHub para continuar.");
    }
    return decryptCredential($r["encrypted_token"], $id);
}
function githubHttp(
    string $url,
    ?string $token = null,
    ?array $post = null,
): array {
    // Test transport is dependency injection in CLI tests only, never enabled by HTTP input/env.
    if (PHP_SAPI === "cli" && isset($GLOBALS["github_test_transport"])) {
        return $GLOBALS["github_test_transport"]($url, $token, $post);
    }
    $headers = [];
    $body = "";
    $ch = curl_init($url);
    $requestHeaders = [
        "Accept: application/json",
        "User-Agent: Orbitfolio",
        "X-GitHub-Api-Version: 2022-11-28",
    ];
    if ($token) {
        $requestHeaders[] = "Authorization: Bearer " . $token;
    }
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => $requestHeaders,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$headers) {
            $pair = explode(":", $line, 2);
            if (count($pair) === 2) {
                $headers[strtolower(trim($pair[0]))] = trim($pair[1]);
            }
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body) {
            if (strlen($body) + strlen($chunk) > 4194304) {
                return 0;
            }
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    if ($post !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post));
    }
    if (curl_exec($ch) === false) {
        curl_close($ch);
        fail(503, "GitHub indisponível ou conexão perdida. Tente novamente.");
    }
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [
        "status" => $status,
        "headers" => $headers,
        "data" => json_decode($body, true),
    ];
}
function githubRequest(string $path, ?string $token = null): array
{
    if (!str_starts_with($path, "/") || str_starts_with($path, "//")) {
        fail(422, "Caminho GitHub inválido.");
    }
    $url = "https://api.github.com" . $path;
    for ($i = 0; $i < 4; $i++) {
        $r = githubHttp($url, $token);
        if (!in_array($r["status"], [301, 302, 307, 308], true)) {
            break;
        }
        $next = $r["headers"]["location"] ?? "";
        if (str_starts_with($next, "/") && !str_starts_with($next, "//")) {
            $next = "https://api.github.com" . $next;
        }
        $u = parse_url($next);
        if (
            $i === 3 ||
            !$u ||
            ($u["scheme"] ?? "") !== "https" ||
            ($u["host"] ?? "") !== "api.github.com" ||
            isset($u["port"]) ||
            isset($u["user"]) ||
            isset($u["pass"])
        ) {
            fail(502, "Redirecionamento GitHub inválido.");
        }
        $url = $next;
    }
    $status = $r["status"];
    $headers = $r["headers"];
    if (
        $status === 429 ||
        ($status === 403 &&
            (($headers["x-ratelimit-remaining"] ?? "") === "0" ||
                isset($headers["retry-after"]) ||
                preg_match(
                    "/rate limit|abuse detection/i",
                    $r["data"]["message"] ?? "",
                )))
    ) {
        fail(
            429,
            "Limite de consultas ao GitHub atingido. Aguarde e tente novamente.",
        );
    }
    if ($status === 401) {
        fail(401, "Integração GitHub expirada. Reconecte sua conta.");
    }
    if ($status === 404) {
        fail(
            404,
            "Repositório não encontrado ou não autorizado. Confira o endereço e as permissões da conta GitHub conectada.",
        );
    }
    if ($status === 403) {
        fail(
            403,
            isset($headers["x-github-sso"])
                ? "Autorize o acesso SSO da organização no GitHub."
                : "O GitHub negou acesso. Verifique as permissões OAuth da organização ou reconecte sua conta.",
        );
    }
    if ($status === 409) {
        return ["data" => [], "hasNext" => false];
    }
    if ($status < 200 || $status >= 300 || !is_array($r["data"])) {
        fail(502, "Resposta inválida do GitHub.");
    }
    return [
        "data" => $r["data"],
        "hasNext" => str_contains($headers["link"] ?? "", 'rel="next"'),
    ];
}
function githubConnect(): array
{
    $id = authenticated();
    $c = githubConfig();
    if (!$c["available"]) {
        fail(503, "Integração GitHub indisponível. Configure o servidor.");
    }
    $state = b64(random_bytes(32));
    $verifier = b64(random_bytes(32));
    $_SESSION["github_oauth"] = [
        "state" => hash("sha256", $state),
        "user" => $id,
        "expires" => time() + 600,
        "verifier" => $verifier,
    ];
    return [
        "url" =>
            "https://github.com/login/oauth/authorize?" .
            http_build_query([
                "client_id" => $c["client"],
                "redirect_uri" => $c["origin"] . "/api/github/callback",
                "scope" => "repo read:user",
                "state" => $state,
                "code_challenge" => b64(hash("sha256", $verifier, true)),
                "code_challenge_method" => "S256",
            ]),
    ];
}
function githubCallback(array $params): void
{
    $id = authenticated();
    $s = $_SESSION["github_oauth"] ?? null;
    unset($_SESSION["github_oauth"]);
    if (
        !$s ||
        $s["user"] !== $id ||
        $s["expires"] < time() ||
        !hash_equals(
            $s["state"],
            hash("sha256", (string) ($params["state"] ?? "")),
        )
    ) {
        fail(403, "Autorização inválida ou expirada.");
    }
    if (empty($params["code"]) || isset($params["error"])) {
        fail(403, "Autorização GitHub cancelada.");
    }
    $c = githubConfig();
    if (!$c["available"]) {
        fail(503, "Integração GitHub indisponível.");
    }
    $r = githubHttp("https://github.com/login/oauth/access_token", null, [
        "client_id" => $c["client"],
        "client_secret" => $c["secret"],
        "code" => $params["code"],
        "redirect_uri" => $c["origin"] . "/api/github/callback",
        "code_verifier" => $s["verifier"],
    ]);
    $token = $r["data"]["access_token"] ?? "";
    if ($r["status"] !== 200 || !is_string($token) || !$token) {
        fail(401, "Autorização GitHub expirada. Tente novamente.");
    }
    $identity = githubRequest("/user", $token)["data"];
    if (empty($identity["id"]) || empty($identity["login"])) {
        fail(502, "Identidade GitHub inválida.");
    }
    query(
        "INSERT INTO orbit_github(user_id,github_user_id,login,encrypted_token) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE github_user_id=VALUES(github_user_id),login=VALUES(login),encrypted_token=VALUES(encrypted_token)",
        [
            $id,
            $identity["id"],
            $identity["login"],
            encryptCredential($token, $id),
        ],
    );
    query(
        "UPDATE usuario SET github_login=?,github_token=NULL WHERE id_user=?",
        [$identity["login"], $id],
    );
}
function githubInspect(array $input): array
{
    $id = authenticated();
    if (!isset($input["integrated"]) || !is_bool($input["integrated"])) {
        fail(422, "Informe se a importação usa integração GitHub.");
    }
    $integrated = $input["integrated"];
    $full = repoName((string) ($input["url"] ?? ($input["fullName"] ?? "")));
    $token = $integrated ? githubToken() : null;
    $repo = githubRequest("/repos/" . $full, $token)["data"];
    if (!empty($repo["private"]) && !$integrated) {
        fail(403, "Este repositório exige integração autenticada.");
    }
    $canonical = repoName($repo["full_name"]);
    $bytes = githubRequest("/repos/" . $canonical . "/languages", $token)[
        "data"
    ];
    $bytes = array_filter($bytes, fn($v) => is_numeric($v) && $v > 0);
    $total = array_sum($bytes);
    $languages = [];
    foreach ($bytes as $name => $value) {
        $languages[$name] = ($value / $total) * 100;
    }
    $data = [
        "name" => $repo["name"],
        "description" => $repo["description"] ?? "",
        "repositoryUrl" => "https://github.com/" . $canonical,
        "githubUrl" => "https://github.com/" . $canonical,
        "languages" => (object) $languages,
        "languageBytes" => (object) $bytes,
        "sizeBytes" => max(0, $repo["size"] ?? 0) * 1024,
        "github" => [
            "id" => $repo["id"],
            "fullName" => $canonical,
            "defaultBranch" => $repo["default_branch"],
            "private" => (bool) $repo["private"],
            "integrationEnabled" => $integrated,
        ],
    ];
    $import = bin2hex(random_bytes(24));
    query("DELETE FROM orbit_import WHERE expires_at<?", [time()]);
    query(
        "INSERT INTO orbit_import(id,user_id,metadata,expires_at) VALUES(?,?,?,?)",
        [$import, $id, json_encode($data, JSON_THROW_ON_ERROR), time() + 1800],
    );
    return $data + ["importId" => $import];
}
function githubAuthorize(array $meta): array
{
    $token = githubToken();
    $full = repoName($meta["github"]["fullName"] ?? "");
    $repo = githubRequest("/repos/" . $full, $token)["data"];
    if ((string) $repo["id"] !== (string) ($meta["github"]["id"] ?? "")) {
        fail(403, "O vínculo do repositório mudou. Reimporte o projeto.");
    }
    return [
        "token" => $token,
        "repo" => $repo,
        "path" => "/repos/" . repoName($repo["full_name"]),
    ];
}
function githubCommits(array $meta, int $page): array
{
    if (empty($meta["github"]["integrationEnabled"])) {
        fail(409, "Este projeto não possui integração GitHub.");
    }
    $a = githubAuthorize($meta);
    $result = githubRequest(
        $a["path"] .
            "/commits?" .
            http_build_query([
                "sha" => $a["repo"]["default_branch"] ?? "HEAD",
                "per_page" => 30,
                "page" => $page,
            ]),
        $a["token"],
    );
    $tags = githubRequest($a["path"] . "/tags?per_page=100", $a["token"])[
        "data"
    ];
    $versions = [];
    foreach ($tags as $t) {
        $versions[$t["commit"]["sha"]] = $t["name"];
    }
    return [
        "commits" => array_map(
            fn($v) => [
                "sha" => $v["sha"],
                "shortSha" => substr($v["sha"], 0, 7),
                "message" => $v["commit"]["message"],
                "author" =>
                    $v["commit"]["author"]["name"] ??
                    ($v["author"]["login"] ?? "Autor desconhecido"),
                "avatarUrl" => $v["author"]["avatar_url"] ?? "",
                "committedAt" =>
                    $v["commit"]["author"]["date"] ??
                    $v["commit"]["committer"]["date"],
                "url" => $v["html_url"],
                "version" => $versions[$v["sha"]] ?? substr($v["sha"], 0, 7),
            ],
            $result["data"],
        ),
        "hasNext" => $result["hasNext"],
        "page" => $page,
    ];
}
