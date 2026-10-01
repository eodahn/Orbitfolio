<?php
declare(strict_types=1);
require_once __DIR__ . "/db.php";
class ApiError extends RuntimeException
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}
function fail(int $status, string $message): never
{
    throw new ApiError($status, $message);
}
function reply(mixed $value, int $status = 200): never
{
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    header("Cache-Control: no-store");
    header("Referrer-Policy: no-referrer");
    if ($status !== 204) {
        echo json_encode(
            $value,
            JSON_UNESCAPED_UNICODE |
                JSON_INVALID_UTF8_SUBSTITUTE |
                JSON_THROW_ON_ERROR,
        );
    }
    exit();
}
function input(): array
{
    if ((int) ($_SERVER["CONTENT_LENGTH"] ?? 0) > 1048576) {
        fail(413, "Dados muito grandes.");
    }
    $raw = file_get_contents("php://input", false, null, 0, 1048577);
    if (strlen($raw) > 1048576) {
        fail(413, "Dados muito grandes.");
    }
    try {
        $v = json_decode($raw ?: "{}", true, 32, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        fail(400, "JSON inválido.");
    }
    if (!is_array($v)) {
        fail(422, "Dados inválidos.");
    }
    return $v;
}
function uid(): ?string
{
    return isset($_SESSION["user_id"]) ? (string) $_SESSION["user_id"] : null;
}
function authenticated(): string
{
    $id = uid();
    if (!$id || !one("SELECT id_user FROM usuario WHERE id_user=?", [$id])) {
        fail(401, "Entre para continuar.");
    }
    return $id;
}
function httpUrl(mixed $v): string
{
    if (!is_string($v) && $v !== null) {
        fail(422, "Informe um link http(s) válido.");
    }
    $v = trim($v ?? "");
    if ($v === "") {
        return "";
    }
    $u = parse_url($v);
    if (
        !$u ||
        !in_array(strtolower($u["scheme"] ?? ""), ["http", "https"], true) ||
        empty($u["host"]) ||
        isset($u["user"]) ||
        isset($u["pass"]) ||
        strlen($v) > 2048 ||
        preg_match('/[\x00-\x20\x7f]/', $v)
    ) {
        fail(422, "Informe um link http(s) válido.");
    }
    return $v;
}
function repoName(string $v): string
{
    $v = trim($v);
    if (str_contains($v, "://")) {
        $v = httpUrl($v);
        $u = parse_url($v);
        if (strtolower($u["host"]) !== "github.com" || isset($u["port"])) {
            fail(422, "Informe o link principal de um repositório GitHub.");
        }
        $v = trim($u["path"] ?? "", "/");
    }
    $v = preg_replace('/\.git$/', "", $v);
    if (
        !preg_match('~^[a-zA-Z0-9-]+/[a-zA-Z0-9_.-]+$~', $v) ||
        in_array(explode("/", $v)[1], [".", ".."], true)
    ) {
        fail(422, "Informe owner/repositório ou o link do GitHub.");
    }
    return $v;
}
function languages(mixed $value): object
{
    if (is_object($value)) {
        $value = (array) $value;
    }
    if (!is_array($value) || count($value) > 24) {
        fail(422, "Linguagens inválidas.");
    }
    $out = [];
    $seen = [];
    $total = 0;
    $complete = count($value) > 0;
    foreach ($value as $raw => $percent) {
        $name = trim((string) $raw);
        $key = mb_strtolower($name);
        if (
            !$name ||
            mb_strlen($name) > 50 ||
            $key === "outra" ||
            isset($seen[$key])
        ) {
            fail(422, "Informe linguagens únicas com até 50 caracteres.");
        }
        $seen[$key] = true;
        if ($percent === null || $percent === "") {
            $p = null;
            $complete = false;
        } else {
            if (!is_numeric($percent)) {
                fail(422, "Porcentagem inválida.");
            }
            $p = (float) $percent;
            if (!is_finite($p) || $p < 0 || $p > 100) {
                fail(422, "Porcentagens devem estar entre 0 e 100.");
            }
            $total += $p;
        }
        $out[$name] = $p;
    }
    if ($total > 100.5 || ($complete && abs($total - 100) > 0.5)) {
        fail(
            422,
            "Quando todas as porcentagens forem preenchidas, a soma deve ser 100%.",
        );
    }
    return (object) $out;
}
const CATEGORIES = ["followers", "following", "friends", "likes", "favorites"];
function privacy(string $id): array
{
    $out = array_fill_keys(CATEGORIES, "public");
    foreach (
        rows("SELECT category,visibility FROM orbit_privacy WHERE user_id=?", [
            $id,
        ])
        as $r
    ) {
        $out[$r["category"]] = $r["visibility"];
    }
    return $out;
}
function follows(?string $a, string $b): bool
{
    return $a !== null &&
        (bool) one(
            "SELECT 1 FROM orbit_follow WHERE follower_id=? AND followed_id=?",
            [$a, $b],
        );
}
function relationIds(string $id, string $category): array
{
    $sql = match ($category) {
        "followers"
            => "SELECT follower_id id FROM orbit_follow WHERE followed_id=?",
        "following"
            => "SELECT followed_id id FROM orbit_follow WHERE follower_id=?",
        "friends"
            => "SELECT a.followed_id id FROM orbit_follow a JOIN orbit_follow b ON a.follower_id=b.followed_id AND a.followed_id=b.follower_id WHERE a.follower_id=?",
    };
    return array_map(fn($r) => (string) $r["id"], rows($sql, [$id]));
}
function userView(?array $u): ?array
{
    if (!$u) {
        return null;
    }
    $id = (string) $u["id_user"];
    $own = $id === uid();
    $privacy = privacy($id);
    $visible = array_map(fn($v) => $own || $v === "public", $privacy);
    $a = follows(uid(), $id);
    $b = uid() ? follows($id, uid()) : false;
    $count = 0;
    foreach (projectRows($id) as $p) {
        $meta = projectMeta($p);
        if ($own || empty($meta["github"]["private"])) {
            $count++;
        }
    }
    return [
        "id" => $id,
        "name" => $u["nome"],
        "username" => $u["username"] ?: "viajante-" . $id,
        "bio" => $u["descricao"] ?? "",
        "avatarUrl" =>
            $u["avatar_url"] ?:
            (!empty($u["pfp"])
                ? "/api/users/" . $id . "/avatar"
                : ""),
        "projects" => $count,
        "followers" => $visible["followers"]
            ? count(relationIds($id, "followers"))
            : null,
        "followingCount" => $visible["following"]
            ? count(relationIds($id, "following"))
            : null,
        "friends" => $visible["friends"]
            ? count(relationIds($id, "friends"))
            : null,
        "following" => $a,
        "followsViewer" => $b,
        "isFriend" => $a && $b,
        "visibility" => $visible,
    ] + ($own ? ["privacy" => $privacy] : []);
}
function projectRows(?string $owner = null): array
{
    return rows(
        "SELECT p.*,pf.id_user owner_id,m.metadata,m.created_at,m.updated_at FROM projeto p JOIN portfolio pf ON p.id_portfolio=pf.id_portfolio LEFT JOIN orbit_project m ON m.project_id=p.id_projeto" .
            ($owner ? " WHERE pf.id_user=?" : "") .
            " ORDER BY p.id_projeto DESC",
        $owner ? [$owner] : [],
    );
}
function projectRow(string $id): array
{
    $p = one(
        "SELECT p.*,pf.id_user owner_id,m.metadata,m.created_at,m.updated_at FROM projeto p JOIN portfolio pf ON p.id_portfolio=pf.id_portfolio LEFT JOIN orbit_project m ON m.project_id=p.id_projeto WHERE p.id_projeto=?",
        [$id],
    );
    if (!$p) {
        fail(404, "Projeto não encontrado.");
    }
    return $p;
}
function projectMeta(array $p): array
{
    $meta = json_decode($p["metadata"] ?? "{}", true) ?: [];
    if (!$meta && !empty($p["github_repo"])) {
        try {
            $repo = repoName($p["github_repo"]);
            $meta["githubUrl"] = "https://github.com/" . $repo;
        } catch (ApiError) {
        }
    }
    return $meta;
}
function projectView(array $p, bool $authorized = false): ?array
{
    $m = projectMeta($p);
    $id = (string) $p["id_projeto"];
    if (
        !empty($m["github"]["private"]) &&
        (string) $p["owner_id"] !== uid() &&
        !$authorized
    ) {
        return null;
    }
    $langs = $m["languages"] ?? null;
    if ($langs === null) {
        $langs = [];
        foreach (
            rows(
                "SELECT l.nome FROM linguagem l JOIN projeto_entidade pe ON l.id_linguagem=pe.id_linguagem WHERE pe.id_projeto=?",
                [$id],
            )
            as $l
        ) {
            $langs[$l["nome"]] = null;
        }
    }
    return [
        "id" => $id,
        "name" => $p["nome"],
        "description" => strip_tags($p["descricao"]),
        "sizeBytes" => $m["sizeBytes"] ?? 0,
        "orbit" => $m["orbit"] ?? null,
        "languages" => (object) $langs,
        "githubUrl" => $m["githubUrl"] ?? "",
        "demoUrl" => $m["demoUrl"] ?? "",
        "repositoryUrl" => $m["githubUrl"] ?? "" ?: $m["demoUrl"] ?? "",
        "github" => $m["github"] ?? [
            "integrationEnabled" => false,
            "private" => false,
            "fullName" => null,
            "defaultBranch" => null,
        ],
        "owner" => userView(
            one("SELECT * FROM usuario WHERE id_user=?", [$p["owner_id"]]),
        ),
        "views" => 0,
        "rating" => 0,
        "likes" => (int) one(
            "SELECT COUNT(DISTINCT id_user) n FROM curtida WHERE id_projeto=?",
            [$id],
        )["n"],
        "liked" =>
            uid() &&
            (bool) one(
                "SELECT 1 FROM curtida WHERE id_user=? AND id_projeto=?",
                [uid(), $id],
            ),
        "favorited" =>
            uid() &&
            (bool) one(
                "SELECT 1 FROM favorito WHERE id_user=? AND id_projeto=?",
                [uid(), $id],
            ),
        "createdAt" => $p["created_at"] ?? $p["data_criacao_projeto"],
        "updatedAt" => $p["updated_at"] ?? $p["data_criacao_projeto"],
    ];
}
function projectList(?string $owner = null): array
{
    return array_values(
        array_filter(array_map("projectView", projectRows($owner))),
    );
}
function radius(float $bytes): float
{
    return 6 + 19 * min(1, log1p(max(0, $bytes) / 1048576) / log1p(10240));
}
function newOrbit(float $bytes): array
{
    $bodies = [];
    foreach (projectRows() as $p) {
        $m = projectMeta($p);
        if (isset($m["orbit"])) {
            $bodies[] = [$m["orbit"], radius((float) ($m["sizeBytes"] ?? 0))];
        }
    }
    $r = radius($bytes);
    for ($i = 0; $i < 2000; $i++) {
        $q = [];
        for ($k = 0; $k < 3; $k++) {
            $q[] =
                -320 + $r + (random_int(0, 1000000) / 1000000) * (640 - 2 * $r);
        }
        $ok = true;
        foreach ($bodies as [$v, $rr]) {
            if (
                array_sum(array_map(fn($a, $b) => ($a - $b) ** 2, $q, $v)) <=
                ($r + $rr + 8) ** 2
            ) {
                $ok = false;
                break;
            }
        }
        if ($ok) {
            return $q;
        }
    }
    fail(409, "Não há espaço seguro para outro planeta.");
}
function lockWrite(callable $fn): mixed
{
    if (
        (int) one("SELECT GET_LOCK('orbitfolio_write',10) acquired")[
            "acquired"
        ] !== 1
    ) {
        fail(503, "Servidor ocupado. Tente novamente.");
    }
    try {
        database()->beginTransaction();
        $result = $fn();
        database()->commit();
        return $result;
    } catch (Throwable $e) {
        if (database()->inTransaction()) {
            database()->rollBack();
        }
        throw $e;
    } finally {
        query("SELECT RELEASE_LOCK('orbitfolio_write')");
    }
}
