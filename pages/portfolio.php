<?php
session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: ../index.php');
    exit;
}

$dbPath = __DIR__ . '/../php/db.php';
if (!file_exists($dbPath)) {
    die('DB helper not found.');
}
$pdo = require $dbPath;

$user_id = $_SESSION['user_id'];
$msg = '';

// Check existing portfolio
$stmt = $pdo->prepare('SELECT * FROM portfolio WHERE id_user = ? LIMIT 1');
$stmt->execute([$user_id]);
$portfolio = $stmt->fetch();

// get github status
$gstmt = $pdo->prepare('SELECT github_login FROM usuario WHERE id_user = ?');
$gstmt->execute([$user_id]);
$ginfo = $gstmt->fetch();
$github_login = $ginfo['github_login'] ?? null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['create'])) {
    // ensure only one portfolio per user
    if ($portfolio) {
        $msg = 'Você já possui um portfólio.';
    } else {
        $nome = trim($_POST['nome'] ?? 'Meu Portfólio');
        if (!$nome) $nome = 'Meu Portfólio';
        try {
            $ins = $pdo->prepare('INSERT INTO portfolio (id_user, nome, data_criacao) VALUES (?, ?, CURDATE())');
            $ins->execute([$user_id, $nome]);
            header('Location: ./portfolio.php');
            exit;
        } catch (Exception $e) {
            $msg = 'Erro ao criar portfólio: ' . $e->getMessage();
        }
    }
}

?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Meu Portfólio</title>
    <style>
        body{font-family:Arial, sans-serif;background:#fafafa;padding:20px}
        .card{max-width:760px;margin:30px auto;background:#fff;padding:22px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
        .meta{display:flex;justify-content:space-between;align-items:center}
        .placeholder{background:linear-gradient(90deg,#f0f0f0,#fafafa);padding:20px;border-radius:6px;color:#666}
        input{padding:8px;width:100%;box-sizing:border-box;margin-top:6px}
        button{margin-top:10px;padding:8px 12px}
        .msg{color:#b00;margin-top:8px}
    </style>
</head>
<body>
<div class="card">
    <div class="meta">
        <h2>Portfólio de <?php echo htmlspecialchars($_SESSION['user_nome']) ?></h2>
        <div>
            <?php if ($github_login): ?>
                <a href="./add_project.php">Adicionar projeto (do GitHub)</a>
            <?php else: ?>
                <a href="./github_connect.php">Conectar GitHub</a>
            <?php endif; ?>
            — <a href="../index.php">Voltar</a>
        </div>
    </div>

    <?php if ($msg): ?>
        <div class="msg"><?php echo htmlspecialchars($msg) ?></div>
    <?php endif; ?>

    <?php if ($portfolio): ?>
        <div class="placeholder">
            <h3><?php echo htmlspecialchars($portfolio['nome']) ?></h3>
            <p>Portfólio criado em <?php echo htmlspecialchars($portfolio['data_criacao']) ?></p>
            <p>Conteúdo placeholder — funcionalidades serão adicionadas depois.</p>
        </div>
    <?php else: ?>
        <div class="placeholder">
            <p>Você ainda não possui um portfólio.</p>
            <form method="post">
                <label>Nome do portfólio (opcional)</label>
                <input name="nome" placeholder="Meu Portfólio">
                <button name="create" type="submit">Criar meu portfólio</button>
            </form>
        </div>
    <?php endif; ?>
</div>
</body>
</html>
