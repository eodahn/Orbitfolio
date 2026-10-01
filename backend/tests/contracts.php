<?php
declare(strict_types=1);
require __DIR__ . "/../php/api.php";
if (!str_starts_with(getenv("DB_NAME") ?: "", "orbit_test_")) {
    throw new RuntimeException(
        "Use a dedicated DB_NAME starting with orbit_test_.",
    );
}
function check(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function rejects(callable $fn, int $status): void
{
    try {
        $fn();
    } catch (ApiError $e) {
        check($e->status === $status, "Unexpected status: " . $e->status);
        return;
    }
    throw new RuntimeException("Expected rejection");
}
$_SESSION = [];
$id = lockWrite(function () {
    query("INSERT INTO usuario(nome,email,senha,descricao) VALUES(?,?,?,?)", [
        "Back1 Legacy",
        "legacy-" . bin2hex(random_bytes(4)) . "@test.local",
        password_hash("test-password", PASSWORD_DEFAULT),
        "Perfil existente",
    ]);
    $id = database()->lastInsertId();
    query("UPDATE usuario SET username=? WHERE id_user=?", [
        "legacy-" . $id,
        $id,
    ]);
    return $id;
});
$_SESSION["user_id"] = $id;
check(
    password_verify(
        "test-password",
        one("SELECT senha FROM usuario WHERE id_user=?", [$id])["senha"],
    ),
    "back1 password compatibility",
);
foreach (
    [
        "https://portfolio.onrender.com",
        "https://site.hostinger.com",
        "https://name.github.io/portfolio",
        "https://site.vercel.app",
        "https://example.com",
    ]
    as $url
) {
    $p = createProject(["name" => "Portfolio externo", "demoUrl" => $url]);
    check(
        $p["demoUrl"] === $url && !$p["github"]["integrationEnabled"],
        "External URLs need no GitHub owner",
    );
}
rejects(fn() => createProject(["name" => "Sem links"]), 422);
rejects(
    fn() => createProject([
        "name" => "Unsafe",
        "demoUrl" => "javascript:alert(1)",
    ]),
    422,
);
rejects(
    fn() => createProject([
        "name" => "Unsafe",
        "demoUrl" => "https://name:secret@example.com",
    ]),
    422,
);
rejects(fn() => languages(["Python" => null, "python" => null]), 422);
rejects(fn() => languages(["Outra" => null]), 422);
putenv("APP_ORIGIN=http://localhost:3000");
putenv("GITHUB_CLIENT_ID=test-client");
putenv("GITHUB_CLIENT_SECRET=test-secret");
putenv("GITHUB_TOKEN_ENCRYPTION_KEY=" . str_repeat("a", 64));
$encrypted = encryptCredential("fixture-token", $id);
check(!str_contains($encrypted, "fixture-token"), "encrypted token");
check(
    decryptCredential($encrypted, $id) === "fixture-token",
    "decrypt roundtrip",
);
rejects(fn() => decryptCredential($encrypted, "other"), 401);
$calls = [];
$repo = [
    "id" => 123,
    "name" => "project",
    "full_name" => "owner/project",
    "description" => "Real metadata",
    "size" => 100,
    "default_branch" => "main",
    "private" => true,
];
$GLOBALS["github_test_transport"] = function ($url, $token, $post) use (
    &$calls,
    $repo,
) {
    $calls[] = [$url, $token, $post];
    $data = match (true) {
        str_contains($url, "access_token") => [
            "access_token" => "fixture-token",
        ],
        str_ends_with($url, "/user") => ["id" => 9, "login" => "fixture"],
        str_contains($url, "/languages") => ["PHP" => 60, "JavaScript" => 40],
        str_contains($url, "/user/repos") => [$repo],
        str_contains($url, "/tags") => [],
        str_contains($url, "/commits") => [
            [
                "sha" => "abcdef123",
                "commit" => [
                    "message" => "Commit real",
                    "author" => [
                        "name" => "Autor",
                        "date" => "2026-09-30T00:00:00Z",
                    ],
                ],
                "html_url" =>
                    "https://github.com/owner/project/commit/abcdef123",
            ],
        ],
        default => $repo,
    };
    return ["status" => 200, "headers" => [], "data" => $data];
};
$connect = githubConnect();
parse_str(parse_url($connect["url"], PHP_URL_QUERY), $params);
check(
    $params["scope"] === "repo read:user" &&
        $params["code_challenge_method"] === "S256",
    "OAuth scopes and PKCE",
);
githubCallback(["state" => $params["state"], "code" => "fixture"]);
check(githubToken() === "fixture-token", "callback persisted credential");
rejects(
    fn() => githubCallback(["state" => $params["state"], "code" => "fixture"]),
    403,
);
check(
    githubRequest("/user/repos", githubToken())["data"][0]["id"] === 123,
    "authenticated repository list",
);
$draft = githubInspect(["fullName" => "owner/project", "integrated" => true]);
$p = createProject([
    "importId" => $draft["importId"],
    "name" => "Private project",
]);
check(
    $p["github"]["private"] && (float) $p["languages"]->PHP === 60.0,
    "private metadata",
);
$commits = githubCommits(projectMeta(projectRow($p["id"])), 1);
check($commits["commits"][0]["sha"] === "abcdef123", "real commits");
foreach ($calls as [$url, $token]) {
    if (str_starts_with($url, "https://api.github.com")) {
        check(
            $token === "fixture-token",
            "Bearer used for integrated API requests",
        );
    }
}
rejects(
    fn() => createProject([
        "importId" => $draft["importId"],
        "name" => "Replay",
    ]),
    422,
);
rejects(
    fn() => githubInspect([
        "fullName" => "owner/project",
        "integrated" => "true",
    ]),
    422,
);
$_SESSION = [];
check(projectView(projectRow($p["id"])) === null, "private project not public");
$_SESSION["user_id"] = $id;
foreach ([401, 403, 404, 429] as $status) {
    $GLOBALS["github_test_transport"] = fn() => [
        "status" => $status,
        "headers" => [],
        "data" => ["message" => "secret upstream"],
    ];
    rejects(fn() => githubRequest("/repos/a/b", "token"), $status);
}
$GLOBALS["github_test_transport"] = fn() => [
    "status" => 403,
    "headers" => [],
    "data" => ["message" => "secondary rate limit"],
];
rejects(fn() => githubRequest("/repos/a/b", "token"), 429);
$count = 0;
$GLOBALS["github_test_transport"] = function () use (&$count) {
    $count++;
    return [
        "status" => 301,
        "headers" => ["location" => "https://evil.example/steal"],
        "data" => [],
    ];
};
rejects(fn() => githubRequest("/repos/a/b", "token"), 502);
check($count === 1, "no token to third party");
$connect = githubConnect();
$_SESSION["github_oauth"]["expires"] = 0;
rejects(
    fn() => githubCallback(["state" => "expired", "code" => "fixture"]),
    403,
);
echo "PASS: PHP/MySQL back1 passwords, external links, validation, OAuth+PKCE+state, encrypted tokens, repositories, private imports/create, commits, access control, errors and redirects.\n";
