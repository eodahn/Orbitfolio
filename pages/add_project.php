<?php
session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: ../pages/login.php');
    exit;
}

$dbPath = __DIR__ . '/../php/db.php';
if (!file_exists($dbPath)) die('DB helper not found.');
$pdo = require $dbPath;

$user_id = $_SESSION['user_id'];

// check github token
$stmt = $pdo->prepare('SELECT github_token FROM usuario WHERE id_user = ?');
$stmt->execute([$user_id]);
$u = $stmt->fetch();
if (!$u || empty($u['github_token'])) {
    header('Location: ./github_connect.php');
    exit;
}
$token = $u['github_token'];

// ensure portfolio exists
$p = $pdo->prepare('SELECT id_portfolio FROM portfolio WHERE id_user = ? LIMIT 1');
$p->execute([$user_id]);
$portfolio = $p->fetch();
if (!$portfolio) {
    // redirect to portfolio creation
    header('Location: ./portfolio.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['repo_full_name'])) {
    $full = $_POST['repo_full_name'];
    $name = $_POST['repo_name'] ?? $full;
    $desc = $_POST['repo_desc'] ?? '';
    try {
        $ins = $pdo->prepare('INSERT INTO projeto (id_portfolio, nome, descricao, data_criacao_projeto) VALUES (?, ?, ?, CURDATE())');
        $ins->execute([$portfolio['id_portfolio'], $name, $desc]);
        header('Location: ./portfolio.php');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}

// fetch repos from GitHub
$ch = curl_init('https://api.github.com/user/repos?per_page=100&type=owner');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: token ' . $token,
    'User-Agent: Orbitfolio-App',
    'Accept: application/vnd.github.v3+json'
]);
$reposJson = curl_exec($ch);
if ($reposJson === false) {
    $repos = [];
} else {
    $repos = json_decode($reposJson, true) ?: [];
}
curl_close($ch);

?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Adicionar Projeto do GitHub</title>
    <style>
        body{font-family:Arial, sans-serif;background:#f7f9fb;padding:20px}
        .card{max-width:900px;margin:20px auto;background:#fff;padding:18px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        .repo{border-bottom:1px solid #eee;padding:10px 0}
        button{padding:6px 10px}
    </style>
</head>
<body>
<div class="card">
    <h2>Seus repositórios GitHub</h2>
    <p>Escolha um repositório para adicionar ao seu portfólio.</p>

    <?php if (!empty($error)): ?><div style="color:#b00"><?=htmlspecialchars($error)?></div><?php endif; ?>

    <?php if (empty($repos)): ?>
        <p>Nenhum repositório encontrado ou erro ao buscar. Tente reconectar sua conta.</p>
        <p><a href="github_connect.php">Conectar GitHub</a></p>
    <?php else: ?>
        <?php foreach ($repos as $r): ?>
            <div class="repo">
                <strong><?php echo htmlspecialchars($r['full_name']) ?></strong>
                <div style="color:#666;margin:6px 0"><?php echo htmlspecialchars($r['description'] ?? '') ?></div>
                <form method="post" style="display:inline">
                    <input type="hidden" name="repo_full_name" value="<?php echo htmlspecialchars($r['full_name']) ?>">
                    <input type="hidden" name="repo_name" value="<?php echo htmlspecialchars($r['name']) ?>">
                    <input type="hidden" name="repo_desc" value="<?php echo htmlspecialchars($r['description'] ?? '') ?>">
                    <button type="submit">Adicionar</button>
                </form>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>

    <p style="margin-top:12px"><a href="./portfolio.php">Voltar</a></p>
</div>
</body>
</html>
