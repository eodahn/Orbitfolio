<?php
session_start();

$msg = '';

// include DB
$dbPath = __DIR__ . '/../php/db.php';
if (!file_exists($dbPath)) {
    die('DB helper not found.');
}
$pdo = require $dbPath;

// logout
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    session_unset();
    session_destroy();
    header('Location: ../index.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $type = $_POST['type'] ?? 'login';

    if ($type === 'register') {
        $nome = trim($_POST['nome'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $senha = $_POST['senha'] ?? '';

        if (!$nome || !$email || !$senha) {
            $msg = 'Preencha todos os campos.';
        } else {
            // check exists
            $stmt = $pdo->prepare('SELECT id_user FROM usuario WHERE email = ?');
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                $msg = 'Email já cadastrado.';
            } else {
                $hash = password_hash($senha, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare('INSERT INTO usuario (nome, email, senha) VALUES (?, ?, ?)');
                try {
                    $stmt->execute([$nome, $email, $hash]);
                    $id = $pdo->lastInsertId();
                    $_SESSION['user_id'] = $id;
                    $_SESSION['user_nome'] = $nome;
                    header('Location: ../index.php');
                    exit;
                } catch (Exception $e) {
                    $msg = 'Erro no cadastro: ' . $e->getMessage();
                }
            }
        }
    } else {
        // login
        $email = trim($_POST['email'] ?? '');
        $senha = $_POST['senha'] ?? '';

        if (!$email || !$senha) {
            $msg = 'Preencha email e senha.';
        } else {
            $stmt = $pdo->prepare('SELECT id_user, nome, senha FROM usuario WHERE email = ?');
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if ($user) {
                $stored = $user['senha'];
                if (password_verify($senha, $stored)) {
                    $_SESSION['user_id'] = $user['id_user'];
                    $_SESSION['user_nome'] = $user['nome'];
                    header('Location: ../index.php');
                    exit;
                } else {
                    // fallback: maybe stored as plain text
                    if ($senha === $stored) {
                        // upgrade to hash
                        $newHash = password_hash($senha, PASSWORD_DEFAULT);
                        $u = $pdo->prepare('UPDATE usuario SET senha = ? WHERE id_user = ?');
                        $u->execute([$newHash, $user['id_user']]);
                        $_SESSION['user_id'] = $user['id_user'];
                        $_SESSION['user_nome'] = $user['nome'];
                        header('Location: ../index.php');
                        exit;
                    }
                    $msg = 'Credenciais inválidas.';
                }
            } else {
                $msg = 'Usuário não encontrado.';
            }
        }
    }
}

// Simple HTML with register/login toggle
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Login / Cadastro</title>
    <style>
        body{font-family:Arial, sans-serif;padding:20px;background:#f5f5f5}
        .card{max-width:420px;margin:30px auto;padding:20px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
        input{width:100%;padding:10px;margin:6px 0;border:1px solid #ccc;border-radius:4px}
        button{padding:10px 14px;margin-top:8px}
        .toggle{margin-bottom:12px}
        .msg{color:#b00;margin-top:8px}
        a{color:#06c}
    </style>
</head>
<body>
<div class="card">
    <h2>Entrar ou Cadastrar</h2>
    <div class="toggle">
        <a href="?mode=login">Entrar</a> | <a href="?mode=register">Cadastrar</a>
    </div>

    <?php if ($msg): ?>
        <div class="msg"><?php echo htmlspecialchars($msg) ?></div>
    <?php endif; ?>

    <?php $mode = $_GET['mode'] ?? 'login'; ?>

    <?php if ($mode === 'register'): ?>
        <form method="post">
            <input type="hidden" name="type" value="register">
            <label>Nome</label>
            <input name="nome" required>
            <label>Email</label>
            <input name="email" type="email" required>
            <label>Senha</label>
            <input name="senha" type="password" required>
            <button type="submit">Cadastrar</button>
        </form>
    <?php else: ?>
        <form method="post">
            <input type="hidden" name="type" value="login">
            <label>Email</label>
            <input name="email" type="email" required>
            <label>Senha</label>
            <input name="senha" type="password" required>
            <button type="submit">Entrar</button>
        </form>
    <?php endif; ?>

    <p style="margin-top:12px"><a href="../index.php">Voltar ao início</a></p>
</div>
</body>
</html>
