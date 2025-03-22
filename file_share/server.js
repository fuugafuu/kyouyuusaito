const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();

// アップロードフォルダの設定
const uploadFolder = './uploads';
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// 静的ファイルの提供（CSSや画像）
app.use(express.static('public'));

// アップロードフォーム
app.get('/upload', (req, res) => {
  res.sendFile(__dirname + '/upload.html');
});

// ファイルアップロード処理
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.send('ファイルが選択されていません。');
  }
  res.send(`ファイルがアップロードされました: <a href="/uploads/${req.file.filename}">ダウンロードリンク</a>`);
});

// ダウンロードページ
app.get('/', (req, res) => {
  const fs = require('fs');
  const files = fs.readdirSync(uploadFolder);
  let fileLinks = files.map(file => `<a href="/uploads/${file}">${file}</a>`).join('<br>');
  res.send(fileLinks);
});

// アップロードされたファイルのダウンロード
app.use('/uploads', express.static(uploadFolder));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で稼働中です。`);
});