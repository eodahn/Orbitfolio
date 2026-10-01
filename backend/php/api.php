<?php
declare(strict_types=1);
require_once __DIR__ . "/github.php";
function createProject(array $in): array
{
    $id = authenticated();
    $meta = [];
    $import = $in["importId"] ?? null;
    if ($import) {
        $row = one(
            "SELECT metadata FROM orbit_import WHERE id=? AND user_id=? AND expires_at>?",
            [$import, $id, time()],
        );
        if (!$row) {
            fail(422, "Importação expirada. Leia o repositório novamente.");
        }
        $meta = json_decode($row["metadata"], true, 32, JSON_THROW_ON_ERROR);
        if (!empty($meta["github"]["integrationEnabled"])) {
            $a = githubAuthorize($meta);
            $meta["github"]["private"] = (bool) $a["repo"]["private"];
        }
    } elseif (
        !empty($in["github"]) ||
        !empty($in["githubIntegrationEnabled"]) ||
        !empty($in["github_integration_enabled"])
    ) {
        fail(422, "Importe o repositório para vincular uma integração.");
    }
    $name = trim((string) ($in["name"] ?? ($meta["name"] ?? "")));
    $desc = trim((string) ($in["description"] ?? ($meta["description"] ?? "")));
    if (
        mb_strlen($name) < 2 ||
        mb_strlen($name) > 100 ||
        mb_strlen($desc) > 500
    ) {
        fail(422, "Confira nome (2–100 caracteres) e descrição (até 500).");
    }
    $github = $meta["githubUrl"] ?? trim((string) ($in["githubUrl"] ?? ""));
    $external = httpUrl($in["demoUrl"] ?? "");
    if ($github) {
        $github = "https://github.com/" . repoName($github);
    }
    if (!$github && !$external && !empty($in["repositoryUrl"])) {
        $url = httpUrl($in["repositoryUrl"]);
        try {
            $github = "https://github.com/" . repoName($url);
        } catch (ApiError) {
            $external = $url;
        }
    }
    if (!$github && !$external) {
        fail(
            422,
            "Adicione um link do GitHub ou um link externo para criar o projeto.",
        );
    }
    $meta["githubUrl"] = $github;
    $meta["demoUrl"] = $external;
    $meta["languages"] = languages(
        $in["languages"] ?? ($meta["languages"] ?? []),
    );
    $size = $meta["sizeBytes"] ?? ($in["sizeBytes"] ?? 0);
    if (
        !is_numeric($size) ||
        $size < 0 ||
        floor((float) $size) != (float) $size ||
        $size > 9007199254740991
    ) {
        fail(422, "Tamanho inválido.");
    }
    $meta["sizeBytes"] = (float) $size;
    return lockWrite(function () use ($id, $import, $meta, $name, $desc) {
        if (
            $import &&
            !one(
                "SELECT 1 FROM orbit_import WHERE id=? AND user_id=? AND expires_at>? FOR UPDATE",
                [$import, $id, time()],
            )
        ) {
            fail(422, "Importação expirada. Leia o repositório novamente.");
        }
        $portfolio = one(
            "SELECT id_portfolio FROM portfolio WHERE id_user=? ORDER BY id_portfolio LIMIT 1",
            [$id],
        );
        if (!$portfolio) {
            query(
                "INSERT INTO portfolio(id_user,nome,data_criacao) VALUES(?,?,CURRENT_DATE)",
                [$id, "Meu portfólio"],
            );
            $portfolio = ["id_portfolio" => database()->lastInsertId()];
        }
        $meta["orbit"] = newOrbit($meta["sizeBytes"]);
        query(
            "INSERT INTO projeto(id_portfolio,nome,descricao,github_repo,data_criacao_projeto) VALUES(?,?,?,?,CURRENT_DATE)",
            [
                $portfolio["id_portfolio"],
                $name,
                $desc,
                $meta["githubUrl"] ?: null,
            ],
        );
        $pid = database()->lastInsertId();
        query("INSERT INTO orbit_project(project_id,metadata) VALUES(?,?)", [
            $pid,
            json_encode($meta, JSON_THROW_ON_ERROR),
        ]);
        if ($import) {
            query("DELETE FROM orbit_import WHERE id=?", [$import]);
        }
        return projectView(projectRow($pid));
    });
}
function normalized(string $value): string
{
    $value = mb_strtolower(trim($value));
    $value = strtr($value, [
        "á" => "a",
        "à" => "a",
        "ã" => "a",
        "â" => "a",
        "ä" => "a",
        "é" => "e",
        "è" => "e",
        "ê" => "e",
        "ë" => "e",
        "í" => "i",
        "ì" => "i",
        "î" => "i",
        "ï" => "i",
        "ó" => "o",
        "ò" => "o",
        "õ" => "o",
        "ô" => "o",
        "ö" => "o",
        "ú" => "u",
        "ù" => "u",
        "û" => "u",
        "ü" => "u",
        "ç" => "c",
    ]);
    return preg_replace("/\s+/u", " ", $value);
}
function rankSearch(
    array $items,
    string $q,
    callable $names,
    callable $details,
): array {
    $ranked = [];
    foreach ($items as $i => $item) {
        $fields = array_map("normalized", $names($item));
        $all = implode(" ", $fields) . " " . normalized($details($item));
        $score = 4;
        foreach ($fields as $f) {
            if ($f === $q) {
                $score = 0;
            } elseif (str_starts_with($f, $q)) {
                $score = min($score, 1);
            } elseif (str_contains($f, $q)) {
                $score = min($score, 2);
            }
        }
        if ($score === 4) {
            $match = true;
            foreach (explode(" ", $q) as $word) {
                if (!str_contains($all, $word)) {
                    $match = false;
                }
            }
            if ($match) {
                $score = 3;
            }
        }
        if ($score < 4) {
            $ranked[] = [$score, $i, $item];
        }
    }
    usort(
        $ranked,
        fn($a, $b) => $a[0] <=> $b[0] ?: strcmp($a[2]["name"], $b[2]["name"]),
    );
    return array_map(fn($r) => $r[2], array_slice($ranked, 0, 50));
}
function api(string $path, string $method): never
{
    $page = max(1, min(100, (int) ($_GET["page"] ?? 1)));
    if ($path === "/api/health" && $method === "GET") {
        query("SELECT 1");
        reply(["ok" => true, "backend" => "back1-php-mysql"]);
    }
    if ($path === "/api/auth/session" && $method === "GET") {
        reply([
            "user" => uid()
                ? userView(
                    one("SELECT * FROM usuario WHERE id_user=?", [uid()]),
                )
                : null,
        ]);
    }
    if (
        in_array($path, ["/api/auth/login", "/api/auth/register"], true) &&
        $method === "POST"
    ) {
        $in = input();
        $email = mb_strtolower(trim((string) ($in["email"] ?? "")));
        $password = (string) ($in["password"] ?? "");
        if (strlen($password) > 1024) {
            fail(422, "Senha muito longa.");
        }
        if ($path === "/api/auth/register") {
            $name = trim((string) ($in["name"] ?? ""));
            if (
                mb_strlen($name) < 2 ||
                mb_strlen($name) > 80 ||
                !filter_var($email, FILTER_VALIDATE_EMAIL) ||
                strlen($email) > 254 ||
                strlen($password) < 8
            ) {
                fail(
                    422,
                    "Confira nome, e-mail e senha (mínimo 8 caracteres).",
                );
            }
            $id = lockWrite(function () use ($name, $email, $password) {
                if (one("SELECT 1 FROM usuario WHERE email=?", [$email])) {
                    fail(409, "Este e-mail já possui uma conta.");
                }
                query(
                    "INSERT INTO usuario(nome,email,senha,descricao) VALUES(?,?,?,?)",
                    [
                        $name,
                        $email,
                        password_hash($password, PASSWORD_DEFAULT),
                        "Explorador(a) da comunidade Orbitfolio.",
                    ],
                );
                $id = database()->lastInsertId();
                query("UPDATE usuario SET username=? WHERE id_user=?", [
                    "viajante-" . $id,
                    $id,
                ]);
                return $id;
            });
        } else {
            $u = one("SELECT * FROM usuario WHERE email=?", [$email]);
            if (!$u || !password_verify($password, $u["senha"])) {
                fail(401, "E-mail ou senha inválidos.");
            }
            $id = (string) $u["id_user"];
            if (password_needs_rehash($u["senha"], PASSWORD_DEFAULT)) {
                query("UPDATE usuario SET senha=? WHERE id_user=?", [
                    password_hash($password, PASSWORD_DEFAULT),
                    $id,
                ]);
            }
        }
        session_regenerate_id(true);
        $_SESSION = ["user_id" => $id];
        reply(
            [
                "user" => userView(
                    one("SELECT * FROM usuario WHERE id_user=?", [$id]),
                ),
            ],
            $path === "/api/auth/register" ? 201 : 200,
        );
    }
    if ($path === "/api/auth/logout" && $method === "POST") {
        $_SESSION = [];
        session_destroy();
        setcookie(session_name(), "", [
            "expires" => 1,
            "path" => "/",
            "httponly" => true,
            "secure" => str_starts_with(githubConfig()["origin"], "https://"),
            "samesite" => "Lax",
        ]);
        reply([], 204);
    }
    if ($path === "/api/github/status" && $method === "GET") {
        $id = authenticated();
        $c = githubConfig();
        $r = one(
            "SELECT login,encrypted_token FROM orbit_github WHERE user_id=?",
            [$id],
        );
        $connected = false;
        if ($c["available"] && $r) {
            try {
                decryptCredential($r["encrypted_token"], $id);
                $connected = true;
            } catch (ApiError) {
            }
        }
        reply([
            "available" => (bool) $c["available"],
            "connected" => $connected,
            "login" => $connected ? $r["login"] : null,
        ]);
    }
    if ($path === "/api/github/connect" && $method === "POST") {
        reply(githubConnect());
    }
    if ($path === "/api/github/callback" && $method === "GET") {
        $result = "connected";
        try {
            githubCallback($_GET);
        } catch (Throwable) {
            $result = "error";
        }
        header("Cache-Control: no-store");
        header("Referrer-Policy: no-referrer");
        header("Location: /projects/new?github=" . $result, true, 303);
        exit();
    }
    if ($path === "/api/github/disconnect" && $method === "DELETE") {
        $id = authenticated();
        query("DELETE FROM orbit_github WHERE user_id=?", [$id]);
        query(
            "UPDATE usuario SET github_token=NULL,github_login=NULL WHERE id_user=?",
            [$id],
        );
        query("DELETE FROM orbit_import WHERE user_id=?", [$id]);
        unset($_SESSION["github_oauth"]);
        reply([], 204);
    }
    if ($path === "/api/github/repositories" && $method === "GET") {
        $r = githubRequest(
            "/user/repos?per_page=30&page=" .
                $page .
                "&sort=updated&affiliation=owner,collaborator,organization_member",
            githubToken(),
        );
        reply([
            "repositories" => array_map(
                fn($p) => [
                    "id" => $p["id"],
                    "name" => $p["name"],
                    "fullName" => $p["full_name"],
                    "private" => $p["private"],
                ],
                $r["data"],
            ),
            "hasNext" => $r["hasNext"],
        ]);
    }
    if ($path === "/api/github/repository/inspect" && $method === "POST") {
        reply(githubInspect(input()));
    }
    if ($path === "/api/projects" && $method === "POST") {
        reply(["project" => createProject(input())], 201);
    }
    if ($path === "/api/projects/mine" && $method === "GET") {
        reply(["projects" => projectList(authenticated())]);
    }
    if ($path === "/api/projects" && $method === "GET") {
        $list = projectList();
        $q = normalized((string) ($_GET["q"] ?? ""));
        if ($q) {
            $list = rankSearch(
                $list,
                $q,
                fn($p) => [$p["name"]],
                fn($p) => $p["description"],
            );
        }
        reply(["projects" => $list]);
    }
    if (
        preg_match(
            '~^/api/projects/([^/]+)(?:/(like|favorite|commits))?$~',
            $path,
            $m,
        )
    ) {
        $p = projectRow($m[1]);
        $meta = projectMeta($p);
        $action = $m[2] ?? "";
        if (
            !empty($meta["github"]["private"]) &&
            (string) $p["owner_id"] !== uid()
        ) {
            githubAuthorize($meta);
        }
        if ($action === "" && $method === "GET") {
            reply(["project" => projectView($p, true)]);
        }
        if ($action === "" && $method === "DELETE") {
            $id = authenticated();
            if ((string) $p["owner_id"] !== $id) {
                fail(403, "Somente o proprietário pode excluir este projeto.");
            }
            lockWrite(function () use ($p) {
                foreach (
                    ["favorito", "curtida", "comentario", "projeto_entidade"]
                    as $table
                ) {
                    query("DELETE FROM $table WHERE id_projeto=?", [
                        $p["id_projeto"],
                    ]);
                }
                query("DELETE FROM projeto WHERE id_projeto=?", [
                    $p["id_projeto"],
                ]);
            });
            reply([], 204);
        }
        if ($action === "commits" && $method === "GET") {
            reply(githubCommits($meta, $page));
        }
        if (
            in_array($action, ["like", "favorite"], true) &&
            in_array($method, ["POST", "DELETE"], true)
        ) {
            $id = authenticated();
            $table = $action === "like" ? "curtida" : "favorito";
            $pk = $action === "like" ? "id_curtida" : "id_fav";
            $date = $action === "like" ? "data_curtida" : "data_favorito";
            lockWrite(function () use ($id, $p, $method, $table, $pk, $date) {
                if ($method === "DELETE") {
                    query(
                        "DELETE FROM $table WHERE id_user=? AND id_projeto=?",
                        [$id, $p["id_projeto"]],
                    );
                } elseif (
                    !one(
                        "SELECT 1 FROM $table WHERE id_user=? AND id_projeto=?",
                        [$id, $p["id_projeto"]],
                    )
                ) {
                    $next = (int) one(
                        "SELECT COALESCE(MAX($pk),0)+1 n FROM $table",
                    )["n"];
                    query(
                        "INSERT INTO $table($pk,id_user,id_projeto,$date) VALUES(?,?,?,CURRENT_DATE)",
                        [$next, $id, $p["id_projeto"]],
                    );
                }
            });
            reply(["project" => projectView($p, true)]);
        }
        fail(405, "Método não permitido.");
    }
    if ($path === "/api/account/privacy" && $method === "PATCH") {
        $id = authenticated();
        $in = input();
        foreach ($in as $k => $v) {
            if (
                !in_array($k, CATEGORIES, true) ||
                !in_array($v, ["public", "private"], true)
            ) {
                fail(422, "Configuração de privacidade inválida.");
            }
        }
        lockWrite(function () use ($in, $id) {
            foreach ($in as $k => $v) {
                query(
                    "INSERT INTO orbit_privacy(user_id,category,visibility) VALUES(?,?,?) ON DUPLICATE KEY UPDATE visibility=VALUES(visibility)",
                    [$id, $k, $v],
                );
            }
        });
        reply(["privacy" => privacy($id)]);
    }
    if ($path === "/api/account/profile" && $method === "PATCH") {
        $id = authenticated();
        $in = input();
        $name = trim((string) ($in["name"] ?? ""));
        $username = mb_strtolower(trim((string) ($in["username"] ?? "")));
        $bio = trim((string) ($in["bio"] ?? ""));
        $avatar = httpUrl($in["avatarUrl"] ?? "");
        if (
            mb_strlen($name) < 2 ||
            mb_strlen($name) > 80 ||
            !preg_match('/^[a-z0-9_-]{3,64}$/', $username) ||
            mb_strlen($bio) > 500
        ) {
            fail(422, "Confira nome, username e bio.");
        }
        lockWrite(function () use ($name, $username, $bio, $avatar, $id) {
            if (
                one("SELECT 1 FROM usuario WHERE username=? AND id_user<>?", [
                    $username,
                    $id,
                ])
            ) {
                fail(409, "Username já utilizado.");
            }
            query(
                "UPDATE usuario SET nome=?,username=?,descricao=?,avatar_url=? WHERE id_user=?",
                [$name, $username, $bio, $avatar, $id],
            );
        });
        reply([
            "user" => userView(
                one("SELECT * FROM usuario WHERE id_user=?", [$id]),
            ),
        ]);
    }
    if (
        preg_match(
            '~^/api/users/([^/]+)(?:/(projects|followers|following|friends|likes|favorites|follow|avatar))?$~',
            $path,
            $m,
        )
    ) {
        $id = $m[1];
        $u = one("SELECT * FROM usuario WHERE id_user=?", [$id]);
        if (!$u) {
            fail(404, "Usuário não encontrado.");
        }
        $category = $m[2] ?? "";
        if (
            $category === "follow" &&
            in_array($method, ["POST", "DELETE"], true)
        ) {
            $viewer = authenticated();
            if ($viewer === $id) {
                fail(422, "Você não pode seguir a própria conta.");
            }
            if ($method === "POST") {
                query(
                    "INSERT IGNORE INTO orbit_follow(follower_id,followed_id) VALUES(?,?)",
                    [$viewer, $id],
                );
            } else {
                query(
                    "DELETE FROM orbit_follow WHERE follower_id=? AND followed_id=?",
                    [$viewer, $id],
                );
            }
            reply(["following" => $method === "POST"]);
        }
        if ($method !== "GET") {
            fail(405, "Método não permitido.");
        }
        if (!$category) {
            reply(["user" => userView($u)]);
        }
        if ($category === "avatar") {
            $data = $u["pfp"];
            $mime = $data ? new finfo(FILEINFO_MIME_TYPE)->buffer($data) : "";
            if (
                !in_array(
                    $mime,
                    ["image/jpeg", "image/png", "image/webp", "image/gif"],
                    true,
                )
            ) {
                fail(404, "Foto não encontrada.");
            }
            header("Content-Type: " . $mime);
            header("X-Content-Type-Options: nosniff");
            echo $data;
            exit();
        }
        if ($category === "projects") {
            reply(["projects" => projectList($id)]);
        }
        if (!in_array($category, CATEGORIES, true)) {
            fail(404, "Seção não encontrada.");
        }
        if ($id !== uid() && privacy($id)[$category] !== "public") {
            fail(403, "Esta seção é privada.");
        }
        if (in_array($category, ["followers", "following", "friends"], true)) {
            reply([
                "users" => array_map(
                    fn($target) => userView(
                        one("SELECT * FROM usuario WHERE id_user=?", [$target]),
                    ),
                    relationIds($id, $category),
                ),
            ]);
        }
        $table = $category === "likes" ? "curtida" : "favorito";
        $ids = array_column(
            rows("SELECT DISTINCT id_projeto FROM $table WHERE id_user=?", [
                $id,
            ]),
            "id_projeto",
        );
        reply([
            "projects" => array_values(
                array_filter(projectList(), fn($p) => in_array($p["id"], $ids)),
            ),
        ]);
    }
    if ($path === "/api/users" && $method === "GET") {
        $users = array_map(
            "userView",
            rows("SELECT * FROM usuario ORDER BY nome"),
        );
        $q = normalized((string) ($_GET["q"] ?? ""));
        if ($q) {
            $users = rankSearch(
                $users,
                $q,
                fn($u) => [$u["name"], $u["username"]],
                fn($u) => $u["bio"],
            );
        }
        reply(["users" => $users]);
    }
    if ($path === "/api/search" && $method === "GET") {
        $q = normalized((string) ($_GET["q"] ?? ""));
        if (mb_strlen($q) > 120) {
            fail(422, "Pesquise com até 120 caracteres.");
        }
        if (!$q) {
            reply(["users" => [], "projects" => []]);
        }
        reply([
            "users" => rankSearch(
                array_map(
                    "userView",
                    rows("SELECT * FROM usuario ORDER BY nome"),
                ),
                $q,
                fn($u) => [$u["name"], $u["username"]],
                fn($u) => "",
            ),
            "projects" => rankSearch(
                projectList(),
                $q,
                fn($p) => [$p["name"]],
                fn($p) => $p["description"] .
                    " " .
                    implode(" ", array_keys((array) $p["languages"])),
            ),
        ]);
    }
    if ($path === "/api/favorites" && $method === "GET") {
        $ids = uid()
            ? array_column(
                rows(
                    "SELECT DISTINCT id_projeto FROM favorito WHERE id_user=?",
                    [uid()],
                ),
                "id_projeto",
            )
            : [];
        reply([
            "projects" => array_values(
                array_filter(projectList(), fn($p) => in_array($p["id"], $ids)),
            ),
        ]);
    }
    if ($path === "/api/progress" && $method === "GET") {
        $id = authenticated();
        reply([
            "projects" => array_values(
                array_filter(
                    projectList($id),
                    fn($p) => !empty($p["github"]["integrationEnabled"]),
                ),
            ),
            "favorites" => (int) one(
                "SELECT COUNT(DISTINCT id_projeto) n FROM favorito WHERE id_user=?",
                [$id],
            )["n"],
            "following" => count(relationIds($id, "following")),
        ]);
    }
    if ($path === "/api/rankings/featured" && $method === "GET") {
        $period = $_GET["period"] ?? "week";
        if (!in_array($period, ["week", "month", "all"], true)) {
            fail(422, "Período inválido.");
        }
        $list = projectList();
        $days = $period === "week" ? 7 : 30;
        $likes = [];
        foreach (
            rows(
                "SELECT id_projeto,COUNT(DISTINCT id_user) n FROM curtida" .
                    ($period === "all"
                        ? ""
                        : " WHERE data_curtida>=DATE_SUB(CURRENT_DATE,INTERVAL " .
                            $days .
                            " DAY)") .
                    " GROUP BY id_projeto",
            )
            as $r
        ) {
            $likes[(string) $r["id_projeto"]] = (int) $r["n"];
        }
        usort(
            $list,
            fn($a, $b) => ($likes[$b["id"]] ?? 0) <=> ($likes[$a["id"]] ?? 0),
        );
        reply(["projects" => array_slice($list, 0, 12)]);
    }
    fail(404, "Endpoint não encontrado.");
}
