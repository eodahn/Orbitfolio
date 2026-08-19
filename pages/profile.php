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

// Load current data
$stmt = $pdo->prepare('SELECT nome, descricao FROM usuario WHERE id_user = ?');
$stmt->execute([$user_id]);
$user = $stmt->fetch();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $descricao = trim($_POST['descricao'] ?? '');

    // handle cropped image data (base64) first
    $pfpData = null;
    if (!empty($_POST['pfp_data'])) {
        $dataUrl = $_POST['pfp_data'];
        if (preg_match('/^data:(.*);base64,(.*)$/', $dataUrl, $m)) {
            $pfpData = base64_decode($m[2]);
        }
    }

    // fallback to regular file upload
    if ($pfpData === null && !empty($_FILES['pfp']['tmp_name']) && is_uploaded_file($_FILES['pfp']['tmp_name'])) {
        $tmp = $_FILES['pfp']['tmp_name'];
        $mime = mime_content_type($tmp);
        if (!in_array($mime, ['image/jpeg','image/png','image/gif'])) {
            $msg = 'Formato de imagem inválido. Use JPG, PNG ou GIF.';
        } else {
            $pfpData = file_get_contents($tmp);
        }
    }

    if ($msg === '') {
        if ($pfpData !== null) {
            $u = $pdo->prepare('UPDATE usuario SET descricao = ?, pfp = ? WHERE id_user = ?');
            $u->bindParam(1, $descricao);
            $u->bindParam(2, $pfpData, PDO::PARAM_LOB);
            $u->bindParam(3, $user_id);
            $u->execute();
        } else {
            $u = $pdo->prepare('UPDATE usuario SET descricao = ? WHERE id_user = ?');
            $u->execute([$descricao, $user_id]);
        }
        $_SESSION['user_nome'] = $user['nome'];
        $msg = 'Perfil atualizado.';
    }
    // reload user
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();
}

?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Editar Perfil</title>
    <style>
        body{font-family:Arial, sans-serif;background:#f6f8fa;padding:20px}
        .card{max-width:640px;margin:30px auto;background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        label{display:block;margin-top:10px}
        textarea{width:100%;height:100px;padding:8px}
        input[type=file]{margin-top:6px}
        button{margin-top:10px;padding:8px 12px}
        .msg{color:green;margin-top:8px}
    </style>
</head>
<body>
<div class="card">
    <h2>Editar perfil — <?php echo htmlspecialchars($_SESSION['user_nome']) ?></h2>

    <?php if ($msg): ?>
        <div class="msg"><?php echo htmlspecialchars($msg) ?></div>
    <?php endif; ?>

    <form id="profileForm" method="post" enctype="multipart/form-data">
        <label>Descrição (máx 100 chars)</label>
        <textarea name="descricao"><?php echo htmlspecialchars($user['descricao'] ?? '') ?></textarea>

        <label>Foto de perfil (JPG/PNG/GIF)</label>
        <input type="file" id="pfpFile" accept="image/*">

        <div style="margin-top:10px">
            <canvas id="cropCanvas" width="240" height="240" style="border:1px solid #ddd;display:block"></canvas>
            <div style="margin-top:6px">
                <label>Zoom</label>
                <input id="zoom" type="range" min="0.5" max="2" step="0.01" value="1">
            </div>
        </div>

        <input type="hidden" name="pfp_data" id="pfp_data">

        <div>
            <button type="submit">Salvar</button>
            <a href="../index.php" style="margin-left:10px">Cancelar</a>
        </div>
    </form>

    <script>
    (function(){
        const fileInput = document.getElementById('pfpFile');
        const canvas = document.getElementById('cropCanvas');
        const ctx = canvas.getContext('2d');
        const zoomInput = document.getElementById('zoom');
        const hidden = document.getElementById('pfp_data');
        let img = new Image();
        let scale = 1;
        let pos = {x:0,y:0};
        let dragging = false;
        let last = {x:0,y:0};

        function draw(){
            ctx.clearRect(0,0,canvas.width,canvas.height);
            if (!img.src) {
                // placeholder box
                ctx.fillStyle = '#f0f4f8';
                ctx.fillRect(0,0,canvas.width,canvas.height);
                return;
            }
            const iw = img.width * scale;
            const ih = img.height * scale;
            const x = pos.x + (canvas.width - iw)/2;
            const y = pos.y + (canvas.height - ih)/2;
            ctx.drawImage(img, x, y, iw, ih);
            // draw frame (optional)
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 2;
            ctx.strokeRect(0,0,canvas.width,canvas.height);
        }

        fileInput.addEventListener('change', function(e){
            const f = e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function(ev){
                img = new Image();
                img.onload = function(){
                    // reset
                    scale = Math.max(canvas.width / img.width, canvas.height / img.height);
                    pos = {x:0,y:0};
                    zoomInput.value = scale.toFixed(2);
                    draw();
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(f);
        });

        zoomInput.addEventListener('input', function(){
            const val = parseFloat(this.value);
            scale = val;
            draw();
        });

        canvas.addEventListener('mousedown', function(e){
            dragging = true;
            last = {x: e.clientX, y: e.clientY};
        });
        window.addEventListener('mousemove', function(e){
            if (!dragging) return;
            const dx = e.clientX - last.x;
            const dy = e.clientY - last.y;
            last = {x: e.clientX, y: e.clientY};
            pos.x += dx;
            pos.y += dy;
            draw();
        });
        window.addEventListener('mouseup', function(){ dragging = false; });

        document.getElementById('profileForm').addEventListener('submit', function(e){
            // convert canvas to data URL and place in hidden input
            if (img.src) {
                const dataUrl = canvas.toDataURL('image/png');
                hidden.value = dataUrl;
            }
            // allow form to submit
        });

        // initial draw
        draw();
    })();
    </script>
        </form>
</div>
</body>
</html>
