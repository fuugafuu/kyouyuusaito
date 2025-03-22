const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Vercelはローカルファイルシステムを永続的に保存できないため、外部ストレージを使用するのが推奨されます。
// ここではローカルに保存する処理例を記述しますが、Vercelでの運用ではS3やGoogle Cloud Storageなどの外部ストレージを使ってください。

const uploadFolder = '/tmp/uploads'; // Vercelの一時ストレージ

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

module.exports = (req, res) => {
  if (req.method === 'POST') {
    upload.single('file')(req, res, function (err) {
      if (err) {
        return res.status(500).json({ error: 'ファイルアップロードエラー' });
      }

      res.status(200).json({
        message: 'ファイルアップロード成功',
        fileUrl: `/uploads/${req.file.filename}`,
      });
    });
  } else {
    res.status(404).send('Not Found');
  }
};
